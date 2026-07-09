import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4004;

// Caminho para o arquivo de cache de remessas
const DB_DIR = path.join(__dirname, '..', '..', 'banco-de-dados', 'separador-remessa');
const CACHE_FILE = path.join(DB_DIR, 'remessas-cache.json');
// Caminho para o arquivo de edições
const EDICOES_FILE = path.join(DB_DIR, 'remessas-edicoes.json');
// Caminho para o arquivo de remessas completas salvas
const REMESSAS_SALVAS_FILE = path.join(DB_DIR, 'remessas-salvas.json');

// Configurações Omie
const OMIE_APP_KEY = "2694922638408";
const OMIE_APP_SECRET = "02995c034ba5ba2ef1a297240bbb5bf5";
const OMIE_REMESSA_URL = "https://app.omie.com.br/api/v1/produtos/remessa/";
const OMIE_PRODUTO_URL = "https://app.omie.com.br/api/v1/geral/produtos/";

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Estado do progresso da sincronização
let progressoSincronizacao = {
  emAndamento: false,
  porcentagem: 0,
  mensagem: '',
  paginaAtual: 0,
  totalPaginas: 0
};

// ================== FUNÇÕES DE CACHE ==================

function lerCache() {
  if (!fs.existsSync(CACHE_FILE)) {
    return { remessas: [], ultima_pagina: 0, total_paginas: 0, ultima_atualizacao: null };
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

function lerRemessasSalvas() {
  if (!fs.existsSync(REMESSAS_SALVAS_FILE)) {
    return {};
  }
  const data = fs.readFileSync(REMESSAS_SALVAS_FILE, 'utf8');
  return JSON.parse(data);
}

function salvarRemessaSalva(nCodRem, dadosRemessa) {
  const remessas = lerRemessasSalvas();
  remessas[nCodRem] = dadosRemessa;
  fs.writeFileSync(REMESSAS_SALVAS_FILE, JSON.stringify(remessas, null, 2), 'utf8');
}

// ================== FUNÇÕES OMIE ==================

async function callOmieRemessa(call, params) {
  const payload = {
    call,
    app_key: OMIE_APP_KEY,
    app_secret: OMIE_APP_SECRET,
    param: [params]
  };

  console.log(`[OMIE] Chamando: ${call}`, JSON.stringify(params, null, 2));

  try {
    const response = await axios.post(OMIE_REMESSA_URL, payload, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.faultstring) {
      throw new Error(`Erro Omie: ${response.data.faultstring}`);
    }

    console.log(`[OMIE] Resposta recebida`);
    return response.data;
  } catch (error) {
    console.error('[OMIE] Erro:', error.message);
    throw error;
  }
}

async function callOmieProduto(call, params) {
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

    console.log(`[OMIE PRODUTO] Resposta recebida`);
    return response.data;
  } catch (error) {
    console.error('[OMIE PRODUTO] Erro:', error.message);
    throw error;
  }
}

// ================== ROTAS ==================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Separador Remessa Backend' });
});

// Endpoint SSE para progresso da sincronização
app.get('/api/progresso-sincronizacao', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  res.write(`data: ${JSON.stringify(progressoSincronizacao)}\n\n`);

  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify(progressoSincronizacao)}\n\n`);
  }, 500);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

// Sincronizar cache de Remessas
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

    const primeiraReq = await callOmieRemessa('ListarRemessas', {
      nPagina: 1
    });

    console.log('[DEBUG] Resposta completa da API:', JSON.stringify(primeiraReq, null, 2));

    const totalPaginas = primeiraReq.nTotalPaginas || 1;
    const totalRegistros = primeiraReq.nTotalRegistros || 0;

    progressoSincronizacao.totalPaginas = totalPaginas;
    progressoSincronizacao.mensagem = `Total: ${totalPaginas} páginas, ${totalRegistros} registros`;

    console.log(`[CACHE] Total de páginas: ${totalPaginas}, Última processada: ${cache.ultima_pagina}`);

    // Define de qual página começar
    let paginaInicial;
    let novasRemessas = [];

    if (primeiraVez) {
      // Primeira vez: extrai da página 1 e depois busca as demais
      console.log(`[DEBUG] primeiraReq.remessas existe?`, !!primeiraReq.remessas);
      console.log(`[DEBUG] Tamanho do array remessas:`, (primeiraReq.remessas || []).length);

      novasRemessas = (primeiraReq.remessas || []).map(item => ({
        cNumeroRemessa: item.cabec?.cNumeroRemessa,
        nCodRem: item.cabec?.nCodRem
      }));

      console.log(`[DEBUG] Remessas extraídas da página 1:`, novasRemessas.length);
      paginaInicial = 2;
    } else {
      // Atualização: começa uma página ANTES da última processada
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

        const resposta = await callOmieRemessa('ListarRemessas', {
          nPagina: pagina
        });

        const remessasNovaPagina = (resposta.remessas || []).map(item => ({
          cNumeroRemessa: item.cabec?.cNumeroRemessa,
          nCodRem: item.cabec?.nCodRem
        }));

        console.log(`[DEBUG] Remessas extraídas da página ${pagina}:`, remessasNovaPagina.length);
        novasRemessas = novasRemessas.concat(remessasNovaPagina);
      }
    }

    // Remove duplicatas
    let remessasFinais;
    if (primeiraVez) {
      remessasFinais = novasRemessas;
    } else {
      const todasRemessas = [...cache.remessas, ...novasRemessas];
      const remessasUnicas = new Map();

      todasRemessas.forEach(remessa => {
        if (remessa.nCodRem) {
          remessasUnicas.set(remessa.nCodRem, remessa);
        }
      });

      remessasFinais = Array.from(remessasUnicas.values());
      console.log(`[CACHE] Removidas ${todasRemessas.length - remessasFinais.length} remessas duplicadas`);
    }

    // Atualiza o cache
    const cacheAtualizado = {
      remessas: remessasFinais,
      ultima_pagina: totalPaginas,
      total_paginas: totalPaginas,
      total_registros: totalRegistros,
      ultima_atualizacao: new Date().toISOString()
    };

    salvarCache(cacheAtualizado);

    console.log(`[CACHE] Sincronização concluída! ${novasRemessas.length} remessas ${primeiraVez ? 'carregadas' : 'adicionadas'}.`);

    // Atualiza progresso para 100%
    progressoSincronizacao = {
      emAndamento: false,
      porcentagem: 100,
      mensagem: `Concluído! ${novasRemessas.length} remessas ${primeiraVez ? 'carregadas' : 'adicionadas'}`,
      paginaAtual: totalPaginas,
      totalPaginas: totalPaginas
    };

    res.json({
      success: true,
      remessas_adicionadas: novasRemessas.length,
      total_remessas: cacheAtualizado.remessas.length,
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

// Obter últimas Remessas do cache
app.get('/api/ultimas-remessas', (req, res) => {
  try {
    const cache = lerCache();
    const ultimas20 = cache.remessas.slice(-20).reverse(); // Últimas 20, mais recentes primeiro

    res.json({
      success: true,
      remessas: ultimas20,
      total_cache: cache.remessas.length,
      ultima_atualizacao: cache.ultima_atualizacao
    });
  } catch (error) {
    console.error('[CACHE] Erro ao ler cache:', error);
    res.status(500).json({ error: error.message });
  }
});

// Buscar Remessa específica no cache
app.post('/api/buscar-remessa-cache', (req, res) => {
  try {
    const { numeroRemessa } = req.body;

    if (!numeroRemessa) {
      return res.status(400).json({ error: 'Informe o número da Remessa' });
    }

    const cache = lerCache();
    const numeroBusca = numeroRemessa.trim();

    const remessaEncontrada = cache.remessas.find(remessa =>
      remessa.cNumeroRemessa === numeroBusca ||
      remessa.cNumeroRemessa?.includes(numeroBusca)
    );

    if (!remessaEncontrada) {
      return res.status(404).json({ error: `Remessa ${numeroBusca} não encontrada no cache. Total no cache: ${cache.remessas.length}` });
    }

    res.json({
      success: true,
      remessa: remessaEncontrada
    });
  } catch (error) {
    console.error('[CACHE] Erro ao buscar Remessa:', error);
    res.status(500).json({ error: error.message });
  }
});

// Consultar detalhes de uma Remessa específica
app.post('/api/consultar-remessa', async (req, res) => {
  const { nCodRem } = req.body;

  if (!nCodRem) {
    return res.status(400).json({ error: 'Informe o código da Remessa (nCodRem)' });
  }

  try {
    const params = {
      nCodRem: nCodRem
    };

    const data = await callOmieRemessa('ConsultarRemessa', params);

    res.json({
      success: true,
      remessa: data
    });
  } catch (error) {
    console.error('[API] Erro ao consultar Remessa:', error);
    res.status(500).json({ error: error.message });
  }
});

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

// Consultar estoque de um produto específico
app.post('/api/consultar-estoque', async (req, res) => {
  const { nIdProduto } = req.body;

  if (!nIdProduto) {
    return res.status(400).json({ error: 'Informe o ID do produto (nIdProduto)' });
  }

  try {
    const dataAtual = new Date().toLocaleDateString('pt-BR');

    const payload = {
      call: 'ObterEstoqueProduto',
      app_key: OMIE_APP_KEY,
      app_secret: OMIE_APP_SECRET,
      param: [{
        nIdProduto: nIdProduto,
        dDia: dataAtual
      }]
    };

    console.log(`[OMIE ESTOQUE] Chamando: ObterEstoqueProduto para produto ${nIdProduto}`);

    const response = await axios.post('https://app.omie.com.br/api/v1/estoque/resumo/', payload, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.faultstring) {
      throw new Error(`Erro Omie: ${response.data.faultstring}`);
    }

    console.log(`[OMIE ESTOQUE] Resposta recebida para produto ${nIdProduto}`);
    console.log(`[DEBUG ESTOQUE] Estrutura completa:`, JSON.stringify(response.data, null, 2));

    res.json({
      success: true,
      estoque: response.data
    });
  } catch (error) {
    console.error('[API] Erro ao consultar estoque:', error);
    res.status(500).json({ error: error.message });
  }
});

// Salvar edições de uma remessa
app.post('/api/salvar-edicoes', (req, res) => {
  try {
    const { nCodRem, produtos, usuario, remessaCompleta, produtosCompletos } = req.body;

    if (!nCodRem) {
      return res.status(400).json({ error: 'Informe o código da Remessa (nCodRem)' });
    }

    if (!produtos || !Array.isArray(produtos)) {
      return res.status(400).json({ error: 'Informe os produtos para salvar' });
    }

    const edicoes = lerEdicoes();
    const edicaoExistente = edicoes[nCodRem] || {};

    edicoes[nCodRem] = {
      produtos,
      status: edicaoExistente.status || 'em_andamento',
      modificado_por: usuario || 'Sistema',
      modificado_em: new Date().toISOString()
    };
    salvarEdicoes(edicoes);

    // Salvar remessa completa para evitar buscar do OMIE novamente
    if (remessaCompleta && produtosCompletos) {
      salvarRemessaSalva(nCodRem, {
        remessa: remessaCompleta,
        produtos: produtosCompletos,
        salvo_em: new Date().toISOString()
      });
      console.log(`[REMESSAS] Remessa completa ${nCodRem} salva localmente`);
    }

    console.log(`[EDICOES] Salvos dados para Remessa ${nCodRem}:`, produtos.length, 'produtos');

    res.json({
      success: true,
      message: 'Edições salvas com sucesso'
    });
  } catch (error) {
    console.error('[EDICOES] Erro ao salvar:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obter edições de uma remessa
app.get('/api/obter-edicoes/:nCodRem', (req, res) => {
  try {
    const { nCodRem } = req.params;

    if (!nCodRem) {
      return res.status(400).json({ error: 'Informe o código da Remessa (nCodRem)' });
    }

    const edicoes = lerEdicoes();
    const edicaoRemessa = edicoes[nCodRem] || { produtos: [] };

    res.json({
      success: true,
      edicao: edicaoRemessa
    });
  } catch (error) {
    console.error('[EDICOES] Erro ao obter edições:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obter remessa salva localmente
app.get('/api/obter-remessa-salva/:nCodRem', (req, res) => {
  try {
    const { nCodRem } = req.params;

    if (!nCodRem) {
      return res.status(400).json({ error: 'Informe o código da Remessa (nCodRem)' });
    }

    const remessasSalvas = lerRemessasSalvas();
    const remessaSalva = remessasSalvas[nCodRem];

    if (!remessaSalva) {
      return res.status(404).json({
        success: false,
        encontrada: false,
        message: 'Remessa não encontrada no banco local'
      });
    }

    console.log(`[REMESSAS] Remessa ${nCodRem} carregada do banco local`);

    res.json({
      success: true,
      encontrada: true,
      remessa: remessaSalva.remessa,
      produtos: remessaSalva.produtos
    });
  } catch (error) {
    console.error('[REMESSAS] Erro ao obter remessa salva:', error);
    res.status(500).json({ error: error.message });
  }
});

// Marcar remessa como concluída
app.post('/api/concluir-remessa', (req, res) => {
  try {
    const { nCodRem, usuario } = req.body;

    if (!nCodRem) {
      return res.status(400).json({ error: 'Informe o código da Remessa (nCodRem)' });
    }

    const edicoes = lerEdicoes();

    if (!edicoes[nCodRem]) {
      return res.status(404).json({ error: 'Remessa não encontrada' });
    }

    edicoes[nCodRem].status = 'concluido';
    edicoes[nCodRem].concluido_por = usuario || 'Sistema';
    edicoes[nCodRem].concluido_em = new Date().toISOString();

    salvarEdicoes(edicoes);

    console.log(`[EDICOES] Remessa ${nCodRem} marcada como concluída`);

    res.json({
      success: true,
      message: 'Remessa marcada como concluída'
    });
  } catch (error) {
    console.error('[EDICOES] Erro ao concluir remessa:', error);
    res.status(500).json({ error: error.message });
  }
});

// Listar remessas por status
app.get('/api/listar-remessas-por-status', (req, res) => {
  try {
    const edicoes = lerEdicoes();
    const cache = lerCache();

    const remessasComStatus = Object.keys(edicoes).map(nCodRem => {
      const edicao = edicoes[nCodRem];
      const remessaCache = cache.remessas.find(r => r.nCodRem === parseInt(nCodRem));

      return {
        nCodRem: parseInt(nCodRem),
        cNumeroRemessa: remessaCache?.cNumeroRemessa || nCodRem,
        status: edicao.status || 'em_andamento',
        modificado_por: edicao.modificado_por,
        modificado_em: edicao.modificado_em,
        concluido_por: edicao.concluido_por,
        concluido_em: edicao.concluido_em
      };
    });

    const emAndamento = remessasComStatus.filter(r => r.status === 'em_andamento');
    const concluidos = remessasComStatus.filter(r => r.status === 'concluido');

    res.json({
      success: true,
      em_andamento: emAndamento,
      concluidos: concluidos
    });
  } catch (error) {
    console.error('[EDICOES] Erro ao listar remessas:', error);
    res.status(500).json({ error: error.message });
  }
});

// Atualizar quantidades requeridas de uma remessa do Omie
app.post('/api/atualizar-quantidades/:nCodRem', async (req, res) => {
  try {
    const { nCodRem } = req.params;

    if (!nCodRem) {
      return res.status(400).json({ error: 'Informe o código da Remessa (nCodRem)' });
    }

    // Verifica se a remessa existe localmente
    const remessasSalvas = lerRemessasSalvas();
    const remessaSalva = remessasSalvas[nCodRem];

    if (!remessaSalva) {
      return res.status(404).json({ error: 'Remessa não encontrada no banco local' });
    }

    console.log(`[ATUALIZAR] Buscando dados atualizados do Omie para remessa ${nCodRem}...`);

    // Busca a remessa atualizada do Omie
    const params = {
      nCodRem: parseInt(nCodRem)
    };

    const dadosOmie = await callOmieRemessa('ConsultarRemessa', params);

    if (!dadosOmie || !dadosOmie.produtos) {
      console.log(`[ATUALIZAR] Erro: dadosOmie =`, dadosOmie);
      return res.status(500).json({ error: 'Não foi possível buscar dados da remessa no Omie' });
    }

    console.log(`[ATUALIZAR] Remessa encontrada no Omie com ${dadosOmie.produtos.length} produtos`);
    console.log(`[ATUALIZAR] Produtos Omie:`, dadosOmie.produtos.map(p => ({ nCodProd: p.nCodProd, nQtde: p.nQtde, cProduto: p.cProduto })));
    console.log(`[ATUALIZAR] Estrutura local tem ${remessaSalva.remessa?.produtos?.length || 0} produtos na remessa e ${remessaSalva.produtos?.length || 0} produtos processados`);

    // Mapeia produtos locais pelo nCodProd da entrada original em remessa.produtos
    // para casar com segurança mesmo se a ordem mudar no Omie.
    const produtosLocaisPorCodProd = new Map();
    const remessaProdutosAntigos = remessaSalva.remessa?.produtos || [];
    (remessaSalva.produtos || []).forEach(produtoLocal => {
      const entradaOriginal = remessaProdutosAntigos[produtoLocal.indiceOriginal];
      const nCodProd = entradaOriginal?.nCodProd;
      if (nCodProd != null) {
        produtosLocaisPorCodProd.set(String(nCodProd), produtoLocal);
      }
    });

    // Reconstrói o array de produtos processados a partir da lista atual do Omie
    // (fonte da verdade). Itens novos: busca detalhes no Omie. Itens removidos do
    // Omie são descartados.
    const produtosAtualizados = [];
    let novosAdicionados = 0;
    let removidos = 0;

    for (let i = 0; i < dadosOmie.produtos.length; i++) {
      const produtoOmie = dadosOmie.produtos[i];
      const nCodProd = produtoOmie.nCodProd;
      const chave = String(nCodProd);

      const produtoLocal = produtosLocaisPorCodProd.get(chave);

      if (produtoLocal) {
        if (produtoLocal.nQtde !== produtoOmie.nQtde) {
          console.log(`[ATUALIZAR] [${i}] Atualizando ${produtoLocal.codigo}: ${produtoLocal.nQtde} → ${produtoOmie.nQtde}`);
        }
        produtosAtualizados.push({
          ...produtoLocal,
          indiceOriginal: i,
          nQtde: produtoOmie.nQtde
        });
        produtosLocaisPorCodProd.delete(chave);
      } else {
        console.log(`[ATUALIZAR] [${i}] Produto novo no Omie (nCodProd ${nCodProd}) - buscando detalhes...`);

        let descricao = '-';
        let modelo = '-';
        let codigo = String(nCodProd);
        try {
          const respProduto = await callOmieProduto('ConsultarProduto', { codigo_produto: nCodProd });
          codigo = respProduto.codigo || codigo;
          descricao = respProduto.descricao || '-';
          modelo = respProduto.modelo || '-';
        } catch (errProd) {
          console.error(`[ATUALIZAR] Erro ao consultar produto ${nCodProd}:`, errProd.message);
          descricao = 'Erro ao carregar';
        }

        let estoqueFisico = '-';
        try {
          const dataAtual = new Date().toLocaleDateString('pt-BR');
          const respEstoque = await axios.post('https://app.omie.com.br/api/v1/estoque/resumo/', {
            call: 'ObterEstoqueProduto',
            app_key: OMIE_APP_KEY,
            app_secret: OMIE_APP_SECRET,
            param: [{ nIdProduto: nCodProd, dDia: dataAtual }]
          }, {
            timeout: 30000,
            headers: { 'Content-Type': 'application/json' }
          });
          const listaEstoque = respEstoque.data?.listaEstoque || [];
          const almoxarifado = listaEstoque.find(local =>
            local.cDescricaoLocal === 'Almoxarifado - Materia Prima'
          );
          if (almoxarifado && almoxarifado.fisico !== undefined) {
            estoqueFisico = almoxarifado.fisico;
          }
        } catch (errEst) {
          console.error(`[ATUALIZAR] Erro ao consultar estoque do produto ${nCodProd}:`, errEst.message);
        }

        produtosAtualizados.push({
          indiceOriginal: i,
          codigo,
          descricao,
          modelo,
          nQtde: produtoOmie.nQtde,
          estoqueFisico
        });
        novosAdicionados++;
      }
    }

    removidos = produtosLocaisPorCodProd.size;
    if (removidos > 0) {
      const codigosRemovidos = Array.from(produtosLocaisPorCodProd.values()).map(p => p.codigo);
      console.log(`[ATUALIZAR] ${removidos} produto(s) removido(s) do Omie e descartado(s) localmente:`, codigosRemovidos);
    }

    // Substitui a lista bruta da remessa pela do Omie (fonte da verdade)
    if (remessaSalva.remessa) {
      remessaSalva.remessa.produtos = dadosOmie.produtos;
    }

    // Salva a remessa com a lista completamente sincronizada
    remessasSalvas[nCodRem] = {
      ...remessaSalva,
      produtos: produtosAtualizados
    };

    fs.writeFileSync(REMESSAS_SALVAS_FILE, JSON.stringify(remessasSalvas, null, 2), 'utf8');

    // Limpa entradas de edição que referenciam produtos que não existem mais
    // (indiceOriginal fora do range ou códigos removidos), e remapeia índices
    // antigos para os novos quando o código ainda existe.
    try {
      const edicoes = lerEdicoes();
      const edicaoRemessa = edicoes[nCodRem];
      if (edicaoRemessa && Array.isArray(edicaoRemessa.produtos)) {
        const codigosAtuais = new Set(produtosAtualizados.map(p => p.codigo));
        const produtosEdicaoLimpos = edicaoRemessa.produtos.filter(p => codigosAtuais.has(p.codigo));
        if (produtosEdicaoLimpos.length !== edicaoRemessa.produtos.length) {
          edicoes[nCodRem] = { ...edicaoRemessa, produtos: produtosEdicaoLimpos };
          salvarEdicoes(edicoes);
          console.log(`[ATUALIZAR] Edições limpas: ${edicaoRemessa.produtos.length} → ${produtosEdicaoLimpos.length}`);
        }
      }
    } catch (errEdicoes) {
      console.error('[ATUALIZAR] Erro ao limpar edições:', errEdicoes.message);
    }

    console.log(`[ATUALIZAR] Sincronização concluída para remessa ${nCodRem}: ${produtosAtualizados.length} produtos (${novosAdicionados} novos, ${removidos} removidos)`);

    res.json({
      success: true,
      message: 'Remessa sincronizada com o Omie',
      produtos: produtosAtualizados,
      resumo: {
        total: produtosAtualizados.length,
        novos: novosAdicionados,
        removidos
      }
    });
  } catch (error) {
    console.error('[ATUALIZAR] Erro ao atualizar quantidades:', error);
    res.status(500).json({ error: error.message });
  }
});

// Excluir remessa
app.delete('/api/excluir-remessa/:nCodRem', (req, res) => {
  try {
    const { nCodRem } = req.params;

    if (!nCodRem) {
      return res.status(400).json({ error: 'Informe o código da Remessa (nCodRem)' });
    }

    const edicoes = lerEdicoes();

    if (!edicoes[nCodRem]) {
      return res.status(404).json({ error: 'Remessa não encontrada' });
    }

    // Remove das edições
    delete edicoes[nCodRem];
    salvarEdicoes(edicoes);

    // Remove das remessas salvas
    const remessasSalvas = lerRemessasSalvas();
    if (remessasSalvas[nCodRem]) {
      delete remessasSalvas[nCodRem];
      fs.writeFileSync(REMESSAS_SALVAS_FILE, JSON.stringify(remessasSalvas, null, 2), 'utf8');
      console.log(`[REMESSAS] Remessa ${nCodRem} removida do banco local`);
    }

    console.log(`[EDICOES] Remessa ${nCodRem} excluída com sucesso`);

    res.json({
      success: true,
      message: 'Remessa excluída com sucesso'
    });
  } catch (error) {
    console.error('[EDICOES] Erro ao excluir remessa:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Separador Remessa Backend rodando em:`);
  console.log(`   Local: http://localhost:${PORT}`);
  console.log(`   Rede:  http://192.168.1.70:${PORT}`);
});
