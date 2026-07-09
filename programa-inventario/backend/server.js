const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 4007;

// Configuração CORS
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Função para remover acentos e normalizar strings
function removerAcentos(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Credenciais Omie
const OMIE_APP_KEY = '2694922638408';
const OMIE_APP_SECRET = '02995c034ba5ba2ef1a297240bbb5bf5';

// Arquivos de dados
const DB_DIR = path.join(__dirname, '..', '..', 'banco-de-dados', 'inventario');
const INVENTARIO_FILE = path.join(DB_DIR, 'inventario.json');
const PRODUTOS_FILE = path.join(DB_DIR, 'produtos.json');

// Variável global para controlar progresso da sincronização
let progressoSincronizacao = {
  sincronizando: false,
  paginaAtual: 0,
  totalPaginas: 0,
  produtosSincronizados: 0,
  mensagem: ''
};

// Função auxiliar para ler dados do inventário
function lerInventario() {
  try {
    if (fs.existsSync(INVENTARIO_FILE)) {
      const data = fs.readFileSync(INVENTARIO_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Erro ao ler inventário:', error);
  }
  return { inventarios: [] };
}

// Função auxiliar para salvar dados do inventário
function salvarInventario(data) {
  try {
    fs.writeFileSync(INVENTARIO_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Erro ao salvar inventário:', error);
    return false;
  }
}

// Função auxiliar para ler produtos
function lerProdutos() {
  try {
    if (fs.existsSync(PRODUTOS_FILE)) {
      const data = fs.readFileSync(PRODUTOS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Erro ao ler produtos:', error);
  }
  return { produtos: [], ultima_sincronizacao: null, total: 0 };
}

// Função auxiliar para salvar produtos
function salvarProdutos(data) {
  try {
    fs.writeFileSync(PRODUTOS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Erro ao salvar produtos:', error);
    return false;
  }
}

// Rota de teste
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    service: 'Programa Inventário Backend',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Buscar produtos da Omie
app.post('/api/buscar-produtos', async (req, res) => {
  try {
    const { filtro, pagina = 1 } = req.body;

    const payload = {
      call: 'ListarProdutos',
      app_key: OMIE_APP_KEY,
      app_secret: OMIE_APP_SECRET,
      param: [{
        pagina: pagina,
        registros_por_pagina: 50,
        apenas_importado_api: 'N',
        filtrar_apenas_omiepdv: 'N'
      }]
    };

    console.log('[OMIE] Buscando produtos - Página:', pagina);

    const response = await axios.post('https://app.omie.com.br/api/v1/geral/produtos/', payload, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.faultstring) {
      throw new Error(`Erro Omie: ${response.data.faultstring}`);
    }

    res.json({
      success: true,
      produtos: response.data.produto_servico_cadastro || [],
      total_paginas: response.data.total_de_paginas || 1,
      pagina_atual: response.data.pagina || 1
    });

  } catch (error) {
    console.error('[API] Erro ao buscar produtos:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Listar inventários salvos
app.get('/api/inventarios', (req, res) => {
  try {
    const data = lerInventario();
    res.json({
      success: true,
      inventarios: data.inventarios || []
    });
  } catch (error) {
    console.error('[API] Erro ao listar inventários:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ROTA DE TESTE - Consultar estoque de um produto específico
app.get('/api/teste-estoque/:codigoProduto', async (req, res) => {
  try {
    const { codigoProduto } = req.params;
    console.log(`[TESTE] Consultando estoque do produto ${codigoProduto}`);

    const estoqueData = await consultarEstoqueProduto(parseInt(codigoProduto));

    if (!estoqueData) {
      return res.json({
        success: false,
        error: 'Produto não encontrado ou erro na API'
      });
    }

    res.json({
      success: true,
      produto: {
        codigo: estoqueData.cCodigo,
        descricao: estoqueData.cDescricao,
        locais: estoqueData.listaEstoque || []
      }
    });
  } catch (error) {
    console.error('[TESTE] Erro:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Função auxiliar para consultar estoque de um produto
async function consultarEstoqueProduto(codigoProduto) {
  try {
    const hoje = new Date();
    const diaFormatado = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;

    console.log(`[ESTOQUE DEBUG] Consultando produto ${codigoProduto} - Data: ${diaFormatado}`);

    const response = await axios.post('https://app.omie.com.br/api/v1/estoque/resumo/', {
      call: 'ObterEstoqueProduto',
      app_key: OMIE_APP_KEY,
      app_secret: OMIE_APP_SECRET,
      param: [{
        cEAN: '',
        nIdProduto: codigoProduto,
        cCodigo: '',
        xCodigo: '',
        dDia: diaFormatado
      }]
    }, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.faultstring) {
      console.error(`[ESTOQUE] Erro ao consultar produto ${codigoProduto}:`, response.data.faultstring);
      return null;
    }

    // LOG DETALHADO DA RESPOSTA
    console.log(`[ESTOQUE DEBUG] Produto ${codigoProduto} - Locais disponíveis:`);

    if (response.data.listaEstoque) {
      console.log(`[ESTOQUE DEBUG] Total de locais encontrados: ${response.data.listaEstoque.length}`);
      response.data.listaEstoque.forEach((loc, index) => {
        console.log(`[ESTOQUE DEBUG] Local ${index + 1}:`, {
          descricao: loc.cDescricaoLocal,
          saldo: loc.nSaldo,
          id: loc.nIdlocal
        });
      });
    } else {
      console.log(`[ESTOQUE DEBUG] ATENÇÃO: Não há array listaEstoque na resposta!`);
    }

    return response.data;
  } catch (error) {
    console.error(`[ESTOQUE] Erro ao consultar produto ${codigoProduto}:`, error.message);
    return null;
  }
}

// Criar novo inventário com consulta de estoque
app.post('/api/inventarios', async (req, res) => {
  try {
    const { nome, descricao, produtos, localEstoque, criado_por } = req.body;

    if (!nome) {
      return res.status(400).json({
        success: false,
        error: 'Nome do inventário é obrigatório'
      });
    }

    if (!localEstoque) {
      return res.status(400).json({
        success: false,
        error: 'Local de estoque é obrigatório'
      });
    }

    console.log(`[INVENTARIO] Criando inventário com ${produtos.length} produtos. Local: ${localEstoque}`);

    // Consulta o estoque de cada produto
    const produtosComEstoque = [];
    for (let i = 0; i < produtos.length; i++) {
      const produto = produtos[i];
      console.log(`[INVENTARIO] Consultando estoque ${i + 1}/${produtos.length}: ${produto.codigo}`);

      const estoqueData = await consultarEstoqueProduto(produto.codigo_produto);

      let quantidadeSistema = 0;
      console.log(`[INVENTARIO DEBUG] Processando produto ${produto.codigo} - Local escolhido: ${localEstoque}`);

      if (estoqueData && estoqueData.listaEstoque) {
        console.log(`[INVENTARIO DEBUG] Produto ${produto.codigo} tem ${estoqueData.listaEstoque.length} locais de estoque`);

        // Procura o saldo no local escolhido
        const localEncontrado = estoqueData.listaEstoque.find(loc => {
          const descLocal = removerAcentos((loc.cDescricaoLocal || '').toLowerCase());
          console.log(`[INVENTARIO DEBUG] Testando local "${loc.cDescricaoLocal}" (normalizado: "${descLocal}") - Saldo: ${loc.nSaldo}`);

          if (localEstoque === 'almoxarifado') {
            const match = descLocal.includes('almoxarifado') || descLocal.includes('materia prima');
            console.log(`[INVENTARIO DEBUG] Buscando almoxarifado: ${match ? 'MATCH!' : 'não match'}`);
            return match;
          } else if (localEstoque === 'comercial') {
            const match = descLocal.includes('comercial') && !descLocal.includes('estoque comercial');
            console.log(`[INVENTARIO DEBUG] Buscando comercial: ${match ? 'MATCH!' : 'não match'}`);
            return match;
          } else if (localEstoque === 'consumivel') {
            const match = descLocal.includes('consumivel');
            console.log(`[INVENTARIO DEBUG] Buscando consumivel: ${match ? 'MATCH!' : 'não match'}`);
            return match;
          } else if (localEstoque === 'estoque_comercial') {
            const match = descLocal.includes('estoque comercial');
            console.log(`[INVENTARIO DEBUG] Buscando estoque comercial: ${match ? 'MATCH!' : 'não match'}`);
            return match;
          }
          return false;
        });

        if (localEncontrado) {
          quantidadeSistema = localEncontrado.nSaldo || 0;
          console.log(`[INVENTARIO] ✅ ${produto.codigo}: ${quantidadeSistema} unidades no local "${localEncontrado.cDescricaoLocal}"`);
        } else {
          console.log(`[INVENTARIO] ⚠️ ${produto.codigo}: Local "${localEstoque}" NÃO ENCONTRADO nos estoques disponíveis`);
        }
      } else {
        console.log(`[INVENTARIO DEBUG] ⚠️ Produto ${produto.codigo}: estoqueData=${!!estoqueData}, listaEstoque=${!!(estoqueData && estoqueData.listaEstoque)}`);
      }

      produtosComEstoque.push({
        ...produto,
        quantidade_sistema: quantidadeSistema,
        quantidade_contada: 0,
        quantidade_contada_2: null,
        quantidade_contada_3: null,
        diferenca: 0,
        observacao: ''
      });

      // Delay de 300ms entre requisições para não sobrecarregar a API
      if (i < produtos.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    const data = lerInventario();
    const novoInventario = {
      id: Date.now().toString(),
      nome,
      descricao: descricao || '',
      localEstoque,
      data_criacao: new Date().toISOString(),
      data_modificacao: new Date().toISOString(),
      criado_por: criado_por || 'Sistema',
      modificado_por: criado_por || 'Sistema',
      status: 'em_andamento',
      mostrar_contagem_2: false,
      mostrar_contagem_3: false,
      produtos: produtosComEstoque
    };

    data.inventarios.push(novoInventario);

    if (salvarInventario(data)) {
      console.log('[INVENTARIO] Novo inventário criado:', novoInventario.id);
      res.json({
        success: true,
        inventario: novoInventario
      });
    } else {
      throw new Error('Erro ao salvar inventário');
    }

  } catch (error) {
    console.error('[API] Erro ao criar inventário:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Atualizar inventário
app.put('/api/inventarios/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { nome, descricao, produtos, status, mostrar_contagem_2, mostrar_contagem_3, modificado_por } = req.body;

    const data = lerInventario();
    const index = data.inventarios.findIndex(inv => inv.id === id);

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Inventário não encontrado'
      });
    }

    // Atualiza apenas os campos fornecidos
    if (nome !== undefined) data.inventarios[index].nome = nome;
    if (descricao !== undefined) data.inventarios[index].descricao = descricao;
    if (produtos !== undefined) data.inventarios[index].produtos = produtos;
    if (status !== undefined) data.inventarios[index].status = status;
    if (mostrar_contagem_2 !== undefined) data.inventarios[index].mostrar_contagem_2 = mostrar_contagem_2;
    if (mostrar_contagem_3 !== undefined) data.inventarios[index].mostrar_contagem_3 = mostrar_contagem_3;

    data.inventarios[index].data_modificacao = new Date().toISOString();
    if (modificado_por !== undefined) data.inventarios[index].modificado_por = modificado_por;

    if (salvarInventario(data)) {
      console.log('[INVENTARIO] Inventário atualizado:', id);
      res.json({
        success: true,
        inventario: data.inventarios[index]
      });
    } else {
      throw new Error('Erro ao salvar inventário');
    }

  } catch (error) {
    console.error('[API] Erro ao atualizar inventário:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Concluir inventário
app.put('/api/inventarios/:id/concluir', (req, res) => {
  try {
    const { id } = req.params;
    const { concluido_por } = req.body;

    const data = lerInventario();
    const index = data.inventarios.findIndex(inv => inv.id === id);

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Inventário não encontrado'
      });
    }

    // Atualiza status para concluído
    data.inventarios[index].status = 'concluido';
    data.inventarios[index].data_conclusao = new Date().toISOString();
    if (concluido_por) data.inventarios[index].concluido_por = concluido_por;

    if (salvarInventario(data)) {
      console.log('[INVENTARIO] Inventário concluído:', id);
      res.json({
        success: true,
        inventario: data.inventarios[index]
      });
    } else {
      throw new Error('Erro ao salvar inventário');
    }

  } catch (error) {
    console.error('[API] Erro ao concluir inventário:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Listar produtos salvos
app.get('/api/produtos', (req, res) => {
  try {
    const data = lerProdutos();
    res.json({
      success: true,
      produtos: data.produtos || [],
      total: data.total || 0,
      ultima_sincronizacao: data.ultima_sincronizacao
    });
  } catch (error) {
    console.error('[API] Erro ao listar produtos:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Verificar progresso da sincronização
app.get('/api/sincronizar-produtos/progresso', (req, res) => {
  res.json({
    success: true,
    ...progressoSincronizacao
  });
});

// Sincronizar produtos da Omie
app.post('/api/sincronizar-produtos', async (req, res) => {
  if (progressoSincronizacao.sincronizando) {
    return res.status(409).json({
      success: false,
      error: 'Sincronização já em andamento'
    });
  }

  // Inicia sincronização em background
  sincronizarProdutos();

  res.json({
    success: true,
    message: 'Sincronização iniciada'
  });
});

// Função de sincronização (roda em background)
async function sincronizarProdutos() {
  try {
    progressoSincronizacao.sincronizando = true;
    progressoSincronizacao.paginaAtual = 0;
    progressoSincronizacao.totalPaginas = 0;
    progressoSincronizacao.produtosSincronizados = 0;
    progressoSincronizacao.mensagem = 'Iniciando sincronização...';

    console.log('[SYNC] Iniciando sincronização de produtos...');

    // Primeira requisição para saber total de páginas
    const primeiraReq = await axios.post('https://app.omie.com.br/api/v1/geral/produtos/', {
      call: 'ListarProdutos',
      app_key: OMIE_APP_KEY,
      app_secret: OMIE_APP_SECRET,
      param: [{
        pagina: 1,
        registros_por_pagina: 50,
        apenas_importado_api: 'N',
        filtrar_apenas_omiepdv: 'N'
      }]
    }, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });

    if (primeiraReq.data.faultstring) {
      throw new Error(`Erro Omie: ${primeiraReq.data.faultstring}`);
    }

    const totalPaginas = primeiraReq.data.total_de_paginas || 1;
    progressoSincronizacao.totalPaginas = totalPaginas;

    console.log(`[SYNC] Total de páginas: ${totalPaginas}`);

    let todosProdutos = [];

    // Extrai produtos da primeira página
    if (primeiraReq.data.produto_servico_cadastro) {
      const produtosPag1 = primeiraReq.data.produto_servico_cadastro.map(p => ({
        codigo: p.codigo || '',
        descricao: p.descricao || '',
        modelo: p.modelo || '',
        codigo_produto: p.codigo_produto || 0
      }));
      todosProdutos = todosProdutos.concat(produtosPag1);
      progressoSincronizacao.produtosSincronizados = todosProdutos.length;
    }

    progressoSincronizacao.paginaAtual = 1;
    progressoSincronizacao.mensagem = `Sincronizando página 1 de ${totalPaginas}...`;

    // Busca as demais páginas
    for (let pagina = 2; pagina <= totalPaginas; pagina++) {
      progressoSincronizacao.paginaAtual = pagina;
      progressoSincronizacao.mensagem = `Sincronizando página ${pagina} de ${totalPaginas}...`;

      console.log(`[SYNC] Processando página ${pagina}/${totalPaginas}...`);

      // Delay de 500ms entre requisições
      await new Promise(resolve => setTimeout(resolve, 500));

      const response = await axios.post('https://app.omie.com.br/api/v1/geral/produtos/', {
        call: 'ListarProdutos',
        app_key: OMIE_APP_KEY,
        app_secret: OMIE_APP_SECRET,
        param: [{
          pagina: pagina,
          registros_por_pagina: 50,
          apenas_importado_api: 'N',
          filtrar_apenas_omiepdv: 'N'
        }]
      }, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data.faultstring) {
        throw new Error(`Erro Omie: ${response.data.faultstring}`);
      }

      if (response.data.produto_servico_cadastro) {
        const produtosNovaPagina = response.data.produto_servico_cadastro.map(p => ({
          codigo: p.codigo || '',
          descricao: p.descricao || '',
          modelo: p.modelo || '',
          codigo_produto: p.codigo_produto || 0
        }));
        todosProdutos = todosProdutos.concat(produtosNovaPagina);
        progressoSincronizacao.produtosSincronizados = todosProdutos.length;
      }
    }

    // Salva no arquivo JSON
    const dadosProdutos = {
      produtos: todosProdutos,
      total: todosProdutos.length,
      ultima_sincronizacao: new Date().toISOString()
    };

    if (salvarProdutos(dadosProdutos)) {
      console.log(`[SYNC] ✅ Sincronização concluída! ${todosProdutos.length} produtos salvos.`);
      progressoSincronizacao.mensagem = `✅ Sincronização concluída! ${todosProdutos.length} produtos salvos.`;
    } else {
      throw new Error('Erro ao salvar produtos no arquivo');
    }

  } catch (error) {
    console.error('[SYNC] ❌ Erro na sincronização:', error.message);
    progressoSincronizacao.mensagem = `❌ Erro: ${error.message}`;
  } finally {
    progressoSincronizacao.sincronizando = false;
  }
}

// Deletar inventário
app.delete('/api/inventarios/:id', (req, res) => {
  try {
    const { id } = req.params;

    const data = lerInventario();
    const index = data.inventarios.findIndex(inv => inv.id === id);

    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Inventário não encontrado'
      });
    }

    data.inventarios.splice(index, 1);

    if (salvarInventario(data)) {
      console.log('[INVENTARIO] Inventário deletado:', id);
      res.json({
        success: true,
        message: 'Inventário deletado com sucesso'
      });
    } else {
      throw new Error('Erro ao salvar inventário');
    }

  } catch (error) {
    console.error('[API] Erro ao deletar inventário:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Iniciar servidor
// Agendamento automático - sincronizar produtos todo dia às 06:11
function agendarSincronizacaoDiaria() {
  const agora = new Date();
  const proxima = new Date();
  proxima.setHours(6, 11, 0, 0);

  if (proxima <= agora) {
    proxima.setDate(proxima.getDate() + 1);
  }

  const ms = proxima.getTime() - agora.getTime();
  console.log(`[SYNC AUTO] Próxima sincronização agendada para: ${proxima.toLocaleString('pt-BR')}`);

  setTimeout(() => {
    console.log('[SYNC AUTO] Iniciando sincronização automática diária...');
    if (!progressoSincronizacao.sincronizando) {
      sincronizarProdutos();
    }
    // Reagenda para o próximo dia
    setInterval(() => {
      console.log('[SYNC AUTO] Iniciando sincronização automática diária...');
      if (!progressoSincronizacao.sincronizando) {
        sincronizarProdutos();
      }
    }, 24 * 60 * 60 * 1000);
  }, ms);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎯 Programa Inventário Backend rodando em:`);
  console.log(`   Local: http://localhost:${PORT}`);
  console.log(`   Rede:  http://192.168.1.70:${PORT}`);
  console.log(`📊 Status: http://localhost:${PORT}/api/status\n`);

  agendarSincronizacaoDiaria();
});
