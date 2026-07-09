import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4009;

// Chaves Omie (FILIAL - CONTROLART)
const OMIE_APP_KEY = '2694922638408';
const OMIE_APP_SECRET = '02995c034ba5ba2ef1a297240bbb5bf5';
const OMIE_LOCAL_URL = 'https://app.omie.com.br/api/v1/estoque/local/';

// Arquivos de dados (compartilhados)
const INVENTARIO_DIR = path.join(__dirname, '..', '..', 'banco-de-dados', 'inventario');
const AJUSTES_ESTOQUE_FILE = path.join(INVENTARIO_DIR, 'ajustes-estoque.json');
const PRODUTOS_FILE = path.join(INVENTARIO_DIR, 'produtos.json');

app.use(cors());
app.use(express.json());

// ===== Mapa de produtos: id_prod (codigo_produto) -> { codigo, descricao } =====
let _produtosCache = null;
let _produtosMtime = 0;
function obterMapaProdutos() {
  try {
    const stat = fs.statSync(PRODUTOS_FILE);
    if (_produtosCache && stat.mtimeMs === _produtosMtime) return _produtosCache;
    const dados = JSON.parse(fs.readFileSync(PRODUTOS_FILE, 'utf-8'));
    const mapa = new Map();
    for (const p of (dados.produtos || [])) {
      if (p.codigo_produto != null) {
        mapa.set(String(p.codigo_produto), { codigo: p.codigo || '', descricao: p.descricao || '' });
      }
    }
    _produtosCache = mapa;
    _produtosMtime = stat.mtimeMs;
    console.log(`[RELATÓRIO] Mapa de produtos carregado: ${mapa.size}`);
    return mapa;
  } catch (e) {
    console.error('[RELATÓRIO] Falha ao ler produtos.json:', e.message);
    return _produtosCache || new Map();
  }
}

// ===== Mapa de locais de estoque: codigo_local_estoque -> nome (descricao) =====
let _locaisCache = null;
let _locaisCacheTime = 0;
const LOCAIS_TTL = 60 * 60 * 1000; // 1h
async function obterMapaLocais() {
  const agora = Date.now();
  if (_locaisCache && (agora - _locaisCacheTime) < LOCAIS_TTL) return _locaisCache;
  try {
    const resp = await axios.post(OMIE_LOCAL_URL, {
      call: 'ListarLocaisEstoque',
      app_key: OMIE_APP_KEY,
      app_secret: OMIE_APP_SECRET,
      param: [{ nPagina: 1, nRegPorPagina: 100 }]
    }, { timeout: 20000, headers: { 'Content-Type': 'application/json' } });

    if (resp.data?.faultstring) throw new Error(resp.data.faultstring);
    const mapa = new Map();
    for (const l of (resp.data.locaisEncontrados || [])) {
      if (l.codigo_local_estoque != null) {
        mapa.set(String(l.codigo_local_estoque), l.descricao || l.codigo || '');
      }
    }
    _locaisCache = mapa;
    _locaisCacheTime = agora;
    console.log(`[RELATÓRIO] Mapa de locais carregado: ${mapa.size}`);
    return mapa;
  } catch (e) {
    console.error('[RELATÓRIO] Falha ao carregar locais de estoque:', e.message);
    return _locaisCache || new Map();
  }
}

function lerAjustes() {
  try {
    const dados = JSON.parse(fs.readFileSync(AJUSTES_ESTOQUE_FILE, 'utf-8'));
    return Array.isArray(dados.ajustes) ? dados.ajustes : [];
  } catch (e) {
    console.error('[RELATÓRIO] Falha ao ler ajustes-estoque.json:', e.message);
    return [];
  }
}

// Converte "DD/MM/AAAA" em timestamp (para ordenar/filtrar). Inválido => 0.
function dataParaTs(d) {
  if (!d || typeof d !== 'string') return 0;
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return 0;
  return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
}

// Converte data do input HTML "AAAA-MM-DD" em timestamp. fimDoDia=true => 23:59:59.999
function inputDateParaTs(s, fimDoDia = false) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = fimDoDia
    ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999)
    : new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0);
  return d.getTime();
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', programa: 'Relatório', timestamp: new Date().toISOString() });
});

// Aplica filtros por coluna + ordenação + paginação a um conjunto de linhas já montadas.
// Cada linha deve ter: estoque, codigo, descricao, data, tipo, quantidade, obs, operacao, _ts
function filtrarOrdenarPaginar(linhas, query) {
  const pagina = Math.max(1, parseInt(query.pagina, 10) || 1);
  const limite = Math.min(1000, Math.max(1, parseInt(query.limite, 10) || 50));
  const fEstoque = String(query.estoque || '').trim().toLowerCase();
  const fCodigo = String(query.codigo || '').trim().toLowerCase();
  const fDescricao = String(query.descricao || '').trim().toLowerCase();
  const fQuantidade = String(query.quantidade || '').trim().toLowerCase();
  const fObs = String(query.obs || '').trim().toLowerCase();
  const fOperacao = String(query.operacao || '').trim().toLowerCase();
  // Tipo aceita um ou vários códigos separados por vírgula (ex.: "OP,OPP")
  const tiposFiltro = String(query.tipo || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const dataInicioTs = inputDateParaTs(query.data_inicio, false);
  const dataFimTs = inputDateParaTs(query.data_fim, true);
  const ordenar = String(query.ordenar || '').trim();
  const direcao = String(query.direcao || '').trim().toLowerCase() === 'asc' ? 'asc' : 'desc';

  let arr = linhas.filter(l => {
    if (fEstoque && !String(l.estoque).toLowerCase().includes(fEstoque)) return false;
    if (fCodigo && !String(l.codigo).toLowerCase().includes(fCodigo)) return false;
    if (fDescricao && !String(l.descricao).toLowerCase().includes(fDescricao)) return false;
    if (fQuantidade && !String(l.quantidade).toLowerCase().includes(fQuantidade)) return false;
    if (fObs && !String(l.obs).toLowerCase().includes(fObs)) return false;
    if (fOperacao && !String(l.operacao).toLowerCase().includes(fOperacao)) return false;
    if (tiposFiltro.length && !tiposFiltro.includes((l.tipo || '').toUpperCase())) return false;
    if (dataInicioTs != null && l._ts < dataInicioTs) return false;
    if (dataFimTs != null && l._ts > dataFimTs) return false;
    return true;
  });

  if (ordenar) {
    const dir = direcao === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      let va, vb;
      if (ordenar === 'data') { va = a._ts; vb = b._ts; }
      else if (ordenar === 'quantidade') { va = Number(a.quantidade) || 0; vb = Number(b.quantidade) || 0; }
      else { va = String(a[ordenar] ?? '').toLowerCase(); vb = String(b[ordenar] ?? '').toLowerCase(); }
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return 0;
    });
  } else {
    arr.sort((a, b) => b._ts - a._ts);
  }

  const total = arr.length;
  const inicio = (pagina - 1) * limite;
  const rows = arr.slice(inicio, inicio + limite).map(({ _ts, ...r }) => r);
  return { success: true, total, pagina, limite, total_paginas: Math.ceil(total / limite) || 1, rows };
}

// Monta as linhas dos AJUSTES (transferências viram 2 linhas: entrada destino + saída origem)
async function construirLinhasAjustes() {
  const ajustes = lerAjustes();
  const mapaProdutos = obterMapaProdutos();
  const mapaLocais = await obterMapaLocais();
  return ajustes.flatMap(a => {
    const prod = mapaProdutos.get(String(a.id_prod));
    const codigo = prod?.codigo || String(a.id_prod ?? '');
    const descricao = prod?.descricao || '';
    const qtd = a.quantidade ?? 0;
    const nomeOrigem = mapaLocais.get(String(a.codigo_local_estoque)) || String(a.codigo_local_estoque ?? '');
    const temDoisEstoques = a.id_local_ds != null && a.id_local_ds !== 0;
    const nomeDestino = temDoisEstoques ? (mapaLocais.get(String(a.id_local_ds)) || String(a.id_local_ds)) : '';
    let operacao = '';
    if ((a.tipo || '').toUpperCase() === 'TRF') {
      operacao = nomeDestino ? `Transf. ${nomeOrigem} → ${nomeDestino}` : `Transf. ${nomeOrigem}`;
    }
    const base = { codigo, descricao, data: a.data || '', tipo: a.tipo || '', obs: a.obs || '', operacao, _ts: dataParaTs(a.data) };
    if (temDoisEstoques) {
      return [
        { ...base, estoque: nomeDestino, quantidade: qtd },
        { ...base, estoque: nomeOrigem, quantidade: -qtd }
      ];
    }
    return [{ ...base, estoque: nomeOrigem, quantidade: qtd }];
  });
}

// Monta as linhas das ORDENS DE PRODUÇÃO A PRODUZIR (pendentes, cConcluida = 'N')
// no formato padrão do relatório, para usar os mesmos filtros/ordenação/exportação.
async function construirLinhasOPAProduzir() {
  const ordens = lerOrdens();
  const mapaProdutos = obterMapaProdutos();
  const mapaLocais = await obterMapaLocais();
  const linhas = [];
  for (const o of ordens) {
    const outras = o.outrasInf || {};
    if (outras.cConcluida === 'S') continue; // só as pendentes (a produzir)
    const id = o.identificacao || {};
    const cNumOP = id.cNumOP || '';
    const prod = mapaProdutos.get(String(id.nCodProduto));
    const previsao = id.dDtPrevisao || '';
    linhas.push({
      estoque: mapaLocais.get(String(id.codigo_local_estoque)) || String(id.codigo_local_estoque ?? ''),
      codigo: prod?.codigo || String(id.nCodProduto ?? ''),
      descricao: prod?.descricao || '',
      data: previsao, // a "data" desta aba é a PREVISÃO
      tipo: 'OPP', // O.P.P = Ordem de Produção a Produzir (pendente)
      quantidade: id.nQtde ?? 0,
      obs: cNumOP,
      operacao: cNumOP ? `Ordem de Produção ${cNumOP}` : 'Ordem de Produção',
      _ts: dataParaTs(previsao)
    });
  }
  return linhas;
}

// Monta as linhas de ORDEM DE PRODUÇÃO (produto produzido + / componentes -) a partir dos detalhes
async function construirLinhasOP() {
  const detalhes = lerDetalhesOPs();
  const mapaProdutos = obterMapaProdutos();
  const mapaLocais = await obterMapaLocais();
  const linhas = [];
  for (const d of detalhes) {
    const id = d.identificacao || {};
    const inf = d.infAdicionais || {};
    const outras = d.outrasInf || {};
    // Só OPs efetivamente concluídas geram movimento de produção real.
    // Pendentes (cConcluida = 'N') têm dDtConclusao apenas como PREVISÃO, então são ignoradas aqui.
    if (outras.cConcluida !== 'S') continue;
    const cNumOP = id.cNumOP || '';
    const data = inf.dDtConclusao || '';
    const ts = dataParaTs(data);
    const operacao = cNumOP ? `Ordem de Produção ${cNumOP}` : 'Ordem de Produção';

    const prodMain = mapaProdutos.get(String(id.nCodProduto));
    linhas.push({
      estoque: mapaLocais.get(String(id.codigo_local_estoque)) || String(id.codigo_local_estoque ?? ''),
      codigo: prodMain?.codigo || String(id.nCodProduto ?? ''),
      descricao: prodMain?.descricao || '',
      data, tipo: 'OP', quantidade: id.nQtde ?? 0, obs: cNumOP, operacao, _ts: ts
    });
    for (const c of (d.itensDetalhes || [])) {
      const prodC = mapaProdutos.get(String(c.nIdProdutoMalha));
      linhas.push({
        estoque: mapaLocais.get(String(c.codigo_local_estoque)) || String(c.codigo_local_estoque ?? ''),
        codigo: prodC?.codigo || String(c.nIdProdutoMalha ?? ''),
        descricao: prodC?.descricao || '',
        data, tipo: 'OP', quantidade: -(c.nQtde ?? 0), obs: cNumOP, operacao, _ts: ts
      });
    }
  }
  return linhas;
}

// Relatório de AJUSTES
app.get('/api/relatorio/ajustes', async (req, res) => {
  try {
    res.json(filtrarOrdenarPaginar(await construirLinhasAjustes(), req.query));
  } catch (error) {
    console.error('[RELATÓRIO] Erro ajustes:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Relatório de ORDEM DE PRODUÇÃO (movimentos)
app.get('/api/relatorio/op-movimentos', async (req, res) => {
  try {
    res.json(filtrarOrdenarPaginar(await construirLinhasOP(), req.query));
  } catch (error) {
    console.error('[RELATÓRIO] Erro OP-mov:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Relatório de ORDENS DE PRODUÇÃO A PRODUZIR (pendentes) — mesmos filtros/ordenação
app.get('/api/relatorio/op-a-produzir', async (req, res) => {
  try {
    res.json(filtrarOrdenarPaginar(await construirLinhasOPAProduzir(), req.query));
  } catch (error) {
    console.error('[RELATÓRIO] Erro OP-a-produzir:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Relatório GERAL (concatenação de Ajustes + Ordem de Produção)
app.get('/api/relatorio/geral', async (req, res) => {
  try {
    const [aj, op, opp] = await Promise.all([construirLinhasAjustes(), construirLinhasOP(), construirLinhasOPAProduzir()]);
    res.json(filtrarOrdenarPaginar([...aj, ...op, ...opp], req.query));
  } catch (error) {
    console.error('[RELATÓRIO] Erro geral:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== EXPORTAÇÃO (PDF / Excel) =====
const TIPO_LABEL = { ENT: 'Entrada', TRF: 'Transferência', SLD: 'Saldo', SAI: 'Saída', OP: 'O.P.', OPP: 'O.P.P' };
const labelTipo = (t) => TIPO_LABEL[(t || '').toUpperCase()] || t || '';

// Monta as linhas de uma fonte (ajustes | op | geral)
async function construirLinhasPorFonte(fonte) {
  if (fonte === 'ajustes') return await construirLinhasAjustes();
  if (fonte === 'op') return await construirLinhasOP();
  if (fonte === 'aproduzir') return await construirLinhasOPAProduzir();
  const [aj, op, opp] = await Promise.all([construirLinhasAjustes(), construirLinhasOP(), construirLinhasOPAProduzir()]);
  return [...aj, ...op, ...opp];
}

// Só filtra + ordena (sem paginar) — para exportar tudo que corresponde
function filtrarOrdenarTudo(linhas, query) {
  const r = filtrarOrdenarPaginar(linhas, { ...query, pagina: 1, limite: 100000000 });
  return r.rows;
}

const COLS_EXPORT = [
  { key: 'estoque', header: 'Estoque', width: 28 },
  { key: 'codigo', header: 'Código', width: 20 },
  { key: 'descricao', header: 'Descrição', width: 40 },
  { key: 'data', header: 'Data', width: 12 },
  { key: 'tipo', header: 'Tipo', width: 14 },
  { key: 'quantidade', header: 'Quantidade', width: 12 },
  { key: 'obs', header: 'Observação', width: 20 },
  { key: 'operacao', header: 'Operação', width: 40 }
];

app.get('/api/relatorio/exportar', async (req, res) => {
  try {
    const fonte = String(req.query.fonte || 'geral');
    const formato = String(req.query.formato || 'excel').toLowerCase();
    const escopo = String(req.query.escopo || 'filtrado').toLowerCase();

    const todas = await construirLinhasPorFonte(fonte);
    // "total" = tudo (ignora filtros); "filtrado" = aplica os filtros recebidos
    const linhas = escopo === 'total'
      ? filtrarOrdenarTudo(todas, {})
      : filtrarOrdenarTudo(todas, req.query);

    // Normaliza o tipo para o rótulo amigável
    const dados = linhas.map(l => ({ ...l, tipo: labelTipo(l.tipo) }));

    const nomeBase = `relatorio_${fonte}_${escopo}`;

    if (formato === 'pdf') {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 24 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nomeBase}.pdf"`);
      doc.pipe(res);

      doc.fontSize(14).text(`Relatório — ${fonte} (${escopo})`, { align: 'left' });
      doc.fontSize(8).fillColor('#666').text(`${dados.length} registro(s) · gerado em ${new Date().toLocaleString('pt-BR')}`);
      doc.moveDown(0.5);

      const larguras = [120, 90, 170, 60, 60, 55, 90, 0]; // operação pega o resto
      const startX = doc.page.margins.left;
      const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      larguras[7] = usable - larguras.slice(0, 7).reduce((a, b) => a + b, 0);

      const desenharCabecalho = (y) => {
        doc.fontSize(8).fillColor('#000').font('Helvetica-Bold');
        let x = startX;
        COLS_EXPORT.forEach((c, i) => { doc.text(c.header, x + 2, y, { width: larguras[i] - 4 }); x += larguras[i]; });
        doc.moveTo(startX, y + 12).lineTo(startX + usable, y + 12).strokeColor('#999').stroke();
        doc.font('Helvetica');
      };

      let y = doc.y;
      desenharCabecalho(y);
      y += 16;
      const bottom = doc.page.height - doc.page.margins.bottom;
      // A fonte padrão (Helvetica) não tem a seta "→"; troca por "->" no PDF
      const limparPdf = (v) => String(v ?? '').replace(/→/g, '->');
      for (const r of dados) {
        const vals = [r.estoque, r.codigo, r.descricao, r.data, r.tipo, String(r.quantidade), r.obs, r.operacao].map(limparPdf);
        doc.fontSize(7);
        // Altura da linha = maior altura entre as células (com quebra de linha)
        const alturas = vals.map((v, i) => doc.heightOfString(v, { width: larguras[i] - 4 }));
        const rowH = Math.max(9, ...alturas) + 4;
        if (y + rowH > bottom) {
          doc.addPage();
          y = doc.page.margins.top;
          desenharCabecalho(y);
          y += 16;
        }
        doc.fillColor(Number(r.quantidade) < 0 ? '#c00' : '#000');
        let x = startX;
        vals.forEach((v, i) => { doc.text(v, x + 2, y, { width: larguras[i] - 4 }); x += larguras[i]; });
        y += rowH;
        doc.moveTo(startX, y - 2).lineTo(startX + usable, y - 2).strokeColor('#eee').stroke();
      }
      doc.end();
      return;
    }

    // Excel (xlsx) — streaming
    const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeBase}.xlsx"`);
    const ws = wb.addWorksheet('Relatório');
    ws.columns = COLS_EXPORT.map(c => ({ header: c.header, key: c.key, width: c.width }));
    ws.getRow(1).font = { bold: true };
    for (const r of dados) {
      ws.addRow({
        estoque: r.estoque, codigo: r.codigo, descricao: r.descricao, data: r.data,
        tipo: r.tipo, quantidade: r.quantidade, obs: r.obs, operacao: r.operacao
      }).commit();
    }
    await ws.commit();
    await wb.commit();
  } catch (error) {
    console.error('[EXPORTAR] Erro:', error.message);
    if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
    else res.end();
  }
});

// Lista os tipos distintos (para um filtro no front, se quiser)
app.get('/api/relatorio/tipos', (req, res) => {
  const ajustes = lerAjustes();
  const tipos = [...new Set(ajustes.map(a => a.tipo).filter(Boolean))].sort();
  res.json({ success: true, tipos });
});

// ===== Sincronização dos ajustes de estoque com o Omie (incremental, página -1) =====
const OMIE_AJUSTE_ESTOQUE_URL = 'https://app.omie.com.br/api/v1/estoque/ajuste/';

let progressoSincAjustes = {
  sincronizando: false,
  paginaAtual: 0,
  totalPaginas: 0,
  registrosSalvos: 0,
  mensagem: '',
  erro: null
};

async function buscarPaginaAjustes(pagina, registrosPorPagina) {
  const TENTATIVAS_MAX = 4;
  let ultimoErro = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS_MAX; tentativa++) {
    try {
      const response = await axios.post(OMIE_AJUSTE_ESTOQUE_URL, {
        call: 'ListarAjusteEstoque',
        app_key: OMIE_APP_KEY,
        app_secret: OMIE_APP_SECRET,
        param: [{ pagina, registros_por_pagina: registrosPorPagina, apenas_importado_api: 'N' }]
      }, { timeout: 60000, headers: { 'Content-Type': 'application/json' } });
      if (response.data.faultstring) throw new Error(`Erro Omie: ${response.data.faultstring}`);
      return response.data;
    } catch (err) {
      ultimoErro = err;
      const status = err.response?.status;
      const transitorio = !status || status >= 500 || status === 429;
      if (!transitorio || tentativa === TENTATIVAS_MAX) break;
      await new Promise(r => setTimeout(r, 2000 * Math.pow(2, tentativa - 1)));
    }
  }
  throw ultimoErro;
}

function extrairAjustes(respostaOmie, destino) {
  const lista = respostaOmie.ajuste_estoque_lista || [];
  for (const item of lista) destino.push({ ...item }); // registro completo
}

async function sincronizarAjustesEstoque() {
  if (progressoSincAjustes.sincronizando) return;
  try {
    progressoSincAjustes = { sincronizando: true, paginaAtual: 0, totalPaginas: 0, registrosSalvos: 0, mensagem: 'Iniciando...', erro: null };

    const REGISTROS_POR_PAGINA = 100;
    const DELAY_ENTRE_PAGINAS = 1500;
    const LOOKBACK = 1; // "página -1"

    let ajustesExistentes = [];
    try {
      const dados = JSON.parse(fs.readFileSync(AJUSTES_ESTOQUE_FILE, 'utf-8'));
      ajustesExistentes = Array.isArray(dados.ajustes) ? dados.ajustes : [];
    } catch { ajustesExistentes = []; }
    const temRegistros = ajustesExistentes.length > 0;

    // Formato antigo = registros sem o conjunto completo de campos do Omie
    // (detecta pela ausência de "bloqueado", que só existe no registro completo).
    const formatoAntigo = temRegistros && !('bloqueado' in ajustesExistentes[0]);

    // Faz sincronização COMPLETA (limpa e refaz) quando: não há registros OU o formato é antigo.
    // Senão, incremental (página -1).
    const fazerCompleta = !temRegistros || formatoAntigo;

    if (formatoAntigo) {
      console.log('[RELATÓRIO] Formato antigo detectado — limpando o banco e sincronizando do zero.');
    }

    const primeiraReq = await buscarPaginaAjustes(1, REGISTROS_POR_PAGINA);
    const totalPaginas = primeiraReq.total_de_paginas || 1;
    const paginaInicial = fazerCompleta ? 1 : Math.max(1, totalPaginas - LOOKBACK);

    progressoSincAjustes.totalPaginas = totalPaginas;
    progressoSincAjustes.paginaAtual = paginaInicial;
    progressoSincAjustes.mensagem = formatoAntigo
      ? `Formato antigo detectado — recriando o banco do zero (1-${totalPaginas})...`
      : `Sincronizando páginas ${paginaInicial}-${totalPaginas} de ${totalPaginas}...`;

    const ajustesNovos = [];
    if (paginaInicial === 1) {
      extrairAjustes(primeiraReq, ajustesNovos);
    } else {
      await new Promise(r => setTimeout(r, DELAY_ENTRE_PAGINAS));
      extrairAjustes(await buscarPaginaAjustes(paginaInicial, REGISTROS_POR_PAGINA), ajustesNovos);
    }
    progressoSincAjustes.registrosSalvos = ajustesNovos.length;

    for (let pagina = paginaInicial + 1; pagina <= totalPaginas; pagina++) {
      progressoSincAjustes.paginaAtual = pagina;
      progressoSincAjustes.mensagem = `Sincronizando página ${pagina} de ${totalPaginas}...`;
      await new Promise(r => setTimeout(r, DELAY_ENTRE_PAGINAS));
      extrairAjustes(await buscarPaginaAjustes(pagina, REGISTROS_POR_PAGINA), ajustesNovos);
      progressoSincAjustes.registrosSalvos = ajustesNovos.length;
    }

    let ajustesFinais;
    if (!fazerCompleta) {
      // Incremental: preserva os antigos (menos os reescritos) e adiciona os novos
      const idsNovos = new Set(ajustesNovos.map(a => a.id_ajuste).filter(id => id != null));
      ajustesFinais = ajustesExistentes.filter(a => !idsNovos.has(a.id_ajuste)).concat(ajustesNovos);
    } else {
      // Completa: descarta tudo que existia (limpa) e usa só o que veio agora
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

    if (fazerCompleta) {
      progressoSincAjustes.mensagem = `✅ Banco recriado do zero! ${ajustesFinais.length} ajustes salvos.`;
    } else {
      const adicionadas = ajustesFinais.length - ajustesExistentes.length;
      progressoSincAjustes.mensagem = `✅ Concluído! ${ajustesNovos.length} buscados, ${adicionadas} novos (total: ${ajustesFinais.length}).`;
    }
    console.log(`[RELATÓRIO] ${progressoSincAjustes.mensagem}`);
  } catch (error) {
    console.error('[RELATÓRIO] Erro na sincronização:', error.message);
    progressoSincAjustes.erro = error.message;
    progressoSincAjustes.mensagem = `❌ Erro: ${error.message}`;
  } finally {
    progressoSincAjustes.sincronizando = false;
  }
}

app.post('/api/relatorio/sincronizar-ajustes', (req, res) => {
  if (progressoSincAjustes.sincronizando) {
    return res.status(409).json({ success: false, error: 'Sincronização já em andamento' });
  }
  sincronizarAjustesEstoque();
  res.json({ success: true, message: 'Sincronização iniciada' });
});

app.get('/api/relatorio/sincronizar-ajustes/progresso', (req, res) => {
  res.json({ success: true, ...progressoSincAjustes });
});

// ===================================================================
// ETAPA 2: ORDEM DE PRODUÇÃO (ListarOrdemProducao)
// ===================================================================
const OMIE_OP_URL = 'https://app.omie.com.br/api/v1/produtos/op/';
const ORDENS_PRODUCAO_FILE = path.join(INVENTARIO_DIR, 'ordens-producao.json');
const OP_REGISTROS_POR_PAGINA = 100;

let progressoSincOP = {
  sincronizando: false, paginaAtual: 0, totalPaginas: 0, registrosSalvos: 0, mensagem: '', erro: null
};

function lerOrdens() {
  try {
    const dados = JSON.parse(fs.readFileSync(ORDENS_PRODUCAO_FILE, 'utf-8'));
    return Array.isArray(dados.ordens) ? dados.ordens : [];
  } catch (e) {
    return [];
  }
}

async function buscarPaginaOP(pagina, registrosPorPagina) {
  const TENTATIVAS_MAX = 4;
  let ultimoErro = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS_MAX; tentativa++) {
    try {
      const response = await axios.post(OMIE_OP_URL, {
        call: 'ListarOrdemProducao',
        app_key: OMIE_APP_KEY,
        app_secret: OMIE_APP_SECRET,
        param: [{ pagina, registros_por_pagina: registrosPorPagina }]
      }, { timeout: 60000, headers: { 'Content-Type': 'application/json' } });
      if (response.data.faultstring) throw new Error(`Erro Omie: ${response.data.faultstring}`);
      return response.data;
    } catch (err) {
      ultimoErro = err;
      const status = err.response?.status;
      const transitorio = !status || status >= 500 || status === 429;
      if (!transitorio || tentativa === TENTATIVAS_MAX) break;
      await new Promise(r => setTimeout(r, 2000 * Math.pow(2, tentativa - 1)));
    }
  }
  throw ultimoErro;
}

async function sincronizarOP() {
  if (progressoSincOP.sincronizando) return;
  try {
    progressoSincOP = { sincronizando: true, paginaAtual: 0, totalPaginas: 0, registrosSalvos: 0, mensagem: 'Iniciando...', erro: null };

    const DELAY = 800;
    const LOOKBACK = 1; // lógica "-1"

    let existentes = lerOrdens();
    const temRegistros = existentes.length > 0;
    // Formato antigo? (sem o conjunto esperado — detecta pela ausência de 'identificacao')
    const formatoAntigo = temRegistros && !('identificacao' in (existentes[0] || {}));
    const fazerCompleta = !temRegistros || formatoAntigo;

    const primeira = await buscarPaginaOP(1, OP_REGISTROS_POR_PAGINA);
    const totalPaginas = primeira.total_de_paginas || 1;
    const paginaInicial = fazerCompleta ? 1 : Math.max(1, totalPaginas - LOOKBACK);

    progressoSincOP.totalPaginas = totalPaginas;
    progressoSincOP.paginaAtual = paginaInicial;
    progressoSincOP.mensagem = fazerCompleta
      ? `Sincronização completa: páginas 1-${totalPaginas}...`
      : `Sincronizando páginas ${paginaInicial}-${totalPaginas} de ${totalPaginas}...`;

    const novas = [];
    if (paginaInicial === 1) {
      (primeira.cadastros || []).forEach(c => novas.push(c));
    } else {
      await new Promise(r => setTimeout(r, DELAY));
      const dados = await buscarPaginaOP(paginaInicial, OP_REGISTROS_POR_PAGINA);
      (dados.cadastros || []).forEach(c => novas.push(c));
    }
    progressoSincOP.registrosSalvos = novas.length;

    for (let pagina = paginaInicial + 1; pagina <= totalPaginas; pagina++) {
      progressoSincOP.paginaAtual = pagina;
      progressoSincOP.mensagem = `Sincronizando página ${pagina} de ${totalPaginas}...`;
      await new Promise(r => setTimeout(r, DELAY));
      const dados = await buscarPaginaOP(pagina, OP_REGISTROS_POR_PAGINA);
      (dados.cadastros || []).forEach(c => novas.push(c));
      progressoSincOP.registrosSalvos = novas.length;
    }

    const idDe = (c) => c?.identificacao?.nCodOP ?? c?.identificacao?.cNumOP ?? null;
    let finais;
    if (!fazerCompleta) {
      const idsNovos = new Set(novas.map(idDe).filter(id => id != null));
      finais = existentes.filter(c => !idsNovos.has(idDe(c))).concat(novas);
    } else {
      finais = novas;
    }

    const dados = { ordens: finais, total: finais.length, total_de_paginas: totalPaginas, ultima_sincronizacao: new Date().toISOString() };
    fs.mkdirSync(path.dirname(ORDENS_PRODUCAO_FILE), { recursive: true });
    fs.writeFileSync(ORDENS_PRODUCAO_FILE, JSON.stringify(dados, null, 2), 'utf-8');

    const adicionadas = fazerCompleta ? finais.length : finais.length - existentes.length;
    progressoSincOP.mensagem = fazerCompleta
      ? `✅ Sincronização completa! ${finais.length} OPs salvas.`
      : `✅ Concluído! ${novas.length} buscadas, ${adicionadas} novas (total: ${finais.length}).`;
    console.log(`[RELATÓRIO-OP] ${progressoSincOP.mensagem}`);
  } catch (error) {
    console.error('[RELATÓRIO-OP] Erro:', error.message);
    progressoSincOP.erro = error.message;
    progressoSincOP.mensagem = `❌ Erro: ${error.message}`;
  } finally {
    progressoSincOP.sincronizando = false;
  }
}

app.post('/api/relatorio/sincronizar-op', (req, res) => {
  if (progressoSincOP.sincronizando) {
    return res.status(409).json({ success: false, error: 'Sincronização já em andamento' });
  }
  sincronizarOP();
  res.json({ success: true, message: 'Sincronização iniciada' });
});

app.get('/api/relatorio/sincronizar-op/progresso', (req, res) => {
  res.json({ success: true, ...progressoSincOP });
});

// Leitura das ordens de produção (enriquecida + paginada)
app.get('/api/relatorio/op', async (req, res) => {
  try {
    const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
    const limite = Math.min(500, Math.max(1, parseInt(req.query.limite, 10) || 50));
    // Filtro por situação: 'N' = a produzir (não concluída), 'S' = concluída
    const filtroConcluida = String(req.query.concluida || '').toUpperCase();
    // Busca textual (OP, código, descrição, etapa)
    const busca = String(req.query.busca || '').trim().toLowerCase();

    const ordens = lerOrdens();
    const mapaProdutos = obterMapaProdutos();
    const mapaLocais = await obterMapaLocais();

    let linhas = ordens.map(o => {
      const id = o.identificacao || {};
      const inf = o.infAdicionais || {};
      const outras = o.outrasInf || {};
      const prod = mapaProdutos.get(String(id.nCodProduto));
      return {
        numero_op: id.cNumOP || '',
        codigo: prod?.codigo || String(id.nCodProduto ?? ''),
        descricao: prod?.descricao || '',
        quantidade: id.nQtde ?? 0,
        etapa: inf.cEtapa || '',
        local: mapaLocais.get(String(id.codigo_local_estoque)) || String(id.codigo_local_estoque ?? ''),
        previsao: id.dDtPrevisao || '',
        conclusao: inf.dDtConclusao || outras.dConclusao || '',
        concluida: outras.cConcluida === 'S' ? 'Sim' : 'Não',
        _cConcluida: outras.cConcluida === 'S' ? 'S' : 'N',
        _ts: dataParaTs(id.dDtPrevisao)
      };
    });

    // Filtra por situação (concluída / a produzir)
    if (filtroConcluida === 'N' || filtroConcluida === 'S') {
      linhas = linhas.filter(l => l._cConcluida === filtroConcluida);
    }

    // Filtra por busca textual
    if (busca) {
      linhas = linhas.filter(l =>
        l.numero_op.toLowerCase().includes(busca) ||
        l.codigo.toLowerCase().includes(busca) ||
        l.descricao.toLowerCase().includes(busca) ||
        l.etapa.toLowerCase().includes(busca)
      );
    }

    // Mais recentes (por previsão) primeiro
    linhas.sort((a, b) => b._ts - a._ts);

    const total = linhas.length;
    const inicio = (pagina - 1) * limite;
    const rows = linhas.slice(inicio, inicio + limite).map(({ _ts, _cConcluida, ...r }) => r);

    res.json({ success: true, total, pagina, limite, total_paginas: Math.ceil(total / limite) || 1, rows });
  } catch (error) {
    console.error('[RELATÓRIO-OP] Erro na leitura:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================================================================
// DEBUG: CONSULTA DETALHADA DE CADA OP (ConsultarOrdemProducao)
// Para cada OP (filtrada por data de Conclusão >= data informada),
// chama ConsultarOrdemProducao e salva a resposta completa num novo JSON.
// ===================================================================
const OP_DETALHES_FILE = path.join(INVENTARIO_DIR, 'ordens-producao-detalhes.json');

let progressoConsultaOPs = {
  consultando: false, atual: 0, total: 0, salvos: 0, mensagem: '', erro: null
};

function lerDetalhesOPs() {
  try {
    const d = JSON.parse(fs.readFileSync(OP_DETALHES_FILE, 'utf-8'));
    return Array.isArray(d.detalhes) ? d.detalhes : [];
  } catch { return []; }
}

function salvarDetalhesOPs(arr, extra = {}) {
  fs.mkdirSync(path.dirname(OP_DETALHES_FILE), { recursive: true });
  fs.writeFileSync(OP_DETALHES_FILE, JSON.stringify({ detalhes: arr, total: arr.length, ...extra }, null, 2), 'utf-8');
}

async function consultarOrdemProducao(nCodOP) {
  const TENTATIVAS_MAX = 3;
  let ultimoErro = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS_MAX; tentativa++) {
    try {
      const resp = await axios.post(OMIE_OP_URL, {
        call: 'ConsultarOrdemProducao',
        app_key: OMIE_APP_KEY,
        app_secret: OMIE_APP_SECRET,
        param: [{ cCodIntOP: '', nCodOP }]
      }, { timeout: 30000, headers: { 'Content-Type': 'application/json' } });
      if (resp.data.faultstring) throw new Error(resp.data.faultstring);
      return resp.data;
    } catch (err) {
      ultimoErro = err;
      const status = err.response?.status;
      const transitorio = !status || status >= 500 || status === 429;
      if (!transitorio || tentativa === TENTATIVAS_MAX) break;
      await new Promise(r => setTimeout(r, 2000 * tentativa));
    }
  }
  throw ultimoErro;
}

async function consultarOPsDesde(dataInicioStr) {
  if (progressoConsultaOPs.consultando) return;
  try {
    progressoConsultaOPs = { consultando: true, atual: 0, total: 0, salvos: 0, mensagem: 'Preparando...', erro: null };

    const dataInicioTs = inputDateParaTs(dataInicioStr, false); // null = todas
    const ordens = lerOrdens();
    // Filtra pelas OPs com data de CONCLUSÃO >= data informada
    const alvo = ordens.filter(o => {
      const ts = dataParaTs(o?.infAdicionais?.dDtConclusao);
      if (dataInicioTs == null) return true;
      return ts && ts >= dataInicioTs;
    });

    progressoConsultaOPs.total = alvo.length;
    progressoConsultaOPs.mensagem = `${alvo.length} OP(s) a consultar (conclusão a partir de ${dataInicioStr || 'todas'})...`;
    console.log(`[OP-DET] ${progressoConsultaOPs.mensagem}`);

    // Merge com o que já existe (dedupe por nCodOP)
    const existentes = lerDetalhesOPs();
    const porId = new Map(existentes.map(d => [String(d?.identificacao?.nCodOP ?? ''), d]));

    for (let i = 0; i < alvo.length; i++) {
      const nCodOP = alvo[i]?.identificacao?.nCodOP;
      progressoConsultaOPs.atual = i + 1;
      progressoConsultaOPs.mensagem = `Consultando OP ${i + 1} de ${alvo.length} (nCodOP ${nCodOP})...`;
      if (nCodOP == null) continue;
      try {
        const det = await consultarOrdemProducao(nCodOP);
        porId.set(String(nCodOP), det);
        progressoConsultaOPs.salvos = porId.size;
      } catch (e) {
        console.error(`[OP-DET] Erro ao consultar nCodOP ${nCodOP}:`, e.message);
      }
      if ((i + 1) % 25 === 0) salvarDetalhesOPs([...porId.values()], { ultima_consulta: new Date().toISOString() });
      await new Promise(r => setTimeout(r, 350)); // respiro entre chamadas
    }

    salvarDetalhesOPs([...porId.values()], { ultima_consulta: new Date().toISOString(), data_inicio_usada: dataInicioStr || null });
    progressoConsultaOPs.mensagem = `✅ Concluído! ${alvo.length} OP(s) consultadas. Total salvo no JSON: ${porId.size}.`;
    console.log(`[OP-DET] ${progressoConsultaOPs.mensagem}`);
  } catch (error) {
    console.error('[OP-DET] Erro geral:', error.message);
    progressoConsultaOPs.erro = error.message;
    progressoConsultaOPs.mensagem = `❌ Erro: ${error.message}`;
  } finally {
    progressoConsultaOPs.consultando = false;
  }
}

app.post('/api/relatorio/consultar-ops', (req, res) => {
  if (progressoConsultaOPs.consultando) {
    return res.status(409).json({ success: false, error: 'Consulta já em andamento' });
  }
  const dataInicio = String(req.body?.data_inicio || '');
  consultarOPsDesde(dataInicio);
  res.json({ success: true, message: 'Consulta iniciada' });
});

app.get('/api/relatorio/consultar-ops/progresso', (req, res) => {
  res.json({ success: true, ...progressoConsultaOPs });
});

// Consulta os detalhes de TODAS as OPs pendentes (cConcluida = N, "a produzir")
// e de TODAS as novas (que ainda não estão no JSON de detalhes).
async function consultarOPsPendentesENovas() {
  if (progressoConsultaOPs.consultando) return;
  try {
    progressoConsultaOPs = { consultando: true, atual: 0, total: 0, salvos: 0, mensagem: 'Preparando...', erro: null };

    const ordens = lerOrdens();
    const existentes = lerDetalhesOPs();
    const porId = new Map(existentes.map(d => [String(d?.identificacao?.nCodOP ?? ''), d]));
    const idsExistentes = new Set(porId.keys());

    // Alvo: pendentes (cConcluida != 'S') OU ainda não consultadas (novas)
    const alvo = ordens.filter(o => {
      const nCodOP = o?.identificacao?.nCodOP;
      if (nCodOP == null) return false;
      const pendente = (o.outrasInf || {}).cConcluida !== 'S';
      const nova = !idsExistentes.has(String(nCodOP));
      return pendente || nova;
    });

    progressoConsultaOPs.total = alvo.length;
    progressoConsultaOPs.mensagem = `${alvo.length} OP(s) a consultar (pendentes + novas)...`;
    console.log(`[OP-DET] ${progressoConsultaOPs.mensagem}`);

    for (let i = 0; i < alvo.length; i++) {
      const nCodOP = alvo[i]?.identificacao?.nCodOP;
      progressoConsultaOPs.atual = i + 1;
      progressoConsultaOPs.mensagem = `Consultando OP ${i + 1} de ${alvo.length} (nCodOP ${nCodOP})...`;
      if (nCodOP == null) continue;
      try {
        const det = await consultarOrdemProducao(nCodOP);
        porId.set(String(nCodOP), det);
        progressoConsultaOPs.salvos = porId.size;
      } catch (e) {
        console.error(`[OP-DET] Erro ao consultar nCodOP ${nCodOP}:`, e.message);
      }
      if ((i + 1) % 25 === 0) salvarDetalhesOPs([...porId.values()], { ultima_consulta: new Date().toISOString() });
      await new Promise(r => setTimeout(r, 350)); // respiro entre chamadas
    }

    salvarDetalhesOPs([...porId.values()], { ultima_consulta: new Date().toISOString(), modo: 'pendentes+novas' });
    progressoConsultaOPs.mensagem = `✅ Concluído! ${alvo.length} OP(s) consultadas. Total salvo no JSON: ${porId.size}.`;
    console.log(`[OP-DET] ${progressoConsultaOPs.mensagem}`);
  } catch (error) {
    console.error('[OP-DET] Erro geral:', error.message);
    progressoConsultaOPs.erro = error.message;
    progressoConsultaOPs.mensagem = `❌ Erro: ${error.message}`;
  } finally {
    progressoConsultaOPs.consultando = false;
  }
}

// ===================================================================
// ATUALIZAÇÃO COMPLETA (em sequência): Ajustes → OP → Consultar OPs
// Orquestrado no backend para que o progresso sobreviva a navegação/recarregamento.
// ===================================================================
let progressoAtualizacaoGeral = {
  rodando: false, etapa: null, passo: 0, totalPassos: 3, mensagem: '', erro: null,
  iniciado_em: null, fim_em: null
};

async function atualizarTudo() {
  if (progressoAtualizacaoGeral.rodando) return;
  progressoAtualizacaoGeral = {
    rodando: true, etapa: 'ajustes', passo: 1, totalPassos: 3,
    mensagem: 'Etapa 1/3: Atualizando ajustes de estoque...', erro: null,
    iniciado_em: new Date().toISOString(), fim_em: null
  };
  try {
    // ETAPA 1: Ajustes de estoque
    progressoAtualizacaoGeral.etapa = 'ajustes';
    progressoAtualizacaoGeral.passo = 1;
    progressoAtualizacaoGeral.mensagem = 'Etapa 1/3: Atualizando ajustes de estoque...';
    await sincronizarAjustesEstoque();
    if (progressoSincAjustes.erro) throw new Error('Ajustes: ' + progressoSincAjustes.erro);

    // ETAPA 2: Lista de Ordens de Produção
    progressoAtualizacaoGeral.etapa = 'op';
    progressoAtualizacaoGeral.passo = 2;
    progressoAtualizacaoGeral.mensagem = 'Etapa 2/3: Atualizando lista de Ordens de Produção...';
    await sincronizarOP();
    if (progressoSincOP.erro) throw new Error('OP: ' + progressoSincOP.erro);

    // ETAPA 3: Consulta de detalhes (pendentes + novas)
    progressoAtualizacaoGeral.etapa = 'consulta';
    progressoAtualizacaoGeral.passo = 3;
    progressoAtualizacaoGeral.mensagem = 'Etapa 3/3: Consultando detalhes das OPs (pendentes + novas)...';
    await consultarOPsPendentesENovas();
    if (progressoConsultaOPs.erro) throw new Error('Consulta: ' + progressoConsultaOPs.erro);

    progressoAtualizacaoGeral.etapa = 'concluido';
    progressoAtualizacaoGeral.mensagem = '✅ Atualização completa concluída!';
  } catch (error) {
    console.error('[ATUALIZAR-TUDO] Erro:', error.message);
    progressoAtualizacaoGeral.etapa = 'erro';
    progressoAtualizacaoGeral.erro = error.message;
    progressoAtualizacaoGeral.mensagem = `❌ Erro: ${error.message}`;
  } finally {
    progressoAtualizacaoGeral.rodando = false;
    progressoAtualizacaoGeral.fim_em = new Date().toISOString();
  }
}

app.post('/api/relatorio/atualizar-tudo', (req, res) => {
  if (progressoAtualizacaoGeral.rodando) {
    return res.status(409).json({ success: false, error: 'Atualização já em andamento' });
  }
  atualizarTudo();
  res.json({ success: true, message: 'Atualização iniciada' });
});

app.get('/api/relatorio/atualizar-tudo/progresso', (req, res) => {
  const g = progressoAtualizacaoGeral;
  // Anexa o detalhe da etapa atual (sub-progresso) para a barra de status
  let detalhe = { atual: 0, total: 0, sub: '' };
  if (g.etapa === 'ajustes') {
    detalhe = { atual: progressoSincAjustes.paginaAtual || 0, total: progressoSincAjustes.totalPaginas || 0, sub: progressoSincAjustes.mensagem || '' };
  } else if (g.etapa === 'op') {
    detalhe = { atual: progressoSincOP.paginaAtual || 0, total: progressoSincOP.totalPaginas || 0, sub: progressoSincOP.mensagem || '' };
  } else if (g.etapa === 'consulta') {
    detalhe = { atual: progressoConsultaOPs.atual || 0, total: progressoConsultaOPs.total || 0, sub: progressoConsultaOPs.mensagem || '' };
  }
  res.json({ success: true, ...g, detalhe });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n📊 [RELATÓRIO] Backend rodando em http://localhost:${PORT}`);
});
