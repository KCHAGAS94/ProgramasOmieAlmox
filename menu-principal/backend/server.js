import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { registrarRotasSistema } from './sistema-atualizacao.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4000;
const JWT_SECRET = 'chave-secreta-super-segura-mudar-em-producao';
const USUARIOS_FILE = path.join(__dirname, '..', '..', 'banco-de-dados', 'compartilhado', 'usuarios.json');

app.use(cors());
// Limite generoso (uploads de atualizacao podem ser grandes).
app.use(express.json({ limit: '50mb' }));

// ========================================
// FUNÇÕES AUXILIARES
// ========================================

function lerUsuarios() {
  try {
    if (!fs.existsSync(USUARIOS_FILE)) {
      const estruturaInicial = { usuarios: [], permissoes: [] };
      fs.writeFileSync(USUARIOS_FILE, JSON.stringify(estruturaInicial, null, 2), 'utf8');
      return estruturaInicial;
    }
    const data = fs.readFileSync(USUARIOS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[USUARIOS] Erro ao ler arquivo:', error);
    return { usuarios: [], permissoes: [] };
  }
}

function salvarUsuarios(dados) {
  try {
    fs.writeFileSync(USUARIOS_FILE, JSON.stringify(dados, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('[USUARIOS] Erro ao salvar arquivo:', error);
    return false;
  }
}

function validarEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

function validarSenha(senha) {
  return senha && senha.length >= 6;
}

// ========================================
// MIDDLEWARES
// ========================================

function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const [bearer, token] = authHeader.split(' ');

  if (bearer !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Formato de token inválido' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuarioId = decoded.userId;
    req.email = decoded.email;
    req.tipo = decoded.tipo;
    req.almoxarifado = decoded.almoxarifado === true;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function apenasAdmin(req, res, next) {
  if (req.tipo !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }
  next();
}

// ========================================
// ROTAS PÚBLICAS
// ========================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Menu Principal API' });
});

// ========================================
// ROTAS DE AUTENTICAÇÃO
// ========================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ error: 'Email e senha obrigatórios' });
    }

    const dados = lerUsuarios();
    const usuario = dados.usuarios.find(u => u.email === email && u.ativo);

    if (!usuario) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha);

    if (!senhaValida) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      { userId: usuario.id, email: usuario.email, tipo: usuario.tipo, almoxarifado: usuario.almoxarifado === true },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Retorna usuário sem a senha
    const { senha: _, ...usuarioSemSenha } = usuario;

    console.log(`[AUTH] Login bem-sucedido: ${usuario.email}`);

    res.json({
      success: true,
      token,
      usuario: usuarioSemSenha
    });
  } catch (error) {
    console.error('[AUTH] Erro no login:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.get('/api/auth/verificar', autenticar, (req, res) => {
  try {
    const dados = lerUsuarios();
    const usuario = dados.usuarios.find(u => u.id === req.usuarioId && u.ativo);

    if (!usuario) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    const { senha: _, ...usuarioSemSenha } = usuario;
    res.json({ success: true, usuario: usuarioSemSenha });
  } catch (error) {
    console.error('[AUTH] Erro ao verificar:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ========================================
// ROTAS DE USUÁRIOS (ADMIN)
// ========================================

app.get('/api/usuarios', autenticar, apenasAdmin, (req, res) => {
  try {
    const dados = lerUsuarios();
    const usuariosSemSenha = dados.usuarios.map(({ senha, ...resto }) => resto);
    res.json({ success: true, usuarios: usuariosSemSenha });
  } catch (error) {
    console.error('[USUARIOS] Erro ao listar:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.post('/api/usuarios', autenticar, apenasAdmin, async (req, res) => {
  try {
    const { nome, email, senha, tipo, almoxarifado } = req.body;

    // Validações
    if (!nome || !email || !senha || !tipo) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    if (!validarEmail(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    if (!validarSenha(senha)) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }

    if (!['admin', 'operador'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido' });
    }

    const dados = lerUsuarios();

    // Verifica email duplicado
    if (dados.usuarios.some(u => u.email === email)) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    // Hash da senha
    const senhaHash = await bcrypt.hash(senha, 10);

    const novoUsuario = {
      id: Date.now().toString(),
      nome,
      email,
      senha: senhaHash,
      tipo,
      almoxarifado: almoxarifado === true,
      ativo: true,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString()
    };

    dados.usuarios.push(novoUsuario);
    salvarUsuarios(dados);

    const { senha: _, ...usuarioSemSenha } = novoUsuario;

    console.log(`[USUARIOS] Usuário criado: ${email}`);

    res.json({ success: true, usuario: usuarioSemSenha });
  } catch (error) {
    console.error('[USUARIOS] Erro ao criar:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/usuarios/:id', autenticar, apenasAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, email, senha, tipo, ativo, almoxarifado } = req.body;

    const dados = lerUsuarios();
    const indice = dados.usuarios.findIndex(u => u.id === id);

    if (indice === -1) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const usuario = dados.usuarios[indice];

    // Atualiza campos
    if (nome) usuario.nome = nome;
    if (email) {
      if (!validarEmail(email)) {
        return res.status(400).json({ error: 'Email inválido' });
      }
      // Verifica email duplicado (exceto o próprio usuário)
      if (dados.usuarios.some(u => u.email === email && u.id !== id)) {
        return res.status(400).json({ error: 'Email já cadastrado' });
      }
      usuario.email = email;
    }
    if (senha) {
      if (!validarSenha(senha)) {
        return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
      }
      usuario.senha = await bcrypt.hash(senha, 10);
    }
    if (tipo && ['admin', 'operador'].includes(tipo)) {
      usuario.tipo = tipo;
    }
    if (typeof ativo === 'boolean') {
      usuario.ativo = ativo;
    }
    if (typeof almoxarifado === 'boolean') {
      usuario.almoxarifado = almoxarifado;
    }
    usuario.atualizadoEm = new Date().toISOString();

    salvarUsuarios(dados);

    const { senha: _, ...usuarioSemSenha } = usuario;

    console.log(`[USUARIOS] Usuário atualizado: ${usuario.email}`);

    res.json({ success: true, usuario: usuarioSemSenha });
  } catch (error) {
    console.error('[USUARIOS] Erro ao atualizar:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ========================================
// ROTAS DE PERMISSÕES
// ========================================

app.get('/api/permissoes/:usuarioId', autenticar, (req, res) => {
  try {
    const { usuarioId } = req.params;

    // Usuário pode ver apenas suas próprias permissões (exceto admin)
    if (req.tipo !== 'admin' && req.usuarioId !== usuarioId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const dados = lerUsuarios();
    const permissoes = dados.permissoes.filter(p => p.usuarioId === usuarioId);

    res.json({ success: true, permissoes });
  } catch (error) {
    console.error('[PERMISSOES] Erro ao listar:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.post('/api/permissoes', autenticar, apenasAdmin, (req, res) => {
  try {
    const { usuarioId, programaId, nivel } = req.body;

    if (!usuarioId || !programaId || !nivel) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    if (!['admin', 'editor', 'visualizador'].includes(nivel)) {
      return res.status(400).json({ error: 'Nível inválido' });
    }

    const dados = lerUsuarios();

    // Remove permissão existente para mesmo programa (se houver)
    dados.permissoes = dados.permissoes.filter(
      p => !(p.usuarioId === usuarioId && p.programaId === programaId)
    );

    const novaPermissao = {
      id: Date.now().toString(),
      usuarioId,
      programaId,
      nivel,
      criadoEm: new Date().toISOString()
    };

    dados.permissoes.push(novaPermissao);
    salvarUsuarios(dados);

    console.log(`[PERMISSOES] Permissão criada: usuário ${usuarioId} -> ${programaId} (${nivel})`);

    res.json({ success: true, permissao: novaPermissao });
  } catch (error) {
    console.error('[PERMISSOES] Erro ao criar:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.delete('/api/permissoes/:id', autenticar, apenasAdmin, (req, res) => {
  try {
    const { id } = req.params;

    const dados = lerUsuarios();
    const indiceBefore = dados.permissoes.length;
    dados.permissoes = dados.permissoes.filter(p => p.id !== id);

    if (dados.permissoes.length === indiceBefore) {
      return res.status(404).json({ error: 'Permissão não encontrada' });
    }

    salvarUsuarios(dados);

    console.log(`[PERMISSOES] Permissão removida: ${id}`);

    res.json({ success: true });
  } catch (error) {
    console.error('[PERMISSOES] Erro ao deletar:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.put('/api/permissoes/lote', autenticar, apenasAdmin, (req, res) => {
  try {
    const { usuarioId, permissoes } = req.body;

    if (!usuarioId || !Array.isArray(permissoes)) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }

    const dados = lerUsuarios();

    // Remove todas as permissões antigas do usuário
    dados.permissoes = dados.permissoes.filter(p => p.usuarioId !== usuarioId);

    // Adiciona novas permissões
    permissoes.forEach(({ programaId, nivel }) => {
      if (programaId && nivel && ['admin', 'editor', 'visualizador'].includes(nivel)) {
        dados.permissoes.push({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          usuarioId,
          programaId,
          nivel,
          criadoEm: new Date().toISOString()
        });
      }
    });

    salvarUsuarios(dados);

    console.log(`[PERMISSOES] Permissões atualizadas em lote para usuário ${usuarioId}`);

    res.json({ success: true });
  } catch (error) {
    console.error('[PERMISSOES] Erro ao atualizar em lote:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ========================================
// SISTEMA DE ATUALIZACAO REMOTA (admin only)
// ========================================

registrarRotasSistema(app, { autenticar, apenasAdmin });

// ========================================
// INICIAR SERVIDOR
// ========================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Menu Principal Backend rodando em:`);
  console.log(`   Local: http://localhost:${PORT}`);
  console.log(`   Rede:  http://192.168.1.70:${PORT}`);
  console.log(`📁 Arquivo de usuários: ${USUARIOS_FILE}`);
  console.log(`🔐 Autenticação ativa\n`);
});
