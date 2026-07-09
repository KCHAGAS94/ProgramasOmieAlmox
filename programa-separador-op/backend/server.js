import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4003;

// Caminho para o arquivo de cache
const DB_DIR = path.join(__dirname, '..', '..', 'banco-de-dados', 'separador-op');
const CACHE_FILE = path.join(DB_DIR, 'ops-cache.json');
// Caminho para o arquivo de edições
const EDICOES_FILE = path.join(DB_DIR, 'ops-edicoes.json');
// Caminho para o arquivo de associações (pai/filha)
const ASSOCIACOES_FILE = path.join(DB_DIR, 'ops-associacoes.json');
// Cache persistente dos detalhes completos de OPs já carregadas (evita re-fetch no Omie a cada clique)
const OP_DETALHES_CACHE_FILE = path.join(DB_DIR, 'op-detalhes-cache.json');

// Arquivos do módulo de inventário (ajustes de estoque e mapa de produtos)
const INVENTARIO_DIR = path.join(__dirname, '..', '..', 'banco-de-dados', 'inventario');
const AJUSTES_ESTOQUE_FILE = path.join(INVENTARIO_DIR, 'ajustes-estoque.json');
const PRODUTOS_INVENTARIO_FILE = path.join(INVENTARIO_DIR, 'produtos.json');

// Estado do progresso da sincronização
let progressoSincronizacao = {
  emAndamento: false,
  porcentagem: 0,
  mensagem: '',
  paginaAtual: 0,
  totalPaginas: 0
};

// Configurações Omie
const OMIE_APP_KEY = "2694922638408";
const OMIE_APP_SECRET = "02995c034ba5ba2ef1a297240bbb5bf5";
const OMIE_OP_URL = "https://app.omie.com.br/api/v1/produtos/op/";
const OMIE_PRODUTO_URL = "https://app.omie.com.br/api/v1/geral/produtos/";
const OMIE_MALHA_URL = "https://app.omie.com.br/api/v1/geral/malha/";
const OMIE_AJUSTE_ESTOQUE_URL = "https://app.omie.com.br/api/v1/estoque/ajuste/";

// Progresso da sincronização de ajustes de estoque (compartilha o JSON com o programa-separador)
let progressoSincAjustes = {
  sincronizando: false,
  paginaAtual: 0,
  totalPaginas: 0,
  registrosSalvos: 0,
  mensagem: '',
  erro: null
};

// Cache de API para evitar redundant consumption
const apiCache = new Map();
const CACHE_TTL = 120000; // 2 minutos

// Limpa cache expirado a cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of apiCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      apiCache.delete(key);
    }
  }
}, 300000);

// Middleware
app.use(cors());
app.use(express.json());

// ================== FUNÇÕES DE CACHE ==================

function lerCache() {
  if (!fs.existsSync(CACHE_FILE)) {
    return { ops: [], ultima_pagina: 0, total_paginas: 0, ultima_atualizacao: null };
  }
  const data = fs.readFileSync(CACHE_FILE, 'utf8');
  return JSON.parse(data);
}

function salvarCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function lerEdicoes() {
  if (!fs.existsSync(EDICOES_FILE)) {
    return {};
  }
  const data = fs.readFileSync(EDICOES_FILE, 'utf8');
  return JSON.parse(data);
}

function salvarEdicoes(edicoes) {
  fs.writeFileSync(EDICOES_FILE, JSON.stringify(edicoes, null, 2), 'utf8');
}

function lerAssociacoes() {
  if (!fs.existsSync(ASSOCIACOES_FILE)) {
    return {};
  }
  const data = fs.readFileSync(ASSOCIACOES_FILE, 'utf8');
  return JSON.parse(data);
}

function salvarAssociacoes(associacoes) {
  fs.writeFileSync(ASSOCIACOES_FILE, JSON.stringify(associacoes, null, 2), 'utf8');
}

function lerOpDetalhesCache() {
  if (!fs.existsSync(OP_DETALHES_CACHE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(OP_DETALHES_CACHE_FILE, 'utf8'));
  } catch (err) {
    console.error('[OP-DETALHES-CACHE] Erro ao parsear arquivo:', err.message);
    return {};
  }
}

function salvarOpDetalhesCache(cache) {
  fs.writeFileSync(OP_DETALHES_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

// ================== FUNÇÕES OMIE ==================

async function callOmieOP(call, params) {
  const payload = {
    call,
    app_key: OMIE_APP_KEY,
    app_secret: OMIE_APP_SECRET,
    param: [params]
  };

  console.log(`[OMIE] Chamando: ${call}`, JSON.stringify(params, null, 2));

  try {
    const response = await axios.post(OMIE_OP_URL, payload, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.faultstring) {
      throw new Error(`Erro Omie: ${response.data.faultstring}`);
    }

    console.log(`[OMIE] Resposta recebida:`, response.data);
    return response.data;
  } catch (error) {
    console.error('[OMIE] Erro:', error.message);
    throw error;
  }
}

async function callOmieMalha(call, params) {
  // Cria chave de cache baseada no call e params
  const cacheKey = `malha_${call}_${JSON.stringify(params)}`;

  // Verifica se existe no cache e se ainda é válido
  const cached = apiCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`[OMIE MALHA] ⚡ Usando cache para: ${call}`);
    return cached.data;
  }

  const payload = {
    call,
    app_key: OMIE_APP_KEY,
    app_secret: OMIE_APP_SECRET,
    param: [params]
  };

  console.log(`[OMIE MALHA] Chamando: ${call}`, JSON.stringify(params, null, 2));

  try {
    const response = await axios.post(OMIE_MALHA_URL, payload, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.faultstring) {
      throw new Error(`Erro Omie Malha: ${response.data.faultstring}`);
    }

    // Armazena no cache
    apiCache.set(cacheKey, {
      data: response.data,
      timestamp: Date.now()
    });

    console.log(`[OMIE MALHA] Resposta recebida:`, response.data);
    return response.data;
  } catch (error) {
    console.error('[OMIE MALHA] Erro:', error.message);
    if (error.response) {
      console.error('[OMIE MALHA] Status:', error.response.status);
      console.error('[OMIE MALHA] Dados do erro:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// Função para explodir conjuntos em suas estruturas
async function explodirConjuntos(itensEstrutura) {
  if (!itensEstrutura || itensEstrutura.length === 0) {
    return itensEstrutura;
  }

  const produtosExplodidos = [];

  for (const item of itensEstrutura) {
    // Pega o código do produto (pode estar em nCodProduto ou nIdProdutoMalha)
    const codigoProduto = item.nCodProduto || item.nIdProdutoMalha;
    const quantidade = item.nQtde || 0;

    console.log(`[CONJUNTO] Verificando produto ${codigoProduto}...`);

    try {
      // Busca os detalhes do produto para ver a descrição
      const detalhes = await callOmieProduto('ConsultarProduto', {
        codigo_produto: codigoProduto
      });

      const descricao = String(detalhes.descricao || '').toUpperCase();

      // Verifica se é um conjunto
      if (descricao.includes('CONJUNTO')) {
        console.log(`[CONJUNTO] ✅ Detectado CONJUNTO: ${detalhes.codigo} - ${detalhes.descricao}`);

        try {
          // Consulta a estrutura do conjunto na API Omie Malha (envia apenas idProduto)
          const estrutura = await callOmieMalha('ConsultarEstrutura', {
            idProduto: codigoProduto
          });

          // Verifica se retornou estrutura válida (campo "itens")
          if (estrutura && estrutura.itens && estrutura.itens.length > 0) {
            console.log(`[CONJUNTO] 📦 Estrutura encontrada com ${estrutura.itens.length} componentes`);

            // Para cada componente da estrutura, adiciona na lista com quantidade calculada
            for (const componente of estrutura.itens) {
              const quantidadeCalculada = (componente.quantProdMalha || 0) * quantidade;

              // Cria um novo item com os campos que o frontend espera
              produtosExplodidos.push({
                nCodProduto: componente.idProdMalha,
                nIdProdutoMalha: componente.idProdMalha,
                nQtde: quantidadeCalculada,
                // Campos adicionais para debug
                _origem_conjunto: detalhes.codigo,
                _conjunto_descricao: detalhes.descricao,
                _quant_malha: componente.quantProdMalha,
                _quant_conjunto_original: quantidade
              });

              console.log(`[CONJUNTO]   └─ ${componente.codProdMalha} - Qtd: ${quantidadeCalculada} (${componente.quantProdMalha} x ${quantidade})`);
            }
          } else {
            console.log(`[CONJUNTO] ⚠️ Estrutura vazia, mantendo produto original`);
            produtosExplodidos.push(item);
          }
        } catch (errorMalha) {
          console.error(`[CONJUNTO] ❌ Erro ao consultar estrutura:`, errorMalha.message);
          // Em caso de erro, mantém o produto original
          produtosExplodidos.push(item);
        }
      } else {
        console.log(`[CONJUNTO] ➡️ Não é conjunto, mantendo produto normal`);
        // Não é conjunto, adiciona normalmente
        produtosExplodidos.push(item);
      }
    } catch (errorProduto) {
      console.error(`[CONJUNTO] ❌ Erro ao buscar detalhes do produto ${codigoProduto}:`, errorProduto.message);
      // Em caso de erro, mantém o item original
      produtosExplodidos.push(item);
    }

    // Delay de 1000ms (1 segundo) entre produtos para evitar rate limit da API Omie
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return produtosExplodidos;
}

// ================== ROTAS ==================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Separador OP Backend' });
});

// Endpoint SSE para progresso da sincronização
app.get('/api/progresso-sincronizacao', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Envia o estado atual imediatamente
  res.write(`data: ${JSON.stringify(progressoSincronizacao)}\n\n`);

  // Envia atualizações a cada 500ms
  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify(progressoSincronizacao)}\n\n`);
  }, 500);

  // Limpa o interval quando a conexão fecha
  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

// Sincronizar cache de OPs
app.post('/api/sincronizar-cache', async (req, res) => {
  try {
    console.log('[CACHE] Iniciando sincronização...');

    // Reseta o progresso
    progressoSincronizacao = {
      emAndamento: true,
      porcentagem: 0,
      mensagem: 'Iniciando sincronização...',
      paginaAtual: 0,
      totalPaginas: 0
    };

    const cache = lerCache();
    const primeiraVez = cache.ultima_pagina === 0;

    // Primeira requisição para saber o total de páginas
    progressoSincronizacao.mensagem = 'Consultando total de páginas...';

    const primeiraReq = await callOmieOP('ListarOrdemProducao', {
      pagina: 1,
      registros_por_pagina: 100
    });

    const totalPaginas = primeiraReq.total_de_paginas || 1;
    const totalRegistros = primeiraReq.total_de_registros || 0;

    progressoSincronizacao.totalPaginas = totalPaginas;
    progressoSincronizacao.mensagem = `Total: ${totalPaginas} páginas, ${totalRegistros} registros`;

    console.log(`[CACHE] Total de páginas: ${totalPaginas}, Última processada: ${cache.ultima_pagina}`);

    // Define de qual página começar
    // Se não for primeira vez, começa da página ANTERIOR à última processada
    // para garantir que não perde nenhuma OP que possa ter sido adicionada
    let paginaInicial;
    let novasOps = [];

    if (primeiraVez) {
      // Primeira vez: extrai da página 1 e depois busca as demais
      novasOps = (primeiraReq.cadastros || []).map(item => ({
        cNumOP: item.identificacao?.cNumOP,
        nCodOP: item.identificacao?.nCodOP
      }));
      paginaInicial = 2;
    } else {
      // Atualização: começa uma página ANTES da última processada para garantir que não perde nenhuma OP
      paginaInicial = Math.max(1, cache.ultima_pagina - 1);
      console.log(`[CACHE] Iniciando da página ${paginaInicial} (uma antes da última: ${cache.ultima_pagina}, total atual: ${totalPaginas})`);
    }

    if (paginaInicial <= totalPaginas) {
      for (let pagina = paginaInicial; pagina <= totalPaginas; pagina++) {
        // Atualiza progresso
        progressoSincronizacao.paginaAtual = pagina;
        progressoSincronizacao.porcentagem = Math.round((pagina / totalPaginas) * 100);
        progressoSincronizacao.mensagem = `Processando página ${pagina} de ${totalPaginas}...`;

        console.log(`[CACHE] Processando página ${pagina} de ${totalPaginas}...`);

        // Delay de 600ms entre requisições para evitar rate limit
        await new Promise(resolve => setTimeout(resolve, 600));

        const resposta = await callOmieOP('ListarOrdemProducao', {
          pagina: pagina,
          registros_por_pagina: 100
        });

        const opsNovaPagina = (resposta.cadastros || []).map(item => ({
          cNumOP: item.identificacao?.cNumOP,
          nCodOP: item.identificacao?.nCodOP
        }));

        novasOps = novasOps.concat(opsNovaPagina);
      }
    }

    // Remove duplicatas (pode haver OPs repetidas ao reprocessar página anterior)
    let opsFinais;
    if (primeiraVez) {
      opsFinais = novasOps;
    } else {
      // Combina OPs antigas com novas e remove duplicatas baseado em nCodOP
      const todasOps = [...cache.ops, ...novasOps];
      const opsUnicas = new Map();

      todasOps.forEach(op => {
        if (op.nCodOP) {
          opsUnicas.set(op.nCodOP, op);
        }
      });

      opsFinais = Array.from(opsUnicas.values());
      console.log(`[CACHE] Removidas ${todasOps.length - opsFinais.length} OPs duplicadas`);
    }

    // Atualiza o cache
    const cacheAtualizado = {
      ops: opsFinais,
      ultima_pagina: totalPaginas,
      total_paginas: totalPaginas,
      total_registros: totalRegistros,
      ultima_atualizacao: new Date().toISOString()
    };

    salvarCache(cacheAtualizado);

    console.log(`[CACHE] Sincronização concluída! ${novasOps.length} OPs ${primeiraVez ? 'carregadas' : 'adicionadas'}.`);

    // Atualiza progresso para 100%
    progressoSincronizacao = {
      emAndamento: false,
      porcentagem: 100,
      mensagem: `Concluído! ${novasOps.length} OPs ${primeiraVez ? 'carregadas' : 'adicionadas'}`,
      paginaAtual: totalPaginas,
      totalPaginas: totalPaginas
    };

    res.json({
      success: true,
      ops_adicionadas: novasOps.length,
      total_ops: cacheAtualizado.ops.length,
      primeira_vez: primeiraVez,
      ultima_atualizacao: cacheAtualizado.ultima_atualizacao
    });

  } catch (error) {
    console.error('[CACHE] Erro ao sincronizar:', error);

    // Atualiza progresso com erro
    progressoSincronizacao = {
      emAndamento: false,
      porcentagem: 0,
      mensagem: `Erro: ${error.message}`,
      paginaAtual: 0,
      totalPaginas: 0
    };

    res.status(500).json({ error: error.message });
  }
});

// Obter últimas OPs do cache
app.get('/api/ultimas-ops', (req, res) => {
  try {
    const cache = lerCache();
    const ultimas20 = cache.ops.slice(-20).reverse(); // Últimas 20, mais recentes primeiro

    res.json({
      success: true,
      ops: ultimas20,
      total_cache: cache.ops.length,
      ultima_atualizacao: cache.ultima_atualizacao
    });
  } catch (error) {
    console.error('[CACHE] Erro ao ler cache:', error);
    res.status(500).json({ error: error.message });
  }
});

// Buscar OP específica no cache
app.post('/api/buscar-op-cache', (req, res) => {
  try {
    const { numeroOP } = req.body;

    if (!numeroOP) {
      return res.status(400).json({ error: 'Informe o número da OP' });
    }

    const cache = lerCache();
    const numeroBusca = numeroOP.trim();

    // Busca exata ou parcial (aceita tanto "2026/19927" quanto "19927")
    const opEncontrada = cache.ops.find(op =>
      op.cNumOP === numeroBusca ||
      op.cNumOP?.endsWith(`/${numeroBusca}`) ||
      op.cNumOP?.includes(numeroBusca)
    );

    if (!opEncontrada) {
      return res.status(404).json({ error: `OP ${numeroBusca} não encontrada no cache. Total no cache: ${cache.ops.length}` });
    }

    res.json({
      success: true,
      op: opEncontrada
    });
  } catch (error) {
    console.error('[CACHE] Erro ao buscar OP:', error);
    res.status(500).json({ error: error.message });
  }
});

// Lê detalhes completos da OP do cache local (evita chamada lenta ao Omie)
app.get('/api/op-detalhes-cache/:nCodOP', (req, res) => {
  try {
    const { nCodOP } = req.params;
    if (!nCodOP) {
      return res.status(400).json({ error: 'Informe nCodOP' });
    }
    const cache = lerOpDetalhesCache();
    const dados = cache[String(nCodOP)];
    if (!dados) {
      return res.status(404).json({ error: 'OP não encontrada no cache de detalhes' });
    }
    res.json({ success: true, ...dados });
  } catch (error) {
    console.error('[OP-DETALHES-CACHE] Erro ao ler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Persiste detalhes completos da OP (chamado após uma busca bem-sucedida no Omie)
app.post('/api/op-detalhes-cache', (req, res) => {
  try {
    const { nCodOP, opDetalhada, produtoPrincipal, produtosDetalhados } = req.body;
    if (!nCodOP) {
      return res.status(400).json({ error: 'Informe nCodOP' });
    }
    const cache = lerOpDetalhesCache();
    cache[String(nCodOP)] = {
      opDetalhada: opDetalhada ?? null,
      produtoPrincipal: produtoPrincipal ?? null,
      produtosDetalhados: produtosDetalhados ?? [],
      atualizadoEm: new Date().toISOString()
    };
    salvarOpDetalhesCache(cache);
    console.log(`[OP-DETALHES-CACHE] Salvo nCodOP=${nCodOP} (${(produtosDetalhados || []).length} produtos)`);
    res.json({ success: true, atualizadoEm: cache[String(nCodOP)].atualizadoEm });
  } catch (error) {
    console.error('[OP-DETALHES-CACHE] Erro ao salvar:', error);
    res.status(500).json({ error: error.message });
  }
});

// Consultar detalhes de uma OP específica
app.post('/api/consultar-op', async (req, res) => {
  const { nCodOP } = req.body;

  if (!nCodOP) {
    return res.status(400).json({ error: 'Informe o código da OP (nCodOP)' });
  }

  try {
    const params = {
      cCodIntOP: "",
      nCodOP: nCodOP
    };

    const data = await callOmieOP('ConsultarOrdemProducao', params);

    console.log(`[CONSULTAR-OP] ========== INICIANDO EXPLOSÃO DE CONJUNTOS ==========`);
    console.log(`[CONSULTAR-OP] Campos disponíveis em data:`, Object.keys(data));
    console.log(`[CONSULTAR-OP] data.estrutura existe?`, !!data.estrutura);
    console.log(`[CONSULTAR-OP] data.estrutura?.estrutura existe?`, !!data.estrutura?.estrutura);
    console.log(`[CONSULTAR-OP] data.itensDetalhes existe?`, !!data.itensDetalhes);

    // Explode conjuntos na estrutura de produtos, se existir
    // Pode estar em estrutura.estrutura ou itensDetalhes
    const estruturaProdutos = data.estrutura?.estrutura || data.itensDetalhes || [];

    console.log(`[CONSULTAR-OP] Quantidade de produtos encontrados: ${estruturaProdutos.length}`);

    if (estruturaProdutos.length > 0) {
      console.log(`[CONSULTAR-OP] Estrutura original (primeiros 2):`, JSON.stringify(estruturaProdutos.slice(0, 2), null, 2));
      console.log(`[CONSULTAR-OP] 🔍 Verificando ${estruturaProdutos.length} produtos para explosão de conjuntos`);

      const produtosExplodidos = await explodirConjuntos(estruturaProdutos);

      console.log(`[CONSULTAR-OP] ✅ Após explosão: ${produtosExplodidos.length} produtos`);

      // Atualiza o campo correto
      if (data.estrutura?.estrutura) {
        data.estrutura.estrutura = produtosExplodidos;
        console.log(`[CONSULTAR-OP] ✅ Atualizado data.estrutura.estrutura`);
      } else if (data.itensDetalhes) {
        data.itensDetalhes = produtosExplodidos;
        console.log(`[CONSULTAR-OP] ✅ Atualizado data.itensDetalhes`);
      }
    } else {
      console.log(`[CONSULTAR-OP] ⚠️ Nenhum produto encontrado para explodir`);
    }

    console.log(`[CONSULTAR-OP] ========== FIM DA EXPLOSÃO ==========`);

    res.json({
      success: true,
      op: data
    });
  } catch (error) {
    console.error('[API] Erro ao consultar OP:', error);
    res.status(500).json({ error: error.message });
  }
});

// Listar Ordens de Produção
app.post('/api/listar-ops', async (req, res) => {
  const { dataDe, dataAte, pagina = 1, registros_por_pagina = 50, tipoBusca = 'conclusao' } = req.body;

  try {
    const params = {
      pagina,
      registros_por_pagina
    };

    // Define os filtros de acordo com o tipo de busca
    if (tipoBusca === 'conclusao') {
      if (!dataDe || !dataAte) {
        return res.status(400).json({ error: 'Informe as datas para busca por conclusão' });
      }
      params.dDtConclusaoDe = dataDe;
      params.dDtConclusaoAte = dataAte;
    } else if (tipoBusca === 'previsao') {
      if (!dataDe || !dataAte) {
        return res.status(400).json({ error: 'Informe as datas para busca por previsão' });
      }
      params.dDtPrevisaoDe = dataDe;
      params.dDtPrevisaoAte = dataAte;
    }
    // Se tipoBusca === 'todas', não adiciona filtros de data

    const data = await callOmieOP('ListarOrdemProducao', params);

    // Extrair e achatar os dados dos cadastros
    const cadastros = data.cadastros || [];
    const opsFlattenadas = cadastros.map(item => {
      const ident = item.identificacao || {};
      const infAd = item.infAdicionais || {};
      const outras = item.outrasInf || {};
      const obs = item.observacoes || {};

      return {
        nCodOP: ident.nCodOP,
        cNumOP: ident.cNumOP,
        nCodProduto: ident.nCodProduto,
        cDescProduto: ident.cDescProduto || `Produto ${ident.nCodProduto}`,
        nQtde: ident.nQtde,
        cEtapa: infAd.cEtapa,
        dDtConclusao: infAd.dDtConclusao,
        cStatus: outras.cConcluida === 'S' ? 'CONCLUÍDA' : 'EM ANDAMENTO',
        cObs: obs.cObs
      };
    });

    res.json({
      success: true,
      ops: opsFlattenadas,
      total_registros: data.total_de_registros || 0,
      total_paginas: data.total_de_paginas || 0,
      pagina_atual: data.pagina || pagina
    });
  } catch (error) {
    console.error('[API] Erro ao listar OPs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Função para chamar API de Produtos Omie
async function callOmieProduto(call, params) {
  // Cria chave de cache baseada no call e params
  const cacheKey = `produto_${call}_${JSON.stringify(params)}`;

  // Verifica se existe no cache e se ainda é válido
  const cached = apiCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`[OMIE PRODUTO] ⚡ Usando cache para: ${call}`);
    return cached.data;
  }

  const payload = {
    call,
    app_key: OMIE_APP_KEY,
    app_secret: OMIE_APP_SECRET,
    param: [params]
  };

  console.log(`[OMIE PRODUTO] Chamando: ${call}`, JSON.stringify(params, null, 2));

  try {
    const response = await axios.post(OMIE_PRODUTO_URL, payload, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.faultstring) {
      throw new Error(`Erro Omie: ${response.data.faultstring}`);
    }

    // Armazena no cache
    apiCache.set(cacheKey, {
      data: response.data,
      timestamp: Date.now()
    });

    console.log(`[OMIE PRODUTO] Resposta recebida:`, response.data);
    return response.data;
  } catch (error) {
    console.error('[OMIE PRODUTO] Erro:', error.message);
    if (error.response) {
      console.error('[OMIE PRODUTO] Status:', error.response.status);
      console.error('[OMIE PRODUTO] Dados do erro:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// Consultar detalhes de um produto específico
app.post('/api/consultar-produto', async (req, res) => {
  const { codigo_produto } = req.body;

  if (!codigo_produto) {
    return res.status(400).json({ error: 'Informe o código do produto' });
  }

  try {
    const params = {
      codigo_produto: codigo_produto
    };

    const data = await callOmieProduto('ConsultarProduto', params);

    res.json({
      success: true,
      produto: data
    });
  } catch (error) {
    console.error('[API] Erro ao consultar produto:', error);
    res.status(500).json({ error: error.message });
  }
});

// Salvar edições de uma OP
app.post('/api/salvar-edicoes', (req, res) => {
  try {
    const { nCodOP, cNumOP, produtos, usuario } = req.body;

    if (!nCodOP) {
      return res.status(400).json({ error: 'Informe o código da OP (nCodOP)' });
    }

    if (!produtos || !Array.isArray(produtos)) {
      return res.status(400).json({ error: 'Informe os produtos para salvar' });
    }

    const edicoes = lerEdicoes();
    edicoes[nCodOP] = {
      cNumOP: cNumOP || nCodOP,
      produtos,
      modificado_por: usuario || 'Sistema',
      modificado_em: new Date().toISOString()
    };
    salvarEdicoes(edicoes);

    console.log(`[EDICOES] Salvos dados para OP ${nCodOP}:`, produtos.length, 'produtos');

    res.json({
      success: true,
      message: 'Edições salvas com sucesso'
    });
  } catch (error) {
    console.error('[EDICOES] Erro ao salvar:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obter edições de uma OP
app.get('/api/obter-edicoes/:nCodOP', (req, res) => {
  try {
    const { nCodOP } = req.params;

    if (!nCodOP) {
      return res.status(400).json({ error: 'Informe o código da OP (nCodOP)' });
    }

    const edicoes = lerEdicoes();
    const edicaoOP = edicoes[nCodOP] || { produtos: [] };

    res.json({
      success: true,
      edicao: edicaoOP
    });
  } catch (error) {
    console.error('[EDICOES] Erro ao obter edições:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obter todos os itens pendentes de transferência
app.get('/api/itens-pendentes', (req, res) => {
  try {
    const edicoes = lerEdicoes();
    const itensPendentes = [];

    // Percorre todas as OPs com edições salvas
    for (const [nCodOP, edicaoOP] of Object.entries(edicoes)) {
      if (!edicaoOP.produtos || edicaoOP.produtos.length === 0) continue;

      // Para cada produto na OP, verifica se não foi transferido
      edicaoOP.produtos.forEach(produto => {
        if (!produto.transferido) {
          itensPendentes.push({
            nCodOP: nCodOP,
            cNumOP: edicaoOP.cNumOP || nCodOP,
            codigo: produto.codigo,
            totalSeparado: produto.totalSeparado || '',
            observacao: produto.observacao || '',
            modificado_em: edicaoOP.modificado_em,
            modificado_por: edicaoOP.modificado_por
          });
        }
      });
    }

    console.log(`[PENDENTES] Total de itens pendentes: ${itensPendentes.length}`);

    res.json({
      success: true,
      total: itensPendentes.length,
      itens: itensPendentes
    });
  } catch (error) {
    console.error('[PENDENTES] Erro ao buscar itens pendentes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Migrar registros antigos para incluir cNumOP correto
app.post('/api/migrar-edicoes', async (req, res) => {
  try {
    console.log('[MIGRACAO] Iniciando migração de edições antigas...');
    const edicoes = lerEdicoes();
    const cache = lerCache();
    let totalMigrados = 0;
    let totalErros = 0;

    for (const [nCodOP, edicaoOP] of Object.entries(edicoes)) {
      // Se já tem cNumOP e contém "/" (formato correto), pula
      if (edicaoOP.cNumOP && edicaoOP.cNumOP.includes('/')) {
        console.log(`[MIGRACAO] ✓ OP ${nCodOP} já tem cNumOP correto: ${edicaoOP.cNumOP}`);
        continue;
      }

      // Busca no cache pelo nCodOP
      const opNoCache = cache.ops.find(op => op.nCodOP === parseInt(nCodOP));

      if (opNoCache && opNoCache.cNumOP) {
        edicoes[nCodOP].cNumOP = opNoCache.cNumOP;
        totalMigrados++;
        console.log(`[MIGRACAO] ✅ Migrado: ${nCodOP} -> ${opNoCache.cNumOP}`);
      } else {
        totalErros++;
        console.log(`[MIGRACAO] ⚠️ OP ${nCodOP} não encontrada no cache`);
      }
    }

    // Salva as edições atualizadas
    if (totalMigrados > 0) {
      salvarEdicoes(edicoes);
    }

    console.log(`[MIGRACAO] Concluída! Migrados: ${totalMigrados}, Erros: ${totalErros}`);

    res.json({
      success: true,
      totalMigrados,
      totalErros,
      message: `Migração concluída! ${totalMigrados} registros atualizados.`
    });
  } catch (error) {
    console.error('[MIGRACAO] Erro:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obter todos os itens concluídos (100% transferidos)
app.get('/api/itens-concluidos', (req, res) => {
  try {
    const edicoes = lerEdicoes();
    const opsConcluidas = [];

    // Percorre todas as OPs com edições salvas
    for (const [nCodOP, edicaoOP] of Object.entries(edicoes)) {
      if (!edicaoOP.produtos || edicaoOP.produtos.length === 0) continue;

      // Verifica se TODOS os produtos estão transferidos
      const totalProdutos = edicaoOP.produtos.length;
      const produtosTransferidos = edicaoOP.produtos.filter(p => p.transferido).length;

      // Só adiciona se 100% dos produtos estão transferidos
      if (totalProdutos === produtosTransferidos) {
        // Adiciona cada produto da OP concluída (para manter compatibilidade com o frontend que agrupa)
        edicaoOP.produtos.forEach(produto => {
          opsConcluidas.push({
            nCodOP: nCodOP,
            cNumOP: edicaoOP.cNumOP || nCodOP,
            codigo: produto.codigo,
            totalSeparado: produto.totalSeparado || '',
            observacao: produto.observacao || '',
            modificado_em: edicaoOP.modificado_em,
            modificado_por: edicaoOP.modificado_por
          });
        });

        console.log(`[CONCLUIDOS] ✅ OP ${edicaoOP.cNumOP || nCodOP} - 100% concluída (${totalProdutos}/${totalProdutos} itens)`);
      } else {
        console.log(`[CONCLUIDOS] ⏳ OP ${edicaoOP.cNumOP || nCodOP} - Parcial (${produtosTransferidos}/${totalProdutos} itens)`);
      }
    }

    console.log(`[CONCLUIDOS] Total de itens em OPs 100% concluídas: ${opsConcluidas.length}`);

    res.json({
      success: true,
      total: opsConcluidas.length,
      itens: opsConcluidas
    });
  } catch (error) {
    console.error('[CONCLUIDOS] Erro ao buscar itens concluídos:', error);
    res.status(500).json({ error: error.message });
  }
});

// Exportar OP para PDF
app.post('/api/exportar-op-pdf', async (req, res) => {
  try {
    const { nCodOP, opDetalhada, produtoPrincipal, produtosDetalhados, dadosEdicao } = req.body;

    if (!nCodOP || !opDetalhada) {
      return res.status(400).json({ error: 'Dados da OP não fornecidos' });
    }

    // Carrega as edições salvas
    const edicoes = lerEdicoes();
    const edicaoSalva = edicoes[nCodOP] || { produtos: [] };

    console.log(`[PDF] Gerando PDF para OP ${opDetalhada.identificacao?.cNumOP}`);

    // Função para normalizar texto e garantir encoding correto
    const normalizeText = (text) => {
      if (!text) return '';
      return String(text)
        .replace(/Ã§/g, 'ç')
        .replace(/Ã£/g, 'ã')
        .replace(/Ã¡/g, 'á')
        .replace(/Ã©/g, 'é')
        .replace(/Ã­/g, 'í')
        .replace(/Ã³/g, 'ó')
        .replace(/Ãº/g, 'ú')
        .replace(/Ã /g, 'à')
        .replace(/Ã¨/g, 'è')
        .replace(/Ã¬/g, 'ì')
        .replace(/Ã²/g, 'ò')
        .replace(/Ã¹/g, 'ù')
        .replace(/Ã¢/g, 'â')
        .replace(/Ãª/g, 'ê')
        .replace(/Ã®/g, 'î')
        .replace(/Ã´/g, 'ô')
        .replace(/Ã»/g, 'û')
        .replace(/Ã/g, 'Ã')
        .replace(/Ã‡/g, 'Ç')
        .replace(/Ã‰/g, 'É')
        .replace(/Ãƒ/g, 'Ã')
        .replace(/Ã•/g, 'Õ');
    };

    // Cria o documento PDF em LANDSCAPE (horizontal)
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 50,
      bufferPages: true,
      info: {
        Title: `OP-${opDetalhada.identificacao?.cNumOP}`,
        Author: 'Separador de OP - IVOLV'
      }
    });

    // Configura headers para download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="OP-${opDetalhada.identificacao?.cNumOP}.pdf"`);

    // Pipe do PDF para a resposta
    doc.pipe(res);

    // === CABEÇALHO ===
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#c2410c')
      .text(normalizeText(`Ordem De Produção - ${opDetalhada.identificacao?.cNumOP || ''}`), { align: 'center' });
    doc.font('Helvetica');
    doc.moveDown(1);

    // === INFORMAÇÕES (OP + Produto Principal) ===
    const infoX = 50;
    const infoWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    let infoY = doc.y;

    const linhasInfo = [
      ['OP:', String(opDetalhada.identificacao?.cNumOP || '')],
      ['Codigo:', String(produtoPrincipal?.codigo || '')],
      ['Descricao:', String(produtoPrincipal?.descricao || '')],
      ['Quantidade:', String(produtoPrincipal?.nQtde ?? opDetalhada.identificacao?.nQtde ?? '')]
    ];

    doc.fontSize(11);
    linhasInfo.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').fillColor('black').text(normalizeText(`${label} `), infoX, infoY, { continued: true });
      doc.font('Helvetica').fillColor('#333').text(normalizeText(value), { width: infoWidth });
      infoY = doc.y + 3;
    });
    doc.font('Helvetica');
    doc.y = infoY + 12;

    // === TABELA DE PRODUTOS ===
    console.log(`[PDF] Produtos detalhados:`, produtosDetalhados ? produtosDetalhados.length : 0);

    if (produtosDetalhados && produtosDetalhados.length > 0) {
      // Mantém na mesma página (landscape)
      doc.fontSize(12).fillColor('gray').text(normalizeText('DETALHES DOS PRODUTOS'), { underline: true });
      doc.moveDown(0.5);

      // Cabeçalho da tabela (ajustado para landscape - largura total ~740)
      const tableTop = doc.y;
      const colWidths = {
        codigo: 90,
        descricao: 220,
        localizacao: 110,
        qtd: 45,
        totSep: 65,
        obs: 140,
        transf: 60
      };

      const drawTableHeader = (y) => {
        const totalWidth = colWidths.codigo + colWidths.descricao + colWidths.localizacao +
                          colWidths.qtd + colWidths.totSep + colWidths.obs + colWidths.transf;

        // Desenha o retângulo PRIMEIRO
        doc.rect(50, y, totalWidth, 26).fillAndStroke('lightgray', 'black');

        // DEPOIS escreve o texto por cima
        doc.fontSize(9).font('Helvetica-Bold').fillColor('black');

        let x = 54;
        doc.text(normalizeText('TRANSF.'), x, y + 9, { width: colWidths.transf, lineBreak: false });
        x += colWidths.transf;
        doc.text(normalizeText('CODIGO'), x, y + 9, { width: colWidths.codigo, lineBreak: false });
        x += colWidths.codigo;
        doc.text(normalizeText('DESCRICAO'), x, y + 9, { width: colWidths.descricao, lineBreak: false });
        x += colWidths.descricao;
        doc.text(normalizeText('LOCALIZACAO'), x, y + 9, { width: colWidths.localizacao, lineBreak: false });
        x += colWidths.localizacao;
        doc.text(normalizeText('QTD'), x, y + 9, { width: colWidths.qtd, lineBreak: false });
        x += colWidths.qtd;
        doc.text(normalizeText('TOT SEP'), x, y + 9, { width: colWidths.totSep, lineBreak: false });
        x += colWidths.totSep;
        doc.text(normalizeText('OBSERVACAO'), x, y + 9, { width: colWidths.obs, lineBreak: false });

        doc.font('Helvetica');
      };

      const totalWidth = colWidths.codigo + colWidths.descricao + colWidths.localizacao +
                        colWidths.qtd + colWidths.totSep + colWidths.obs + colWidths.transf;

      let currentY = tableTop;
      drawTableHeader(currentY);
      currentY += 26;

      // Linhas da tabela
      doc.fontSize(8).fillColor('black');

      produtosDetalhados.forEach((produto, idx) => {
        // Verifica se precisa de nova página (landscape A4 tem altura ~500)
        if (currentY > 500) {
          doc.addPage({
            size: 'A4',
            layout: 'landscape',
            margin: 50
          });
          currentY = 50;
          drawTableHeader(currentY);
          currentY += 26;
        }

        // Busca edição salva para este produto
        let totalSeparado = '';
        let observacao = '';
        let transferido = false;

        if (dadosEdicao && dadosEdicao[idx]) {
          totalSeparado = String(dadosEdicao[idx].totalSeparado || '');
          observacao = String(dadosEdicao[idx].observacao || '');
          transferido = dadosEdicao[idx].transferido || false;
        } else if (edicaoSalva.produtos && edicaoSalva.produtos.length > 0) {
          const edicaoProduto = edicaoSalva.produtos.find(p => p.codigo === produto.codigo);
          if (edicaoProduto) {
            totalSeparado = String(edicaoProduto.totalSeparado || '');
            observacao = String(edicaoProduto.observacao || '');
            transferido = edicaoProduto.transferido || false;
          }
        }

        // Linha da tabela
        const rowHeight = 26;
        doc.rect(50, currentY, totalWidth, rowHeight).stroke('lightgray');

        let x = 54;
        doc.fillColor('black').fontSize(8);
        doc.text(transferido ? '[X]' : '[ ]', x + 15, currentY + 8, { width: colWidths.transf - 8, height: rowHeight });
        x += colWidths.transf;
        doc.text(normalizeText(String(produto.codigo || '')), x, currentY + 8, { width: colWidths.codigo - 8, height: rowHeight });
        x += colWidths.codigo;
        doc.text(normalizeText(String(produto.descricao || '')), x, currentY + 8, { width: colWidths.descricao - 8, height: rowHeight, ellipsis: true });
        x += colWidths.descricao;
        doc.text(normalizeText(String(produto.modelo || '')), x, currentY + 8, { width: colWidths.localizacao - 8, height: rowHeight, ellipsis: true });
        x += colWidths.localizacao;
        doc.text(normalizeText(String(produto.quantidade || '')), x, currentY + 8, { width: colWidths.qtd - 8, height: rowHeight });
        x += colWidths.qtd;
        doc.fillColor('green').text(normalizeText(totalSeparado), x, currentY + 8, { width: colWidths.totSep - 8, height: rowHeight });
        x += colWidths.totSep;
        doc.fillColor('gray').text(normalizeText(observacao), x, currentY + 8, { width: colWidths.obs - 8, height: rowHeight, ellipsis: true });

        currentY += rowHeight;
      });

      // Informações de auditoria - OCULTO
      // if (edicaoSalva.modificado_por) {
      //   doc.moveDown(1.5);
      //   doc.fontSize(8).fillColor('green');
      //   doc.text(`Ultima modificacao: ${edicaoSalva.modificado_por} em ${new Date(edicaoSalva.modificado_em).toLocaleString('pt-BR')}`, { align: 'left' });
      // }
    }

    // Finaliza o PDF
    doc.end();

    console.log(`[PDF] PDF gerado com sucesso para OP ${opDetalhada.identificacao?.cNumOP}`);

  } catch (error) {
    console.error('[PDF] Erro ao gerar PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// ================== ASSOCIAÇÕES DE OPs (PAI/FILHA) ==================

// Função auxiliar para resolver número canônico da OP a partir do cache
function resolverNumeroOP(numeroBusca) {
  const cache = lerCache();
  const op = cache.ops.find(op =>
    op.cNumOP === numeroBusca ||
    op.cNumOP?.endsWith(`/${numeroBusca}`) ||
    op.cNumOP?.includes(numeroBusca)
  );
  return op ? op.cNumOP : null;
}

// Associar duas OPs (1 para 1)
app.post('/api/associar-op', (req, res) => {
  try {
    const { cNumOPPai, cNumOPFilha } = req.body;

    if (!cNumOPPai || !cNumOPFilha) {
      return res.status(400).json({ error: 'Informe o número da OP pai e da OP filha' });
    }

    // Resolve os números canônicos das OPs no cache
    const paiCanonico = resolverNumeroOP(cNumOPPai) || cNumOPPai;
    const filhaCanonico = resolverNumeroOP(cNumOPFilha);

    if (!filhaCanonico) {
      return res.status(404).json({ error: `OP filha "${cNumOPFilha}" não encontrada no cache. Sincronize o cache primeiro.` });
    }

    if (paiCanonico === filhaCanonico) {
      return res.status(400).json({ error: 'Não é possível associar uma OP a ela mesma' });
    }

    const associacoes = lerAssociacoes();

    // Verifica se a OP pai já tem associação
    if (associacoes[paiCanonico]) {
      return res.status(400).json({ error: `OP ${paiCanonico} já está associada com ${associacoes[paiCanonico]}. Remova a associação antes de criar uma nova.` });
    }

    // Verifica se a OP filha já tem associação (como pai ou filha)
    if (associacoes[filhaCanonico]) {
      return res.status(400).json({ error: `OP ${filhaCanonico} já está associada com ${associacoes[filhaCanonico]}. Remova a associação antes de criar uma nova.` });
    }

    // Verifica se alguma das duas já é filha de outra
    for (const [pai, filha] of Object.entries(associacoes)) {
      if (filha === paiCanonico) {
        return res.status(400).json({ error: `OP ${paiCanonico} já é filha da OP ${pai}. Remova a associação antes.` });
      }
      if (filha === filhaCanonico) {
        return res.status(400).json({ error: `OP ${filhaCanonico} já é filha da OP ${pai}. Remova a associação antes.` });
      }
    }

    // Salva a associação com números canônicos (chave = pai, valor = filha)
    associacoes[paiCanonico] = filhaCanonico;
    salvarAssociacoes(associacoes);

    console.log(`[ASSOCIACAO] OP ${paiCanonico} (pai) associada com OP ${filhaCanonico} (filha)`);

    res.json({
      success: true,
      message: `OP ${paiCanonico} associada com OP ${filhaCanonico}`,
      pai: paiCanonico,
      filha: filhaCanonico
    });
  } catch (error) {
    console.error('[ASSOCIACAO] Erro ao associar:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remover associação de uma OP
app.post('/api/remover-associacao', (req, res) => {
  try {
    const { cNumOP } = req.body;

    if (!cNumOP) {
      return res.status(400).json({ error: 'Informe o número da OP' });
    }

    const associacoes = lerAssociacoes();
    const numCanonico = resolverNumeroOP(cNumOP) || cNumOP;
    let removida = false;

    // Verifica se é pai
    if (associacoes[numCanonico]) {
      console.log(`[ASSOCIACAO] Removendo associação: ${numCanonico} (pai) <-> ${associacoes[numCanonico]} (filha)`);
      delete associacoes[numCanonico];
      removida = true;
    }

    // Verifica se é filha
    if (!removida) {
      for (const [pai, filha] of Object.entries(associacoes)) {
        if (filha === numCanonico) {
          console.log(`[ASSOCIACAO] Removendo associação: ${pai} (pai) <-> ${filha} (filha)`);
          delete associacoes[pai];
          removida = true;
          break;
        }
      }
    }

    if (!removida) {
      return res.status(404).json({ error: `OP ${cNumOP} não possui associação` });
    }

    salvarAssociacoes(associacoes);

    res.json({
      success: true,
      message: `Associação da OP ${cNumOP} removida com sucesso`
    });
  } catch (error) {
    console.error('[ASSOCIACAO] Erro ao remover:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obter associação de uma OP (retorna a OP parceira)
app.get('/api/obter-associacao/:cNumOP', (req, res) => {
  try {
    const cNumOP = decodeURIComponent(req.params.cNumOP);

    if (!cNumOP) {
      return res.status(400).json({ error: 'Informe o número da OP' });
    }

    const associacoes = lerAssociacoes();

    // Resolve para o número canônico para garantir a busca
    const numCanonicoOP = resolverNumeroOP(cNumOP) || cNumOP;

    // Verifica se é pai (busca exata pelo canônico)
    if (associacoes[numCanonicoOP]) {
      return res.json({
        success: true,
        temAssociacao: true,
        tipo: 'pai',
        opAtual: numCanonicoOP,
        opAssociada: associacoes[numCanonicoOP]
      });
    }

    // Verifica se é filha (busca nos valores)
    for (const [pai, filha] of Object.entries(associacoes)) {
      if (filha === numCanonicoOP) {
        return res.json({
          success: true,
          temAssociacao: true,
          tipo: 'filha',
          opAtual: numCanonicoOP,
          opAssociada: pai
        });
      }
    }

    // Não tem associação
    res.json({
      success: true,
      temAssociacao: false,
      opAtual: numCanonicoOP,
      opAssociada: null
    });
  } catch (error) {
    console.error('[ASSOCIACAO] Erro ao obter:', error);
    res.status(500).json({ error: error.message });
  }
});

// ================== AJUSTES DE ESTOQUE x OP ==================

// Extrai os identificadores de OP no formato ANO/NUMERO (ex: "2026/21051") de um texto.
// Tolera prefixo "OP", separadores e a entidade HTML &apos; usada em obs antigas.
function extrairOPsDoTexto(texto) {
  if (!texto) return [];
  const limpo = String(texto).replace(/&apos;/g, "'");
  const matches = limpo.match(/\d{4}\/\d+/g);
  return matches || [];
}

// Lê e cacheia (com TTL) o JSON de ajustes e o mapa de produtos do inventário.
let _ajustesCache = null;
let _ajustesCacheTime = 0;
function lerAjustesEProdutos() {
  const agora = Date.now();
  if (_ajustesCache && (agora - _ajustesCacheTime) < CACHE_TTL) {
    return _ajustesCache;
  }
  const ajustesRaw = JSON.parse(fs.readFileSync(AJUSTES_ESTOQUE_FILE, 'utf8'));
  const produtosRaw = JSON.parse(fs.readFileSync(PRODUTOS_INVENTARIO_FILE, 'utf8'));

  // Mapa id_prod (numérico) -> codigo (SKU)
  const idParaSku = {};
  (produtosRaw.produtos || []).forEach(p => {
    if (p.codigo_produto != null) idParaSku[String(p.codigo_produto)] = p.codigo;
  });

  _ajustesCache = { ajustes: ajustesRaw.ajustes || [], idParaSku };
  _ajustesCacheTime = agora;
  return _ajustesCache;
}

// Dada uma OP, retorna a soma das quantidades de ajustes de estoque por produto,
// indexada tanto pelo id_prod (numérico) quanto pelo código SKU.
app.post('/api/ajustes-op', (req, res) => {
  try {
    const { numero_op } = req.body;
    if (!numero_op) {
      return res.status(400).json({ error: 'Informe o número da OP (numero_op)' });
    }

    const opsAlvo = extrairOPsDoTexto(numero_op);
    if (opsAlvo.length === 0) {
      // OP fora do formato ANO/NUMERO — sem como casar com o obs
      return res.json({ success: true, numero_op, op_normalizada: null, ajustes_por_produto: {} });
    }
    const opNorm = opsAlvo[0];

    const { ajustes, idParaSku } = lerAjustesEProdutos();

    // Soma quantidade por id_prod entre os ajustes cujo obs contém a OP
    const somaPorId = {};
    for (const a of ajustes) {
      const opsDoAjuste = extrairOPsDoTexto(a.obs);
      if (opsDoAjuste.includes(opNorm)) {
        const id = String(a.id_prod);
        somaPorId[id] = (somaPorId[id] || 0) + (Number(a.quantidade) || 0);
      }
    }

    // Indexa por id_prod e também por SKU, pra facilitar o casamento no frontend
    const ajustesPorProduto = {};
    for (const [id, soma] of Object.entries(somaPorId)) {
      ajustesPorProduto[id] = soma;
      const sku = idParaSku[id];
      if (sku) ajustesPorProduto[sku] = soma;
    }

    res.json({
      success: true,
      numero_op,
      op_normalizada: opNorm,
      ajustes_por_produto: ajustesPorProduto
    });
  } catch (error) {
    console.error('[AJUSTES-OP] Erro:', error);
    res.status(500).json({ error: error.message });
  }
});

// ----- Sincronização dos ajustes de estoque com o Omie (espelha o programa-separador) -----

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

function extrairAjustes(respostaOmie, destino) {
  const lista = respostaOmie.ajuste_estoque_lista || [];
  for (const item of lista) {
    // Salva o registro completo do Omie (todos os campos)
    destino.push({ ...item });
  }
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

    fs.mkdirSync(path.dirname(AJUSTES_ESTOQUE_FILE), { recursive: true });
    fs.writeFileSync(AJUSTES_ESTOQUE_FILE, JSON.stringify(dados, null, 2), 'utf-8');

    // Invalida o cache de leitura para o endpoint /api/ajustes-op refletir os novos dados
    _ajustesCache = null;

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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Separador OP Backend rodando em:`);
  console.log(`   Local: http://localhost:${PORT}`);
  console.log(`   Rede:  http://192.168.1.70:${PORT}`);
});
