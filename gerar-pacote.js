// ============================================================================
//  gerar-pacote.js  (rodar no PC X - de desenvolvimento)
// ----------------------------------------------------------------------------
//  Gera "dist-atualizacao/atualizacao.zip" contendo APENAS os arquivos da
//  aplicacao (codigo-fonte). NAO inclui:
//    - node_modules (dependencias instaladas)
//    - banco-de-dados (dados do usuario final)
//    - backups
//    - .git / .claude
//    - scripts .bat da raiz
//    - arquivos .zip / restart.flag / a propria pasta de saida
//
//  Como o sistema roda em modo DEV (Vite serve o codigo-fonte direto),
//  NAO ha etapa de build: basta empacotar a fonte.
//
//  Uso:  node gerar-pacote.js
//        (ou clique em GERAR_ATUALIZACAO.bat)
// ============================================================================

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const PROJECT_ROOT = __dirname;
const OUT_DIR = path.join(PROJECT_ROOT, 'dist-atualizacao');
const OUT_FILE = path.join(OUT_DIR, 'atualizacao.zip');

// Pastas/arquivos do topo que NUNCA entram no pacote.
const EXCLUIR_TOPO = new Set([
  'node_modules',
  'banco-de-dados',
  'backups',
  '.git',
  '.claude',
  'dist-atualizacao',
  'restart.flag',
  'versao.json',          // controlado pelo destino (e protegido na extracao)
  '_teste-atualizacao.mjs'
]);

function deveIgnorar(rel) {
  const norm = rel.replace(/\\/g, '/');
  const topo = norm.split('/')[0];
  if (EXCLUIR_TOPO.has(topo)) return true;
  // .bat na raiz
  if (!norm.includes('/') && norm.toLowerCase().endsWith('.bat')) return true;
  // arquivos .zip soltos
  if (norm.toLowerCase().endsWith('.zip')) return true;
  // arquivo solto "nul" e timestamps do vite
  if (norm === 'nul') return true;
  if (/\.timestamp-\d+.*\.mjs$/i.test(norm)) return true;
  return false;
}

function listarArquivos() {
  const out = [];
  function andar(absDir, relDir) {
    let itens;
    try {
      itens = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of itens) {
      const rel = relDir ? `${relDir}/${item.name}` : item.name;
      if (deveIgnorar(rel)) continue;
      const abs = path.join(absDir, item.name);
      if (item.isDirectory()) andar(abs, rel);
      else if (item.isFile()) out.push(rel);
    }
  }
  andar(PROJECT_ROOT, '');
  return out;
}

// ============================================================================
//  Camada de ANIMACAO / UI no console
// ============================================================================
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  magenta: '\x1b[35m', blue: '\x1b[34m', gray: '\x1b[90m',
  white: '\x1b[97m', red: '\x1b[31m'
};
const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const LARGURA_BARRA = 30;

const out = process.stdout;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const limparLinha = () => out.write('\r\x1b[2K');
const esconderCursor = () => out.write('\x1b[?25l');
const mostrarCursor = () => out.write('\x1b[?25h');

function banner() {
  const linha = '═'.repeat(52);
  console.log('');
  console.log(`${C.cyan}${C.bold}  ${linha}${C.reset}`);
  console.log(`${C.cyan}${C.bold}   📦  GERADOR DE PACOTE DE ATUALIZAÇÃO${C.reset}`);
  console.log(`${C.gray}       Sistema Almoxarifado · empacotando a versão nova${C.reset}`);
  console.log(`${C.cyan}${C.bold}  ${linha}${C.reset}`);
  console.log('');
}

// Spinner por um tempo fixo (efeito visual enquanto algo "acontece").
async function spinnerPor(label, ms) {
  const fim = Date.now() + ms;
  let i = 0;
  while (Date.now() < fim) {
    limparLinha();
    out.write(`  ${C.cyan}${SPIN[i % SPIN.length]}${C.reset}  ${label}${C.gray}...${C.reset}`);
    i++;
    await sleep(80);
  }
}

function passoOk(texto) {
  limparLinha();
  console.log(`  ${C.green}✔${C.reset}  ${texto}`);
}

// Desenha a barra de progresso (mesma linha).
function desenharBarra(atual, total, label) {
  const frac = total === 0 ? 1 : atual / total;
  const cheio = Math.round(frac * LARGURA_BARRA);
  const vazio = LARGURA_BARRA - cheio;
  const barra = `${C.green}${'█'.repeat(cheio)}${C.gray}${'░'.repeat(vazio)}${C.reset}`;
  const pct = String(Math.round(frac * 100)).padStart(3, ' ');
  limparLinha();
  out.write(`  ${C.cyan}${label}${C.reset}  ▕${barra}▏ ${C.bold}${pct}%${C.reset} ${C.gray}(${atual}/${total})${C.reset}`);
}

function formatarMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function cartaoFinal(qtd, mb) {
  const linha = '─'.repeat(52);
  console.log('');
  console.log(`  ${C.green}${C.bold}┌${linha}┐${C.reset}`);
  console.log(`  ${C.green}${C.bold}│${C.reset}  ${C.green}${C.bold}✅  PACOTE GERADO COM SUCESSO!${C.reset}`);
  console.log(`  ${C.green}${C.bold}│${C.reset}`);
  console.log(`  ${C.green}${C.bold}│${C.reset}   ${C.gray}Arquivos :${C.reset} ${C.white}${C.bold}${qtd}${C.reset}`);
  console.log(`  ${C.green}${C.bold}│${C.reset}   ${C.gray}Tamanho  :${C.reset} ${C.white}${C.bold}${mb} MB${C.reset}`);
  console.log(`  ${C.green}${C.bold}│${C.reset}   ${C.gray}Arquivo  :${C.reset} ${C.white}dist-atualizacao\\atualizacao.zip${C.reset}`);
  console.log(`  ${C.green}${C.bold}└${linha}┘${C.reset}`);
  console.log('');
  console.log(`  ${C.cyan}➜${C.reset}  Agora faça ${C.bold}upload${C.reset} deste ${C.bold}atualizacao.zip${C.reset} na aba`);
  console.log(`     ${C.bold}Configurações${C.reset} do sistema (no PC do servidor).`);
  console.log('');
  console.log(`  ${C.yellow}⚠${C.reset}  ${C.gray}Se esta versão usa NOVAS dependências (novos pacotes npm),${C.reset}`);
  console.log(`     ${C.gray}rode "npm install" uma vez no servidor após atualizar.${C.reset}`);
  console.log('');
}

// ============================================================================
//  Fluxo principal
// ============================================================================
async function main() {
  esconderCursor();
  banner();

  // Passo 1 - analisar arquivos
  await spinnerPor('Analisando arquivos do projeto', 700);
  const arquivos = listarArquivos();
  if (arquivos.length === 0) {
    limparLinha();
    console.log(`  ${C.red}✖  Nenhum arquivo encontrado para empacotar. Abortando.${C.reset}`);
    mostrarCursor();
    process.exit(1);
  }
  passoOk(`${C.bold}${arquivos.length}${C.reset} arquivos selecionados ${C.gray}(sem node_modules, banco-de-dados, backups e .bat)${C.reset}`);

  // Prepara pasta de saida
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  if (fs.existsSync(OUT_FILE)) fs.unlinkSync(OUT_FILE);

  // Passo 2 - compactar (barra de progresso animada)
  console.log('');
  const zip = new AdmZip();
  const total = arquivos.length;
  // Ritmo: ~1.8s no total, independente da quantidade de arquivos.
  const delayPorArquivo = Math.min(8, Math.max(1, Math.round(1800 / total)));
  const passoRedraw = Math.max(1, Math.floor(total / 120)); // redesenha ~120 vezes

  for (let i = 0; i < total; i++) {
    const rel = arquivos[i];
    const abs = path.join(PROJECT_ROOT, rel);
    const pastaNoZip = path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel);
    zip.addLocalFile(abs, pastaNoZip);

    if (i % passoRedraw === 0 || i === total - 1) {
      desenharBarra(i + 1, total, 'Compactando');
      await sleep(delayPorArquivo * passoRedraw);
    }
  }
  desenharBarra(total, total, 'Compactando');
  limparLinha();
  passoOk('Compactação concluída');

  // Passo 3 - gravar o zip em disco
  out.write(`  ${C.cyan}${SPIN[0]}${C.reset}  Gravando ${C.bold}atualizacao.zip${C.reset}${C.gray}...${C.reset}`);
  zip.writeZip(OUT_FILE);
  await sleep(250);
  passoOk('Arquivo gravado em disco');

  const mb = formatarMB(fs.statSync(OUT_FILE).size);
  cartaoFinal(total, mb);

  mostrarCursor();
}

main().catch(err => {
  mostrarCursor();
  console.error(`\n  ${C.red}✖  Erro ao gerar o pacote:${C.reset} ${err.message}`);
  process.exit(1);
});
