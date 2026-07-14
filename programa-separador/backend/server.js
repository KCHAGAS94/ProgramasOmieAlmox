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
const OMIE_AJUSTE_ESTOQUE_URL = "https://app.omie.com.br/api/v1/estoque/ajuste/";

// Caminho do database (na raiz do projeto)
const DATABASE_DIR = join(__dirname, '..', '..', 'banco-de-dados', 'compartilhado');
const PEDIDOS_FILE = join(DATABASE_DIR, 'separador-pedidos.json');
const FLAGS_FILE = join(DATABASE_DIR, 'separador-flags.json');
const OBS_FILE = join(DATABASE_DIR, 'separador-observacoes.json');
const AJUSTES_ESTOQUE_FILE = join(__dirname, '..', '..', 'banco-de-dados', 'inventario', 'ajustes-estoque.json');

// Cache em memória
let PEDIDOS_CACHE = [];
let STATUS_FLAGS = {};
let PRODUTOS_CACHE = {}; // Cache de produtos consultados (codigo_produto => dados)

// Progresso da sincronização de ajustes de estoque
let progressoSincAjustes = {
  sincronizando: false,
  paginaAtual: 0,
  totalPaginas: 0,
  registrosSalvos: 0,
  mensagem: '',
  erro: null
};

// Caminho do banco de produtos (usado p/ resolver código string → codigo_produto numérico)
const PRODUTOS_FILE = join(__dirname, '..', '..', 'banco-de-dados', 'inventario', 'produtos.json');

// Cache do índice de ajustes de estoque para cálculo de STATUS RM
let INDICE_AJUSTES_RM = null;
let INDICE_AJUSTES_RM_MTIME = 0;

// Cache do mapa de produtos: codigo (string) → codigo_produto (numérico)
let MAPA_PRODUTOS_BY_CODIGO = null;
let MAPA_PRODUTOS_MTIME = 0;

function obterMapaProdutosByCodigo() {
  try {
    if (!fs.existsSync(PRODUTOS_FILE)) {
      MAPA_PRODUTOS_BY_CODIGO = new Map();
      return MAPA_PRODUTOS_BY_CODIGO;
    }
    const stat = fs.statSync(PRODUTOS_FILE);
    if (MAPA_PRODUTOS_BY_CODIGO && stat.mtimeMs === MAPA_PRODUTOS_MTIME) {
      return MAPA_PRODUTOS_BY_CODIGO;
    }
    const dados = JSON.parse(fs.readFileSync(PRODUTOS_FILE, 'utf-8'));
    const produtos = Array.isArray(dados.produtos) ? dados.produtos : [];
    const mapa = new Map();
    for (const p of produtos) {
      if (p.codigo && p.codigo_produto) {
        mapa.set(String(p.codigo).trim().toUpperCase(), p.codigo_produto);
      }
    }
    MAPA_PRODUTOS_BY_CODIGO = mapa;
    MAPA_PRODUTOS_MTIME = stat.mtimeMs;
    console.log(`[STATUS RM] Mapa de produtos carregado: ${mapa.size} códigos.`);
    return MAPA_PRODUTOS_BY_CODIGO;
  } catch (err) {
    console.error('[STATUS RM] Falha ao carregar mapa de produtos:', err.message);
    return MAPA_PRODUTOS_BY_CODIGO || new Map();
  }
}

function resolverCodigosProdutoPorTexto(texto) {
  if (!texto) return [];
  const mapa = obterMapaProdutosByCodigo();
  // pre_montado pode vir como "CA-A" ou "CA-A, CA-B" ou "CA-A/CA-B" — separa por vírgula/barra/espaço
  const tokens = String(texto).split(/[\s,/;]+/).map(t => t.trim().toUpperCase()).filter(Boolean);
  const ids = [];
  for (const tok of tokens) {
    const id = mapa.get(tok);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function obterIndiceAjustesRm() {
  try {
    if (!fs.existsSync(AJUSTES_ESTOQUE_FILE)) {
      INDICE_AJUSTES_RM = new Map();
      return INDICE_AJUSTES_RM;
    }
    const stat = fs.statSync(AJUSTES_ESTOQUE_FILE);
    if (INDICE_AJUSTES_RM && stat.mtimeMs === INDICE_AJUSTES_RM_MTIME) {
      return INDICE_AJUSTES_RM;
    }
    const dados = JSON.parse(fs.readFileSync(AJUSTES_ESTOQUE_FILE, 'utf-8'));
    const ajustes = Array.isArray(dados.ajustes) ? dados.ajustes : [];
    const indice = new Map();
    for (const a of ajustes) {
      if (a.id_prod == null) continue;
      const lista = indice.get(a.id_prod) || [];
      lista.push({ obs: a.obs || '', quantidade: Number(a.quantidade) || 0 });
      indice.set(a.id_prod, lista);
    }
    INDICE_AJUSTES_RM = indice;
    INDICE_AJUSTES_RM_MTIME = stat.mtimeMs;
    console.log(`[STATUS RM] Índice carregado: ${ajustes.length} ajustes, ${indice.size} id_prod únicos.`);
    return INDICE_AJUSTES_RM;
  } catch (err) {
    console.error('[STATUS RM] Falha ao indexar ajustes:', err.message);
    return INDICE_AJUSTES_RM || new Map();
  }
}

function calcularStatusRm(codigosProduto, numPedido, dividirPor2 = false) {
  if (!numPedido || !codigosProduto || codigosProduto.length === 0) return '';
  const indice = obterIndiceAjustesRm();
  const regex = new RegExp(`\\bP-${numPedido}\\b`, 'i');
  let qtdTotal = 0;
  let achou = false;
  for (const idProd of codigosProduto) {
    const registros = indice.get(idProd);
    if (!registros) continue;
    for (const r of registros) {
      if (regex.test(r.obs)) {
        achou = true;
        qtdTotal += r.quantidade;
      }
    }
  }
  if (!achou) return '';
  // Quando o LOCAL é KANBAN, a quantidade do STATUS RM é dividida por 2
  if (dividirPor2) {
    qtdTotal = qtdTotal / 2;
  }
  // Remove o ".0" desnecessário (ex: 5.0 -> 5), mantendo decimais quando houver (ex: 2.5)
  const qtdFormatada = Number.isInteger(qtdTotal) ? qtdTotal : parseFloat(qtdTotal.toFixed(2));
  return `OK, Qtd: ${qtdFormatada}`;
}

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
  if (!fs.existsSync(OBS_FILE)) {
    fs.writeFileSync(OBS_FILE, JSON.stringify({}, null, 2));
  }
}

// Cache em memória dos arquivos JSON com invalidação por mtime
let FLAGS_MTIME = 0;
let PEDIDOS_OBJ = null;
let PEDIDOS_MTIME = 0;
let LISTAS_CACHE = { pendentes: null, concluidos: null, key: null };

function invalidarListasCache() {
  LISTAS_CACHE = { pendentes: null, concluidos: null, key: null };
}

function loadFlagsFromFile(force = false) {
  try {
    ensureDatabase();
    const stat = fs.statSync(FLAGS_FILE);
    if (!force && STATUS_FLAGS && stat.mtimeMs === FLAGS_MTIME) {
      return STATUS_FLAGS;
    }
    const data = fs.readFileSync(FLAGS_FILE, 'utf-8');
    STATUS_FLAGS = JSON.parse(data);
    FLAGS_MTIME = stat.mtimeMs;
    invalidarListasCache();
    console.log(`✅ Flags carregadas: ${Object.keys(STATUS_FLAGS).length} registros`);
    return STATUS_FLAGS;
  } catch (error) {
    console.error('Erro ao carregar flags:', error.message);
    STATUS_FLAGS = {};
    return STATUS_FLAGS;
  }
}

function loadPedidosCached(force = false) {
  try {
    ensureDatabase();
    const stat = fs.statSync(PEDIDOS_FILE);
    if (!force && PEDIDOS_OBJ && stat.mtimeMs === PEDIDOS_MTIME) {
      return PEDIDOS_OBJ;
    }
    PEDIDOS_OBJ = JSON.parse(fs.readFileSync(PEDIDOS_FILE, 'utf-8'));
    PEDIDOS_MTIME = stat.mtimeMs;
    invalidarListasCache();
    return PEDIDOS_OBJ;
  } catch (error) {
    console.error('Erro ao carregar pedidos:', error.message);
    PEDIDOS_OBJ = {};
    return PEDIDOS_OBJ;
  }
}

function savePedidosFile(pedidos) {
  fs.writeFileSync(PEDIDOS_FILE, JSON.stringify(pedidos));
  PEDIDOS_OBJ = pedidos;
  PEDIDOS_MTIME = fs.statSync(PEDIDOS_FILE).mtimeMs;
  invalidarListasCache();
}

function saveFlagsFile() {
  fs.writeFileSync(FLAGS_FILE, JSON.stringify(STATUS_FLAGS));
  FLAGS_MTIME = fs.statSync(FLAGS_FILE).mtimeMs;
  invalidarListasCache();
}

function saveFlagToFile(pedidoId, descKey, flagsObj, usuario = 'Sistema') {
  try {
    ensureDatabase();
    const key = `${pedidoId}_${descKey}`;
    STATUS_FLAGS[key] = {
      ...(STATUS_FLAGS[key] || {}),
      ...flagsObj,
      modificado_por: usuario,
      modificado_em: new Date().toISOString()
    };
    saveFlagsFile();
  } catch (error) {
    console.error('Erro ao salvar flag:', error.message);
  }
}

function savePedidoCache(pedidoId, numPedido, detalhe, produtos, itens, usuario = 'Sistema') {
  try {
    ensureDatabase();
    const pedidos = loadPedidosCached();
    const existente = pedidos[String(pedidoId)];
    pedidos[String(pedidoId)] = {
      num_pedido: numPedido,
      detalhe,
      produtos,
      itens,
      criado_em: existente?.criado_em || new Date().toISOString(),
      criado_por: existente?.criado_por || usuario
    };
    savePedidosFile(pedidos);
  } catch (error) {
    console.error('Erro ao salvar pedido:', error.message);
  }
}

function loadPedidoCache(pedidoId) {
  try {
    ensureDatabase();
    const pedidos = loadPedidosCached();
    return pedidos[String(pedidoId)] || null;
  } catch (error) {
    return null;
  }
}

function loadPedidoCachePorNum(normNum) {
  try {
    ensureDatabase();
    const pedidos = loadPedidosCached();
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

async function consultarProdutoPorCodigo(codigoProduto, retries = 3, delay = 2000) {
  // Verifica se o produto já está em cache
  if (PRODUTOS_CACHE[codigoProduto]) {
    console.log(`💾 Produto ${codigoProduto} encontrado em cache`);
    return PRODUTOS_CACHE[codigoProduto];
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Delay inicial antes de cada tentativa (evita erro 425 da API Omie)
      if (attempt > 1) {
        const waitTime = delay * Math.pow(2, attempt - 2);
        console.log(`⏳ Aguardando ${waitTime}ms antes da tentativa ${attempt}...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

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
    // Delay de 2s entre cada requisição (API do Omie bloqueia requisições muito rápidas com erro 425)
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
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

    // Se for objeto, tenta extrair campos de texto relevantes
    if (typeof dadosAdic === 'object' && dadosAdic !== null) {
      const campos = ['observacao', 'obs', 'texto', 'descricao', 'texto_livre', 'obs_item'];
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

// ================== REGRA: AUTO-NÃO-SEPARAR (Espelho + IVOLV da mesma cor) ==================

// Cores canônicas aceitas. Cada entrada mapeia as variações de texto (masculino/feminino)
// que podem aparecer na descrição do produto para uma cor canônica única.
const CORES_CANONICAS = [
  { cor: 'PRETO', variantes: ['PRETO', 'PRETA'] },
  { cor: 'BRANCO', variantes: ['BRANCO', 'BRANCA'] },
  { cor: 'GRAFITE', variantes: ['GRAFITE'] }
];

function ehItemEspelho(descricao) {
  return /\bESPELHO\b/i.test(descricao || '');
}

function ehItemIvolv(descricao) {
  return /\bIVOLV\b/i.test(descricao || '');
}

function ehSemEngrave(descricao) {
  return /SEM\s+ENGRAVE/i.test(descricao || '');
}

// Extrai a cor canônica da descrição de um Espelho. Só reconhece as 3 cores válidas
// (PRETO TEXTURIZADO, BRANCO TEXTURIZADO, GRAFITE TEXTURIZADO); qualquer outra cor retorna null,
// o que força a separação física (não entra na regra de auto-não-separar).
function extrairCorEspelho(descricao) {
  const desc = (descricao || '').toUpperCase();
  if (!/TEXTURIZADO/.test(desc)) return null;
  for (const { cor, variantes } of CORES_CANONICAS) {
    if (variantes.some(v => new RegExp(`\\b${v}\\b`).test(desc))) {
      return cor;
    }
  }
  return null;
}

// Extrai a cor canônica da descrição de um IVOLV (cores fixas: TECLA PRETA/PRETO, TECLA BRANCA/BRANCO, TECLA GRAFITE).
function extrairCorIvolv(descricao) {
  const desc = (descricao || '').toUpperCase();
  for (const { cor, variantes } of CORES_CANONICAS) {
    if (variantes.some(v => new RegExp(`\\b${v}\\b`).test(desc))) {
      return cor;
    }
  }
  return null;
}

// Percorre os itens NA SEQUÊNCIA ORIGINAL do pedido do Omie (antes de qualquer agrupamento) e marca,
// para cada IVOLV "SEM ENGRAVE" cujo item imediatamente anterior é um Espelho da mesma cor,
// autoNaoSeparar = true e kanban = true (flag "Não Separar" automática).
function aplicarRegraAutoNaoSeparar(itens) {
  for (let i = 0; i < itens.length; i++) {
    const atual = itens[i];
    atual.autoNaoSeparar = false;

    if (i === 0) continue;
    if (!ehItemIvolv(atual.descricao) || !ehSemEngrave(atual.descricao)) continue;

    const anterior = itens[i - 1];
    if (!ehItemEspelho(anterior.descricao)) continue;

    const corEspelho = extrairCorEspelho(anterior.descricao);
    const corIvolv = extrairCorIvolv(atual.descricao);

    if (corEspelho && corIvolv && corEspelho === corIvolv) {
      atual.autoNaoSeparar = true;
      atual.kanban = true;
    }
  }
}

function aggregateItensPorDescricao(itens, pedidoId) {
  aplicarRegraAutoNaoSeparar(itens);

  const agg = {};

  for (const it of itens) {
    const desc = (it.descricao || '').trim();
    const codigo = (it.codigo || '').trim();
    const local = (it.local || '').trim();
    const preMontado = (it.pre_montado || '').trim();
    const autoNaoSeparar = !!it.autoNaoSeparar;

    // Agrupa por local + pre_montado + autoNaoSeparar se local/pre_montado existirem; senão por codigo+descricao.
    // autoNaoSeparar entra na chave para nunca misturar, na mesma linha/lista de seriais, itens que
    // precisam ser separados fisicamente com itens que não precisam (cor do IVOLV bate com o Espelho acima).
    let keyAgg;
    if (local && preMontado) {
      keyAgg = `LOCAL_PRE|||${local}|||${preMontado}|||${autoNaoSeparar}`;
    } else {
      keyAgg = `INDIVIDUAL|||${codigo}|||${desc}|||${autoNaoSeparar}`;
    }

    if (!agg[keyAgg]) {
      agg[keyAgg] = {
        codigos: [],      // Array de códigos diferentes
        codigos_produto: [], // Array de IDs numéricos do produto (Omie)
        descricoes: [],   // Array de descrições diferentes
        quantidade: 0,
        dados: [],
        local: it.local,
        pre_montado: it.pre_montado,
        separado: false,
        transferido: false,
        autoNaoSeparar: false
      };
    }

    if (autoNaoSeparar) {
      agg[keyAgg].autoNaoSeparar = true;
    }

    // Adiciona código se não estiver na lista
    if (codigo && !agg[keyAgg].codigos.includes(codigo)) {
      agg[keyAgg].codigos.push(codigo);
    }

    // Adiciona codigo_produto numérico se não estiver na lista
    if (it.codigo_produto && !agg[keyAgg].codigos_produto.includes(it.codigo_produto)) {
      agg[keyAgg].codigos_produto.push(it.codigo_produto);
    }

    // Adiciona descrição se não estiver na lista
    if (desc && !agg[keyAgg].descricoes.includes(desc)) {
      agg[keyAgg].descricoes.push(desc);
    }

    const q = toFloat(it.quantidade);
    if (q !== null) {
      agg[keyAgg].quantidade += q;
    } else {
      agg[keyAgg].quantidade = `${agg[keyAgg].quantidade} + ${it.quantidade}`;
    }

    if (it.dados_adicionais_item) {
      let valorFinal = '';

      // Se for objeto, converte para JSON legível
      if (typeof it.dados_adicionais_item === 'object' && it.dados_adicionais_item !== null) {
        // Tenta extrair campos de texto primeiro
        const textos = [];
        const extrairTextos = (obj, prefixo = '') => {
          for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string' && value.trim() !== '') {
              textos.push(value.trim());
            } else if (typeof value === 'object' && value !== null) {
              extrairTextos(value, key + '.');
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
    // Ordena arrays antes de concatenar (garante chave consistente)
    e.codigos.sort();
    e.descricoes.sort();

    // Converte arrays de códigos e descrições em strings concatenadas
    e.codigo = e.codigos.join(', ');
    e.descricao = e.descricoes.join(', ');

    // Usa as descrições ordenadas para criar chave consistente
    const keyFlag = `${pedidoId}_desc:${e.descricao}`;
    const flags = STATUS_FLAGS[keyFlag] || {};

    if (typeof e.quantidade === 'number' && Number.isInteger(e.quantidade)) {
      e.quantidade = Math.floor(e.quantidade);
    }

    e.separado = flags.separado || false;
    e.transferido = flags.transferido || false;
    const kanbanAuto = String(e.local || '').toLowerCase().includes('kanban');
    // autoNaoSeparar (Espelho + IVOLV da mesma cor) força kanban=true, sem depender de clique manual
    e.kanban = e.autoNaoSeparar ? true : (('kanban' in flags) ? !!flags.kanban : kanbanAuto);

    // Garante que todos os elementos sejam strings antes de juntar
    const dadosLimpos = e.dados.map(d => {
      if (typeof d === 'object' && d !== null) {
        // Se ainda for objeto, tenta extrair texto ou converte para JSON
        return JSON.stringify(d);
      }
      return String(d);
    }).filter(d => d && d.trim() !== '');

    e.dados_adicionais_item = dadosLimpos.length > 0 ? dadosLimpos.join(', ') : '';

    // Remove arrays temporários
    delete e.codigos;
    delete e.descricoes;

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
  const { num_pedido, refresh, ordenar, usuario } = req.body;

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
        // Se não encontrou no cache local, força recarga da API e tenta novamente
        console.log('⚠️ Pedido não encontrado no cache, recarregando da API...');
        await listarPedidosEtapa('50');

        for (const p of PEDIDOS_CACHE) {
          const pnum = String(p.cNumPedido || '');
          const pnumNorm = pnum.replace(/^0+/, '') || '0';
          if (pnumNorm === normNum) {
            nid = p.nIdPed;
            break;
          }
        }

        if (!nid) {
          return res.status(404).json({ error: `Pedido ${num_pedido} não encontrado` });
        }
      }
    }

    let detalhe, produtos, itens;

    const cached = loadPedidoCache(nid);
    if (cached && !refresh) {
      console.log('[CACHE] Usando cache do pedido:', nid);
      detalhe = cached.detalhe;
      produtos = cached.produtos;

      // IMPORTANTE: Re-extrai itens
      const itensExtraidos = extrairItens(detalhe);

      // Restaura local e pre_montado dos dados de produtos salvos
      for (const it of itensExtraidos) {
        const prodInfo = produtos.find(p => p.codigo_produto === it.codigo_produto);
        if (prodInfo && prodInfo.resposta) {
          const modelo = prodInfo.resposta.modelo || (prodInfo.resposta.produto && prodInfo.resposta.produto.modelo) || '';
          const obsInternas = prodInfo.resposta.obs_internas || (prodInfo.resposta.produto && prodInfo.resposta.produto.obs_internas) || '';

          if (modelo) it.local = modelo;
          if (obsInternas) it.pre_montado = obsInternas;

          console.log('[CACHE] Restaurado local/pré:', it.codigo, '→', it.local, '/', it.pre_montado);
        }
      }

      // Re-agrega com a nova lógica
      itens = aggregateItensPorDescricao(itensExtraidos, nid);

      console.log('[CACHE] Itens re-agregados com nova lógica:', itens.length);
    }

    if (refresh || !cached) {
      // Se refresh=true, limpa o cache de produtos para buscar dados atualizados do Omie
      if (refresh) {
        const produtosLimpos = Object.keys(PRODUTOS_CACHE).length;
        PRODUTOS_CACHE = {};
        console.log(`🔄 REFRESH: Cache de produtos limpo (${produtosLimpos} produtos removidos)`);
      }

      detalhe = await consultarPedidoPorId(nid);
      const itensExtraidos = extrairItens(detalhe);

      for (const it of itensExtraidos) {
        const key = `${nid}_${it.codigo}`;
        const flags = STATUS_FLAGS[key] || {};
        it.separado = flags.separado || false;
        it.transferido = flags.transferido || false;
      }

      // ✨ OTIMIZAÇÃO: Busca produtos em LOTES (1 por vez) para evitar erro 425 da API do Omie
      console.log(`📦 Consultando ${itensExtraidos.length} produtos...`);
      const codigosProdutos = itensExtraidos
        .map(it => it.codigo_produto)
        .filter(cod => cod); // Remove valores vazios

      // Remove duplicatas mantendo a ordem
      const codigosUnicos = [...new Set(codigosProdutos)];
      console.log(`🔍 Total de produtos únicos a consultar: ${codigosUnicos.length}`);

      // Faz consultas SEQUENCIALMENTE (1 por vez) porque a API do Omie bloqueia requisições paralelas com erro 425
      const consultarProdutoComTratamento = async (codigoProd) => {
        try {
          const resposta = await consultarProdutoPorCodigo(codigoProd);
          return { codigoProd, resposta, sucesso: true };
        } catch (error) {
          return { codigoProd, erro: error.message, sucesso: false };
        }
      };

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
      savePedidoCache(nid, num_pedido, detalhe, produtos, itens, usuario || 'Sistema');
    }

    const itensOrdenados = ordenarItens(itens, ordenar);

    if (refresh && fs.existsSync(AJUSTES_ESTOQUE_FILE) && !progressoSincAjustes.sincronizando) {
      console.log('[STATUS RM] Refresh: rodando sinc incremental antes de calcular STATUS RM...');
      await sincronizarAjustesEstoque();
    }

    for (const item of itensOrdenados) {
      const idsPreMontado = resolverCodigosProdutoPorTexto(item.pre_montado);
      const idsCombinados = [...(item.codigos_produto || []), ...idsPreMontado];
      // Se o LOCAL do item contém "KANBAN", divide a quantidade do STATUS RM por 2
      const localKanban = /KANBAN/i.test(item.local || '');
      item.status_rm = calcularStatusRm(idsCombinados, num_pedido, localKanban);
    }

    const pedidoSalvo = loadPedidoCache(nid);
    res.json({
      success: true,
      pedido_id: nid,
      num_pedido,
      detalhe,
      produtos,
      itens: itensOrdenados,
      concluido_manual: pedidoSalvo?.concluido_manual || false
    });

  } catch (error) {
    console.error('Erro ao consultar pedido:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/toggle-flag', (req, res) => {
  const { pedido_id, item_desc, flag, usuario } = req.body;

  if (!pedido_id || !flag || !['separado', 'transferido', 'kanban'].includes(flag)) {
    return res.status(400).json({ error: 'Parâmetros inválidos' });
  }

  try {
    // Normaliza a descrição (ordena se tiver vírgulas)
    const descNormalizada = item_desc.includes(', ')
      ? item_desc.split(', ').sort().join(', ')
      : item_desc;

    const key = `${pedido_id}_desc:${descNormalizada}`;
    const current = STATUS_FLAGS[key] || { separado: false, transferido: false, kanban: false };
    current[flag] = !current[flag];

    saveFlagToFile(pedido_id, `desc:${descNormalizada}`, {
      separado: current.separado,
      transferido: current.transferido,
      kanban: current.kanban
    }, usuario || 'Sistema');

    // Verifica se todos os itens do pedido estão transferidos para registrar conclusão
    try {
      const pedidos = loadPedidosCached();
      const pedido = pedidos[String(pedido_id)];
      if (pedido && pedido.itens) {
        const itensExtraidos = extrairItens(pedido.detalhe);
        const itensAgregados = aggregateItensPorDescricao(itensExtraidos, pedido_id);
        const todosConcluidos = itensAgregados.length > 0 && itensAgregados.every(i => i.transferido);

        if (todosConcluidos && !pedido.concluido_em) {
          pedido.concluido_em = new Date().toISOString();
          pedido.concluido_por = usuario || 'Sistema';
          savePedidosFile(pedidos);
        } else if (!todosConcluidos && pedido.concluido_em) {
          delete pedido.concluido_em;
          delete pedido.concluido_por;
          savePedidosFile(pedidos);
        }
      }
    } catch (err) {
      console.error('Erro ao verificar conclusão:', err.message);
    }

    // Retorna o objeto completo com auditoria
    res.json({
      success: true,
      flags: STATUS_FLAGS[key]
    });
  } catch (error) {
    console.error('Erro ao toggle flag:', error);
    res.status(500).json({ error: error.message });
  }
});

// Concluir pedido (apenas marca como concluído, sem alterar flags dos itens)
app.post('/api/concluir-pedido', (req, res) => {
  const { pedido_id, usuario } = req.body;

  if (!pedido_id) {
    return res.status(400).json({ error: 'pedido_id é obrigatório' });
  }

  try {
    const pedidos = loadPedidosCached();
    const pedido = pedidos[String(pedido_id)];

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    pedido.concluido_em = new Date().toISOString();
    pedido.concluido_por = usuario || 'Sistema';
    pedido.concluido_manual = true;
    savePedidosFile(pedidos);

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao concluir pedido:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reverter conclusão de um pedido (apenas admin)
app.post('/api/reverter-conclusao', (req, res) => {
  const { pedido_id } = req.body;

  if (!pedido_id) {
    return res.status(400).json({ error: 'pedido_id é obrigatório' });
  }

  try {
    const pedidos = loadPedidosCached();
    const pedido = pedidos[String(pedido_id)];

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    delete pedido.concluido_em;
    delete pedido.concluido_por;
    delete pedido.concluido_manual;
    savePedidosFile(pedidos);

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao reverter conclusão:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rota para deletar/resetar um item (remove as flags)
app.post('/api/deletar-item', (req, res) => {
  const { pedido_id, item_desc, usuario } = req.body;

  if (!pedido_id || !item_desc) {
    return res.status(400).json({ error: 'Parâmetros inválidos' });
  }

  try {
    // Normaliza a descrição (ordena se tiver vírgulas)
    const descNormalizada = item_desc.includes(', ')
      ? item_desc.split(', ').sort().join(', ')
      : item_desc;

    const key = `${pedido_id}_desc:${descNormalizada}`;

    // Remove as flags do item
    if (STATUS_FLAGS[key]) {
      delete STATUS_FLAGS[key];
      saveFlagsFile();
      console.log(`🗑️ Item deletado: ${key} (por ${usuario || 'Sistema'})`);
    }

    res.json({
      success: true,
      message: 'Item resetado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao deletar item:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rota para deletar um pedido completo do banco de dados
app.post('/api/deletar-pedido', (req, res) => {
  const { pedido_id, usuario } = req.body;

  if (!pedido_id) {
    return res.status(400).json({ error: 'Parâmetros inválidos' });
  }

  try {
    ensureDatabase();

    // Remove o pedido do cache JSON
    const pedidos = loadPedidosCached();
    const pedidoRemovido = pedidos[String(pedido_id)];

    if (pedidoRemovido) {
      delete pedidos[String(pedido_id)];
      savePedidosFile(pedidos);
      console.log(`🗑️ Pedido ${pedidoRemovido.num_pedido} (ID: ${pedido_id}) deletado do banco de dados (por ${usuario || 'Sistema'})`);
    }

    // Remove todas as flags relacionadas ao pedido
    const flagsParaRemover = Object.keys(STATUS_FLAGS).filter(key => key.startsWith(`${pedido_id}_`));
    flagsParaRemover.forEach(key => delete STATUS_FLAGS[key]);

    if (flagsParaRemover.length > 0) {
      saveFlagsFile();
      console.log(`🗑️ ${flagsParaRemover.length} flags removidas do pedido ${pedido_id}`);
    }

    // Remove do cache em memória
    PEDIDOS_CACHE = PEDIDOS_CACHE.filter(p => p.nIdPed !== parseInt(pedido_id));

    res.json({
      success: true,
      message: `Pedido ${pedidoRemovido?.num_pedido || pedido_id} excluído com sucesso`,
      flags_removidas: flagsParaRemover.length
    });
  } catch (error) {
    console.error('Erro ao deletar pedido:', error);
    res.status(500).json({ error: error.message });
  }
});

// Salvar observação de um pedido
app.post('/api/salvar-observacao', (req, res) => {
  try {
    ensureDatabase();
    const { pedidoId, observacao, usuario } = req.body;
    if (!pedidoId) return res.status(400).json({ error: 'pedidoId é obrigatório' });
    const obs = JSON.parse(fs.readFileSync(OBS_FILE, 'utf-8'));
    obs[String(pedidoId)] = {
      observacao: observacao || '',
      modificado_por: usuario || 'Sistema',
      modificado_em: new Date().toISOString()
    };
    fs.writeFileSync(OBS_FILE, JSON.stringify(obs, null, 2));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obter observação de um pedido
app.get('/api/observacao/:pedidoId', (req, res) => {
  try {
    ensureDatabase();
    const obs = JSON.parse(fs.readFileSync(OBS_FILE, 'utf-8'));
    const data = obs[String(req.params.pedidoId)] || null;
    res.json({ observacao: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Computa pendentes e concluídos em uma única passada e memoiza por mtime
function computarListas() {
  loadFlagsFromFile();
  const pedidos = loadPedidosCached();

  let obsMtime = 0;
  try { obsMtime = fs.statSync(OBS_FILE).mtimeMs; } catch {}
  const cacheKey = `${PEDIDOS_MTIME}|${FLAGS_MTIME}|${obsMtime}`;

  if (LISTAS_CACHE.key === cacheKey && LISTAS_CACHE.pendentes && LISTAS_CACHE.concluidos) {
    return { pendentes: LISTAS_CACHE.pendentes, concluidos: LISTAS_CACHE.concluidos };
  }

  const pendentes = [];
  const concluidos = [];

  for (const [pedidoId, pedidoData] of Object.entries(pedidos)) {
    if (!pedidoData.itens || pedidoData.itens.length === 0) continue;

    const itensExtraidos = extrairItens(pedidoData.detalhe);

    // Restaura local e pre_montado dos produtos salvos
    for (const it of itensExtraidos) {
      const prodInfo = pedidoData.produtos?.find(p => p.codigo_produto === it.codigo_produto);
      if (prodInfo && prodInfo.resposta) {
        const modelo = prodInfo.resposta.modelo || (prodInfo.resposta.produto && prodInfo.resposta.produto.modelo) || '';
        const obsInternas = prodInfo.resposta.obs_internas || (prodInfo.resposta.produto && prodInfo.resposta.produto.obs_internas) || '';
        if (modelo) it.local = modelo;
        if (obsInternas) it.pre_montado = obsInternas;
      }
    }

    const itensAgregados = aggregateItensPorDescricao(itensExtraidos, pedidoId);
    const totalItens = itensAgregados.length;
    const itensTransferidos = itensAgregados.filter(item => item.transferido).length;
    const todosTransferidos = totalItens > 0 && totalItens === itensTransferidos;

    if (!todosTransferidos && !pedidoData.concluido_manual) {
      pendentes.push({
        pedido_id: pedidoId,
        num_pedido: pedidoData.num_pedido,
        itens: itensAgregados
      });
    }

    if (todosTransferidos || pedidoData.concluido_manual) {
      concluidos.push({
        pedido_id: pedidoId,
        num_pedido: pedidoData.num_pedido,
        itens: itensAgregados,
        criado_em: pedidoData.criado_em || null,
        criado_por: pedidoData.criado_por || null,
        concluido_em: pedidoData.concluido_em || null,
        concluido_por: pedidoData.concluido_por || null
      });
    }
  }

  // Anexa observações
  try {
    const obs = JSON.parse(fs.readFileSync(OBS_FILE, 'utf-8'));
    for (const item of pendentes) item.observacao = obs[String(item.pedido_id)]?.observacao || '';
    for (const item of concluidos) item.observacao = obs[String(item.pedido_id)]?.observacao || '';
  } catch {}

  // Ordena concluídos: data de conclusão mais recente primeiro
  concluidos.sort((a, b) => {
    const dataA = a.concluido_em ? new Date(a.concluido_em).getTime() : Math.max(...a.itens.map(i => i.modificado_em ? new Date(i.modificado_em).getTime() : 0));
    const dataB = b.concluido_em ? new Date(b.concluido_em).getTime() : Math.max(...b.itens.map(i => i.modificado_em ? new Date(i.modificado_em).getTime() : 0));
    return dataB - dataA;
  });

  LISTAS_CACHE = { pendentes, concluidos, key: cacheKey };
  return { pendentes, concluidos };
}

// Endpoint para buscar pedidos pendentes (não 100% transferidos)
app.get('/api/itens-pendentes', (req, res) => {
  try {
    res.json(computarListas().pendentes);
  } catch (error) {
    console.error('Erro ao buscar itens pendentes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para buscar pedidos concluídos (100% transferidos)
app.get('/api/itens-concluidos', (req, res) => {
  try {
    res.json(computarListas().concluidos);
  } catch (error) {
    console.error('Erro ao buscar itens concluídos:', error);
    res.status(500).json({ error: error.message });
  }
});

// ================== SINCRONIZAÇÃO DE AJUSTES DE ESTOQUE (OMIE) ==================

async function buscarPaginaAjustes(pagina, registrosPorPagina) {
  const TENTATIVAS_MAX = 4;
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= TENTATIVAS_MAX; tentativa++) {
    try {
      const response = await axios.post(OMIE_AJUSTE_ESTOQUE_URL, {
        call: 'ListarAjusteEstoque',
        app_key: OMIE_APP_KEY,
        app_secret: OMIE_APP_SECRET,
        param: [{
          pagina,
          registros_por_pagina: registrosPorPagina,
          apenas_importado_api: 'N'
        }]
      }, { timeout: 60000, headers: { 'Content-Type': 'application/json' } });

      if (response.data.faultstring) {
        throw new Error(`Erro Omie: ${response.data.faultstring}`);
      }
      return response.data;
    } catch (err) {
      ultimoErro = err;
      const status = err.response?.status;
      const transitorio = !status || status >= 500 || status === 429;
      if (!transitorio || tentativa === TENTATIVAS_MAX) break;

      const espera = 2000 * Math.pow(2, tentativa - 1);
      console.log(`[AJUSTES] ⚠️ Falha pág. ${pagina} (tentativa ${tentativa}/${TENTATIVAS_MAX}, status ${status || 'rede'}). Aguardando ${espera}ms...`);
      await new Promise(resolve => setTimeout(resolve, espera));
    }
  }
  throw ultimoErro;
}

async function sincronizarAjustesEstoque() {
  if (progressoSincAjustes.sincronizando) {
    console.log('[AJUSTES] Sincronização já em andamento, ignorando chamada concorrente.');
    return;
  }
  try {
    progressoSincAjustes = {
      sincronizando: true,
      paginaAtual: 0,
      totalPaginas: 0,
      registrosSalvos: 0,
      mensagem: 'Iniciando sincronização...',
      erro: null
    };

    const REGISTROS_POR_PAGINA = 100;
    const DELAY_ENTRE_PAGINAS = 1500;

    let ajustesExistentes = [];
    if (fs.existsSync(AJUSTES_ESTOQUE_FILE)) {
      try {
        const dados = JSON.parse(fs.readFileSync(AJUSTES_ESTOQUE_FILE, 'utf-8'));
        ajustesExistentes = Array.isArray(dados.ajustes) ? dados.ajustes : [];
      } catch (err) {
        console.warn('[AJUSTES] ⚠️ Falha ao ler arquivo existente, tratando como primeira sinc:', err.message);
      }
    }
    const sincIncremental = ajustesExistentes.length > 0;

    console.log(`[AJUSTES] Iniciando sincronização ${sincIncremental ? 'incremental' : 'completa'}...`);

    const primeiraReq = await buscarPaginaAjustes(1, REGISTROS_POR_PAGINA);
    const totalPaginas = primeiraReq.total_de_paginas || 1;

    const paginaInicial = sincIncremental ? Math.max(1, totalPaginas - 1) : 1;

    progressoSincAjustes.totalPaginas = totalPaginas;
    progressoSincAjustes.paginaAtual = paginaInicial;
    progressoSincAjustes.mensagem = sincIncremental
      ? `Sinc. incremental: páginas ${paginaInicial}-${totalPaginas} de ${totalPaginas}...`
      : `Sincronizando página 1 de ${totalPaginas}...`;

    const ajustesNovos = [];

    if (paginaInicial === 1) {
      extrairAjustes(primeiraReq, ajustesNovos);
    } else {
      await new Promise(resolve => setTimeout(resolve, DELAY_ENTRE_PAGINAS));
      const dadosInicial = await buscarPaginaAjustes(paginaInicial, REGISTROS_POR_PAGINA);
      extrairAjustes(dadosInicial, ajustesNovos);
    }
    progressoSincAjustes.registrosSalvos = ajustesNovos.length;

    for (let pagina = paginaInicial + 1; pagina <= totalPaginas; pagina++) {
      progressoSincAjustes.paginaAtual = pagina;
      progressoSincAjustes.mensagem = `Sincronizando página ${pagina} de ${totalPaginas}...`;

      await new Promise(resolve => setTimeout(resolve, DELAY_ENTRE_PAGINAS));

      const dadosPagina = await buscarPaginaAjustes(pagina, REGISTROS_POR_PAGINA);
      extrairAjustes(dadosPagina, ajustesNovos);
      progressoSincAjustes.registrosSalvos = ajustesNovos.length;
    }

    let ajustesFinais;
    if (sincIncremental) {
      const idsNovos = new Set(ajustesNovos.map(a => a.id_ajuste).filter(id => id !== null));
      const preservados = ajustesExistentes.filter(a => !idsNovos.has(a.id_ajuste));
      ajustesFinais = preservados.concat(ajustesNovos);
    } else {
      ajustesFinais = ajustesNovos;
    }

    const dados = {
      ajustes: ajustesFinais,
      total: ajustesFinais.length,
      total_de_paginas: totalPaginas,
      ultima_sincronizacao: new Date().toISOString()
    };

    fs.mkdirSync(dirname(AJUSTES_ESTOQUE_FILE), { recursive: true });
    fs.writeFileSync(AJUSTES_ESTOQUE_FILE, JSON.stringify(dados, null, 2), 'utf-8');

    const adicionados = sincIncremental ? ajustesFinais.length - ajustesExistentes.length : ajustesFinais.length;
    const msgFinal = sincIncremental
      ? `✅ Sinc. incremental concluída! ${ajustesNovos.length} registros buscados, ${adicionados} novos adicionados (total: ${ajustesFinais.length}).`
      : `✅ Sincronização concluída! ${ajustesFinais.length} ajustes salvos.`;
    console.log(`[AJUSTES] ${msgFinal}`);
    progressoSincAjustes.mensagem = msgFinal;
  } catch (error) {
    console.error('[AJUSTES] ❌ Erro:', error.message);
    progressoSincAjustes.erro = error.message;
    progressoSincAjustes.mensagem = `❌ Erro: ${error.message}`;
  } finally {
    progressoSincAjustes.sincronizando = false;
  }
}

function extrairAjustes(respostaOmie, destino) {
  const lista = respostaOmie.ajuste_estoque_lista || [];
  for (const item of lista) {
    // Salva o registro completo do Omie (todos os campos)
    destino.push({ ...item });
  }
}

app.post('/api/sincronizar-ajustes', (req, res) => {
  if (progressoSincAjustes.sincronizando) {
    return res.status(409).json({ success: false, error: 'Sincronização já em andamento' });
  }
  sincronizarAjustesEstoque();
  res.json({ success: true, message: 'Sincronização iniciada' });
});

app.get('/api/sincronizar-ajustes/progresso', (req, res) => {
  res.json({ success: true, ...progressoSincAjustes });
});

app.get('/api/ajustes-estoque', (req, res) => {
  try {
    if (!fs.existsSync(AJUSTES_ESTOQUE_FILE)) {
      return res.json({ success: true, ajustes: [], total: 0, ultima_sincronizacao: null });
    }
    const dados = JSON.parse(fs.readFileSync(AJUSTES_ESTOQUE_FILE, 'utf-8'));
    res.json({ success: true, ...dados });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Programa Separador Backend rodando em:`);
  console.log(`   Local: http://localhost:${PORT}`);
  console.log(`   Rede:  http://192.168.1.70:${PORT}`);
  console.log(`📁 Database (JSON): ${DATABASE_DIR}`);
});
