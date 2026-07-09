// Debug: procura uma NFe no SQLite local e, se não achar, varre as páginas do Omie
// Uso: node debug-nfe.js <numero_nfe>
//   ex: node debug-nfe.js 3769

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OMIE_APP_KEY = "2694922638408";
const OMIE_APP_SECRET = "02995c034ba5ba2ef1a297240bbb5bf5";
const OMIE_URL = "https://app.omie.com.br/api/v1/produtos/recebimentonfe/";
const XML_DB_PATH = path.join(__dirname, '..', '..', 'banco-de-dados', 'xml-nfe.db');

const alvoArg = process.argv[2] || '3769';
const alvoSemZeros = String(alvoArg).replace(/^0+/, '') || '0';

function normaliza(n) {
  return String(n || '').replace(/^0+/, '') || '0';
}

async function chamarOmie(payload) {
  const res = await fetch(OMIE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error('Resposta não-JSON: ' + text.slice(0, 300)); }
}

async function main() {
  console.log(`\n=== Procurando NFe "${alvoArg}" (normalizada: "${alvoSemZeros}") ===\n`);

  // 1) Consulta SQLite local
  const SQL = await initSqlJs();
  let db = null;
  if (fs.existsSync(XML_DB_PATH)) {
    const buf = fs.readFileSync(XML_DB_PATH);
    db = new SQL.Database(buf);
  } else {
    console.log(`[LOCAL] xml-nfe.db não existe em ${XML_DB_PATH}`);
  }

  if (db) {
    const stmt = db.prepare(
      `SELECT cNumeroNFe, cSerieNFe, cChaveNFe, dEmissaoNFe, nValorNFe, cNome, cRazaoSocial
       FROM omie_recebimentos
       WHERE cNumeroNFe = ? OR ltrim(cNumeroNFe, '0') = ?`
    );
    stmt.bind([String(alvoArg), alvoSemZeros]);
    const achadosLocal = [];
    while (stmt.step()) achadosLocal.push(stmt.getAsObject());
    stmt.free();

    if (achadosLocal.length > 0) {
      console.log(`[LOCAL] ENCONTRADA no xml-nfe.db:`);
      achadosLocal.forEach(r => console.log('  ', r));
    } else {
      console.log(`[LOCAL] NÃO encontrada no xml-nfe.db.`);

      // Estatísticas do banco
      const total = db.exec('SELECT COUNT(*) as n FROM omie_recebimentos')[0]?.values[0][0];
      const maisRecente = db.exec('SELECT cNumeroNFe, dEmissaoNFe FROM omie_recebimentos ORDER BY dEmissaoNFe DESC LIMIT 5')[0];
      const sync = db.exec('SELECT ultima_pagina, total_paginas, updated_at FROM omie_sync_status WHERE id=1')[0];
      console.log(`[LOCAL] Total de NFes no banco: ${total}`);
      console.log(`[LOCAL] Status do sync:`, sync?.values?.[0]);
      console.log(`[LOCAL] 5 NFes mais recentes no banco:`);
      (maisRecente?.values || []).forEach(v => console.log('  ', v));
    }
  }

  // 2) Busca no Omie página por página
  console.log(`\n=== Varredura Omie ===`);
  const primeira = await chamarOmie({
    call: 'ListarRecebimentos',
    app_key: OMIE_APP_KEY,
    app_secret: OMIE_APP_SECRET,
    param: [{ nPagina: 1, nRegistrosPorPagina: 50 }]
  });
  const totalPaginas = primeira.nTotalPaginas || primeira.nTotPaginas || 1;
  console.log(`[OMIE] Total de páginas: ${totalPaginas}`);

  async function varrerPagina(nPagina, data) {
    const recs = data.recebimentos || [];
    const achado = recs.find(r => {
      const n = normaliza(r.cabec?.cNumeroNFe);
      return n === alvoSemZeros;
    });
    if (achado) {
      console.log(`\n[OMIE] ✅ ENCONTRADA na página ${nPagina}:`);
      console.log('  ', {
        cNumeroNFe: achado.cabec?.cNumeroNFe,
        cSerieNFe: achado.cabec?.cSerieNFe,
        cChaveNFe: achado.cabec?.cChaveNFe,
        dEmissaoNFe: achado.cabec?.dEmissaoNFe,
        nValorNFe: achado.cabec?.nValorNFe,
        cNome: achado.cabec?.cNome,
        cRazaoSocial: achado.cabec?.cRazaoSocial,
        nIdReceb: achado.cabec?.nIdReceb
      });
      return true;
    }
    const primeiros = recs.slice(0, 3).map(r => normaliza(r.cabec?.cNumeroNFe)).join(', ');
    console.log(`[OMIE] Página ${nPagina}/${totalPaginas} — ${recs.length} registros (primeiros: ${primeiros})`);
    return false;
  }

  if (await varrerPagina(1, primeira)) return;

  for (let pag = 2; pag <= totalPaginas; pag++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const data = await chamarOmie({
        call: 'ListarRecebimentos',
        app_key: OMIE_APP_KEY,
        app_secret: OMIE_APP_SECRET,
        param: [{ nPagina: pag, nRegistrosPorPagina: 50 }]
      });
      if (await varrerPagina(pag, data)) return;
    } catch (e) {
      console.log(`[OMIE] Página ${pag} falhou: ${e.message}`);
    }
  }

  console.log(`\n[OMIE] ❌ NFe "${alvoArg}" NÃO foi encontrada em nenhuma das ${totalPaginas} páginas com app_key filial.`);
  console.log(`[OMIE] Pode ser: 1) app_key diferente (matriz/outra filial); 2) chamada diferente do Omie (NFe emitida, não recebida).`);
}

main().catch(e => {
  console.error('ERRO:', e);
  process.exit(1);
});
