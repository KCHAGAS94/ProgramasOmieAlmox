const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 4011;

// Configuração CORS
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Arquivo de dados
const DB_DIR = path.join(__dirname, '..', '..', 'banco-de-dados', 'requisicao-material');
const REQUISICOES_FILE = path.join(DB_DIR, 'requisicoes.json');
const DATABASE_DIR = path.join(__dirname, '..', '..', 'banco-de-dados', 'compartilhado');
const USUARIOS_FILE = path.join(DATABASE_DIR, 'usuarios.json');

// Função auxiliar para ler requisições
function lerRequisicoes() {
  try {
    if (fs.existsSync(REQUISICOES_FILE)) {
      const data = fs.readFileSync(REQUISICOES_FILE, 'utf8');
      const parsed = JSON.parse(data);

      // Migrar estrutura antiga para nova
      if (parsed.requisicoes) {
        parsed.requisicoes = parsed.requisicoes.map(req => {
          // Se não tem array de itens, converte para o novo formato
          if (!req.itens && req.produto_codigo) {
            return {
              ...req,
              itens: [{
                produto_codigo: req.produto_codigo,
                produto_descricao: req.produto_descricao || '',
                quantidade_solicitada: Number(req.quantidade || 0),
                quantidade_entregue: req.status === 'entregue' ? Number(req.quantidade || 0) : 0,
                status: req.status === 'entregue' ? 'entregue' : 'pendente'
              }]
            };
          }

          // Se tem itens mas usa 'quantidade' em vez de 'quantidade_solicitada', converte
          if (req.itens && req.itens.length > 0 && req.itens[0].quantidade !== undefined && req.itens[0].quantidade_solicitada === undefined) {
            return {
              ...req,
              itens: req.itens.map(item => ({
                produto_codigo: item.produto_codigo,
                produto_descricao: item.produto_descricao || '',
                quantidade_solicitada: Number(item.quantidade || 0),
                quantidade_entregue: item.quantidade_entregue || 0,
                status: item.status || 'pendente'
              }))
            };
          }

          return req;
        });

        // Garante histórico imutável: requisições antigas recebem um histórico reconstruído.
        parsed.requisicoes = parsed.requisicoes.map(req =>
          Array.isArray(req.historico) ? req : { ...req, historico: construirHistoricoLegado(req) }
        );
      }

      return parsed;
    }
  } catch (error) {
    console.error('Erro ao ler requisições:', error);
  }
  return { requisicoes: [] };
}

// Função auxiliar para salvar requisições
function salvarRequisicoes(data) {
  try {
    fs.writeFileSync(REQUISICOES_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Erro ao salvar requisições:', error);
    return false;
  }
}

// ===== Histórico imutável de eventos da requisição =====
// Cada entrada é apenas ANEXADA (append-only). Não há rota para editar/remover entradas.
function registrarHistorico(requisicao, acao, descricao, usuario) {
  if (!Array.isArray(requisicao.historico)) requisicao.historico = [];
  requisicao.historico.push({
    acao,                                  // criacao | aprovacao | reprovacao | ajuste | entrega | entrega_parcial
    descricao: descricao || '',
    usuario: usuario || 'Sistema',
    data: new Date().toISOString()
  });
}

// Reconstrói um histórico para requisições antigas (criadas antes deste recurso),
// a partir das datas já gravadas. Usado só quando a requisição ainda não tem histórico.
function construirHistoricoLegado(req) {
  const h = [];
  if (req.data_solicitacao) {
    h.push({ acao: 'criacao', descricao: 'Requisição criada', usuario: req.solicitante_nome || 'Solicitante', data: req.data_solicitacao });
  }
  if (req.data_aprovacao) {
    h.push({ acao: 'aprovacao', descricao: 'Requisição aprovada', usuario: req.aprovado_por || 'Almoxarifado', data: req.data_aprovacao });
  }
  if (req.data_rejeicao) {
    h.push({ acao: 'reprovacao', descricao: req.motivo_rejeicao ? `Reprovada: ${req.motivo_rejeicao}` : 'Requisição reprovada', usuario: req.rejeitado_por || 'Almoxarifado', data: req.data_rejeicao });
  }
  if (req.data_entrega) {
    h.push({ acao: 'entrega', descricao: 'Entrega registrada', usuario: req.entregue_por || 'Almoxarifado', data: req.data_entrega });
  }
  return h.sort((a, b) => new Date(a.data) - new Date(b.data));
}

// Função para ler produtos do inventário
function lerProdutosInventario() {
  try {
    const produtosFile = path.join(__dirname, '..', '..', 'banco-de-dados', 'inventario', 'produtos.json');
    if (fs.existsSync(produtosFile)) {
      const data = fs.readFileSync(produtosFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Erro ao ler produtos do inventário:', error);
  }
  return { produtos: [], total: 0 };
}

// Rota de teste
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    programa: 'Requisição de Material',
    porta: PORT
  });
});

// GET /api/requisicoes - Listar todas as requisições
app.get('/api/requisicoes', (req, res) => {
  try {
    const data = lerRequisicoes();
    res.json({ success: true, requisicoes: data.requisicoes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/requisicoes/usuario/:usuarioId - Requisições de um usuário específico
app.get('/api/requisicoes/usuario/:usuarioId', (req, res) => {
  try {
    const { usuarioId } = req.params;
    const data = lerRequisicoes();
    const requisicoes = data.requisicoes.filter(r => r.solicitante_id === usuarioId);
    res.json({ success: true, requisicoes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/requisicoes - Criar nova requisição
app.post('/api/requisicoes', (req, res) => {
  try {
    const { itens, motivo, ordem_producao, solicitante_nome, solicitante_email } = req.body;

    // Validações
    if (!itens || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ success: false, error: 'Adicione pelo menos um item' });
    }

    if (!solicitante_nome) {
      return res.status(400).json({ success: false, error: 'Solicitante não identificado' });
    }

    // Valida cada item
    for (const item of itens) {
      if (!item.produto_codigo || !item.quantidade || Number(item.quantidade) <= 0) {
        return res.status(400).json({ success: false, error: 'Dados incompletos em um dos itens' });
      }
    }

    const data = lerRequisicoes();

    // Gera ID sequencial (RM-00001, RM-00002, RM-00003...)
    let novoId = 1;
    if (data.requisicoes.length > 0) {
      // Filtra apenas IDs sequenciais (ignora timestamps antigos que são > 99999)
      const idsSequenciais = data.requisicoes
        .map(r => {
          // Remove o prefixo RM- se existir
          const idNum = r.id.toString().replace('RM-', '');
          return parseInt(idNum) || 0;
        })
        .filter(id => id <= 99999);

      if (idsSequenciais.length > 0) {
        const ultimoId = Math.max(...idsSequenciais);
        novoId = ultimoId + 1;
      }
    }
    const idFormatado = 'RM-' + String(novoId).padStart(5, '0');

    const novaRequisicao = {
      id: idFormatado,
      itens: itens.map(item => ({
        produto_codigo: item.produto_codigo,
        produto_descricao: item.produto_descricao || '',
        produto_modelo: item.produto_modelo || '',
        quantidade_solicitada: Number(item.quantidade),
        quantidade_entregue: 0,
        status: 'pendente' // pendente, parcial, entregue
      })),
      motivo: motivo || '',
      ordem_producao: ordem_producao || '',
      status: 'pendente', // pendente, aprovada, rejeitada, entregue, parcial
      solicitante_nome,
      solicitante_email,
      data_solicitacao: new Date().toISOString(),
      aprovado_por: null,
      data_aprovacao: null,
      rejeitado_por: null,
      data_rejeicao: null,
      motivo_rejeicao: '',
      entregue_por: null,
      data_entrega: null,
      historico: []
    };

    registrarHistorico(novaRequisicao, 'criacao', `Requisição criada com ${novaRequisicao.itens.length} item(ns)`, solicitante_nome);

    data.requisicoes.push(novaRequisicao);

    if (salvarRequisicoes(data)) {
      res.json({ success: true, requisicao: novaRequisicao });
    } else {
      res.status(500).json({ success: false, error: 'Erro ao salvar requisição' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/requisicoes/:id/aprovar - Aprovar requisição
app.put('/api/requisicoes/:id/aprovar', (req, res) => {
  try {
    const { id } = req.params;
    const { aprovado_por } = req.body;

    const data = lerRequisicoes();
    const requisicao = data.requisicoes.find(r => r.id === id);

    if (!requisicao) {
      return res.status(404).json({ success: false, error: 'Requisição não encontrada' });
    }

    if (requisicao.status !== 'pendente') {
      return res.status(400).json({ success: false, error: 'Requisição já foi processada' });
    }

    requisicao.status = 'aprovada';
    requisicao.aprovado_por = aprovado_por;
    requisicao.data_aprovacao = new Date().toISOString();

    // Tempo decorrido da criação até a aprovação (em ms), preservado no histórico.
    const tempoAteAprovacaoMs = requisicao.data_solicitacao
      ? new Date(requisicao.data_aprovacao) - new Date(requisicao.data_solicitacao)
      : null;
    requisicao.tempo_ate_aprovacao_ms = tempoAteAprovacaoMs;
    registrarHistorico(requisicao, 'aprovacao', 'Requisição aprovada', aprovado_por);

    if (salvarRequisicoes(data)) {
      res.json({ success: true, requisicao });
    } else {
      res.status(500).json({ success: false, error: 'Erro ao salvar aprovação' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/requisicoes/:id/rejeitar - Rejeitar requisição
app.put('/api/requisicoes/:id/rejeitar', (req, res) => {
  try {
    const { id } = req.params;
    const { rejeitado_por, motivo_rejeicao } = req.body;

    // O motivo da reprovação é obrigatório
    if (!motivo_rejeicao || !String(motivo_rejeicao).trim()) {
      return res.status(400).json({ success: false, error: 'O motivo da reprovação é obrigatório' });
    }

    const data = lerRequisicoes();
    const requisicao = data.requisicoes.find(r => r.id === id);

    if (!requisicao) {
      return res.status(404).json({ success: false, error: 'Requisição não encontrada' });
    }

    if (requisicao.status !== 'pendente') {
      return res.status(400).json({ success: false, error: 'Requisição já foi processada' });
    }

    requisicao.status = 'rejeitada';
    requisicao.rejeitado_por = rejeitado_por;
    requisicao.data_rejeicao = new Date().toISOString();
    requisicao.motivo_rejeicao = String(motivo_rejeicao).trim();

    registrarHistorico(requisicao, 'reprovacao', `Reprovada: ${requisicao.motivo_rejeicao}`, rejeitado_por);

    if (salvarRequisicoes(data)) {
      res.json({ success: true, requisicao });
    } else {
      res.status(500).json({ success: false, error: 'Erro ao salvar rejeição' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/requisicoes/:id/ajustar - Solicitante ajusta uma requisição REPROVADA e reenvia
app.put('/api/requisicoes/:id/ajustar', (req, res) => {
  try {
    const { id } = req.params;
    const { itens, motivo, ordem_producao, solicitante_email, solicitante_nome } = req.body;

    const data = lerRequisicoes();
    const requisicao = data.requisicoes.find(r => r.id === id);

    if (!requisicao) {
      return res.status(404).json({ success: false, error: 'Requisição não encontrada' });
    }

    // Ajuste só é permitido após o retorno do almoxarifado (requisição reprovada)
    if (requisicao.status !== 'rejeitada') {
      return res.status(400).json({ success: false, error: 'Só é possível ajustar requisições reprovadas' });
    }

    // Apenas o usuário que CRIOU a requisição pode ajustá-la
    const mesmoEmail = solicitante_email && requisicao.solicitante_email &&
      String(solicitante_email).toLowerCase() === String(requisicao.solicitante_email).toLowerCase();
    const mesmoNome = solicitante_nome && requisicao.solicitante_nome &&
      String(solicitante_nome).toLowerCase() === String(requisicao.solicitante_nome).toLowerCase();
    if (!mesmoEmail && !mesmoNome) {
      return res.status(403).json({ success: false, error: 'Apenas o solicitante que criou a requisição pode ajustá-la' });
    }

    // Validação dos itens
    if (!itens || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ success: false, error: 'Adicione pelo menos um item' });
    }
    for (const item of itens) {
      if (!item.produto_codigo || !item.quantidade || Number(item.quantidade) <= 0) {
        return res.status(400).json({ success: false, error: 'Dados incompletos em um dos itens' });
      }
    }

    // Reaplica os itens (zera entregas) e devolve a requisição para análise (pendente)
    requisicao.itens = itens.map(item => ({
      produto_codigo: item.produto_codigo,
      produto_descricao: item.produto_descricao || '',
      produto_modelo: item.produto_modelo || '',
      quantidade_solicitada: Number(item.quantidade),
      quantidade_entregue: 0,
      status: 'pendente'
    }));
    requisicao.motivo = motivo || '';
    if (ordem_producao !== undefined) requisicao.ordem_producao = ordem_producao || '';

    // Guarda o histórico da reprovação anterior e limpa o estado de rejeição
    requisicao.ultimo_motivo_rejeicao = requisicao.motivo_rejeicao || '';
    requisicao.rejeitado_por = null;
    requisicao.data_rejeicao = null;
    requisicao.motivo_rejeicao = '';
    requisicao.status = 'pendente';
    requisicao.data_ajuste = new Date().toISOString();

    registrarHistorico(
      requisicao,
      'ajuste',
      `Ajustada pelo solicitante e reenviada para análise (${requisicao.itens.length} item(ns))`,
      solicitante_nome || requisicao.solicitante_nome
    );

    if (salvarRequisicoes(data)) {
      res.json({ success: true, requisicao });
    } else {
      res.status(500).json({ success: false, error: 'Erro ao salvar ajuste' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/requisicoes/:id/entregar - Entregar itens (parcial ou total)
app.put('/api/requisicoes/:id/entregar', (req, res) => {
  try {
    const { id } = req.params;
    const { entregue_por, entregas } = req.body;

    const data = lerRequisicoes();
    const requisicao = data.requisicoes.find(r => r.id === id);

    if (!requisicao) {
      return res.status(404).json({ success: false, error: 'Requisição não encontrada' });
    }

    if (requisicao.status !== 'aprovada' && requisicao.status !== 'parcial') {
      return res.status(400).json({ success: false, error: 'Requisição precisa estar aprovada' });
    }

    // Se não houver array de entregas, entrega TUDO (entrega completa)
    let descricaoEntrega = '';
    if (!entregas || !Array.isArray(entregas) || entregas.length === 0) {
      // Entrega completa automática
      requisicao.itens.forEach(item => {
        item.quantidade_entregue = item.quantidade_solicitada || item.quantidade || 0;
        item.status = 'entregue';
      });
      requisicao.status = 'entregue';
      descricaoEntrega = 'Entrega total dos itens';
    } else {
      // Entrega parcial com quantidades específicas
      entregas.forEach(entrega => {
        const item = requisicao.itens.find(i => i.produto_codigo === entrega.produto_codigo);
        if (item) {
          const novaQuantidade = (item.quantidade_entregue || 0) + Number(entrega.quantidade);
          item.quantidade_entregue = novaQuantidade;

          // Atualiza status do item
          if (novaQuantidade >= (item.quantidade_solicitada || item.quantidade)) {
            item.status = 'entregue';
          } else if (novaQuantidade > 0) {
            item.status = 'parcial';
          }
        }
      });

      // Calcula status geral da requisição
      const todosEntregues = requisicao.itens.every(i => i.status === 'entregue');
      const algunsEntregues = requisicao.itens.some(i => i.status === 'parcial' || i.status === 'entregue');

      if (todosEntregues) {
        requisicao.status = 'entregue';
      } else if (algunsEntregues) {
        requisicao.status = 'parcial';
      }

      const resumoEntregas = entregas.map(e => `${e.produto_codigo}: ${Number(e.quantidade)}`).join(', ');
      descricaoEntrega = `Entrega parcial (${resumoEntregas})`;
    }

    requisicao.entregue_por = entregue_por;
    requisicao.data_entrega = new Date().toISOString();

    registrarHistorico(
      requisicao,
      requisicao.status === 'entregue' ? 'entrega' : 'entrega_parcial',
      descricaoEntrega,
      entregue_por
    );

    if (salvarRequisicoes(data)) {
      res.json({ success: true, requisicao });
    } else {
      res.status(500).json({ success: false, error: 'Erro ao salvar entrega' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/requisicoes/:id - Excluir requisição
// Admin pode excluir qualquer pendente/rejeitada; o solicitante pode excluir a PRÓPRIA
// enquanto ainda não foi aprovada (pendente ou rejeitada).
app.delete('/api/requisicoes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { solicitante_email, solicitante_nome, tipo } = req.query;

    const data = lerRequisicoes();
    const requisicao = data.requisicoes.find(r => r.id === id);

    if (!requisicao) {
      return res.status(404).json({ success: false, error: 'Requisição não encontrada' });
    }

    // Só permite excluir requisições pendentes ou rejeitadas (ainda não aprovadas)
    if (requisicao.status !== 'pendente' && requisicao.status !== 'rejeitada') {
      return res.status(403).json({
        success: false,
        error: 'Não é possível excluir requisições aprovadas, parciais ou entregues'
      });
    }

    // Permissão: admin OU o próprio solicitante que criou a requisição
    const isAdmin = tipo === 'admin';
    if (!isAdmin) {
      const mesmoEmail = solicitante_email && requisicao.solicitante_email &&
        String(solicitante_email).toLowerCase() === String(requisicao.solicitante_email).toLowerCase();
      const mesmoNome = solicitante_nome && requisicao.solicitante_nome &&
        String(solicitante_nome).toLowerCase() === String(requisicao.solicitante_nome).toLowerCase();
      if (!mesmoEmail && !mesmoNome) {
        return res.status(403).json({ success: false, error: 'Apenas o solicitante que criou a requisição pode excluí-la' });
      }
    }

    // Remove a requisição
    const index = data.requisicoes.findIndex(r => r.id === id);
    data.requisicoes.splice(index, 1);

    if (salvarRequisicoes(data)) {
      res.json({ success: true, message: 'Requisição excluída com sucesso' });
    } else {
      res.status(500).json({ success: false, error: 'Erro ao excluir requisição' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/produtos - Buscar produtos do inventário para autocomplete
app.get('/api/produtos', (req, res) => {
  try {
    const { busca } = req.query;
    const data = lerProdutosInventario();

    let produtos = data.produtos || [];

    // Filtrar se houver busca
    if (busca && busca.trim()) {
      const buscaLower = busca.toLowerCase();
      produtos = produtos.filter(p =>
        (p.codigo && p.codigo.toLowerCase().includes(buscaLower)) ||
        (p.descricao && p.descricao.toLowerCase().includes(buscaLower))
      );
    }

    // Limitar a 20 resultados
    produtos = produtos.slice(0, 20);

    res.json({ success: true, produtos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/produtos/:codigoProduto - Consultar modelo atualizado na API Omie
app.get('/api/produtos/:codigoProduto', async (req, res) => {
  try {
    const { codigoProduto } = req.params;

    console.log(`[OMIE] Consultando produto ${codigoProduto} para buscar modelo`);

    // Configurações da API Omie (mesmas do inventário)
    const OMIE_APP_KEY = '2694922638408';
    const OMIE_APP_SECRET = '02995c034ba5ba2ef1a297240bbb5bf5';

    const response = await axios.post('https://app.omie.com.br/api/v1/geral/produtos/', {
      call: 'ConsultarProduto',
      app_key: OMIE_APP_KEY,
      app_secret: OMIE_APP_SECRET,
      param: [{
        codigo_produto: parseInt(codigoProduto)
      }]
    }, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.faultstring) {
      throw new Error(`Erro Omie: ${response.data.faultstring}`);
    }

    const produto = response.data;

    res.json({
      success: true,
      modelo: produto.modelo || '',
      codigo: produto.codigo || '',
      descricao: produto.descricao || ''
    });

  } catch (error) {
    console.error('[API] Erro ao consultar produto:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      modelo: '' // Retorna vazio em caso de erro
    });
  }
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n📦 Programa Requisição de Material Backend rodando em:`);
  console.log(`   Local: http://localhost:${PORT}`);
  console.log(`   Rede:  http://192.168.1.70:${PORT}`);
  console.log(`\n✅ Rotas disponíveis:`);
  console.log(`   GET    /api/status`);
  console.log(`   GET    /api/requisicoes`);
  console.log(`   POST   /api/requisicoes`);
  console.log(`   PUT    /api/requisicoes/:id/aprovar`);
  console.log(`   PUT    /api/requisicoes/:id/rejeitar`);
  console.log(`   PUT    /api/requisicoes/:id/ajustar`);
  console.log(`   PUT    /api/requisicoes/:id/entregar`);
  console.log(`   DELETE /api/requisicoes/:id`);
  console.log(`   GET    /api/produtos`);
  console.log(`   GET    /api/produtos/:codigoProduto`);
});
