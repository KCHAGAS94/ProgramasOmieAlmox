import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4008;

// Caminho do banco de dados
const DB_DIR = path.join(__dirname, '..', '..', 'banco-de-dados', 'auxiliares');
const CAIXAS_FILE = path.join(DB_DIR, 'caixas.json');

app.use(cors());
app.use(express.json());

// ========================================
// FUNÇÕES AUXILIARES
// ========================================

// Garante que o diretório e arquivo existem
function inicializarBanco() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(CAIXAS_FILE)) {
    fs.writeFileSync(CAIXAS_FILE, JSON.stringify({ caixas: [] }, null, 2), 'utf8');
  }
}

function lerCaixas() {
  try {
    inicializarBanco();
    const data = fs.readFileSync(CAIXAS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[CAIXAS] Erro ao ler arquivo:', error);
    return { caixas: [] };
  }
}

function salvarCaixas(dados) {
  try {
    fs.writeFileSync(CAIXAS_FILE, JSON.stringify(dados, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[CAIXAS] Erro ao salvar arquivo:', error);
    return false;
  }
}

// ========================================
// ROTAS
// ========================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Programas Auxiliares - Backend ativo',
    timestamp: new Date().toISOString()
  });
});

// Listar todas as caixas
app.get('/api/caixas', (req, res) => {
  try {
    const dados = lerCaixas();
    res.json({ caixas: dados.caixas });
  } catch (error) {
    console.error('[CAIXAS] Erro ao listar:', error);
    res.status(500).json({ error: 'Erro ao listar caixas' });
  }
});

// Criar nova caixa
app.post('/api/caixas', (req, res) => {
  try {
    const { nome, peso, unidade } = req.body;

    if (!nome || !peso || !unidade) {
      return res.status(400).json({ error: 'Nome, peso e unidade são obrigatórios' });
    }

    if (peso <= 0) {
      return res.status(400).json({ error: 'Peso deve ser maior que zero' });
    }

    const dados = lerCaixas();

    const novaCaixa = {
      id: Date.now().toString(),
      nome: nome.trim(),
      peso: parseFloat(peso),
      unidade,
      criadoEm: new Date().toISOString()
    };

    dados.caixas.push(novaCaixa);
    salvarCaixas(dados);

    res.json({ caixa: novaCaixa });
  } catch (error) {
    console.error('[CAIXAS] Erro ao criar:', error);
    res.status(500).json({ error: 'Erro ao criar caixa' });
  }
});

// Atualizar caixa
app.put('/api/caixas/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { nome, peso, unidade } = req.body;

    if (!nome || !peso || !unidade) {
      return res.status(400).json({ error: 'Nome, peso e unidade são obrigatórios' });
    }

    if (peso <= 0) {
      return res.status(400).json({ error: 'Peso deve ser maior que zero' });
    }

    const dados = lerCaixas();
    const index = dados.caixas.findIndex(c => c.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Caixa não encontrada' });
    }

    dados.caixas[index] = {
      ...dados.caixas[index],
      nome: nome.trim(),
      peso: parseFloat(peso),
      unidade,
      atualizadoEm: new Date().toISOString()
    };

    salvarCaixas(dados);
    res.json({ caixa: dados.caixas[index] });
  } catch (error) {
    console.error('[CAIXAS] Erro ao atualizar:', error);
    res.status(500).json({ error: 'Erro ao atualizar caixa' });
  }
});

// Deletar caixa
app.delete('/api/caixas/:id', (req, res) => {
  try {
    const { id } = req.params;
    const dados = lerCaixas();

    const index = dados.caixas.findIndex(c => c.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Caixa não encontrada' });
    }

    dados.caixas.splice(index, 1);
    salvarCaixas(dados);

    res.json({ message: 'Caixa removida com sucesso' });
  } catch (error) {
    console.error('[CAIXAS] Erro ao deletar:', error);
    res.status(500).json({ error: 'Erro ao deletar caixa' });
  }
});

// ========================================
// CONSULTAR PRODUTO
// ========================================

const OMIE_APP_KEY = '2694922638408';
const OMIE_APP_SECRET = '02995c034ba5ba2ef1a297240bbb5bf5';
const PRODUTOS_INVENTARIO = path.join(__dirname, '..', '..', 'banco-de-dados', 'inventario', 'produtos.json');

// Buscar produtos na base local (pesquisa por código ou descrição)
app.get('/api/buscar-produtos', (req, res) => {
  try {
    const { termo } = req.query;
    if (!termo || termo.trim().length < 2) {
      return res.json({ produtos: [] });
    }

    const data = JSON.parse(fs.readFileSync(PRODUTOS_INVENTARIO, 'utf-8'));
    const termoLower = termo.toLowerCase();

    const resultados = (data.produtos || []).filter(p => {
      const codigo = (p.codigo || '');
      if (!codigo.startsWith('CA-')) return false;
      return codigo.toLowerCase().includes(termoLower) ||
        (p.descricao || '').toLowerCase().includes(termoLower);
    }).slice(0, 50);

    res.json({ produtos: resultados, total: resultados.length });
  } catch (error) {
    console.error('[PRODUTOS] Erro ao buscar:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Consultar detalhes completos de um produto na API Omie
app.post('/api/consultar-produto-omie', async (req, res) => {
  const { codigo_produto } = req.body;

  if (!codigo_produto) {
    return res.status(400).json({ error: 'codigo_produto é obrigatório' });
  }

  try {
    const response = await axios.post('https://app.omie.com.br/api/v1/geral/produtos/', {
      call: 'ConsultarProduto',
      app_key: OMIE_APP_KEY,
      app_secret: OMIE_APP_SECRET,
      param: [{ codigo_produto: codigo_produto }]
    }, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.faultstring) {
      throw new Error(response.data.faultstring);
    }

    res.json({ success: true, produto: response.data });
  } catch (error) {
    console.error('[PRODUTOS] Erro ao consultar Omie:', error.message);
    res.status(500).json({ error: error.response?.data?.faultstring || error.message });
  }
});

// Consultar estoque de um produto na API Omie
app.post('/api/consultar-estoque-omie', async (req, res) => {
  const { codigo_produto } = req.body;

  if (!codigo_produto) {
    return res.status(400).json({ error: 'codigo_produto é obrigatório' });
  }

  try {
    const hoje = new Date();
    const dDia = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;

    const response = await axios.post('https://app.omie.com.br/api/v1/estoque/resumo/', {
      call: 'ObterEstoqueProduto',
      app_key: OMIE_APP_KEY,
      app_secret: OMIE_APP_SECRET,
      param: [{
        cEAN: '',
        nIdProduto: codigo_produto,
        cCodigo: '',
        xCodigo: '',
        dDia: dDia
      }]
    }, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });

    const dados = response.data;
    console.log('[ESTOQUE] Chaves da resposta:', Object.keys(dados));

    if (dados.faultstring) {
      throw new Error(dados.faultstring);
    }

    // Procura o array em todas as chaves da resposta
    let locais = [];
    for (const chave of Object.keys(dados)) {
      const valor = dados[chave];
      if (Array.isArray(valor) && valor.length > 0 && valor[0].cDescricaoLocal) {
        console.log(`[ESTOQUE] Encontrado array na chave: "${chave}" com ${valor.length} itens`);
        locais = valor.map(local => ({
          descricaoLocal: local.cDescricaoLocal || '-',
          fisico: local.fisico || 0
        }));
        break;
      }
    }

    // Fallback: se não encontrou em nenhuma chave, tenta raiz
    if (locais.length === 0 && dados.cDescricaoLocal) {
      locais = [{ descricaoLocal: dados.cDescricaoLocal, fisico: dados.fisico || 0 }];
    }

    console.log('[ESTOQUE] Locais extraídos:', JSON.stringify(locais));

    res.json({ success: true, estoque: locais });
  } catch (error) {
    console.error('[ESTOQUE] Erro ao consultar Omie:', error.message);
    res.status(500).json({ error: error.response?.data?.faultstring || error.message });
  }
});

// ========================================
// CONSULTA NFE (ListarNF - Omie)
// ========================================

const OMIE_NF_URL = 'https://app.omie.com.br/api/v1/produtos/nfconsultar/';
const CONSULTA_NFE_FILE = path.join(DB_DIR, 'consulta-nfe.json');
// Notas que o usuário pesquisou, com status (em_andamento / concluido)
const NOTAS_PESQUISADAS_FILE = path.join(DB_DIR, 'consulta-nfe-pesquisadas.json');
const NFE_REGISTROS_POR_PAGINA = 20;
const NFE_DELAY_ENTRE_PAGINAS = 800; // ms — evita bloqueio do Omie
const NFE_LOOKBACK_PAGINAS = 1;      // nas sincronizações seguintes, refaz a partir de (total - 1)
const NFE_PAGINA_INICIAL_PADRAO = 700; // 1ª sincronização (sem JSON) começa desta página

let progressoConsultaNfe = {
  sincronizando: false,
  paginaAtual: 0,
  totalPaginas: 0,
  registrosSalvos: 0,
  mensagem: '',
  erro: null
};

function lerConsultaNfe() {
  try {
    if (!fs.existsSync(CONSULTA_NFE_FILE)) {
      return { nfs: [], total: 0, total_de_paginas: 0, ultima_pagina: 0, ultima_sincronizacao: null };
    }
    return JSON.parse(fs.readFileSync(CONSULTA_NFE_FILE, 'utf-8'));
  } catch (err) {
    console.error('[CONSULTA-NFE] Falha ao ler arquivo:', err.message);
    return { nfs: [], total: 0, total_de_paginas: 0, ultima_pagina: 0, ultima_sincronizacao: null };
  }
}

async function buscarPaginaNF(pagina, registrosPorPagina) {
  const TENTATIVAS_MAX = 4;
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= TENTATIVAS_MAX; tentativa++) {
    try {
      const response = await axios.post(OMIE_NF_URL, {
        call: 'ListarNF',
        app_key: OMIE_APP_KEY,
        app_secret: OMIE_APP_SECRET,
        param: [{ pagina, registros_por_pagina: registrosPorPagina }]
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
      console.log(`[CONSULTA-NFE] ⚠️ Falha pág. ${pagina} (tentativa ${tentativa}/${TENTATIVAS_MAX}, status ${status || 'rede'}). Aguardando ${espera}ms...`);
      await new Promise(resolve => setTimeout(resolve, espera));
    }
  }
  throw ultimoErro;
}

async function sincronizarConsultaNfe(paginaInicialForcada = null) {
  if (progressoConsultaNfe.sincronizando) {
    console.log('[CONSULTA-NFE] Sincronização já em andamento, ignorando.');
    return;
  }
  try {
    progressoConsultaNfe = {
      sincronizando: true,
      paginaAtual: 0,
      totalPaginas: 0,
      registrosSalvos: 0,
      mensagem: 'Iniciando sincronização...',
      erro: null
    };

    const dadosExistentes = lerConsultaNfe();
    const nfsExistentes = Array.isArray(dadosExistentes.nfs) ? dadosExistentes.nfs : [];
    const sincIncremental = nfsExistentes.length > 0;

    console.log(`[CONSULTA-NFE] Iniciando sincronização ${sincIncremental ? 'incremental' : 'completa'}${paginaInicialForcada ? ` (página inicial forçada: ${paginaInicialForcada})` : ''}...`);

    // 1ª página: descobre o total de páginas atual
    const primeiraReq = await buscarPaginaNF(1, NFE_REGISTROS_POR_PAGINA);
    const totalPaginas = primeiraReq.total_de_paginas || 1;

    // Prioridade: página inicial forçada (se informada e válida) →
    // Incremental: (total - lookback) → 1ª sincronização: a partir da página padrão (700)
    let paginaInicial;
    if (paginaInicialForcada && paginaInicialForcada >= 1) {
      paginaInicial = Math.min(paginaInicialForcada, totalPaginas);
    } else if (sincIncremental) {
      paginaInicial = Math.max(1, totalPaginas - NFE_LOOKBACK_PAGINAS);
    } else {
      paginaInicial = Math.min(NFE_PAGINA_INICIAL_PADRAO, totalPaginas);
    }

    progressoConsultaNfe.totalPaginas = totalPaginas;
    progressoConsultaNfe.paginaAtual = paginaInicial;
    progressoConsultaNfe.mensagem = `Sincronizando páginas ${paginaInicial}-${totalPaginas} de ${totalPaginas}...`;

    const nfsNovas = [];

    if (paginaInicial === 1) {
      (primeiraReq.nfCadastro || []).forEach(nf => nfsNovas.push(nf));
    } else {
      await new Promise(resolve => setTimeout(resolve, NFE_DELAY_ENTRE_PAGINAS));
      const dadosInicial = await buscarPaginaNF(paginaInicial, NFE_REGISTROS_POR_PAGINA);
      (dadosInicial.nfCadastro || []).forEach(nf => nfsNovas.push(nf));
    }
    progressoConsultaNfe.registrosSalvos = nfsNovas.length;

    for (let pagina = paginaInicial + 1; pagina <= totalPaginas; pagina++) {
      progressoConsultaNfe.paginaAtual = pagina;
      progressoConsultaNfe.mensagem = `Sincronizando página ${pagina} de ${totalPaginas}...`;

      await new Promise(resolve => setTimeout(resolve, NFE_DELAY_ENTRE_PAGINAS));

      const dadosPagina = await buscarPaginaNF(pagina, NFE_REGISTROS_POR_PAGINA);
      (dadosPagina.nfCadastro || []).forEach(nf => nfsNovas.push(nf));
      progressoConsultaNfe.registrosSalvos = nfsNovas.length;
    }

    // Mescla deduplicando por compl.nIdNF (as novas substituem as antigas)
    const idDe = (nf) => nf?.compl?.nIdNF ?? nf?.compl?.cChaveNFe ?? null;
    let nfsFinais;
    if (sincIncremental) {
      const idsNovos = new Set(nfsNovas.map(idDe).filter(id => id != null));
      const preservadas = nfsExistentes.filter(nf => !idsNovos.has(idDe(nf)));
      nfsFinais = preservadas.concat(nfsNovas);
    } else {
      nfsFinais = nfsNovas;
    }

    const dados = {
      nfs: nfsFinais,
      total: nfsFinais.length,
      total_de_paginas: totalPaginas,
      ultima_pagina: totalPaginas,
      ultima_sincronizacao: new Date().toISOString()
    };

    fs.mkdirSync(path.dirname(CONSULTA_NFE_FILE), { recursive: true });
    fs.writeFileSync(CONSULTA_NFE_FILE, JSON.stringify(dados, null, 2), 'utf-8');

    const adicionadas = sincIncremental ? nfsFinais.length - nfsExistentes.length : nfsFinais.length;
    const msgFinal = sincIncremental
      ? `✅ Sinc. incremental concluída! ${nfsNovas.length} NFes buscadas, ${adicionadas} novas (total: ${nfsFinais.length}).`
      : `✅ Sincronização completa concluída! ${nfsFinais.length} NFes salvas.`;
    console.log(`[CONSULTA-NFE] ${msgFinal}`);
    progressoConsultaNfe.mensagem = msgFinal;
  } catch (error) {
    console.error('[CONSULTA-NFE] ❌ Erro:', error.message);
    progressoConsultaNfe.erro = error.message;
    progressoConsultaNfe.mensagem = `❌ Erro: ${error.message}`;
  } finally {
    progressoConsultaNfe.sincronizando = false;
  }
}

// Dispara a sincronização (1ª vez = completa; depois = incremental).
// Aceita opcionalmente { pagina_inicial } para começar de uma página específica.
app.post('/api/consulta-nfe/sincronizar', (req, res) => {
  if (progressoConsultaNfe.sincronizando) {
    return res.status(409).json({ success: false, error: 'Sincronização já em andamento' });
  }
  const paginaInicial = parseInt(req.body?.pagina_inicial, 10);
  sincronizarConsultaNfe(Number.isInteger(paginaInicial) && paginaInicial >= 1 ? paginaInicial : null);
  res.json({ success: true, message: 'Sincronização iniciada' });
});

// Andamento da sincronização
app.get('/api/consulta-nfe/progresso', (req, res) => {
  res.json({ success: true, ...progressoConsultaNfe });
});

// Extrai os itens de uma NFe (estrutura det[].prod do ListarNF/ConsultarNF),
// AGRUPANDO itens iguais (mesmo código + unidade) e SOMANDO as quantidades.
function extrairItensDaNfe(nf) {
  const dets = (nf && nf.det) || [];
  const mapa = new Map();
  for (const det of dets) {
    const prod = det.prod || {};
    const codigo = prod.cProd || prod.cProdOrig || '-';
    const unidade = prod.uCom || prod.uTrib || '';
    const chave = `${codigo}|||${unidade}`;
    const qtd = Number(prod.qCom != null ? prod.qCom : prod.qTrib) || 0;

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        codigo,
        descricao: prod.xProd || prod.xProdOrig || '-',
        quantidade: 0,
        unidade,
        ncm: prod.NCM || '',
        cfop: prod.CFOP || '',
        nCodProd: det.nfProdInt?.nCodProd ?? null, // id do produto p/ resolver o local
        local: '' // preenchido depois via ConsultarProduto (campo modelo)
      });
    }
    mapa.get(chave).quantidade += qtd;
  }
  // Arredonda pra 2 casas pra evitar lixo de ponto flutuante
  return [...mapa.values()].map(it => ({ ...it, quantidade: Math.round(it.quantidade * 100) / 100 }));
}

// Cache em memória: nCodProd -> modelo (local). Evita reconsultar o mesmo produto.
const _localProdutoCache = new Map();

// Resolve o LOCAL de um produto (campo "modelo" no Omie), igual ao Pedidos IVOLV
async function resolverLocalProduto(nCodProd) {
  if (nCodProd == null) return '';
  const key = String(nCodProd);
  if (_localProdutoCache.has(key)) return _localProdutoCache.get(key);
  try {
    const resp = await axios.post('https://app.omie.com.br/api/v1/geral/produtos/', {
      call: 'ConsultarProduto',
      app_key: OMIE_APP_KEY,
      app_secret: OMIE_APP_SECRET,
      param: [{ codigo_produto: nCodProd }]
    }, { timeout: 15000, headers: { 'Content-Type': 'application/json' } });

    const modelo = resp.data?.modelo || (resp.data?.produto && resp.data.produto.modelo) || '';
    _localProdutoCache.set(key, modelo);
    return modelo;
  } catch (e) {
    console.error(`[CONSULTA-NFE] Falha ao resolver local do produto ${nCodProd}:`, e.message);
    return '';
  }
}

// Preenche o campo "local" dos itens de cada nota (sequencial, com cache p/ produtos repetidos)
async function enriquecerLocaisDasNotas(notas) {
  for (const nota of notas) {
    for (const item of nota.itens) {
      if (item.nCodProd != null) {
        const jaTinha = _localProdutoCache.has(String(item.nCodProd));
        item.local = await resolverLocalProduto(item.nCodProd);
        if (!jaTinha) await new Promise(r => setTimeout(r, 200)); // respiro entre chamadas reais
      }
    }
  }
}

// Salva/atualiza uma NFe pesquisada no consulta-nfe.json (dedupe por nIdNF/chave)
function salvarNotaPesquisada(nf) {
  try {
    const idDe = (x) => x?.compl?.nIdNF ?? x?.compl?.cChaveNFe ?? null;
    const id = idDe(nf);
    if (id == null) return;

    const dados = lerConsultaNfe();
    const nfs = Array.isArray(dados.nfs) ? dados.nfs : [];
    const idx = nfs.findIndex(x => idDe(x) === id);
    if (idx >= 0) nfs[idx] = nf; else nfs.push(nf);

    const novo = { ...dados, nfs, total: nfs.length };
    fs.mkdirSync(path.dirname(CONSULTA_NFE_FILE), { recursive: true });
    fs.writeFileSync(CONSULTA_NFE_FILE, JSON.stringify(novo, null, 2), 'utf-8');
    console.log(`[CONSULTA-NFE] Nota pesquisada salva (id ${id}). Total no JSON: ${nfs.length}`);
  } catch (e) {
    console.error('[CONSULTA-NFE] Falha ao salvar nota pesquisada:', e.message);
  }
}

// Consulta uma NFe ao vivo na Omie pela chave de acesso (ConsultarNF)
async function consultarNfeOmiePorChave(chave) {
  const response = await axios.post(OMIE_NF_URL, {
    call: 'ConsultarNF',
    app_key: OMIE_APP_KEY,
    app_secret: OMIE_APP_SECRET,
    param: [{ nCodNF: 0, cChaveNFe: chave }]
  }, { timeout: 30000, headers: { 'Content-Type': 'application/json' } });

  if (response.data && response.data.faultstring) {
    throw new Error(response.data.faultstring);
  }
  return response.data;
}

// ----- Store das notas pesquisadas (status: em_andamento / concluido) -----
function lerPesquisadas() {
  try {
    if (!fs.existsSync(NOTAS_PESQUISADAS_FILE)) return { notas: [] };
    const d = JSON.parse(fs.readFileSync(NOTAS_PESQUISADAS_FILE, 'utf-8'));
    return { notas: Array.isArray(d.notas) ? d.notas : [] };
  } catch (e) {
    console.error('[CONSULTA-NFE] Falha ao ler pesquisadas:', e.message);
    return { notas: [] };
  }
}

function salvarPesquisadas(dados) {
  fs.mkdirSync(path.dirname(NOTAS_PESQUISADAS_FILE), { recursive: true });
  fs.writeFileSync(NOTAS_PESQUISADAS_FILE, JSON.stringify(dados, null, 2), 'utf-8');
}

// Registra/atualiza uma nota pesquisada. Mantém o status se já existir; novas entram como em_andamento.
function registrarNotaPesquisada(nota) {
  if (!nota?.chave) return { status: 'em_andamento' };
  const dados = lerPesquisadas();
  const lista = dados.notas;
  const idx = lista.findIndex(n => n.chave === nota.chave);
  if (idx >= 0) {
    // atualiza o conteúdo, preserva status/datas
    lista[idx] = {
      ...lista[idx],
      numero: nota.numero, serie: nota.serie, emissao: nota.emissao,
      destinatario: nota.destinatario, itens: nota.itens
    };
    salvarPesquisadas({ notas: lista });
    return lista[idx];
  }
  const novo = {
    numero: nota.numero, serie: nota.serie, chave: nota.chave, emissao: nota.emissao,
    destinatario: nota.destinatario, itens: nota.itens,
    status: 'em_andamento', pesquisada_em: new Date().toISOString(), concluida_em: null
  };
  lista.push(novo);
  salvarPesquisadas({ notas: lista });
  return novo;
}

// Lista as notas pesquisadas, opcionalmente filtrando por status (?status=em_andamento|concluido)
app.get('/api/consulta-nfe/pesquisadas', (req, res) => {
  try {
    const status = req.query.status;
    let lista = lerPesquisadas().notas;
    if (status && status !== 'todos') {
      lista = lista.filter(n => n.status === status);
    }
    // Concluídos: mais recém-concluídos primeiro. Demais: mais recém-pesquisados primeiro.
    const dataOrdenacao = status === 'concluido'
      ? (n) => n.concluida_em || n.pesquisada_em || 0
      : (n) => n.pesquisada_em || 0;
    lista = lista.slice().sort((a, b) => new Date(dataOrdenacao(b)) - new Date(dataOrdenacao(a)));
    res.json({ success: true, total: lista.length, notas: lista });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Marca/desmarca a flag de concluído de uma nota pesquisada
app.post('/api/consulta-nfe/status', (req, res) => {
  try {
    const { chave, concluido } = req.body || {};
    if (!chave) return res.status(400).json({ success: false, error: 'chave é obrigatória' });
    const dados = lerPesquisadas();
    const idx = dados.notas.findIndex(n => n.chave === chave);
    if (idx < 0) return res.status(404).json({ success: false, error: 'Nota não encontrada nas pesquisadas' });
    dados.notas[idx].status = concluido ? 'concluido' : 'em_andamento';
    dados.notas[idx].concluida_em = concluido ? new Date().toISOString() : null;
    salvarPesquisadas(dados);
    res.json({ success: true, status: dados.notas[idx].status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Monta o objeto de resultado (cabeçalho + itens) a partir de uma NFe
function montarResultadoNfe(nf) {
  return {
    numero: numeroDaNfe(nf),
    serie: nf?.ide?.serie || '',
    chave: nf?.compl?.cChaveNFe || '',
    emissao: nf?.ide?.dEmi || '',
    destinatario: nf?.nfDestInt?.cRazao || nf?.nfDestInt?.razao_social || '',
    valor_total: nf?.total?.cValorTotal ?? nf?.total?.vNF ?? null,
    itens: extrairItensDaNfe(nf)
  };
}

// Número da nota (nNF) a partir de uma NFe — usa ide.nNF; cai pra chave (posições 26-34) se faltar
function numeroDaNfe(nf) {
  const nNF = nf?.ide?.nNF;
  if (nNF != null && String(nNF).replace(/\D/g, '') !== '') {
    return parseInt(String(nNF).replace(/\D/g, ''), 10);
  }
  const chave = nf?.compl?.cChaveNFe || '';
  if (chave.length >= 34) {
    return parseInt(chave.substring(25, 34), 10);
  }
  return null;
}

// Busca uma NFe pelo NÚMERO da nota (no JSON sincronizado) OU pela CHAVE de 44 dígitos
// (no JSON e, se não achar, consulta a Omie ao vivo via ConsultarNF).
// Ex: ?numero=1011  ou  ?numero=31260628436336000200550010000114201466992991
app.get('/api/consulta-nfe/buscar', async (req, res) => {
  try {
    const termo = String(req.query.numero || req.query.chave || '').trim();
    const digitos = termo.replace(/\D/g, '');
    if (!digitos) {
      return res.status(400).json({ success: false, error: 'Informe o número ou a chave da nota fiscal' });
    }

    const dados = lerConsultaNfe();
    const nfs = Array.isArray(dados.nfs) ? dados.nfs : [];

    // ===== Busca por CHAVE (44 dígitos) =====
    if (digitos.length === 44) {
      // 1) tenta no JSON sincronizado
      const noCache = nfs.filter(nf => (nf?.compl?.cChaveNFe || '') === digitos);
      if (noCache.length > 0) {
        const notas = noCache.map(montarResultadoNfe);
        await enriquecerLocaisDasNotas(notas);
        notas.forEach(n => { n.status = registrarNotaPesquisada(n).status; });
        return res.json({ success: true, encontrada: true, origem: 'cache', numero: numeroDaNfe(noCache[0]), total: notas.length, notas });
      }
      // 2) não achou local → consulta a Omie ao vivo pela chave
      try {
        const nfOmie = await consultarNfeOmiePorChave(digitos);
        const itens = extrairItensDaNfe(nfOmie);
        if (!itens.length && !nfOmie?.compl?.cChaveNFe) {
          return res.json({ success: true, encontrada: false, numero: digitos, mensagem: 'Nota não encontrada na Omie para essa chave.' });
        }
        // Salva a nota pesquisada no JSON (conteúdo completo)
        salvarNotaPesquisada(nfOmie);
        const notas = [montarResultadoNfe(nfOmie)];
        await enriquecerLocaisDasNotas(notas);
        notas.forEach(n => { n.status = registrarNotaPesquisada(n).status; });
        return res.json({ success: true, encontrada: true, origem: 'omie', numero: numeroDaNfe(nfOmie), total: 1, notas });
      } catch (omieErr) {
        return res.json({ success: true, encontrada: false, numero: digitos, mensagem: 'Erro ao consultar a Omie: ' + omieErr.message });
      }
    }

    // ===== Busca por NÚMERO da nota (até 9 dígitos) — só no JSON sincronizado =====
    if (digitos.length <= 9) {
      const numeroExato = parseInt(digitos, 10);
      const encontradas = nfs.filter(nf => numeroDaNfe(nf) === numeroExato);
      if (encontradas.length === 0) {
        return res.json({
          success: true,
          encontrada: false,
          numero: numeroExato,
          mensagem: 'Nota não encontrada nos dados sincronizados. Sincronize as páginas dessa nota, ou cole a chave de 44 dígitos para consultar direto na Omie.'
        });
      }
      const notas = encontradas.map(montarResultadoNfe);
      await enriquecerLocaisDasNotas(notas);
      notas.forEach(n => { n.status = registrarNotaPesquisada(n).status; });
      return res.json({ success: true, encontrada: true, origem: 'cache', numero: numeroExato, total: notas.length, notas });
    }

    // ===== Entrada inválida (entre 10 e 43 dígitos, ou mais de 44) =====
    return res.json({
      success: true,
      encontrada: false,
      numero: digitos,
      mensagem: 'Entrada inválida. Digite o número da nota (até 9 dígitos) ou a chave completa de 44 dígitos.'
    });
  } catch (error) {
    console.error('[CONSULTA-NFE] Erro na busca:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Resumo do que já está salvo
app.get('/api/consulta-nfe/info', (req, res) => {
  const d = lerConsultaNfe();
  res.json({
    success: true,
    total: d.total || (d.nfs ? d.nfs.length : 0),
    total_de_paginas: d.total_de_paginas || 0,
    ultima_pagina: d.ultima_pagina || 0,
    ultima_sincronizacao: d.ultima_sincronizacao || null,
    sincronizando: progressoConsultaNfe.sincronizando
  });
});

// Inicializa o banco ao iniciar o servidor
inicializarBanco();

app.listen(PORT, () => {
  console.log(`\n🛠️  [AUXILIARES] Backend rodando em http://localhost:${PORT}`);
  console.log(`📦 Banco de dados: ${DB_DIR}`);
});
