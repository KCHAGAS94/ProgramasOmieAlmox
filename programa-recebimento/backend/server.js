import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4002;
const DB_DIR = path.join(__dirname, '..', '..', 'banco-de-dados', 'recebimento');

// ===== BANCO SQLite PARA XML (sql.js - sem compilação nativa) =====
const XML_DB_PATH = path.join(__dirname, '..', '..', 'banco-de-dados', 'xml-nfe.db');
let xmlDb = null;

async function initXmlDb() {
  const SQL = await initSqlJs();
  try {
    if (fs.existsSync(XML_DB_PATH)) {
      const buffer = fs.readFileSync(XML_DB_PATH);
      xmlDb = new SQL.Database(buffer);
    } else {
      xmlDb = new SQL.Database();
    }
  } catch (e) {
    xmlDb = new SQL.Database();
  }

  // Tabela de recebimentos Omie (sync incremental)
  xmlDb.run(`
    CREATE TABLE IF NOT EXISTS omie_recebimentos (
      nIdReceb TEXT PRIMARY KEY,
      cNumeroNFe TEXT,
      cChaveNFe TEXT,
      cSerieNFe TEXT,
      dEmissaoNFe TEXT,
      nValorNFe REAL,
      cNome TEXT,
      cRazaoSocial TEXT,
      dados_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  xmlDb.run(`
    CREATE TABLE IF NOT EXISTS omie_recebimento_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nIdReceb TEXT,
      nSequencia INTEGER,
      cCodigoProduto TEXT,
      cDescricaoProduto TEXT,
      cUnidadeNfe TEXT,
      nQtdeNFe REAL,
      nPrecoUnit REAL,
      vTotalItem REAL,
      UNIQUE(nIdReceb, nSequencia)
    )
  `);

  xmlDb.run(`
    CREATE TABLE IF NOT EXISTS omie_sync_status (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      ultima_pagina INTEGER DEFAULT 0,
      total_paginas INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Garante que existe o registro de sync
  const syncRow = xmlDbGet('SELECT id FROM omie_sync_status WHERE id = 1');
  if (!syncRow) {
    xmlDbRun('INSERT INTO omie_sync_status (id, ultima_pagina, total_paginas) VALUES (1, 0, 0)');
  }

  xmlDb.run(`
    CREATE TABLE IF NOT EXISTS xml_nfe (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_nfe TEXT,
      link_xml TEXT,
      xml_content TEXT NOT NULL,
      fornecedor TEXT,
      data_emissao TEXT,
      chave_acesso TEXT,
      serie TEXT,
      valor_total TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(numero_nfe, link_xml)
    )
  `);
  salvarXmlDb();
  console.log('[DB] Banco de dados XML iniciado em:', XML_DB_PATH);
}

function salvarXmlDb() {
  if (!xmlDb) return;
  const data = xmlDb.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(XML_DB_PATH, buffer);
}

function xmlDbGet(sql, params = []) {
  if (!xmlDb) return null;
  const stmt = xmlDb.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function xmlDbRun(sql, params = []) {
  if (!xmlDb) return;
  xmlDb.run(sql, params);
  salvarXmlDb();
}

// initXmlDb é chamado no app.listen abaixo
const ASSOCIACOES_FILE = path.join(DB_DIR, 'associacoes.json');
const CONVERSOES_FILE = path.join(DB_DIR, 'conversoes.json');
const CONFERENCIAS_FILE = path.join(DB_DIR, 'conferencias.json');
const ASSOCIACOES_MANUAIS_FILE = path.join(DB_DIR, 'associacoes_manuais.json');
const CONTAGENS_DETALHADAS_FILE = path.join(DB_DIR, 'contagens-detalhadas.json');
const PEDIDOS_STATUS_FILE = path.join(DB_DIR, 'pedidos-status.json');
const PEDIDOS_CACHE_FILE = path.join(DB_DIR, 'pedidos-cache.json');
const QUALIDADE_FILE = path.join(DB_DIR, 'qualidade-itens.json');

// ===== Itens de inspeção de qualidade (cadastro) =====
// Estrutura: array de { codigo, descricao, criterio, atualizado_em }
function normalizarCodigoQualidade(codigo) {
  return String(codigo || '').trim().toUpperCase();
}

function lerItensQualidade() {
  try {
    if (fs.existsSync(QUALIDADE_FILE)) {
      const data = fs.readFileSync(QUALIDADE_FILE, 'utf8');
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (error) {
    console.error('[QUALIDADE] Erro ao ler arquivo:', error.message);
  }
  return [];
}

function salvarItensQualidade(itens) {
  try {
    fs.writeFileSync(QUALIDADE_FILE, JSON.stringify(itens, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[QUALIDADE] Erro ao salvar arquivo:', error.message);
    return false;
  }
}

// Funções para cache de pedidos (evita chamar API Omie toda vez)
function lerPedidosCache() {
  try {
    if (fs.existsSync(PEDIDOS_CACHE_FILE)) {
      const data = fs.readFileSync(PEDIDOS_CACHE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[CACHE PEDIDOS] Erro ao ler:', error.message);
  }
  return {};
}

function salvarPedidoCache(numeroPedido, pedidoData) {
  try {
    const cache = lerPedidosCache();
    cache[String(numeroPedido)] = {
      pedido: pedidoData,
      salvo_em: new Date().toISOString()
    };
    fs.writeFileSync(PEDIDOS_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    console.log(`[CACHE PEDIDOS] Pedido ${numeroPedido} salvo no cache`);
    return true;
  } catch (error) {
    console.error('[CACHE PEDIDOS] Erro ao salvar:', error.message);
    return false;
  }
}

function buscarPedidoCache(numeroPedido) {
  const cache = lerPedidosCache();
  return cache[String(numeroPedido)] || null;
}

// Configuração API Omie
const OMIE_KEYS = {
  filial: { app_key: "2694922638408", app_secret: "02995c034ba5ba2ef1a297240bbb5bf5" },
  matriz: { app_key: "1440013226652", app_secret: "f73dfd9b15a31b7b184acd3d9ef94c6e" }
};
const OMIE_APP_KEY = OMIE_KEYS.filial.app_key;
const OMIE_APP_SECRET = OMIE_KEYS.filial.app_secret;
const OMIE_URL_NFE = "https://app.omie.com.br/api/v1/produtos/recebimentonfe/";
const OMIE_URL_PEDIDO = "https://app.omie.com.br/api/v1/produtos/pedidocompra/";
const OMIE_URL_PRODUTO = "https://app.omie.com.br/api/v1/geral/produtos/";

// Middleware
app.use(cors());
app.use(express.json());

// Funções para gerenciar associações
function lerAssociacoes() {
  try {
    if (fs.existsSync(ASSOCIACOES_FILE)) {
      const data = fs.readFileSync(ASSOCIACOES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[ASSOCIAÇÕES] Erro ao ler arquivo:', error.message);
  }
  return [];
}

function salvarAssociacoes(associacoes) {
  try {
    fs.writeFileSync(ASSOCIACOES_FILE, JSON.stringify(associacoes, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[ASSOCIAÇÕES] Erro ao salvar arquivo:', error.message);
    return false;
  }
}

// Funções para gerenciar conversões de unidades
function lerConversoes() {
  try {
    if (fs.existsSync(CONVERSOES_FILE)) {
      const data = fs.readFileSync(CONVERSOES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[CONVERSÕES] Erro ao ler arquivo:', error.message);
  }
  return {};
}

function salvarConversoes(conversoes) {
  try {
    fs.writeFileSync(CONVERSOES_FILE, JSON.stringify(conversoes, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[CONVERSÕES] Erro ao salvar arquivo:', error.message);
    return false;
  }
}

function salvarConversao(codigoProduto, unidadePedido, unidadeNFe, fator) {
  const conversoes = lerConversoes();

  if (!conversoes[codigoProduto]) {
    conversoes[codigoProduto] = {};
  }

  const chave = `${unidadePedido}_${unidadeNFe}`;
  conversoes[codigoProduto][chave] = {
    unidade_pedido: unidadePedido,
    unidade_nfe: unidadeNFe,
    fator: parseFloat(fator),
    atualizado_em: new Date().toISOString()
  };

  return salvarConversoes(conversoes);
}

function buscarConversao(codigoProduto, unidadePedido, unidadeNFe) {
  const conversoes = lerConversoes();

  if (!conversoes[codigoProduto]) {
    return null;
  }

  const chave = `${unidadePedido}_${unidadeNFe}`;
  return conversoes[codigoProduto][chave] || null;
}

// Funções para gerenciar conferências físicas
function lerConferencias() {
  try {
    if (fs.existsSync(CONFERENCIAS_FILE)) {
      const data = fs.readFileSync(CONFERENCIAS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[CONFERÊNCIAS] Erro ao ler arquivo:', error.message);
  }
  return [];
}

function salvarConferencias(conferencias) {
  try {
    fs.writeFileSync(CONFERENCIAS_FILE, JSON.stringify(conferencias, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[CONFERÊNCIAS] Erro ao salvar arquivo:', error.message);
    return false;
  }
}

function salvarConferenciaItem(numeroPedido, numeroNFe, codigoNFe, quantidadeNFe, quantidadeFisica, conferidoPor) {
  const conferencias = lerConferencias();

  // Busca ou cria conferência para este pedido/NFe
  let conferencia = conferencias.find(c =>
    c.numero_pedido === String(numeroPedido) &&
    c.numero_nfe === String(numeroNFe)
  );

  if (!conferencia) {
    conferencia = {
      numero_pedido: String(numeroPedido),
      numero_nfe: String(numeroNFe),
      itens: [],
      atualizado_em: new Date().toISOString()
    };
    conferencias.push(conferencia);
  }

  // Busca ou cria item na conferência
  let item = conferencia.itens.find(i => i.codigo_nfe === String(codigoNFe));

  if (item) {
    // Atualiza item existente
    item.quantidade_nfe = parseFloat(quantidadeNFe);
    item.quantidade_fisica = parseFloat(quantidadeFisica);
    item.conferido_por = conferidoPor;
    item.conferido_em = new Date().toISOString();
  } else {
    // Adiciona novo item
    conferencia.itens.push({
      codigo_nfe: String(codigoNFe),
      quantidade_nfe: parseFloat(quantidadeNFe),
      quantidade_fisica: parseFloat(quantidadeFisica),
      conferido_por: conferidoPor,
      conferido_em: new Date().toISOString()
    });
  }

  conferencia.atualizado_em = new Date().toISOString();

  return salvarConferencias(conferencias);
}

function buscarConferencia(numeroPedido, numeroNFe) {
  const conferencias = lerConferencias();
  return conferencias.find(c =>
    c.numero_pedido === String(numeroPedido) &&
    c.numero_nfe === String(numeroNFe)
  );
}

// Funções para gerenciar associações manuais persistentes
function lerAssociacoesManuais() {
  try {
    if (fs.existsSync(ASSOCIACOES_MANUAIS_FILE)) {
      const data = fs.readFileSync(ASSOCIACOES_MANUAIS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[ASSOCIAÇÕES MANUAIS] Erro ao ler arquivo:', error.message);
  }
  return {};
}

function salvarAssociacoesManuais(associacoesManuais) {
  try {
    fs.writeFileSync(ASSOCIACOES_MANUAIS_FILE, JSON.stringify(associacoesManuais, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[ASSOCIAÇÕES MANUAIS] Erro ao salvar arquivo:', error.message);
    return false;
  }
}

function salvarAssociacaoManual(numeroPedido, codigoPedido, codigoNFe) {
  const associacoesManuais = lerAssociacoesManuais();

  // Estrutura: { "numeroPedido_codigoPedido": [codigoNFe1, codigoNFe2, ...] }
  const chave = `${numeroPedido}_${codigoPedido}`;

  // Se já existe, adiciona ao array; se não, cria um array novo
  if (associacoesManuais[chave]) {
    if (Array.isArray(associacoesManuais[chave])) {
      // Já é array, adiciona se não existir
      if (!associacoesManuais[chave].includes(codigoNFe)) {
        associacoesManuais[chave].push(codigoNFe);
      }
    } else {
      // Migrar de string para array
      const valorAntigo = associacoesManuais[chave];
      associacoesManuais[chave] = valorAntigo !== codigoNFe
        ? [valorAntigo, codigoNFe]
        : [valorAntigo];
    }
  } else {
    // Nova entrada, cria como array
    associacoesManuais[chave] = [codigoNFe];
  }

  console.log(`[ASSOCIAÇÕES MANUAIS] Salvando: ${chave} → ${JSON.stringify(associacoesManuais[chave])}`);
  return salvarAssociacoesManuais(associacoesManuais);
}

function buscarAssociacaoManual(numeroPedido, codigoPedido) {
  const associacoesManuais = lerAssociacoesManuais();
  const chave = `${numeroPedido}_${codigoPedido}`;
  const resultado = associacoesManuais[chave];

  // Retorna array se existir, ou null se não existir
  if (!resultado) return null;

  // Se for string (formato antigo), converte para array
  if (!Array.isArray(resultado)) {
    return [resultado];
  }

  return resultado;
}

// Funções para gerenciar contagens detalhadas
function lerContagensDetalhadas() {
  try {
    if (fs.existsSync(CONTAGENS_DETALHADAS_FILE)) {
      const data = fs.readFileSync(CONTAGENS_DETALHADAS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[CONTAGENS DETALHADAS] Erro ao ler arquivo:', error.message);
  }
  return {};
}

function salvarContagensDetalhadas(contagens) {
  try {
    fs.writeFileSync(CONTAGENS_DETALHADAS_FILE, JSON.stringify(contagens, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[CONTAGENS DETALHADAS] Erro ao salvar arquivo:', error.message);
    return false;
  }
}

// Funções para gerenciar status de pedidos
function lerStatusPedidos() {
  try {
    if (fs.existsSync(PEDIDOS_STATUS_FILE)) {
      const data = fs.readFileSync(PEDIDOS_STATUS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[STATUS PEDIDOS] Erro ao ler arquivo:', error.message);
  }
  return {};
}

function salvarStatusPedidos(statusPedidos) {
  try {
    fs.writeFileSync(PEDIDOS_STATUS_FILE, JSON.stringify(statusPedidos, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[STATUS PEDIDOS] Erro ao salvar arquivo:', error.message);
    return false;
  }
}

// Registra/atualiza apenas a empresa do pedido, sem alterar status existente.
// Usado quando apenas consultamos o pedido (visualização), não há mudança de fluxo.
function registrarConsultaPedido(numeroPedido, empresa = null) {
  const statusPedidos = lerStatusPedidos();
  const pedidoKey = String(numeroPedido);

  if (!statusPedidos[pedidoKey]) {
    statusPedidos[pedidoKey] = {
      numero_pedido: pedidoKey,
      status: 'em_andamento',
      criado_em: new Date().toISOString()
    };
  }

  if (empresa) {
    statusPedidos[pedidoKey].empresa = empresa;
  }

  statusPedidos[pedidoKey].atualizado_em = new Date().toISOString();
  return salvarStatusPedidos(statusPedidos);
}

function atualizarStatusPedido(numeroPedido, status, usuario = null, empresa = null) {
  const statusPedidos = lerStatusPedidos();
  const pedidoKey = String(numeroPedido);

  if (!statusPedidos[pedidoKey]) {
    statusPedidos[pedidoKey] = {
      numero_pedido: pedidoKey,
      status: 'em_andamento',
      criado_em: new Date().toISOString()
    };
  }

  if (empresa) {
    statusPedidos[pedidoKey].empresa = empresa;
  }

  if (status === 'concluido' && usuario) {
    statusPedidos[pedidoKey].status = 'concluido';
    statusPedidos[pedidoKey].concluido_por = usuario;
    statusPedidos[pedidoKey].concluido_em = new Date().toISOString();
  } else if (status === 'recusado' && usuario) {
    statusPedidos[pedidoKey].status = 'recusado';
    statusPedidos[pedidoKey].recusado_por = usuario;
    statusPedidos[pedidoKey].recusado_em = new Date().toISOString();
  } else if (status === 'em_andamento') {
    statusPedidos[pedidoKey].status = 'em_andamento';
    // Remove campos de conclusão/recusa se estiver reabrindo
    delete statusPedidos[pedidoKey].concluido_por;
    delete statusPedidos[pedidoKey].concluido_em;
    delete statusPedidos[pedidoKey].recusado_por;
    delete statusPedidos[pedidoKey].recusado_em;
  }

  statusPedidos[pedidoKey].atualizado_em = new Date().toISOString();

  return salvarStatusPedidos(statusPedidos);
}

function buscarAssociacaoPorPedidoNFe(numeroPedido, numeroNFe) {
  const associacoes = lerAssociacoes();
  return associacoes.find(
    a => a.numero_pedido === String(numeroPedido) && a.numero_nfe === String(numeroNFe)
  );
}

function atualizarAssociacao(numeroPedido, numeroNFe, novasAssociacoes, linkXml) {
  const associacoes = lerAssociacoes();
  const indexPedido = associacoes.findIndex(
    a => a.numero_pedido === String(numeroPedido)
  );

  const novaNFe = {
    numero_nfe: String(numeroNFe),
    link_xml: linkXml || null,
    associacoes: novasAssociacoes,
    data_processamento: new Date().toISOString()
  };

  if (indexPedido >= 0) {
    // Pedido já existe, verificar se NFe já foi processada
    if (!associacoes[indexPedido].nfes) {
      // Migrar estrutura antiga para nova
      associacoes[indexPedido] = {
        numero_pedido: String(numeroPedido),
        nfes: [{
          numero_nfe: associacoes[indexPedido].numero_nfe,
          link_xml: associacoes[indexPedido].link_xml,
          associacoes: associacoes[indexPedido].associacoes,
          data_processamento: associacoes[indexPedido].atualizado_em
        }],
        atualizado_em: new Date().toISOString()
      };
    }

    const indexNFe = associacoes[indexPedido].nfes.findIndex(
      nfe => nfe.numero_nfe === String(numeroNFe)
    );

    if (indexNFe >= 0) {
      // Atualizar NFe existente
      if (!linkXml && associacoes[indexPedido].nfes[indexNFe].link_xml) {
        novaNFe.link_xml = associacoes[indexPedido].nfes[indexNFe].link_xml;
      }
      associacoes[indexPedido].nfes[indexNFe] = novaNFe;
    } else {
      // Adicionar nova NFe ao array
      associacoes[indexPedido].nfes.push(novaNFe);
    }
    associacoes[indexPedido].atualizado_em = new Date().toISOString();
  } else {
    // Novo pedido
    associacoes.push({
      numero_pedido: String(numeroPedido),
      nfes: [novaNFe],
      atualizado_em: new Date().toISOString()
    });
  }

  // Salvar também no arquivo de associações manuais persistentes
  if (novasAssociacoes && typeof novasAssociacoes === 'object') {
    Object.entries(novasAssociacoes).forEach(([codigoPedido, codigoNFe]) => {
      salvarAssociacaoManual(numeroPedido, codigoPedido, codigoNFe);
    });
  }

  return salvarAssociacoes(associacoes);
}

function buscarAssociacaoPorPedido(numeroPedido) {
  const associacoes = lerAssociacoes();
  return associacoes.find(a => a.numero_pedido === String(numeroPedido));
}

// Função para extrair valor de tag XML
function extrairTag(xml, tagName) {
  const regex = new RegExp(`<${tagName}>([^<]+)</${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

// Extrai dados completos da NFe para visualização formatada
function extrairDadosCompletosNFe(xml) {
  const emitBlock = xml.match(/<emit>([\s\S]*?)<\/emit>/);
  const destBlock = xml.match(/<dest>([\s\S]*?)<\/dest>/);
  const totalBlock = xml.match(/<ICMSTot>([\s\S]*?)<\/ICMSTot>/);

  const emitente = emitBlock ? {
    razaoSocial: extrairTag(emitBlock[1], 'xNome'),
    cnpj: extrairTag(emitBlock[1], 'CNPJ'),
    inscricaoEstadual: extrairTag(emitBlock[1], 'IE'),
    endereco: extrairTag(emitBlock[1], 'xLgr'),
    numero: extrairTag(emitBlock[1], 'nro'),
    bairro: extrairTag(emitBlock[1], 'xBairro'),
    cidade: extrairTag(emitBlock[1], 'xMun'),
    uf: extrairTag(emitBlock[1], 'UF'),
    cep: extrairTag(emitBlock[1], 'CEP'),
    telefone: extrairTag(emitBlock[1], 'fone')
  } : null;

  const destinatario = destBlock ? {
    razaoSocial: extrairTag(destBlock[1], 'xNome'),
    cnpj: extrairTag(destBlock[1], 'CNPJ'),
    inscricaoEstadual: extrairTag(destBlock[1], 'IE'),
    endereco: extrairTag(destBlock[1], 'xLgr'),
    cidade: extrairTag(destBlock[1], 'xMun'),
    uf: extrairTag(destBlock[1], 'UF')
  } : null;

  const totais = totalBlock ? {
    valorProdutos: extrairTag(totalBlock[1], 'vProd'),
    valorFrete: extrairTag(totalBlock[1], 'vFrete'),
    valorSeguro: extrairTag(totalBlock[1], 'vSeg'),
    valorDesconto: extrairTag(totalBlock[1], 'vDesc'),
    valorIPI: extrairTag(totalBlock[1], 'vIPI'),
    valorICMS: extrairTag(totalBlock[1], 'vICMS'),
    valorTotal: extrairTag(totalBlock[1], 'vNF')
  } : null;

  return {
    numeroNF: extrairTag(xml, 'nNF'),
    serie: extrairTag(xml, 'serie'),
    dataEmissao: extrairTag(xml, 'dhEmi') || extrairTag(xml, 'dEmi'),
    chaveAcesso: extrairTag(xml, 'chNFe') || (() => {
      const infNFe = xml.match(/Id="NFe(\d+)"/);
      return infNFe ? infNFe[1] : null;
    })(),
    naturezaOperacao: extrairTag(xml, 'natOp'),
    emitente,
    destinatario,
    totais
  };
}

// Função para extrair todos os itens da NFe
function extrairItensNFe(xml) {
  const itens = [];

  // Extrai informação do emitente
  const emit = xml.match(/<emit>[\s\S]*?<\/emit>/);
  const fornecedor = emit ? extrairTag(emit[0], 'xNome') : null;

  // Extrai número da NF
  const numeroNF = extrairTag(xml, 'nNF');

  // Extrai todos os blocos de items (<det nItem="N">). Captura também os atributos pra extrair nItem.
  const detRegex = /<det\b([^>]*)>([\s\S]*?)<\/det>/gi;
  let match;
  let posicaoFallback = 0;

  while ((match = detRegex.exec(xml)) !== null) {
    const attrs = match[1] || '';
    const detContent = match[2];
    posicaoFallback++;

    const nItemMatch = attrs.match(/nItem\s*=\s*"(\d+)"/i);
    const nItem = nItemMatch ? parseInt(nItemMatch[1], 10) : posicaoFallback;

    const item = {
      fornecedor: fornecedor,
      numeroNF: numeroNF,
      nItem,
      codigo: extrairTag(detContent, 'cProd'),
      descricao: extrairTag(detContent, 'xProd'),
      unidade: extrairTag(detContent, 'uCom'),
      quantidade: extrairTag(detContent, 'qCom'),
      valorUnitario: extrairTag(detContent, 'vUnCom'),
      valorTotal: extrairTag(detContent, 'vProd')
    };

    itens.push(item);
  }

  return itens;
}

// Função auxiliar para chamadas Omie com retry (protege contra erro 425 - rate limit)
async function chamarOmieComRetry(url, payload, timeout = 30000, maxTentativas = 3) {
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      const response = await axios.post(url, payload, { timeout });

      if (response.data.faultstring) {
        throw new Error(`Erro Omie: ${response.data.faultstring}`);
      }

      return response.data;
    } catch (error) {
      const status = error.response?.status;

      // Erro 425 (Too Early) ou 429 (Too Many Requests) = rate limit, tentar novamente
      if ((status === 425 || status === 429) && tentativa < maxTentativas) {
        const espera = tentativa * 2000; // 2s, 4s
        console.log(`[OMIE] Rate limit (${status}) na tentativa ${tentativa}/${maxTentativas}. Aguardando ${espera / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, espera));
        continue;
      }

      throw error;
    }
  }
}

// Helper para obter chaves por origem
function getKeys(origem) {
  const keys = OMIE_KEYS[origem] || OMIE_KEYS.filial;
  return { app_key: keys.app_key, app_secret: keys.app_secret };
}

// Funções de consulta Omie
async function consultarRecebimentoPorChave(chave_nfe, origem = 'filial') {
  const keys = getKeys(origem);
  const payload = {
    call: "ConsultarRecebimento",
    ...keys,
    param: [{
      nIdReceb: 0,
      cChaveNfe: chave_nfe
    }]
  };

  return await chamarOmieComRetry(OMIE_URL_NFE, payload);
}

async function consultarPedidoPorNumero(numero_pedido, origem = 'filial') {
  const keys = getKeys(origem);
  const payload = {
    call: "ConsultarPedCompra",
    ...keys,
    param: [{ cNumero: String(numero_pedido) }]
  };

  return await chamarOmieComRetry(OMIE_URL_PEDIDO, payload);
}

async function consultarProdutoModelo(codigo_produto, origem = 'filial') {
  if (!codigo_produto) return null;

  const keys = getKeys(origem);
  const payload = {
    call: "ConsultarProduto",
    ...keys,
    param: [{
      codigo_produto: 0,
      codigo_produto_integracao: "",
      codigo: codigo_produto
    }]
  };

  try {
    return await chamarOmieComRetry(OMIE_URL_PRODUTO, payload, 5000);
  } catch {
    return null;
  }
}

// Rota de status
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Servidor ativo'
  });
});

// Rota para buscar associações por pedido (retorna todas as NFes)
app.post('/api/buscar-por-pedido', (req, res) => {
  try {
    const { numero_pedido } = req.body;

    if (!numero_pedido) {
      return res.status(400).json({
        success: false,
        error: 'Número do pedido é obrigatório'
      });
    }

    const associacao = buscarAssociacaoPorPedido(numero_pedido);

    if (associacao) {
      // Migrar estrutura antiga se necessário
      if (!associacao.nfes && associacao.numero_nfe) {
        res.json({
          success: true,
          encontrado: true,
          nfes: [{
            numero_nfe: associacao.numero_nfe,
            link_xml: associacao.link_xml,
            associacoes: associacao.associacoes || {},
            data_processamento: associacao.atualizado_em
          }]
        });
      } else {
        res.json({
          success: true,
          encontrado: true,
          nfes: associacao.nfes || []
        });
      }
    } else {
      res.json({
        success: true,
        encontrado: false,
        nfes: []
      });
    }
  } catch (error) {
    console.error('[ASSOCIAÇÕES] Erro ao buscar por pedido:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar associações'
    });
  }
});

// Rota para buscar associações
app.post('/api/buscar-associacoes', (req, res) => {
  try {
    const { numero_pedido, numero_nfe } = req.body;

    if (!numero_pedido || !numero_nfe) {
      return res.status(400).json({
        success: false,
        error: 'Número do pedido e NFe são obrigatórios'
      });
    }

    const associacao = buscarAssociacaoPorPedidoNFe(numero_pedido, numero_nfe);

    res.json({
      success: true,
      associacoes: associacao?.associacoes || {}
    });
  } catch (error) {
    console.error('[ASSOCIAÇÕES] Erro ao buscar:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar associações'
    });
  }
});

// Rota para salvar associações
app.post('/api/salvar-associacoes', (req, res) => {
  try {
    const { numero_pedido, numero_nfe, associacoes, link_xml } = req.body;

    if (!numero_pedido || !numero_nfe) {
      return res.status(400).json({
        success: false,
        error: 'Número do pedido e NFe são obrigatórios'
      });
    }

    if (!associacoes || typeof associacoes !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Associações inválidas'
      });
    }

    console.log(`[ASSOCIAÇÕES] Salvando associações para Pedido ${numero_pedido} × NFe ${numero_nfe}`);
    console.log('[ASSOCIAÇÕES] Link XML:', link_xml || 'não fornecido');
    console.log('[ASSOCIAÇÕES] Dados:', JSON.stringify(associacoes, null, 2));

    const sucesso = atualizarAssociacao(numero_pedido, numero_nfe, associacoes, link_xml);

    if (sucesso) {
      console.log('[ASSOCIAÇÕES] ✅ Salvo com sucesso');
      res.json({
        success: true,
        message: 'Associações salvas com sucesso'
      });
    } else {
      throw new Error('Falha ao salvar no arquivo');
    }
  } catch (error) {
    console.error('[ASSOCIAÇÕES] Erro ao salvar:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao salvar associações'
    });
  }
});

// Rota para consultar pedido do Omie
app.post('/api/consultar-pedido', async (req, res) => {
  try {
    const { numero_pedido, forcar_atualizacao, empresa } = req.body;
    const origemEmpresa = empresa || 'filial';

    if (!numero_pedido || !numero_pedido.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Número do pedido é obrigatório'
      });
    }

    const numPedido = numero_pedido.trim();
    const cacheKey = `${origemEmpresa}_${numPedido}`;

    // Verifica cache primeiro (se não for atualização forçada)
    if (!forcar_atualizacao) {
      const cached = buscarPedidoCache(cacheKey);
      if (cached) {
        console.log(`[CACHE PEDIDOS] Pedido ${numPedido} (${origemEmpresa}) encontrado no cache`);
        // Garante que a empresa está salva no status (sem alterar status atual)
        registrarConsultaPedido(numPedido, origemEmpresa);
        return res.json({
          success: true,
          pedido: cached.pedido,
          origem: 'cache',
          empresa: origemEmpresa,
          salvo_em: cached.salvo_em
        });
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log(`[OMIE API] CONSULTANDO PEDIDO ${forcar_atualizacao ? '(ATUALIZAÇÃO FORÇADA)' : '(sem cache)'} - ${origemEmpresa.toUpperCase()}`);
    console.log('='.repeat(80));
    console.log(`Numero do Pedido: ${numPedido} | Empresa: ${origemEmpresa}`);
    console.log('='.repeat(80) + '\n');

    const pedidoData = await consultarPedidoPorNumero(numPedido, origemEmpresa);

    // Salva no cache
    salvarPedidoCache(cacheKey, pedidoData);

    // Salva a empresa no status do pedido (sem alterar status atual)
    registrarConsultaPedido(numPedido, origemEmpresa);

    console.log(`[OMIE API] Resposta recebida e salva no cache (${origemEmpresa})`);

    res.json({
      success: true,
      pedido: pedidoData,
      origem: 'api',
      empresa: origemEmpresa
    });
  } catch (error) {
    console.error('[OMIE] Erro ao consultar pedido:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao consultar pedido'
    });
  }
});

// Rota para baixar XML do link
app.post('/api/baixar-xml', async (req, res) => {
  try {
    const { link } = req.body;

    if (!link || !link.trim()) {
      return res.status(400).json({ success: false, error: 'Link é obrigatório' });
    }

    if (!link.startsWith('http')) {
      return res.status(400).json({ success: false, error: 'Link inválido. Deve começar com http:// ou https://' });
    }

    // Tenta buscar do banco primeiro (link já salvo anteriormente)
    const salvo = xmlDbGet('SELECT xml_content FROM xml_nfe WHERE link_xml = ?', [link.trim()]);

    let xmlContent;

    if (salvo) {
      console.log('[XML] ✅ XML encontrado no banco local');
      xmlContent = salvo.xml_content;
    } else {
      console.log(`[XML] Baixando XML do link: ${link}`);
      const response = await axios.get(link, { timeout: 30000, responseType: 'text' });
      xmlContent = response.data;

      if (!xmlContent || !xmlContent.includes('<?xml')) {
        return res.status(400).json({ success: false, error: 'O link não retornou um XML válido' });
      }

      // Salva no banco SQLite
      const dadosNFe = extrairDadosCompletosNFe(xmlContent);
      try {
        xmlDbRun(`
          INSERT OR REPLACE INTO xml_nfe (numero_nfe, link_xml, xml_content, fornecedor, data_emissao, chave_acesso, serie, valor_total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          dadosNFe.numeroNF,
          link.trim(),
          xmlContent,
          dadosNFe.emitente?.razaoSocial || null,
          dadosNFe.dataEmissao || null,
          dadosNFe.chaveAcesso || null,
          dadosNFe.serie || null,
          dadosNFe.totais?.valorTotal || null
        ]);
        console.log('[XML] ✅ XML salvo no banco local');
      } catch (dbErr) {
        console.error('[XML] Erro ao salvar no banco:', dbErr.message);
      }
    }

    const itens = extrairItensNFe(xmlContent);

    console.log(`[XML] ℹ️ Extraídos ${itens.length} itens da NFe`);
    console.log(`[XML] ℹ️ Número NF:`, itens[0]?.numeroNF || 'Não encontrado');
    console.log(`[XML] ℹ️ Fornecedor:`, itens[0]?.fornecedor || 'Não encontrado');

    res.json({ success: true, xml_content: xmlContent, itens });
  } catch (error) {
    // Se o link falhou, tenta buscar do banco mesmo assim
    const { link } = req.body;
    if (link) {
      const salvo = xmlDbGet('SELECT xml_content FROM xml_nfe WHERE link_xml = ?', [link.trim()]);
      if (salvo) {
        console.log('[XML] ⚠️ Link expirado, mas XML encontrado no banco local');
        const itens = extrairItensNFe(salvo.xml_content);
        return res.json({ success: true, xml_content: salvo.xml_content, itens, from_cache: true });
      }
    }
    console.error('[XML] Erro:', error.message);
    res.status(500).json({ success: false, error: 'Link expirado e XML não encontrado no banco local. Adicione um novo link.' });
  }
});

// ===== SYNC INCREMENTAL DE RECEBIMENTOS OMIE =====

// Flag global: true enquanto qualquer sync com o Omie está em andamento.
// Usada por /api/sync-status para bloquear o modal de adição de NFe no frontend.
let omieSyncing = false;
function setSyncing(v) { omieSyncing = !!v; }

// Janela "retroativa" pra pegar NFes novas que apareceram em páginas anteriores
// à última sincronizada (o Omie pode reordenar quando há edições).
const SYNC_LOOKBACK_PAGINAS = 3;

// Helper: sincroniza de (ultima_pagina - SYNC_LOOKBACK_PAGINAS) até totalPaginas.
// Se ultima_pagina === 0, faz sync completo (página 1 em diante).
async function syncPaginasRecentes() {
  setSyncing(true);
  try {
    const syncStatus = xmlDbGet('SELECT ultima_pagina FROM omie_sync_status WHERE id = 1');
    const ultimaPagina = syncStatus?.ultima_pagina || 0;

    const primeira = await chamarOmieComRetry(OMIE_URL_NFE, {
      call: 'ListarRecebimentos',
      app_key: OMIE_APP_KEY,
      app_secret: OMIE_APP_SECRET,
      param: [{ nPagina: 1, nRegistrosPorPagina: 50 }]
    });
    const totalPaginas = primeira.nTotalPaginas || primeira.nTotPaginas || 1;

    // Sempre salva página 1 (já foi buscada pra descobrir o total)
    salvarRecebimentosPagina(primeira.recebimentos || []);

    const paginaInicial = ultimaPagina === 0
      ? 2
      : Math.max(2, ultimaPagina - SYNC_LOOKBACK_PAGINAS);

    console.log(`[SYNC-NFE] Recentes: páginas ${paginaInicial} até ${totalPaginas} (lookback ${SYNC_LOOKBACK_PAGINAS}, última=${ultimaPagina})`);

    for (let pag = paginaInicial; pag <= totalPaginas; pag++) {
      await new Promise(r => setTimeout(r, 600));
      const data = await chamarOmieComRetry(OMIE_URL_NFE, {
        call: 'ListarRecebimentos',
        app_key: OMIE_APP_KEY,
        app_secret: OMIE_APP_SECRET,
        param: [{ nPagina: pag, nRegistrosPorPagina: 50 }]
      });
      salvarRecebimentosPagina(data.recebimentos || []);
      console.log(`[SYNC-NFE] Página ${pag}/${totalPaginas} processada`);
    }

    xmlDbRun('UPDATE omie_sync_status SET ultima_pagina = ?, total_paginas = ?, updated_at = datetime("now") WHERE id = 1', [totalPaginas, totalPaginas]);
    salvarXmlDb();
    return { totalPaginas, paginaInicial };
  } finally {
    setSyncing(false);
  }
}

app.get('/api/sync-status', (req, res) => {
  res.json({ syncing: omieSyncing });
});

async function syncRecebimentosIncremental() {
  setSyncing(true);
  try {
    const syncStatus = xmlDbGet('SELECT ultima_pagina, total_paginas FROM omie_sync_status WHERE id = 1');
    let ultimaPagina = syncStatus?.ultima_pagina || 0;

    const payload1 = {
      call: 'ListarRecebimentos',
      app_key: OMIE_APP_KEY,
      app_secret: OMIE_APP_SECRET,
      param: [{ nPagina: 1, nRegistrosPorPagina: 50 }]
    };
    console.log('[SYNC-NFE] Payload primeira req:', JSON.stringify({ call: payload1.call, app_key: payload1.app_key?.substring(0, 5) + '...' }));
    const primeiraReq = await chamarOmieComRetry(OMIE_URL_NFE, payload1);
    console.log('[SYNC-NFE] Resposta chaves:', Object.keys(primeiraReq));
    console.log('[SYNC-NFE] nTotPaginas:', primeiraReq.nTotPaginas, '| nTotRegistros:', primeiraReq.nTotRegistros, '| total_de_paginas:', primeiraReq.total_de_paginas);

    const totalPaginas = primeiraReq.nTotalPaginas || primeiraReq.nTotPaginas || 1;
    console.log(`[SYNC-NFE] Total de páginas: ${totalPaginas}, última processada: ${ultimaPagina}`);

    // Sempre salva página 1
    salvarRecebimentosPagina(primeiraReq.recebimentos || []);

    // Começa em (ultima_pagina - SYNC_LOOKBACK_PAGINAS) para recapturar NFes que surgiram em páginas anteriores.
    // Se nunca sincronizou (ultimaPagina = 0), faz sync completo a partir da página 2.
    const paginaInicial = ultimaPagina === 0
      ? 2
      : Math.max(2, ultimaPagina - SYNC_LOOKBACK_PAGINAS);
    let novasPaginas = 0;

    for (let pag = paginaInicial; pag <= totalPaginas; pag++) {

      await new Promise(resolve => setTimeout(resolve, 600));

      const data = await chamarOmieComRetry(OMIE_URL_NFE, {
        call: 'ListarRecebimentos',
        app_key: OMIE_APP_KEY,
        app_secret: OMIE_APP_SECRET,
        param: [{ nPagina: pag, nRegistrosPorPagina: 50 }]
      });

      salvarRecebimentosPagina(data.recebimentos || []);
      novasPaginas++;
      console.log(`[SYNC-NFE] Página ${pag}/${totalPaginas} processada`);
    }

    xmlDbRun('UPDATE omie_sync_status SET ultima_pagina = ?, total_paginas = ?, updated_at = datetime("now") WHERE id = 1', [totalPaginas, totalPaginas]);
    salvarXmlDb();

    console.log(`[SYNC-NFE] Sync concluída. ${novasPaginas} novas páginas processadas.`);
    return { novasPaginas, totalPaginas };
  } finally {
    setSyncing(false);
  }
}

function salvarRecebimentosPagina(recebimentos) {
  console.log(`[SYNC-NFE] Salvando ${recebimentos.length} recebimentos. Números: ${recebimentos.slice(0, 5).map(r => r.cabec?.cNumeroNFe).join(', ')}...`);
  for (const rec of recebimentos) {
    const cabec = rec.cabec || {};
    xmlDbRun(`
      INSERT OR REPLACE INTO omie_recebimentos (nIdReceb, cNumeroNFe, cChaveNFe, cSerieNFe, dEmissaoNFe, nValorNFe, cNome, cRazaoSocial, dados_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      String(cabec.nIdReceb || ''),
      cabec.cNumeroNFe || '',
      cabec.cChaveNFe || '',
      cabec.cSerieNFe || '',
      cabec.dEmissaoNFe || '',
      cabec.nValorNFe || 0,
      cabec.cNome || '',
      cabec.cRazaoSocial || '',
      JSON.stringify(rec)
    ]);
  }
  salvarXmlDb();
}

function buscarNFeLocal(numero) {
  // Match exato, normalizando zeros à esquerda dos dois lados (ex: "3769" casa com "0000003769", mas NÃO com "137694")
  const numeroStr = String(numero);
  const numeroSemZeros = numeroStr.replace(/^0+/, '') || '0';
  const stmt = xmlDb.prepare(
    `SELECT * FROM omie_recebimentos
     WHERE cNumeroNFe = ? OR ltrim(cNumeroNFe, '0') = ?
     ORDER BY dEmissaoNFe DESC`
  );
  stmt.bind([numeroStr, numeroSemZeros]);
  const resultados = [];
  while (stmt.step()) {
    resultados.push(stmt.getAsObject());
  }
  stmt.free();
  return resultados;
}

function buscarItensLocal(nIdReceb) {
  const stmt = xmlDb.prepare('SELECT * FROM omie_recebimento_itens WHERE nIdReceb = ? ORDER BY nSequencia ASC');
  stmt.bind([nIdReceb]);
  const resultados = [];
  while (stmt.step()) {
    resultados.push(stmt.getAsObject());
  }
  stmt.free();
  return resultados;
}

// Forçar sincronização com Omie — sincroniza de (ultima_pagina - SYNC_LOOKBACK_PAGINAS) até o final
app.post('/api/sync-nfes', async (req, res) => {
  try {
    console.log('[SYNC-NFE] Sync solicitado pelo usuário');
    const { totalPaginas, paginaInicial } = await syncPaginasRecentes();
    res.json({ success: true, message: `Sincronização concluída. Páginas ${paginaInicial} até ${totalPaginas} processadas.` });
  } catch (error) {
    console.error('[SYNC-NFE] Erro no sync:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Pesquisar NFes no banco local (retorna lista para o usuário selecionar)
app.post('/api/pesquisar-nfe', async (req, res) => {
  try {
    const { termo } = req.body;
    if (!termo || termo.trim().length < 2) {
      return res.json({ success: true, resultados: [] });
    }

    const t = termo.trim();

    // Busca no banco local por número ou fornecedor
    const stmt = xmlDb.prepare(`
      SELECT nIdReceb, cNumeroNFe, cRazaoSocial, cNome, nValorNFe, dEmissaoNFe
      FROM omie_recebimentos
      WHERE cNumeroNFe LIKE ? OR cRazaoSocial LIKE ? OR cNome LIKE ?
      ORDER BY dEmissaoNFe DESC
      LIMIT 20
    `);
    stmt.bind([`%${t}%`, `%${t}%`, `%${t}%`]);

    let resultados = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      resultados.push({
        nIdReceb: row.nIdReceb,
        numero_nfe: (row.cNumeroNFe || '').replace(/^0+/, '') || '0',
        numero_nfe_original: row.cNumeroNFe,
        fornecedor: row.cNome || row.cRazaoSocial || '-',
        valor: row.nValorNFe || 0,
        data_emissao: row.dEmissaoNFe || '-'
      });
    }
    stmt.free();

    // Se não encontrou nada, faz sync e tenta de novo
    if (resultados.length === 0) {
      await syncRecebimentosIncremental();

      const stmt2 = xmlDb.prepare(`
        SELECT nIdReceb, cNumeroNFe, cRazaoSocial, cNome, nValorNFe, dEmissaoNFe
        FROM omie_recebimentos
        WHERE cNumeroNFe LIKE ? OR cRazaoSocial LIKE ? OR cNome LIKE ?
        ORDER BY dEmissaoNFe DESC
        LIMIT 20
      `);
      stmt2.bind([`%${t}%`, `%${t}%`, `%${t}%`]);
      while (stmt2.step()) {
        const row = stmt2.getAsObject();
        resultados.push({
          nIdReceb: row.nIdReceb,
          numero_nfe: (row.cNumeroNFe || '').replace(/^0+/, '') || '0',
          numero_nfe_original: row.cNumeroNFe,
          fornecedor: row.cNome || row.cRazaoSocial || '-',
          valor: row.nValorNFe || 0,
          data_emissao: row.dEmissaoNFe || '-'
        });
      }
      stmt2.free();
    }

    res.json({ success: true, resultados });
  } catch (error) {
    console.error('[PESQUISAR-NFE] Erro:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Buscar NFe por número — busca local → sync incremental → busca de novo → consulta itens
app.post('/api/buscar-nfe-omie', async (req, res) => {
  try {
    const { numero_nfe } = req.body;

    if (!numero_nfe || !numero_nfe.trim()) {
      return res.status(400).json({ success: false, error: 'Número da NFe é obrigatório' });
    }

    const numNfe = numero_nfe.trim();
    const keys = getKeys('filial');

    console.log(`[NFE-OMIE] Buscando NFe ${numNfe}...`);

    // 1. Busca no banco local
    let resultados = buscarNFeLocal(numNfe);

    // 2. Se não achou, sincroniza (ultima_pagina - SYNC_LOOKBACK_PAGINAS) até o final e tenta de novo
    if (resultados.length === 0) {
      console.log(`[NFE-OMIE] NFe ${numNfe} não encontrada localmente, sincronizando páginas recentes...`);
      try {
        await syncPaginasRecentes();
        resultados = buscarNFeLocal(numNfe);
      } catch (syncErr) {
        console.error(`[NFE-OMIE] Erro ao sincronizar páginas recentes:`, syncErr.message);
      }
    }

    if (resultados.length === 0) {
      return res.status(404).json({ success: false, error: `NFe ${numNfe} não encontrada no Omie` });
    }

    const nfe = resultados[0];
    const nIdReceb = nfe.nIdReceb;

    // 3. Busca itens no banco local
    let itensLocal = buscarItensLocal(nIdReceb);

    // 4. Se não tem itens locais, consulta API e salva
    if (itensLocal.length === 0) {
      console.log(`[NFE-OMIE] Buscando itens da NFe ${numNfe} (nIdReceb: ${nIdReceb}) na API...`);

      const detData = await chamarOmieComRetry(OMIE_URL_NFE, {
        call: 'ConsultarRecebimento',
        app_key: OMIE_APP_KEY,
        app_secret: OMIE_APP_SECRET,
        param: [{ nIdReceb: Number(nIdReceb), cChaveNfe: '' }]
      });

      const itensApi = (detData.itensRecebimento || []).map(item => {
        const ic = item.itensCabec || {};
        return {
          nSequencia: ic.nSequencia || 0,
          cCodigoProduto: ic.cCodigoProduto || '',
          cDescricaoProduto: ic.cDescricaoProduto || '',
          cUnidadeNfe: ic.cUnidadeNfe || '',
          nQtdeNFe: ic.nQtdeNFe || 0,
          nPrecoUnit: ic.nPrecoUnit || 0,
          vTotalItem: ic.vTotalItem || 0
        };
      });

      // Salva itens no banco local
      for (const item of itensApi) {
        xmlDbRun(`
          INSERT OR REPLACE INTO omie_recebimento_itens (nIdReceb, nSequencia, cCodigoProduto, cDescricaoProduto, cUnidadeNfe, nQtdeNFe, nPrecoUnit, vTotalItem)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [nIdReceb, item.nSequencia, item.cCodigoProduto, item.cDescricaoProduto, item.cUnidadeNfe, item.nQtdeNFe, item.nPrecoUnit, item.vTotalItem]);
      }
      salvarXmlDb();

      itensLocal = itensApi;
    }

    // 5. Formata resposta — usa o número oficial do banco (sem zeros à esquerda) pra evitar divergência com o que o usuário digitou
    const numeroOficial = (nfe.cNumeroNFe || '').replace(/^0+/, '') || numNfe;

    const itens = itensLocal.map((item, idx) => ({
      codigo: item.cCodigoProduto || '',
      descricao: item.cDescricaoProduto || '',
      unidade: item.cUnidadeNfe || '',
      quantidade: String(item.nQtdeNFe || 0),
      valorUnitario: String(item.nPrecoUnit || 0),
      valorTotal: String(item.vTotalItem || 0),
      fornecedor: nfe.cNome || nfe.cRazaoSocial || '',
      numeroNF: numeroOficial,
      nItem: item.nSequencia || (idx + 1)
    }));

    console.log(`[NFE-OMIE] ${itens.length} itens retornados para NFe ${numeroOficial}`);

    res.json({
      success: true,
      itens,
      info: {
        numero_nfe: numeroOficial,
        fornecedor: nfe.cNome || nfe.cRazaoSocial || '',
        chave_nfe: nfe.cChaveNFe || '',
        data_emissao: nfe.dEmissaoNFe || '',
        valor_total: nfe.nValorNFe || 0
      }
    });
  } catch (error) {
    console.error('[NFE-OMIE] Erro:', error.message);
    console.error('[NFE-OMIE] Detalhes:', error.response?.data || error.response?.status || 'sem detalhes');
    res.status(500).json({ success: false, error: error.message || 'Erro ao buscar NFe' });
  }
});

// Rota para obter dados formatados da NFe (para visualização tipo DANFE)
app.post('/api/xml-formatado', (req, res) => {
  try {
    const { link_xml, numero_nfe } = req.body;

    let xmlContent = null;

    // Busca por link ou por número da NFe
    if (link_xml) {
      const row = xmlDbGet('SELECT xml_content FROM xml_nfe WHERE link_xml = ?', [link_xml]);
      if (row) xmlContent = row.xml_content;
    }

    if (!xmlContent && numero_nfe) {
      const row = xmlDbGet('SELECT xml_content FROM xml_nfe WHERE numero_nfe = ?', [numero_nfe]);
      if (row) xmlContent = row.xml_content;
    }

    if (!xmlContent) {
      return res.status(404).json({ success: false, error: 'XML não encontrado no banco' });
    }

    const dados = extrairDadosCompletosNFe(xmlContent);
    const itens = extrairItensNFe(xmlContent);

    res.json({
      success: true,
      dados: {
        ...dados,
        itens: itens.map(item => ({
          codigo: item.codigo,
          descricao: item.descricao,
          unidade: item.unidade,
          quantidade: item.quantidade,
          valorUnitario: item.valorUnitario,
          valorTotal: item.valorTotal,
          nItem: item.nItem
        }))
      }
    });
  } catch (error) {
    console.error('[XML-FORMATADO] Erro:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para visualizar dados da NFe do banco (sem XML)
app.post('/api/dados-nfe', async (req, res) => {
  try {
    const { numero_nfe } = req.body;

    if (!numero_nfe) {
      return res.status(400).json({ success: false, error: 'Número da NFe é obrigatório' });
    }

    const resultados = buscarNFeLocal(String(numero_nfe));

    if (resultados.length === 0) {
      return res.status(404).json({ success: false, error: 'NFe não encontrada no banco' });
    }

    const nfe = resultados[0];
    const itens = buscarItensLocal(nfe.nIdReceb);

    res.json({
      success: true,
      dados: {
        numeroNF: nfe.cNumeroNFe || numero_nfe,
        serie: nfe.cSerieNFe || '-',
        dataEmissao: nfe.dEmissaoNFe || '-',
        chaveAcesso: nfe.cChaveNFe || null,
        naturezaOperacao: '-',
        emitente: {
          razaoSocial: nfe.cRazaoSocial || nfe.cNome || '-',
          cnpj: null,
          nomeFantasia: nfe.cNome || null
        },
        destinatario: null,
        totais: {
          valorProdutos: String(nfe.nValorNFe || 0),
          valorTotal: String(nfe.nValorNFe || 0)
        },
        itens: itens.map((item, idx) => ({
          codigo: item.cCodigoProduto || '',
          descricao: item.cDescricaoProduto || '',
          unidade: item.cUnidadeNfe || '',
          quantidade: String(item.nQtdeNFe || 0),
          valorUnitario: String(item.nPrecoUnit || 0),
          valorTotal: String(item.vTotalItem || 0),
          nItem: item.nSequencia || (idx + 1)
        }))
      }
    });
  } catch (error) {
    console.error('[DADOS-NFE] Erro:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota para salvar conversão de unidade
app.post('/api/salvar-conversao', (req, res) => {
  try {
    const { codigo_produto, unidade_pedido, unidade_nfe, fator } = req.body;

    if (!codigo_produto || !unidade_pedido || !unidade_nfe || !fator) {
      return res.status(400).json({
        success: false,
        error: 'Todos os campos são obrigatórios'
      });
    }

    if (isNaN(fator) || fator <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Fator deve ser um número positivo'
      });
    }

    console.log(`[CONVERSÃO] Salvando: ${codigo_produto} | ${unidade_pedido} → ${unidade_nfe} | Fator: ${fator}`);

    const sucesso = salvarConversao(codigo_produto, unidade_pedido, unidade_nfe, fator);

    if (sucesso) {
      console.log('[CONVERSÃO] ✅ Salva com sucesso');
      res.json({
        success: true,
        message: 'Conversão salva com sucesso'
      });
    } else {
      throw new Error('Falha ao salvar conversão');
    }
  } catch (error) {
    console.error('[CONVERSÃO] Erro:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao salvar conversão'
    });
  }
});

// Rota para buscar conversão de unidade
app.post('/api/buscar-conversao', (req, res) => {
  try {
    const { codigo_produto, unidade_pedido, unidade_nfe } = req.body;

    if (!codigo_produto || !unidade_pedido || !unidade_nfe) {
      return res.status(400).json({
        success: false,
        error: 'Todos os campos são obrigatórios'
      });
    }

    const conversao = buscarConversao(codigo_produto, unidade_pedido, unidade_nfe);

    res.json({
      success: true,
      encontrado: !!conversao,
      conversao: conversao
    });
  } catch (error) {
    console.error('[CONVERSÃO] Erro ao buscar:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar conversão'
    });
  }
});

// Rota para listar todas as conversões
app.get('/api/listar-conversoes', (req, res) => {
  try {
    const conversoes = lerConversoes();
    res.json({
      success: true,
      conversoes: conversoes
    });
  } catch (error) {
    console.error('[CONVERSÃO] Erro ao listar:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao listar conversões'
    });
  }
});

// ===== Inspeção de Qualidade: CRUD de itens =====
// Lista todos os itens cadastrados para inspeção de qualidade
app.get('/api/listar-qualidade', (req, res) => {
  try {
    res.json({ success: true, itens: lerItensQualidade() });
  } catch (error) {
    console.error('[QUALIDADE] Erro ao listar:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Erro ao listar itens de qualidade' });
  }
});

// Cria ou atualiza um item de qualidade (upsert por código).
// body: { codigo, descricao, criterio, codigo_original? }
app.post('/api/salvar-qualidade', (req, res) => {
  try {
    const { codigo, descricao, criterio, codigo_original } = req.body;

    if (!codigo || !String(codigo).trim()) {
      return res.status(400).json({ success: false, error: 'Código é obrigatório' });
    }
    if (!criterio || !String(criterio).trim()) {
      return res.status(400).json({ success: false, error: 'Motivo/Critério é obrigatório' });
    }

    const codigoNorm = normalizarCodigoQualidade(codigo);
    const itens = lerItensQualidade();

    // Em edição, remove o registro antigo (caso o código tenha mudado)
    const chaveOriginal = codigo_original ? normalizarCodigoQualidade(codigo_original) : codigoNorm;

    // Impede duplicidade quando o novo código já existe em OUTRO registro
    const existeOutro = itens.some(it =>
      normalizarCodigoQualidade(it.codigo) === codigoNorm &&
      normalizarCodigoQualidade(it.codigo) !== chaveOriginal
    );
    if (existeOutro) {
      return res.status(409).json({ success: false, error: `Já existe um item de qualidade com o código ${codigoNorm}` });
    }

    const novoItem = {
      codigo: String(codigo).trim(),
      descricao: String(descricao || '').trim(),
      criterio: String(criterio).trim(),
      atualizado_em: new Date().toISOString()
    };

    const idx = itens.findIndex(it => normalizarCodigoQualidade(it.codigo) === chaveOriginal);
    if (idx >= 0) {
      itens[idx] = novoItem;
    } else {
      itens.push(novoItem);
    }

    if (salvarItensQualidade(itens)) {
      console.log(`[QUALIDADE] Salvo: ${novoItem.codigo}`);
      res.json({ success: true, message: 'Item de qualidade salvo com sucesso', itens });
    } else {
      throw new Error('Falha ao salvar item de qualidade');
    }
  } catch (error) {
    console.error('[QUALIDADE] Erro ao salvar:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Erro ao salvar item de qualidade' });
  }
});

// Remove um item de qualidade pelo código. body: { codigo }
app.post('/api/excluir-qualidade', (req, res) => {
  try {
    const { codigo } = req.body;
    if (!codigo) {
      return res.status(400).json({ success: false, error: 'Código é obrigatório' });
    }
    const codigoNorm = normalizarCodigoQualidade(codigo);
    const itens = lerItensQualidade().filter(it => normalizarCodigoQualidade(it.codigo) !== codigoNorm);

    if (salvarItensQualidade(itens)) {
      console.log(`[QUALIDADE] Removido: ${codigoNorm}`);
      res.json({ success: true, message: 'Item de qualidade removido', itens });
    } else {
      throw new Error('Falha ao remover item de qualidade');
    }
  } catch (error) {
    console.error('[QUALIDADE] Erro ao remover:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Erro ao remover item de qualidade' });
  }
});

// Rota para salvar conferência física
app.post('/api/salvar-conferencia', (req, res) => {
  try {
    const { numero_pedido, numero_nfe, codigo_nfe, quantidade_nfe, quantidade_fisica, conferido_por } = req.body;

    if (!numero_pedido || !numero_nfe || !codigo_nfe || quantidade_nfe === undefined || quantidade_fisica === undefined || !conferido_por) {
      return res.status(400).json({
        success: false,
        error: 'Todos os campos são obrigatórios'
      });
    }

    if (isNaN(quantidade_fisica) || quantidade_fisica < 0) {
      return res.status(400).json({
        success: false,
        error: 'Quantidade física deve ser um número positivo ou zero'
      });
    }

    console.log(`[CONFERÊNCIA] Salvando: Pedido ${numero_pedido} | NFe ${numero_nfe} | Item ${codigo_nfe} | NFe: ${quantidade_nfe} | Física: ${quantidade_fisica}`);

    const sucesso = salvarConferenciaItem(numero_pedido, numero_nfe, codigo_nfe, quantidade_nfe, quantidade_fisica, conferido_por);

    if (sucesso) {
      console.log('[CONFERÊNCIA] ✅ Salva com sucesso');
      res.json({
        success: true,
        message: 'Conferência salva com sucesso'
      });
    } else {
      throw new Error('Falha ao salvar conferência');
    }
  } catch (error) {
    console.error('[CONFERÊNCIA] Erro:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao salvar conferência'
    });
  }
});

// Rota para buscar conferência de uma NFe
app.post('/api/buscar-conferencia', (req, res) => {
  try {
    const { numero_pedido, numero_nfe } = req.body;

    if (!numero_pedido || !numero_nfe) {
      return res.status(400).json({
        success: false,
        error: 'Número do pedido e NFe são obrigatórios'
      });
    }

    const conferencia = buscarConferencia(numero_pedido, numero_nfe);

    res.json({
      success: true,
      encontrado: !!conferencia,
      conferencia: conferencia || null
    });
  } catch (error) {
    console.error('[CONFERÊNCIA] Erro ao buscar:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar conferência'
    });
  }
});

// Rota para listar todas as conferências
app.get('/api/listar-conferencias', (req, res) => {
  try {
    const conferencias = lerConferencias();
    res.json({
      success: true,
      conferencias: conferencias
    });
  } catch (error) {
    console.error('[CONFERÊNCIA] Erro ao listar:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao listar conferências'
    });
  }
});

// Rota para buscar associação manual persistente
app.post('/api/buscar-associacao-manual', (req, res) => {
  try {
    const { numero_pedido, codigo_pedido } = req.body;

    if (!numero_pedido || !codigo_pedido) {
      return res.status(400).json({
        success: false,
        error: 'Número do pedido e código do produto são obrigatórios'
      });
    }

    const codigoNFe = buscarAssociacaoManual(numero_pedido, codigo_pedido);

    res.json({
      success: true,
      encontrado: !!codigoNFe,
      codigo_nfe: codigoNFe
    });
  } catch (error) {
    console.error('[ASSOCIAÇÃO MANUAL] Erro ao buscar:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar associação manual'
    });
  }
});

// Rota para listar todas as associações manuais
app.get('/api/listar-associacoes-manuais', (req, res) => {
  try {
    const associacoesManuais = lerAssociacoesManuais();
    res.json({
      success: true,
      associacoes: associacoesManuais
    });
  } catch (error) {
    console.error('[ASSOCIAÇÃO MANUAL] Erro ao listar:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao listar associações manuais'
    });
  }
});

// Rota para remover associação manual persistente
app.post('/api/remover-associacao-manual', (req, res) => {
  try {
    const { numero_pedido, codigo_pedido, codigo_nfe } = req.body;

    if (!numero_pedido || !codigo_pedido) {
      return res.status(400).json({
        success: false,
        error: 'Número do pedido e código do produto são obrigatórios'
      });
    }

    const associacoesManuais = lerAssociacoesManuais();
    const chave = `${numero_pedido}_${codigo_pedido}`;

    if (associacoesManuais[chave]) {
      if (codigo_nfe) {
        // Remoção parcial: remove apenas um código específico do array
        const atual = associacoesManuais[chave];
        if (Array.isArray(atual)) {
          const atualizado = atual.filter(cod => cod !== codigo_nfe);
          if (atualizado.length > 0) {
            associacoesManuais[chave] = atualizado;
          } else {
            delete associacoesManuais[chave];
          }
        } else if (atual === codigo_nfe) {
          delete associacoesManuais[chave];
        }
        console.log(`[ASSOCIAÇÃO MANUAL] ✅ Removida parcial: ${chave} -> ${codigo_nfe}`);
      } else {
        // Remoção total
        delete associacoesManuais[chave];
        console.log(`[ASSOCIAÇÃO MANUAL] ✅ Removida total: ${chave}`);
      }

      const sucesso = salvarAssociacoesManuais(associacoesManuais);
      if (sucesso) {
        res.json({ success: true, message: 'Associação manual removida com sucesso' });
      } else {
        throw new Error('Falha ao salvar após remover associação');
      }
    } else {
      res.json({ success: true, message: 'Associação não encontrada (já removida)' });
    }
  } catch (error) {
    console.error('[ASSOCIAÇÃO MANUAL] Erro ao remover:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Erro ao remover associação manual' });
  }
});

// Rota para migrar associações existentes para o arquivo persistente
app.post('/api/migrar-associacoes', (req, res) => {
  try {
    console.log('[MIGRAÇÃO] Iniciando migração de associações...');

    const associacoes = lerAssociacoes();
    let totalMigradas = 0;

    associacoes.forEach(pedido => {
      const numeroPedido = pedido.numero_pedido;

      // Para estrutura nova (com array de nfes)
      if (pedido.nfes && Array.isArray(pedido.nfes)) {
        pedido.nfes.forEach(nfe => {
          if (nfe.associacoes && typeof nfe.associacoes === 'object') {
            Object.entries(nfe.associacoes).forEach(([codigoPedido, codigoNFe]) => {
              salvarAssociacaoManual(numeroPedido, codigoPedido, codigoNFe);
              totalMigradas++;
              console.log(`[MIGRAÇÃO] ${numeroPedido}_${codigoPedido} → ${codigoNFe}`);
            });
          }
        });
      }
      // Para estrutura antiga (sem array de nfes)
      else if (pedido.associacoes && typeof pedido.associacoes === 'object') {
        Object.entries(pedido.associacoes).forEach(([codigoPedido, codigoNFe]) => {
          salvarAssociacaoManual(numeroPedido, codigoPedido, codigoNFe);
          totalMigradas++;
          console.log(`[MIGRAÇÃO] ${numeroPedido}_${codigoPedido} → ${codigoNFe}`);
        });
      }
    });

    console.log(`[MIGRAÇÃO] ✅ Migradas ${totalMigradas} associações`);

    res.json({
      success: true,
      message: `${totalMigradas} associações migradas com sucesso`,
      total: totalMigradas
    });
  } catch (error) {
    console.error('[MIGRAÇÃO] Erro:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao migrar associações'
    });
  }
});

// Rota para excluir NFe de um pedido
app.post('/api/excluir-nfe', (req, res) => {
  try {
    const { numero_pedido, numero_nfe } = req.body;

    if (!numero_pedido || !numero_nfe) {
      return res.status(400).json({
        success: false,
        error: 'Número do pedido e NFe são obrigatórios'
      });
    }

    console.log(`[EXCLUSÃO] Excluindo NFe ${numero_nfe} do Pedido ${numero_pedido}`);

    const associacoes = lerAssociacoes();
    const pedidoIndex = associacoes.findIndex(a => a.numero_pedido === String(numero_pedido));

    if (pedidoIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Pedido não encontrado'
      });
    }

    const pedido = associacoes[pedidoIndex];

    // Se o pedido usa estrutura antiga (sem array de nfes), remove o pedido inteiro
    if (!pedido.nfes) {
      if (pedido.numero_nfe === String(numero_nfe)) {
        associacoes.splice(pedidoIndex, 1);
        salvarAssociacoes(associacoes);
        console.log('[EXCLUSÃO] ✅ NFe removida (estrutura antiga)');
        return res.json({
          success: true,
          message: 'NFe excluída com sucesso'
        });
      } else {
        return res.status(404).json({
          success: false,
          error: 'NFe não encontrada neste pedido'
        });
      }
    }

    // Estrutura nova: remove a NFe do array
    const nfeIndex = pedido.nfes.findIndex(nfe => nfe.numero_nfe === String(numero_nfe));

    if (nfeIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'NFe não encontrada neste pedido'
      });
    }

    pedido.nfes.splice(nfeIndex, 1);

    // Se não sobrou nenhuma NFe, remove o pedido inteiro
    if (pedido.nfes.length === 0) {
      associacoes.splice(pedidoIndex, 1);
    } else {
      pedido.atualizado_em = new Date().toISOString();
    }

    const sucesso = salvarAssociacoes(associacoes);

    if (sucesso) {
      console.log('[EXCLUSÃO] ✅ NFe removida com sucesso');
      res.json({
        success: true,
        message: 'NFe excluída com sucesso'
      });
    } else {
      throw new Error('Falha ao salvar após exclusão');
    }
  } catch (error) {
    console.error('[EXCLUSÃO] Erro:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao excluir NFe'
    });
  }
});

// Rota para salvar contagens detalhadas
app.post('/api/salvar-contagens-detalhadas', (req, res) => {
  try {
    const { numero_pedido, numero_nfe, contagens, usuario } = req.body;

    if (!numero_pedido || !numero_nfe) {
      return res.status(400).json({
        success: false,
        error: 'Número do pedido e NFe são obrigatórios'
      });
    }

    if (!contagens || typeof contagens !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Contagens inválidas'
      });
    }

    const chaveGeral = `${numero_pedido}_${numero_nfe}`;
    const todasContagens = lerContagensDetalhadas();

    todasContagens[chaveGeral] = {
      numero_pedido: String(numero_pedido),
      numero_nfe: String(numero_nfe),
      contagens: contagens,
      modificado_por: usuario || 'Sistema',
      atualizado_em: new Date().toISOString()
    };

    const sucesso = salvarContagensDetalhadas(todasContagens);

    if (sucesso) {
      console.log(`[CONTAGENS DETALHADAS] ✅ Salvadas para Pedido ${numero_pedido} × NFe ${numero_nfe}`);
      res.json({
        success: true,
        message: 'Contagens detalhadas salvas com sucesso'
      });
    } else {
      throw new Error('Falha ao salvar contagens detalhadas');
    }
  } catch (error) {
    console.error('[CONTAGENS DETALHADAS] Erro ao salvar:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao salvar contagens detalhadas'
    });
  }
});

// Rota para carregar contagens detalhadas
app.post('/api/carregar-contagens-detalhadas', (req, res) => {
  try {
    const { numero_pedido, numero_nfe } = req.body;

    if (!numero_pedido || !numero_nfe) {
      return res.status(400).json({
        success: false,
        error: 'Número do pedido e NFe são obrigatórios'
      });
    }

    const chaveGeral = `${numero_pedido}_${numero_nfe}`;
    const todasContagens = lerContagensDetalhadas();
    const contagemPedido = todasContagens[chaveGeral];

    if (contagemPedido) {
      console.log(`[CONTAGENS DETALHADAS] ✅ Carregadas para Pedido ${numero_pedido} × NFe ${numero_nfe}`);
      res.json({
        success: true,
        encontrado: true,
        contagens: contagemPedido.contagens || {}
      });
    } else {
      res.json({
        success: true,
        encontrado: false,
        contagens: {}
      });
    }
  } catch (error) {
    console.error('[CONTAGENS DETALHADAS] Erro ao carregar:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao carregar contagens detalhadas'
    });
  }
});

// Rota para listar todos os pedidos com status
app.get('/api/listar-pedidos', (req, res) => {
  try {
    const associacoes = lerAssociacoes();
    const statusPedidos = lerStatusPedidos();
    const conferencias = lerConferencias();

    const pedidos = associacoes.map(pedido => {
      const numeroPedido = pedido.numero_pedido;
      const status = statusPedidos[numeroPedido] || {
        numero_pedido: numeroPedido,
        status: 'em_andamento',
        criado_em: pedido.atualizado_em
      };

      // Lista de números de NFe deste pedido (suporta formato novo `nfes[]` e legado `numero_nfe`)
      const numerosNfe = pedido.nfes && pedido.nfes.length > 0
        ? pedido.nfes.map(n => n.numero_nfe).filter(Boolean)
        : (pedido.numero_nfe ? [pedido.numero_nfe] : []);

      // Conta NFes associadas
      const qtdNfes = pedido.nfes ? pedido.nfes.length : 1;

      // Busca conferências deste pedido
      const conferenciasPedido = conferencias.filter(c => c.numero_pedido === numeroPedido);

      return {
        numero_pedido: numeroPedido,
        status: status.status,
        empresa: status.empresa || 'filial',
        criado_em: status.criado_em,
        atualizado_em: status.atualizado_em || pedido.atualizado_em,
        concluido_por: status.concluido_por,
        concluido_em: status.concluido_em,
        recusado_por: status.recusado_por,
        recusado_em: status.recusado_em,
        qtd_nfes: qtdNfes,
        numeros_nfe: numerosNfe,
        tem_conferencias: conferenciasPedido.length > 0
      };
    });

    // Ordena por data de atualização (mais recente primeiro)
    pedidos.sort((a, b) => {
      const dataA = new Date(a.atualizado_em || a.criado_em);
      const dataB = new Date(b.atualizado_em || b.criado_em);
      return dataB - dataA;
    });

    console.log(`[LISTAR PEDIDOS] ✅ Retornando ${pedidos.length} pedidos`);

    res.json({
      success: true,
      pedidos: pedidos
    });
  } catch (error) {
    console.error('[LISTAR PEDIDOS] Erro:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao listar pedidos'
    });
  }
});

// Rota para concluir um pedido
app.post('/api/concluir-pedido', (req, res) => {
  try {
    const { numero_pedido, usuario } = req.body;

    if (!numero_pedido) {
      return res.status(400).json({
        success: false,
        error: 'Número do pedido é obrigatório'
      });
    }

    if (!usuario) {
      return res.status(400).json({
        success: false,
        error: 'Usuário é obrigatório'
      });
    }

    console.log(`[CONCLUIR PEDIDO] Pedido ${numero_pedido} sendo concluído por ${usuario}`);

    const sucesso = atualizarStatusPedido(numero_pedido, 'concluido', usuario);

    if (sucesso) {
      console.log(`[CONCLUIR PEDIDO] ✅ Pedido ${numero_pedido} concluído com sucesso`);
      res.json({
        success: true,
        message: 'Pedido concluído com sucesso'
      });
    } else {
      throw new Error('Falha ao atualizar status do pedido');
    }
  } catch (error) {
    console.error('[CONCLUIR PEDIDO] Erro:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao concluir pedido'
    });
  }
});

// Rota para reabrir um pedido (voltar para "em andamento")
app.post('/api/reabrir-pedido', (req, res) => {
  try {
    const { numero_pedido } = req.body;

    if (!numero_pedido) {
      return res.status(400).json({
        success: false,
        error: 'Número do pedido é obrigatório'
      });
    }

    console.log(`[REABRIR PEDIDO] Pedido ${numero_pedido} sendo reaberto`);

    const sucesso = atualizarStatusPedido(numero_pedido, 'em_andamento');

    if (sucesso) {
      console.log(`[REABRIR PEDIDO] ✅ Pedido ${numero_pedido} reaberto com sucesso`);
      res.json({
        success: true,
        message: 'Pedido reaberto com sucesso'
      });
    } else {
      throw new Error('Falha ao atualizar status do pedido');
    }
  } catch (error) {
    console.error('[REABRIR PEDIDO] Erro:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao reabrir pedido'
    });
  }
});

// Rota para recusar um pedido
app.post('/api/recusar-pedido', (req, res) => {
  try {
    const { numero_pedido, usuario } = req.body;

    if (!numero_pedido) {
      return res.status(400).json({
        success: false,
        error: 'Número do pedido é obrigatório'
      });
    }

    if (!usuario) {
      return res.status(400).json({
        success: false,
        error: 'Usuário é obrigatório'
      });
    }

    console.log(`[RECUSAR PEDIDO] Pedido ${numero_pedido} sendo recusado por ${usuario}`);

    const sucesso = atualizarStatusPedido(numero_pedido, 'recusado', usuario);

    if (sucesso) {
      console.log(`[RECUSAR PEDIDO] ✅ Pedido ${numero_pedido} recusado com sucesso`);
      res.json({
        success: true,
        message: 'Pedido recusado com sucesso'
      });
    } else {
      throw new Error('Falha ao atualizar status do pedido');
    }
  } catch (error) {
    console.error('[RECUSAR PEDIDO] Erro:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao recusar pedido'
    });
  }
});

// Rota para excluir um pedido completamente (apenas admin)
app.post('/api/excluir-pedido', (req, res) => {
  try {
    const { numero_pedido } = req.body;

    if (!numero_pedido) {
      return res.status(400).json({
        success: false,
        error: 'Número do pedido é obrigatório'
      });
    }

    console.log(`[EXCLUIR PEDIDO] ⚠️ Iniciando exclusão do pedido ${numero_pedido}`);

    // Remove das associações
    let associacoes = lerAssociacoes();
    const associacoesAntes = associacoes.length;
    associacoes = associacoes.filter(a => a.numero_pedido !== String(numero_pedido));
    const associacoesDepois = associacoes.length;

    if (associacoesAntes !== associacoesDepois) {
      salvarAssociacoes(associacoes);
      console.log(`[EXCLUIR PEDIDO] ✅ Removido de associacoes.json`);
    }

    // Remove das conferências
    let conferencias = lerConferencias();
    const conferenciasAntes = conferencias.length;
    conferencias = conferencias.filter(c => c.numero_pedido !== String(numero_pedido));
    const conferenciasDepois = conferencias.length;

    if (conferenciasAntes !== conferenciasDepois) {
      salvarConferencias(conferencias);
      console.log(`[EXCLUIR PEDIDO] ✅ Removido de conferencias.json`);
    }

    // Remove das associações manuais
    let associacoesManuais = lerAssociacoesManuais();
    let associacoesManuaisAlteradas = false;
    Object.keys(associacoesManuais).forEach(chave => {
      if (chave.startsWith(`${numero_pedido}_`)) {
        delete associacoesManuais[chave];
        associacoesManuaisAlteradas = true;
      }
    });

    if (associacoesManuaisAlteradas) {
      salvarAssociacoesManuais(associacoesManuais);
      console.log(`[EXCLUIR PEDIDO] ✅ Removido de associacoes_manuais.json`);
    }

    // Remove das contagens detalhadas
    let contagensDetalhadas = lerContagensDetalhadas();
    let contagensAlteradas = false;
    Object.keys(contagensDetalhadas).forEach(chave => {
      if (chave.startsWith(`${numero_pedido}_`)) {
        delete contagensDetalhadas[chave];
        contagensAlteradas = true;
      }
    });

    if (contagensAlteradas) {
      salvarContagensDetalhadas(contagensDetalhadas);
      console.log(`[EXCLUIR PEDIDO] ✅ Removido de contagens-detalhadas.json`);
    }

    // Remove do status de pedidos
    let statusPedidos = lerStatusPedidos();
    if (statusPedidos[String(numero_pedido)]) {
      delete statusPedidos[String(numero_pedido)];
      salvarStatusPedidos(statusPedidos);
      console.log(`[EXCLUIR PEDIDO] ✅ Removido de pedidos-status.json`);
    }

    console.log(`[EXCLUIR PEDIDO] ✅ Pedido ${numero_pedido} excluído completamente de todos os arquivos`);

    res.json({
      success: true,
      message: `Pedido ${numero_pedido} excluído com sucesso`
    });
  } catch (error) {
    console.error('[EXCLUIR PEDIDO] ❌ Erro:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao excluir pedido'
    });
  }
});

// Caminho do produtos.json (base local de produtos com modelo)
const PRODUTOS_JSON_PATH = path.join(__dirname, '..', '..', 'banco-de-dados', 'inventario', 'produtos.json');

function buscarProdutoLocal(codigoBusca) {
  try {
    if (!fs.existsSync(PRODUTOS_JSON_PATH)) return null;
    const data = JSON.parse(fs.readFileSync(PRODUTOS_JSON_PATH, 'utf8'));
    const lista = Array.isArray(data?.produtos) ? data.produtos : [];
    const alvo = String(codigoBusca).trim();
    return lista.find(p =>
      String(p.codigo || '').trim() === alvo ||
      String(p.codigo_produto || '').trim() === alvo
    ) || null;
  } catch (err) {
    console.error('[PRODUTOS-LOCAL] Erro ao ler produtos.json:', err.message);
    return null;
  }
}

// Rota para buscar modelo do produto
app.post('/api/buscar-local-estoque', async (req, res) => {
  try {
    const { codigo_produto, codigo_sku } = req.body;

    if (!codigo_produto && !codigo_sku) {
      return res.status(400).json({
        success: false,
        error: 'Código do produto é obrigatório'
      });
    }

    console.log(`[MODELO PRODUTO] Buscando modelo — codigo_produto: ${codigo_produto}, codigo_sku: ${codigo_sku}`);

    // 1. Tenta achar no produtos.json local primeiro (mais rápido e confiável).
    //    Busca primeiro pelo SKU (valor consistente entre sistemas), depois pelo ID numérico.
    let produtoLocal = null;
    if (codigo_sku) produtoLocal = buscarProdutoLocal(codigo_sku);
    if (!produtoLocal && codigo_produto) produtoLocal = buscarProdutoLocal(codigo_produto);

    if (produtoLocal && produtoLocal.modelo) {
      console.log(`[MODELO PRODUTO] ✅ Achado no produtos.json: ${produtoLocal.codigo} → modelo: ${produtoLocal.modelo}`);
      return res.json({
        success: true,
        local: produtoLocal.modelo,
        modelo: produtoLocal.modelo,
        produto: produtoLocal,
        fonte: 'local'
      });
    }
    if (produtoLocal) {
      console.log(`[MODELO PRODUTO] ⚠️ Achado no produtos.json mas sem modelo: ${produtoLocal.codigo}`);
    }

    // Se não tem codigo_produto pra cair no Omie, retorna vazio mesmo
    if (!codigo_produto) {
      return res.json({ success: true, local: null, modelo: null, fonte: 'local' });
    }

    // 2. Fallback: consulta no Omie tentando os 3 campos possíveis
    const codigoNumerico = parseInt(codigo_produto);
    const ehNumerico = !isNaN(codigoNumerico) && String(codigoNumerico) === String(codigo_produto);

    const tentativas = [
      { codigo_produto: 0, codigo_produto_integracao: '', codigo: String(codigo_produto) },
      { codigo_produto: 0, codigo_produto_integracao: String(codigo_produto), codigo: '' },
    ];
    if (ehNumerico) {
      tentativas.push({ codigo_produto: codigoNumerico, codigo_produto_integracao: '', codigo: '' });
    }

    let responseData = null;
    let ultimoErro = null;
    for (const parametro of tentativas) {
      try {
        console.log('[MODELO PRODUTO] Tentando Omie com parâmetro:', parametro);
        responseData = await chamarOmieComRetry(OMIE_URL_PRODUTO, {
          call: 'ConsultarProduto',
          app_key: OMIE_APP_KEY,
          app_secret: OMIE_APP_SECRET,
          param: [parametro]
        }, 10000);
        if (responseData) break;
      } catch (err) {
        ultimoErro = err;
        console.log('[MODELO PRODUTO] Tentativa falhou:', err.response?.data?.faultstring || err.message);
      }
    }

    if (!responseData) {
      throw ultimoErro || new Error('Produto não encontrado em nenhuma forma de busca');
    }

    const response = { data: responseData };

    // LOG DEBUG - mostra todos os campos do produto
    console.log('[MODELO PRODUTO] 🔍 DEBUG - Campos disponíveis:');
    console.log('  codigo_produto:', response.data.codigo_produto);
    console.log('  descricao:', response.data.descricao);
    console.log('  modelo:', response.data.modelo);
    console.log('  marca:', response.data.marca);
    console.log('  Todos os campos:', Object.keys(response.data));

    // Pega o modelo do produto
    const modelo = response.data.modelo || '';

    if (modelo) {
      console.log(`[MODELO PRODUTO] ✅ Modelo encontrado para ${codigo_produto}: ${modelo}`);
    } else {
      console.log(`[MODELO PRODUTO] ⚠️ Modelo não encontrado para ${codigo_produto}`);
    }

    res.json({
      success: true,
      local: modelo || null,
      modelo: modelo || null,
      produto: response.data,
      fonte: 'omie'
    });
  } catch (error) {
    console.error('[MODELO PRODUTO] ❌ Erro:', error.message);

    // Log detalhado do erro
    if (error.response) {
      console.error('[MODELO PRODUTO] Status:', error.response.status);
      console.error('[MODELO PRODUTO] Resposta da API:', JSON.stringify(error.response.data, null, 2));
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao buscar modelo do produto',
      local: null
    });
  }
});

// Função para sincronizar associações.json com associacoes_manuais.json ao iniciar
function sincronizarAssociacoesNaInicialiacao() {
  try {
    console.log('[SYNC] 🔄 Sincronizando associações manuais...');
    const associacoes = lerAssociacoes();
    let totalSincronizadas = 0;

    associacoes.forEach(pedido => {
      const numeroPedido = pedido.numero_pedido;

      // Para estrutura nova (com array de nfes)
      if (pedido.nfes && Array.isArray(pedido.nfes)) {
        pedido.nfes.forEach(nfe => {
          if (nfe.associacoes && typeof nfe.associacoes === 'object') {
            Object.entries(nfe.associacoes).forEach(([codigoPedido, codigoNFe]) => {
              salvarAssociacaoManual(numeroPedido, codigoPedido, codigoNFe);
              totalSincronizadas++;
            });
          }
        });
      }
      // Para estrutura antiga (sem array de nfes)
      else if (pedido.associacoes && typeof pedido.associacoes === 'object') {
        Object.entries(pedido.associacoes).forEach(([codigoPedido, codigoNFe]) => {
          salvarAssociacaoManual(numeroPedido, codigoPedido, codigoNFe);
          totalSincronizadas++;
        });
      }
    });

    console.log(`[SYNC] ✅ ${totalSincronizadas} associações sincronizadas`);
  } catch (error) {
    console.error('[SYNC] ❌ Erro ao sincronizar:', error.message);
  }
}

// Inicia banco XML e depois o servidor
(async () => {
  await initXmlDb();
  sincronizarAssociacoesNaInicialiacao();

  // Agendamento automático - sincronizar recebimentos todo dia às 06:35
  function agendarSyncRecebimentos() {
    const agora = new Date();
    const proxima = new Date();
    proxima.setHours(6, 35, 0, 0);

    if (proxima <= agora) {
      proxima.setDate(proxima.getDate() + 1);
    }

    const ms = proxima.getTime() - agora.getTime();
    console.log(`[SYNC AUTO] Próxima sincronização de recebimentos: ${proxima.toLocaleString('pt-BR')}`);

    setTimeout(() => {
      console.log('[SYNC AUTO] Iniciando sincronização automática de recebimentos...');
      syncRecebimentosIncremental().catch(err => console.error('[SYNC AUTO] Erro:', err.message));
      setInterval(() => {
        console.log('[SYNC AUTO] Iniciando sincronização automática de recebimentos...');
        syncRecebimentosIncremental().catch(err => console.error('[SYNC AUTO] Erro:', err.message));
      }, 24 * 60 * 60 * 1000);
    }, ms);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Backend rodando em:`);
    console.log(`   Local: http://localhost:${PORT}`);
    console.log(`   Rede:  http://192.168.1.70:${PORT}`);
    console.log(`🔗 APIs Omie integradas`);

    agendarSyncRecebimentos();
  });
})();
