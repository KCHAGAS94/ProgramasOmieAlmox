// ============================================================================
//  SISTEMA DE ATUALIZACAO REMOTA  (admin only)
// ----------------------------------------------------------------------------
//  Endpoints registrados em /api/sistema/*
//    GET    /api/sistema/status        -> publico (health + versao + supervisor)
//    GET    /api/sistema/info          -> admin: versao + lista de backups
//    POST   /api/sistema/atualizar     -> admin: upload .zip e aplica
//    GET    /api/sistema/backups       -> admin: lista backups
//    POST   /api/sistema/restaurar     -> admin: rollback para um backup
//    POST   /api/sistema/reiniciar     -> admin: reinicia o servidor (supervisor)
//
//  Tudo escrito sobre a RAIZ do projeto (dois niveis acima deste arquivo).
// ============================================================================

import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import multer from 'multer';
import AdmZip from 'adm-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Raiz do projeto: menu-principal/backend -> ../../
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const VERSAO_FILE = path.join(PROJECT_ROOT, 'versao.json');
const BACKUPS_DIR = path.join(PROJECT_ROOT, 'backups');
const RESTART_FLAG = path.join(PROJECT_ROOT, 'restart.flag');
const NPM_INSTALL_FLAG = path.join(PROJECT_ROOT, 'npm-install.flag');

const MAX_BACKUPS = 8;

// Pastas/arquivos do topo que NUNCA podem ser sobrescritos por uma atualizacao.
// (dados do usuario, dependencias, backups, scripts de inicializacao, etc.)
const PROTEGIDOS_TOPO = new Set([
  'node_modules',
  'banco-de-dados',
  'backups',
  '.git',
  '.claude',
  'versao.json',
  'restart.flag',
  'npm-install.flag'
]);

// Extensoes de topo que sao protegidas (scripts .bat na raiz).
function ehProtegido(relPath) {
  const norm = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!norm) return true;
  const topo = norm.split('/')[0];
  if (PROTEGIDOS_TOPO.has(topo)) return true;
  // .bat na raiz do projeto
  if (!norm.includes('/') && norm.toLowerCase().endsWith('.bat')) return true;
  return false;
}

// ----------------------------------------------------------------------------
//  Helpers de versao
// ----------------------------------------------------------------------------
function lerVersao() {
  try {
    if (!fs.existsSync(VERSAO_FILE)) {
      return { versao: '0.0.0', data: null, autor: null, observacao: null };
    }
    return JSON.parse(fs.readFileSync(VERSAO_FILE, 'utf8'));
  } catch (e) {
    console.error('[SISTEMA] Erro ao ler versao.json:', e);
    return { versao: '0.0.0', data: null, autor: null, observacao: null };
  }
}

function salvarVersao(info) {
  fs.writeFileSync(VERSAO_FILE, JSON.stringify(info, null, 2), 'utf8');
}

// ----------------------------------------------------------------------------
//  Helpers de backup
// ----------------------------------------------------------------------------
function garantirBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

// Lista todos os caminhos de arquivos do projeto que NAO sao protegidos.
// Retorna caminhos relativos a PROJECT_ROOT (com '/').
function listarArquivosDoProjeto() {
  const resultado = [];
  function andar(absDir, relDir) {
    let itens;
    try {
      itens = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of itens) {
      const rel = relDir ? `${relDir}/${item.name}` : item.name;
      if (ehProtegido(rel)) continue;
      const abs = path.join(absDir, item.name);
      if (item.isDirectory()) {
        andar(abs, rel);
      } else if (item.isFile()) {
        resultado.push(rel);
      }
    }
  }
  andar(PROJECT_ROOT, '');
  return resultado;
}

// ----------------------------------------------------------------------------
//  Dependencias: se algum package.json (de qualquer programa) mudar numa
//  atualizacao/rollback, cria o npm-install.flag para o supervisor
//  (INICIAR.bat) rodar "npm install" no proximo restart.
// ----------------------------------------------------------------------------
function hashPackages() {
  const out = {};
  for (const rel of listarArquivosDoProjeto()) {
    if (path.posix.basename(rel).toLowerCase() === 'package.json') {
      try {
        out[rel] = crypto.createHash('sha1').update(fs.readFileSync(path.join(PROJECT_ROOT, rel))).digest('hex');
      } catch {
        out[rel] = null;
      }
    }
  }
  return out;
}

function marcarNpmInstallSeMudou(antes) {
  const depois = hashPackages();
  const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  const mudou = [...chaves].some((k) => antes[k] !== depois[k]);
  if (mudou) {
    try {
      fs.writeFileSync(NPM_INSTALL_FLAG, 'install', 'utf8');
    } catch (e) {
      console.warn('[SISTEMA] Nao foi possivel criar npm-install.flag:', e.message);
    }
  }
  return mudou;
}

// Cria um backup .zip da versao atual (apenas arquivos da aplicacao).
function criarBackup(rotulo) {
  garantirBackupsDir();
  const versaoAtual = lerVersao();
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  const nome = `backup-${carimbo}.zip`;
  const destino = path.join(BACKUPS_DIR, nome);

  const zip = new AdmZip();
  const arquivos = listarArquivosDoProjeto();
  for (const rel of arquivos) {
    const abs = path.join(PROJECT_ROOT, rel);
    const pastaNoZip = path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel);
    try {
      zip.addLocalFile(abs, pastaNoZip);
    } catch (e) {
      console.warn('[SISTEMA] Nao foi possivel adicionar ao backup:', rel, e.message);
    }
  }
  // Guarda metadados do backup dentro do proprio zip.
  zip.addFile(
    '_backup-info.json',
    Buffer.from(JSON.stringify({
      criadoEm: new Date().toISOString(),
      rotulo: rotulo || null,
      versaoNoMomento: versaoAtual
    }, null, 2), 'utf8')
  );
  zip.writeZip(destino);
  console.log(`[SISTEMA] Backup criado: ${nome} (${arquivos.length} arquivos)`);

  limparBackupsAntigos();
  return nome;
}

function limparBackupsAntigos() {
  const lista = listarBackups();
  if (lista.length <= MAX_BACKUPS) return;
  const excedentes = lista.slice(MAX_BACKUPS); // lista vem ordenada do mais novo p/ mais antigo
  for (const b of excedentes) {
    try {
      fs.unlinkSync(path.join(BACKUPS_DIR, b.nome));
      console.log(`[SISTEMA] Backup antigo removido: ${b.nome}`);
    } catch (e) {
      console.warn('[SISTEMA] Erro ao remover backup antigo:', b.nome, e.message);
    }
  }
}

function listarBackups() {
  garantirBackupsDir();
  let arquivos;
  try {
    arquivos = fs.readdirSync(BACKUPS_DIR);
  } catch {
    return [];
  }
  return arquivos
    .filter(f => f.toLowerCase().endsWith('.zip'))
    .map(nome => {
      const abs = path.join(BACKUPS_DIR, nome);
      const stat = fs.statSync(abs);
      let info = null;
      try {
        const zip = new AdmZip(abs);
        const entry = zip.getEntry('_backup-info.json');
        if (entry) info = JSON.parse(entry.getData().toString('utf8'));
      } catch { /* ignora */ }
      return {
        nome,
        tamanhoBytes: stat.size,
        criadoEm: info?.criadoEm || stat.mtime.toISOString(),
        rotulo: info?.rotulo || null,
        versaoNoMomento: info?.versaoNoMomento || null
      };
    })
    .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm)); // mais novo primeiro
}

// ----------------------------------------------------------------------------
//  Avalia UMA entrada do zip (pelo nome cru) e decide o que fazer com ela.
//  - normaliza '\' -> '/' (zips do Windows usam '\')
//  - bloqueia zip-slip (entradas que escapem da raiz, ex.: ../ ou ..\)
//  - pula caminhos protegidos (dados do usuario, node_modules, backups, .bat...)
//  Retorna { acao: 'aplicar'|'ignorar', rel, destinoAbs, motivo }
//  Funcao pura (sem I/O) -> testavel isoladamente. Exportada para testes.
// ----------------------------------------------------------------------------
export function avaliarEntrada(nomeCru) {
  const rel = nomeCru.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  if (!rel) return { acao: 'ignorar', rel, motivo: 'vazio' };

  // Protecao zip-slip: o destino resolvido tem que ficar DENTRO da raiz.
  const destinoAbs = path.resolve(PROJECT_ROOT, rel);
  const raizComBarra = PROJECT_ROOT.endsWith(path.sep) ? PROJECT_ROOT : PROJECT_ROOT + path.sep;
  if (destinoAbs !== PROJECT_ROOT && !destinoAbs.startsWith(raizComBarra)) {
    return { acao: 'ignorar', rel: nomeCru, motivo: 'zip-slip (fora da raiz)' };
  }

  if (ehProtegido(rel)) {
    return { acao: 'ignorar', rel, motivo: 'protegido' };
  }

  return { acao: 'aplicar', rel, destinoAbs };
}

// ----------------------------------------------------------------------------
//  Extracao segura de um zip (Buffer) sobre a raiz do projeto.
//  Retorna { aplicados, ignorados }
// ----------------------------------------------------------------------------
function extrairZipSeguro(buffer) {
  const zip = new AdmZip(buffer);
  const entradas = zip.getEntries();
  const aplicados = [];
  const ignorados = [];

  for (const entrada of entradas) {
    if (entrada.isDirectory) continue;

    const r = avaliarEntrada(entrada.entryName);
    if (r.acao === 'ignorar') {
      ignorados.push({ entrada: r.rel, motivo: r.motivo });
      continue;
    }

    try {
      fs.mkdirSync(path.dirname(r.destinoAbs), { recursive: true });
      fs.writeFileSync(r.destinoAbs, entrada.getData());
      aplicados.push(r.rel);
    } catch (e) {
      ignorados.push({ entrada: r.rel, motivo: 'erro: ' + e.message });
    }
  }

  return { aplicados, ignorados };
}

// ----------------------------------------------------------------------------
//  Reinicio via supervisor: grava restart.flag e encerra o processo.
//  O .bat supervisor ve o flag, apaga e sobe o servidor de novo.
// ----------------------------------------------------------------------------
function supervisorAtivo() {
  return process.env.SISTEMA_SUPERVISOR === '1';
}

function agendarReinicio() {
  fs.writeFileSync(RESTART_FLAG, new Date().toISOString(), 'utf8');
  console.log('[SISTEMA] restart.flag gravado. Encerrando para o supervisor reiniciar...');
  // Da tempo da resposta HTTP sair antes de encerrar.
  setTimeout(() => process.exit(0), 800);
}

// ----------------------------------------------------------------------------
//  Registro das rotas
// ----------------------------------------------------------------------------
export function registrarRotasSistema(app, { autenticar, apenasAdmin }) {
  // Upload em memoria (zips de fonte sao pequenos). Limite generoso.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 300 * 1024 * 1024 } // 300 MB
  });

  // --- STATUS (publico) — usado pelo frontend para saber se o servidor voltou.
  app.get('/api/sistema/status', (req, res) => {
    const v = lerVersao();
    res.json({
      status: 'ok',
      versao: v.versao,
      supervisor: supervisorAtivo()
    });
  });

  // --- INFO (admin): versao + backups
  app.get('/api/sistema/info', autenticar, apenasAdmin, (req, res) => {
    res.json({
      success: true,
      versao: lerVersao(),
      supervisor: supervisorAtivo(),
      backups: listarBackups()
    });
  });

  // --- BACKUPS (admin)
  app.get('/api/sistema/backups', autenticar, apenasAdmin, (req, res) => {
    res.json({ success: true, backups: listarBackups() });
  });

  // --- ATUALIZAR (admin): recebe .zip multipart no campo "pacote"
  app.post(
    '/api/sistema/atualizar',
    autenticar,
    apenasAdmin,
    upload.single('pacote'),
    (req, res) => {
      try {
        if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
          return res.status(400).json({ error: 'Nenhum arquivo .zip enviado (campo "pacote").' });
        }

        const nomeArq = (req.file.originalname || '').toLowerCase();
        if (!nomeArq.endsWith('.zip')) {
          return res.status(400).json({ error: 'O arquivo precisa ser um .zip.' });
        }

        // Valida que o buffer e um zip legivel ANTES de mexer em qualquer coisa.
        let entradasCount = 0;
        try {
          const teste = new AdmZip(req.file.buffer);
          entradasCount = teste.getEntries().length;
        } catch {
          return res.status(400).json({ error: 'Arquivo .zip invalido ou corrompido.' });
        }
        if (entradasCount === 0) {
          return res.status(400).json({ error: 'O .zip esta vazio.' });
        }

        const versaoInformada = (req.body.versao || '').trim();
        const observacao = (req.body.observacao || '').trim();
        const reiniciar = req.body.reiniciar === 'true' || req.body.reiniciar === true;

        // snapshot dos package.json ANTES de aplicar
        const pkgAntes = hashPackages();

        // 1) BACKUP AUTOMATICO da versao atual ANTES de aplicar.
        const nomeBackup = criarBackup(`antes de aplicar ${versaoInformada || 'atualizacao'}`);

        // 2) Extrai o pacote com seguranca.
        const { aplicados, ignorados } = extrairZipSeguro(req.file.buffer);

        // 2b) Se dependencias mudaram, marca npm-install.flag para o supervisor.
        const depsMudaram = marcarNpmInstallSeMudou(pkgAntes);

        // 3) Atualiza versao.json
        const versaoAnterior = lerVersao();
        const novaVersao = {
          versao: versaoInformada || versaoAnterior.versao,
          data: new Date().toISOString(),
          autor: req.email || 'desconhecido',
          observacao: observacao || null,
          versaoAnterior: versaoAnterior.versao || null
        };
        salvarVersao(novaVersao);

        console.log(`[SISTEMA] Atualizacao aplicada por ${req.email}: ${aplicados.length} arquivos, ${ignorados.length} ignorados. Backup: ${nomeBackup}`);

        // 4) Reinicio (se pedido e se supervisionado)
        let reinicioInfo;
        if (reiniciar) {
          if (supervisorAtivo()) {
            reinicioInfo = { reiniciando: true, mensagem: 'Servidor sera reiniciado.' };
            // Responde primeiro; depois encerra.
            res.json({
              success: true,
              versao: novaVersao,
              backup: nomeBackup,
              aplicados: aplicados.length,
              ignorados,
              depsMudaram,
              reinicio: reinicioInfo
            });
            agendarReinicio();
            return;
          } else {
            reinicioInfo = {
              reiniciando: false,
              mensagem: 'Atualizacao aplicada, mas o reinicio automatico esta indisponivel: o sistema nao foi iniciado pelo supervisor (INICIAR_SUPERVISOR.bat). Reinicie manualmente.'
            };
          }
        }

        res.json({
          success: true,
          versao: novaVersao,
          backup: nomeBackup,
          aplicados: aplicados.length,
          ignorados,
          depsMudaram,
          reinicio: reinicioInfo || { reiniciando: false }
        });
      } catch (error) {
        console.error('[SISTEMA] Erro ao aplicar atualizacao:', error);
        res.status(500).json({ error: 'Erro ao aplicar atualizacao: ' + error.message });
      }
    }
  );

  // --- RESTAURAR (admin): rollback para um backup
  app.post('/api/sistema/restaurar', autenticar, apenasAdmin, (req, res) => {
    try {
      const { backup, reiniciar } = req.body;
      if (!backup || typeof backup !== 'string') {
        return res.status(400).json({ error: 'Informe o nome do backup.' });
      }
      // Evita path traversal no nome do backup.
      if (backup.includes('/') || backup.includes('\\') || backup.includes('..')) {
        return res.status(400).json({ error: 'Nome de backup invalido.' });
      }
      const abs = path.join(BACKUPS_DIR, backup);
      if (!fs.existsSync(abs)) {
        return res.status(404).json({ error: 'Backup nao encontrado.' });
      }

      // snapshot dos package.json ANTES de restaurar
      const pkgAntes = hashPackages();

      // Antes de restaurar, faz um backup do estado atual (seguranca extra).
      criarBackup(`antes de restaurar ${backup}`);

      const buffer = fs.readFileSync(abs);
      const { aplicados, ignorados } = extrairZipSeguro(buffer);

      // Se o backup restaurado tem dependencias diferentes, marca reinstalacao.
      const depsMudaram = marcarNpmInstallSeMudou(pkgAntes);

      // Atualiza versao.json com a info contida no backup, se houver.
      let versaoRestaurada = null;
      try {
        const zip = new AdmZip(buffer);
        const entry = zip.getEntry('_backup-info.json');
        if (entry) {
          const meta = JSON.parse(entry.getData().toString('utf8'));
          if (meta?.versaoNoMomento) {
            versaoRestaurada = {
              ...meta.versaoNoMomento,
              data: new Date().toISOString(),
              autor: req.email || 'desconhecido',
              observacao: `Rollback do backup ${backup}`
            };
            salvarVersao(versaoRestaurada);
          }
        }
      } catch { /* ignora */ }

      console.log(`[SISTEMA] Rollback aplicado por ${req.email}: ${backup} (${aplicados.length} arquivos)`);

      if (reiniciar && supervisorAtivo()) {
        res.json({
          success: true,
          restaurado: backup,
          aplicados: aplicados.length,
          ignorados,
          versao: versaoRestaurada,
          depsMudaram,
          reinicio: { reiniciando: true }
        });
        agendarReinicio();
        return;
      }

      res.json({
        success: true,
        restaurado: backup,
        aplicados: aplicados.length,
        ignorados,
        versao: versaoRestaurada,
        depsMudaram,
        reinicio: {
          reiniciando: false,
          mensagem: supervisorAtivo() ? undefined : 'Reinicie manualmente (sem supervisor).'
        }
      });
    } catch (error) {
      console.error('[SISTEMA] Erro ao restaurar backup:', error);
      res.status(500).json({ error: 'Erro ao restaurar: ' + error.message });
    }
  });

  // --- REINICIAR (admin)
  app.post('/api/sistema/reiniciar', autenticar, apenasAdmin, (req, res) => {
    if (!supervisorAtivo()) {
      return res.status(409).json({
        error: 'Reinicio automatico indisponivel: o sistema nao foi iniciado pelo supervisor (INICIAR_SUPERVISOR.bat).'
      });
    }
    console.log(`[SISTEMA] Reinicio solicitado por ${req.email}`);
    res.json({ success: true, reinicio: { reiniciando: true } });
    agendarReinicio();
  });

  console.log('[SISTEMA] Rotas de atualizacao remota registradas em /api/sistema/*');
}
