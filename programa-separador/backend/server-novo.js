import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 4001;

// Configurações Omie
const OMIE_APP_KEY = "2694922638408";
const OMIE_APP_SECRET = "02995c034ba5ba2ef1a297240bbb5bf5";
const OMIE_FAT_URL = "https://app.omie.com.br/api/v1/produtos/pedidovendafat/";
const OMIE_PEDIDO_URL = "https://app.omie.com.br/api/v1/produtos/pedido/";
const OMIE_PRODUTO_URL = "https://app.omie.com.br/api/v1/geral/produtos/";

// Caminho do database (na raiz do projeto)
const DATABASE_DIR = join(__dirname, '..', '..', '..', 'database');
const PEDIDOS_FILE = join(DATABASE_DIR, 'separador-pedidos.json');
const FLAGS_FILE = join(DATABASE_DIR, 'separador-flags.json');

// Cache em memória
let PEDIDOS_CACHE = [];
let STATUS_FLAGS = {};
let PRODUTOS_CACHE = {}; // Cache de produtos consultados (codigo_produto => dados)

// Middleware
app.use(cors());
app.use(express.json());

// ================== FUNÇÕES DE PERSISTÊNCIA JSON ==================

function ensureDatabase() {
  // Cria pasta database se não existir
  if (!fs.existsSync(DATABASE_DIR)) {
    fs.mkdirSync(DATABASE_DIR, { recursive: true });
    console.log(`📁 Pasta database criada em: ${DATABASE_DIR}`);
  }

  // Cria arquivos JSON se não existirem
  if (!fs.existsSync(PEDIDOS_FILE)) {
    fs.writeFileSync(PEDIDOS_FILE, JSON.stringify({}, null, 2));
  }
  if (!fs.existsSync(FLAGS_FILE)) {
    fs.writeFileSync(FLAGS_FILE, JSON.stringify({}, null, 2));
  }
}

function loadFlagsFromFile() {
  try {
    ensureDatabase();
    const data = fs.readFileSync(FLAGS_FILE, 'utf-8');
    STATUS_FLAGS = JSON.parse(data);
    console.log(`✅ Flags carregadas: ${Object.keys(STATUS_FLAGS).length} registros`);
  } catch (error) {
    console.error('Erro ao carregar flags:', error.message);
    STATUS_FLAGS = {};
  }
}

function saveFlagToFile(pedidoId, descKey, separado, transferido) {
  try {
    ensureDatabase();
    const key = `${pedidoId}_${descKey}`;
    STATUS_FLAGS[key] = { separado, transferido };
    fs.writeFileSync(FLAGS_FILE, JSON.stringify(STATUS_FLAGS, null, 2));
  } catch (error) {
    console.error('Erro ao salvar flag:', error.message);
  }
}

function savePedidoCache(pedidoId, numPedido, detalhe, produtos, itens) {
  try {
    ensureDatabase();
    const pedidos = JSON.parse(fs.readFileSync(PEDIDOS_FILE, 'utf-8'));
    pedidos[String(pedidoId)] = {
      num_pedido: numPedido,
      detalhe,
      produtos,
      itens
    };
    fs.writeFileSync(PEDIDOS_FILE, JSON.stringify(pedidos, null, 2));
  } catch (error) {
    console.error('Erro ao salvar pedido:', error.message);
  }
}

function loadPedidoCache(pedidoId) {
  try {
    ensureDatabase();
    const pedidos = JSON.parse(fs.readFileSync(PEDIDOS_FILE, 'utf-8'));
    return pedidos[String(pedidoId)] || null;
  } catch (error) {
    return null;
  }
}

function loadPedidoCachePorNum(normNum) {
  try {
    ensureDatabase();
    const pedidos = JSON.parse(fs.readFileSync(PEDIDOS_FILE, 'utf-8'));
    for (const [pedidoId, data] of Object.entries(pedidos)) {
      const numNorm = String(data.num_pedido).replace(/^0+/, '') || '0';
      if (numNorm === normNum) {
        return { pedido_id: pedidoId, ...data };
      }
    }
  } catch (error) {
    return null;
  }
  return null;
}

// ================== FUNÇÕES OMIE ==================

async function callOmieFat(call, params) {
  const payload = {
    call,
    app_key: OMIE_APP_KEY,
    app_secret: OMIE_APP_SECRET,
    param: params
  };
  console.log(`Chamando Omie FAT: ${call}`);
  const response = await axios.post(OMIE_FAT_URL, payload, { timeout: 30000 });
  if (response.data.faultstring) {
    throw new Error(`Erro Omie: ${response.data.faultstring}`);
  }
  return response.data;
}

async function consultarPedidoPorId(codigoPedido) {
  const payload = {
    call: "ConsultarPedido",
    app_key: OMIE_APP_KEY,
    app_secret: OMIE_APP_SECRET,
    param: [{ codigo_pedido: codigoPedido }]
  };
  console.log(`Consultando pedido codigo_pedido=${codigoPedido}`);
  const response = await axios.post(OMIE_PEDIDO_URL, payload, { timeout: 30000 });
  if (response.data.faultstring) {
    throw new Error(`Erro Omie: ${response.data.faultstring}`);
  }
  return response.data;
}

async function consultarProdutoPorCodigo(codigoProduto, retries = 3, delay = 1000) {
  // Verifica se o produto já está em cache
  if (PRODUTOS_CACHE[codigoProduto]) {
    console.log(`💾 Produto ${codigoProduto} encontrado em cache`);
    return PRODUTOS_CACHE[codigoProduto];
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const payload = {
        call: "ConsultarProduto",
        app_key: OMIE_APP_KEY,
        app_secret: OMIE_APP_SECRET,
        param: [{
          codigo_produto: codigoProduto,
          codigo_produto_integracao: "",
          codigo: ""
        }]
      };
      console.log(`🔍 Consultando produto ${codigoProduto} (tentativa ${attempt}/${retries})`);
      const response = await axios.post(OMIE_PRODUTO_URL, payload, { timeout: 30000 });
      if (response.data.faultstring) {
        throw new Error(`Erro Omie: ${response.data.faultstring}`);
      }
      console.log(`✅ Produto ${codigoProduto} consultado com sucesso`);

      // Salva no cache antes de retornar
      PRODUTOS_CACHE[codigoProduto] = response.data;
      return response.data;
    } catch (error) {
      console.error(`❌ Tentativa ${attempt}/${retries} falhou para produto ${codigoProduto}:`, error.message);
      if (attempt === retries) {
        throw error; // Última tentativa, propaga o erro
      }
      // Backoff exponencial: espera aumenta a cada tentativa
      const waitTime = delay * Math.pow(2, attempt - 1);
      console.log(`⏳ Aguardando ${waitTime}ms antes da próxima tentativa...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

async function listarPedidosEtapa(etapa = "50") {
  const data = await callOmieFat("ObterPedidosVenda", [{ cEtapa: etapa }]);
  PEDIDOS_CACHE = data.listaPedidosVenda || data.pedido_venda_produto || data.pedidos || [];
  console.log(`Total pedidos etapa ${etapa}: ${PEDIDOS_CACHE.length}`);
  return PEDIDOS_CACHE;
}

// ================== FUNÇÕES DE PROCESSAMENTO ==================

// Função para processar promises em lotes (evita sobrecarga da API)
async function processarEmLotes(items, asyncFn, batchSize = 1) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(`🔄 Processando item ${i + 1}/${items.length}...`);
    const batchResults = await Promise.all(batch.map(item => asyncFn(item)));
    results.push(...batchResults);
    // Delay de 1.5s entre cada requisição (API do Omie bloqueia requisições muito rápidas)
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  return results;
}

function extrairItens(detalhe) {
  function pickItems(obj) {
    const candidates = [obj.det, obj.produtos, obj.lista_produtos, obj.produto, obj.itens, obj.listaItens];
    for (const c of candidates) {
      if (c) return Array.isArray(c) ? c : [c];
    }
    return [];
  }

  const base = detalhe.pedido_venda_produto || detalhe;
  const itensBrutos = pickItems(base);
  const normalizados = [];

  for (const raw of itensBrutos) {
    const prod = (typeof raw === 'object' && raw.produto) ? raw.produto : raw;
    const inf = (typeof raw === 'object' && raw.inf_adic) ? raw.inf_adic : {};

    // Extrai dados adicionais e trata se for objeto
    let dadosAdic = raw.dados_adicionais_item || prod.dados_adicionais_item ||
                    inf.dados_adicionais_item || raw.obs_item || prod.obs_item || raw.observacao;

    if (typeof dadosAdic === 'object' && dadosAdic !== null) {
      const campos = ['observacao', 'obs', 'texto', 'descricao', 'texto_livre', 'obs_item', 'cTexto', 'cObs'];
      let textoExtraido = '';
      for (const campo of campos) {
        if (dadosAdic[campo]) {
          textoExtraido = String(dadosAdic[campo]);
          break;
        }
      }
      if (textoExtraido) {
        dadosAdic = textoExtraido;
      } else {
        const jsonStr = JSON.stringify(dadosAdic);
        // Se for objeto ou array vazio, deixa como null
        dadosAdic = (jsonStr === '{}' || jsonStr === '[]') ? null : jsonStr;
      }
    }

    normalizados.push({
      codigo: prod.codigo || prod.cCodigo || prod.codigo_item || prod.cItem,
      codigo_produto: prod.codigo_produto || prod.cCodigoProduto,
      descricao: prod.descricao || prod.cDescricao || prod.descricao_produto,
      quantidade: prod.quantidade || prod.nQtde || prod.nQtdeItem || prod.qtde,
      dados_adicionais_item: dadosAdic,
      local: null,
      pre_montado: null,
      separado: false,
      transferido: false
    });
  }
  return normalizados;
}

function toFloat(val) {
  try {
    return parseFloat(String(val).replace(',', '.'));
  } catch {
    return null;
  }
}

function aggregateItensPorDescricao(itens, pedidoId) {
  const agg = {};

  for (const it of itens) {
    const desc = (it.descricao || '').trim();
    const codigo = (it.codigo || '').trim();
    const local = (it.local || '').trim();
    const preMontado = (it.pre_montado || '').trim();

    // Chave composta: codigo + descricao + local + pre_montado
    const keyAgg = `${codigo}|||${desc}|||${local}|||${preMontado}`;

    if (!agg[keyAgg]) {
      agg[keyAgg] = {
        descricao: desc,
        codigo: codigo,
        quantidade: 0,
        dados: [],
        local: it.local,
        pre_montado: it.pre_montado,
        separado: false,
        transferido: false
      };
    }

    const q = toFloat(it.quantidade);
    if (q !== null) {
      agg[keyAgg].quantidade += q;
    } else {
      agg[keyAgg].quantidade = `${agg[keyAgg].quantidade} + ${it.quantidade}`;
    }

    if (it.dados_adicionais_item) {
      let valorFinal = '';
      if (typeof it.dados_adicionais_item === 'object' && it.dados_adicionais_item !== null) {
        const textos = [];
        const extrairTextos = (obj) => {
          for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string' && value.trim() !== '') {
              textos.push(value.trim());
            } else if (typeof value === 'object' && value !== null) {
              extrairTextos(value);
            }
          }
        };
        extrairTextos(it.dados_adicionais_item);

        // Só usa JSON.stringify se o objeto não estiver vazio
        if (textos.length > 0) {
          valorFinal = textos.join(' | ');
        } else {
          const jsonStr = JSON.stringify(it.dados_adicionais_item);
          // Ignora objetos vazios "{}" ou arrays vazios "[]"
          if (jsonStr !== '{}' && jsonStr !== '[]') {
            valorFinal = jsonStr;
          }
        }
      } else {
        valorFinal = String(it.dados_adicionais_item);
      }
      if (valorFinal && valorFinal.trim() !== '' && valorFinal !== '{}' && valorFinal !== '[]') {
        agg[keyAgg].dados.push(valorFinal);
      }
    }

    if (!agg[keyAgg].local) agg[keyAgg].local = it.local;
    if (!agg[keyAgg].pre_montado) agg[keyAgg].pre_montado = it.pre_montado;
  }

  const agregados = [];
  for (const [keyAgg, e] of Object.entries(agg)) {
    // Usa a descrição para a chave de flags (mantém compatibilidade)
    const keyFlag = `${pedidoId}_desc:${e.descricao}`;
    const flags = STATUS_FLAGS[keyFlag] || {};

    if (typeof e.quantidade === 'number' && Number.isInteger(e.quantidade)) {
      e.quantidade = Math.floor(e.quantidade);
    }

    e.separado = flags.separado || false;
    e.transferido = flags.transferido || false;

    // Garante que todos os dados são strings antes de juntar
    const dadosLimpos = e.dados.map(d => {
      if (typeof d === 'object' && d !== null) {
        return '';
      }
      return String(d);
    }).filter(d => d && d.trim() !== '');

    e.dados_adicionais_item = dadosLimpos.length > 0 ? dadosLimpos.join(', ') : '';
    agregados.push(e);
  }

  return agregados;
}

function ordenarItens(itens, ordenar) {
  if (ordenar === 'local_az') {
    return [...itens].sort((a, b) => {
      const localA = (a.local || '').toLowerCase();
      const localB = (b.local || '').toLowerCase();
      if (localA < localB) return -1;
      if (localA > localB) return 1;
      return (a.descricao || '').toLowerCase().localeCompare((b.descricao || '').toLowerCase());
    });
  }
  if (ordenar === 'local_za') {
    return [...itens].sort((a, b) => {
      const localA = (a.local || '').toLowerCase();
      const localB = (b.local || '').toLowerCase();
      if (localA > localB) return -1;
      if (localA < localB) return 1;
      return (a.descricao || '').toLowerCase().localeCompare((b.descricao || '').toLowerCase());
    });
  }
  return itens;
}

// ================== ROTAS ==================

// Inicializa database e carrega flags
ensureDatabase();
loadFlagsFromFile();

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: 'JSON',
    database_path: DATABASE_DIR,
    cache: {
      pedidos: PEDIDOS_CACHE.length,
      produtos: Object.keys(PRODUTOS_CACHE).length,
      flags: Object.keys(STATUS_FLAGS).length
    }
  });
});

// Rota para limpar cache de produtos (útil se houver dados desatualizados)
app.post('/api/limpar-cache-produtos', (req, res) => {
  const quantidadeAntes = Object.keys(PRODUTOS_CACHE).length;
  PRODUTOS_CACHE = {};
  console.log(`🗑️ Cache de produtos limpo (${quantidadeAntes} produtos removidos)`);
  res.json({
    success: true,
    message: `Cache limpo. ${quantidadeAntes} produtos removidos.`
  });
});

app.get('/api/pedidos-etapa/:etapa', async (req, res) => {
  try {
    const pedidos = await listarPedidosEtapa(req.params.etapa);
    res.json({ pedidos });
  } catch (error) {
    console.error('Erro ao listar pedidos:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/consultar-pedido', async (req, res) => {
  const { num_pedido, refresh, ordenar } = req.body;

  if (!num_pedido) {
    return res.status(400).json({ error: 'Informe o número do pedido' });
  }

  try {
    loadFlagsFromFile();

    if (PEDIDOS_CACHE.length === 0) {
      await listarPedidosEtapa('50');
    }

    const normNum = num_pedido.replace(/^0+/, '') || '0';
    let nid = null;

    for (const p of PEDIDOS_CACHE) {
      const pnum = String(p.cNumPedido || '');
      const pnumNorm = pnum.replace(/^0+/, '') || '0';
      if (pnumNorm === normNum) {
        nid = p.nIdPed;
        break;
      }
    }

    if (!nid) {
      const cached = loadPedidoCachePorNum(normNum);
      if (cached) {
        nid = cached.pedido_id;
      } else {
        return res.status(404).json({ error: `Pedido ${num_pedido} não encontrado` });
      }
    }

    let detalhe, produtos, itens;

    const cached = loadPedidoCache(nid);
    if (cached && !refresh) {
      detalhe = cached.detalhe;
      produtos = cached.produtos;
      itens = cached.itens;

      for (const it of itens) {
        const key = `${nid}_desc:${it.descricao}`;
        const flags = STATUS_FLAGS[key] || {};
        it.separado = flags.separado || false;
        it.transferido = flags.transferido || false;
      }
    }

    if (refresh || !cached) {
      console.log(`🔄 Buscando dados do pedido ${num_pedido} (ID: ${nid}) no Omie...`);
      detalhe = await consultarPedidoPorId(nid);
      const itensExtraidos = extrairItens(detalhe);

      for (const it of itensExtraidos) {
        const key = `${nid}_${it.codigo}`;
        const flags = STATUS_FLAGS[key] || {};
        it.separado = flags.separado || false;
        it.transferido = flags.transferido || false;
      }

      // ✨ OTIMIZAÇÃO: Busca produtos em PARALELO ao invés de sequencial
      console.log(`📦 Consultando ${itensExtraidos.length} produtos em paralelo...`);
      const codigosProdutos = itensExtraidos
        .map(it => it.codigo_produto)
        .filter(cod => cod); // Remove valores vazios

      // Remove duplicatas mantendo a ordem
      const codigosUnicos = [...new Set(codigosProdutos)];
      console.log(`🔍 Total de produtos únicos a consultar: ${codigosUnicos.length}`);

      // Faz consultas em LOTES de 5 por vez (evita sobrecarregar a API do Omie)
      const consultarProdutoComTratamento = async (codigoProd) => {
        try {
          const resposta = await consultarProdutoPorCodigo(codigoProd);
          return { codigoProd, resposta, sucesso: true };
        } catch (error) {
          return { codigoProd, erro: error.message, sucesso: false };
        }
      };

      // Reduzido para 1 por vez (sequencial) porque a API do Omie bloqueia requisições paralelas com erro 425
      const resultados = await processarEmLotes(codigosUnicos, consultarProdutoComTratamento, 1);

      // Cria um mapa de resultados para acesso rápido
      const mapaProdutos = {};
      produtos = [];
      let sucessos = 0;
      let falhas = 0;

      for (const resultado of resultados) {
        if (resultado.sucesso) {
          mapaProdutos[resultado.codigoProd] = resultado.resposta;
          produtos.push({ codigo_produto: resultado.codigoProd, resposta: resultado.resposta });
          sucessos++;
        } else {
          produtos.push({ codigo_produto: resultado.codigoProd, erro: resultado.erro });
          falhas++;
        }
      }

      console.log(`✅ Produtos consultados: ${sucessos} sucesso(s), ${falhas} falha(s)`);

      // Atualiza os itens com LOCAL e PRE-MONTADO dos produtos consultados
      for (const it of itensExtraidos) {
        const codigoProd = it.codigo_produto;
        if (!codigoProd) continue;

        const prodResp = mapaProdutos[codigoProd];
        if (prodResp) {
          const modelo = prodResp.modelo || (prodResp.produto && prodResp.produto.modelo) || '';
          const obsInternas = prodResp.obs_internas || (prodResp.produto && prodResp.produto.obs_internas) || '';

          if (modelo) {
            it.local = modelo;
            console.log(`📍 LOCAL definido para ${it.codigo}: ${modelo}`);
          }
          if (obsInternas) {
            it.pre_montado = obsInternas;
            console.log(`🔧 PRE-MONTADO definido para ${it.codigo}: ${obsInternas}`);
          }
        } else {
          console.warn(`⚠️ Produto ${codigoProd} não encontrado no mapa de resultados`);
        }
      }

      itens = aggregateItensPorDescricao(itensExtraidos, nid);
      savePedidoCache(nid, num_pedido, detalhe, produtos, itens);
      console.log(`💾 Pedido ${num_pedido} salvo no cache`);
    }

    const itensOrdenados = ordenarItens(itens, ordenar);

    res.json({
      success: true,
      pedido_id: nid,
      num_pedido,
      detalhe,
      produtos,
      itens: itensOrdenados
    });

  } catch (error) {
    console.error('Erro ao consultar pedido:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/toggle-flag', (req, res) => {
  const { pedido_id, item_desc, flag } = req.body;

  if (!pedido_id || !flag || !['separado', 'transferido'].includes(flag)) {
    return res.status(400).json({ error: 'Parâmetros inválidos' });
  }

  try {
    const key = `${pedido_id}_desc:${item_desc}`;
    const current = STATUS_FLAGS[key] || { separado: false, transferido: false };
    current[flag] = !current[flag];
    STATUS_FLAGS[key] = current;

    saveFlagToFile(pedido_id, `desc:${item_desc}`, current.separado, current.transferido);

    res.json({ success: true, flags: current });
  } catch (error) {
    console.error('Erro ao toggle flag:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Programa Separador Backend rodando em http://localhost:${PORT}`);
  console.log(`📁 Database (JSON): ${DATABASE_DIR}`);
});
