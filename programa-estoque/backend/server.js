const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 4005;

// Configuração CORS
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Middleware de log para debug
app.use((req, res, next) => {
  const contentLength = req.headers['content-length'] || '0';
  const sizeInMB = (parseInt(contentLength) / (1024 * 1024)).toFixed(2);
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${contentLength} bytes (${sizeInMB} MB)`);
  next();
});

// Credenciais Omie
const OMIE_APP_KEY = 'OMIE_APP_KEY_REDACTED';
const OMIE_APP_SECRET = 'OMIE_APP_SECRET_REDACTED';

// Estado global do progresso da atualização Omie (consultado pelo frontend)
let progressoAtualizacao = {
  ativo: false,
  atual: 0,
  total: 0,
  atualizados: 0,
  codigoAtual: '',
  iniciadoEm: null
};

// Arquivos de dados
const DB_DIR = path.join(__dirname, '..', '..', 'banco-de-dados', 'estoque');
const PRODUTOS_FILE = path.join(DB_DIR, 'produtos.json');
const CATEGORIAS_FILE = path.join(DB_DIR, 'categorias.json');
const PARAMETROS_FILE = path.join(DB_DIR, 'parametros.json');

// Garantir que o diretório existe
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// ============ FUNÇÕES AUXILIARES ============

// Funções para buscar dados na resposta da API Omie
function buscarPrimeiro(dados, chaveProcurada) {
  if (typeof dados === 'object' && dados !== null) {
    if (chaveProcurada in dados) {
      return dados[chaveProcurada];
    }
    for (const v of Object.values(dados)) {
      const achou = buscarPrimeiro(v, chaveProcurada);
      if (achou !== null && achou !== undefined) {
        return achou;
      }
    }
  } else if (Array.isArray(dados)) {
    for (const v of dados) {
      const achou = buscarPrimeiro(v, chaveProcurada);
      if (achou !== null && achou !== undefined) {
        return achou;
      }
    }
  }
  return null;
}

function buscarEstoques(dados) {
  let encontrados = [];
  if (typeof dados === 'object' && dados !== null) {
    // Verificar se é um objeto de estoque (tem descrição local E estoque físico)
    if (('cDescricaoLocal' in dados || 'descricao' in dados) && ('fisico' in dados || 'saldo' in dados)) {
      // Garantir que todos os campos necessários existam
      const estoque = {
        cDescricaoLocal: dados.cDescricaoLocal || dados.descricao || '',
        fisico: dados.fisico || dados.saldo || 0,
        nPrevisaoSaida: dados.nPrevisaoSaida || 0,
        nCodLocal: dados.nCodLocal || dados.codigo_local_estoque || null
      };
      encontrados.push(estoque);
    }
    for (const v of Object.values(dados)) {
      encontrados = encontrados.concat(buscarEstoques(v));
    }
  } else if (Array.isArray(dados)) {
    for (const v of dados) {
      encontrados = encontrados.concat(buscarEstoques(v));
    }
  }
  return encontrados;
}

function lerProdutos() {
  try {
    if (fs.existsSync(PRODUTOS_FILE)) {
      const data = fs.readFileSync(PRODUTOS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Erro ao ler produtos:', error);
  }
  return { produtos: [] };
}

function salvarProdutos(data) {
  try {
    fs.writeFileSync(PRODUTOS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Erro ao salvar produtos:', error);
    return false;
  }
}

function lerCategorias() {
  try {
    if (fs.existsSync(CATEGORIAS_FILE)) {
      const data = fs.readFileSync(CATEGORIAS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Erro ao ler categorias:', error);
  }
  // Retorna categoria padrão se não existir
  return {
    categorias: [
      { id: 1, nome: 'Sem Categoria', cor: '#6b7280', ordem: -1 }
    ],
    proximoId: 2
  };
}

function salvarCategorias(data) {
  try {
    fs.writeFileSync(CATEGORIAS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Erro ao salvar categorias:', error);
    return false;
  }
}

function lerParametros() {
  try {
    if (fs.existsSync(PARAMETROS_FILE)) {
      const data = fs.readFileSync(PARAMETROS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Erro ao ler parâmetros:', error);
  }
  return { ultima_atualizacao: null };
}

function salvarParametros(data) {
  try {
    fs.writeFileSync(PARAMETROS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Erro ao salvar parâmetros:', error);
    return false;
  }
}

// ============ ROTAS DE TESTE ============

app.get('/', (req, res) => {
  res.json({ message: 'API Sistema de Estoque - OK' });
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    service: 'Programa Estoque Backend',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// ============ ROTAS DE PRODUTOS ============

app.get('/api/produtos', (req, res) => {
  try {
    const { categoria_id, ordenar } = req.query;
    let data = lerProdutos();

    let produtos = data.produtos || [];

    // Filtrar por categoria se especificado
    if (categoria_id) {
      produtos = produtos.filter(p => p.categoria_id == categoria_id);
    }

    // Ordenar por situação se especificado (do pior para o melhor)
    if (ordenar === 'situacao') {
      produtos.sort((a, b) => {
        // Calcula meses disponíveis para cada produto com base no estoque líquido
        const calcularMeses = (produto) => {
          const estoque = produto.estoque || 0;
          const previsaoSaida = produto.previsao_saida || 0;
          const estoqueLiquido = estoque - previsaoSaida;
          const minimo = produto.estoque_minimo || 0;
          if (minimo === 0) return 999; // Produtos sem mínimo vão para o final
          return (estoqueLiquido / minimo) * 2;
        };

        const mesesA = calcularMeses(a);
        const mesesB = calcularMeses(b);

        // Ordena do menor para o maior (pior situação primeiro)
        return mesesA - mesesB;
      });
    }

    res.json(produtos);
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

app.get('/api/produtos/:id', (req, res) => {
  try {
    const data = lerProdutos();
    const produto = data.produtos.find(p => p.id == req.params.id);

    if (!produto) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json(produto);
  } catch (error) {
    console.error('Erro ao buscar produto:', error);
    res.status(500).json({ error: 'Erro ao buscar produto' });
  }
});

app.post('/api/produtos', async (req, res) => {
  try {
    const { codigo_produto_omie, categoria_id, nome_local_estoque } = req.body;

    if (!codigo_produto_omie) {
      return res.status(400).json({ error: 'Código do produto Omie é obrigatório' });
    }

    // Buscar produto e estoque na Omie usando ObterEstoqueProduto (com retry)
    // dDia = data de POSICAO do estoque no Omie. A previsao de saida/entrada
    // so inclui pedidos com previsao ATE essa data. Usamos uma data bem no
    // futuro para capturar TODAS as previsoes em aberto (igual a tela web do
    // Omie). A posicao fisica (fisico) NAO muda com a data, entao e seguro.
    const hoje = new Date();
    const dDia = `31/12/${hoje.getFullYear() + 5}`;

    const payload = {
      call: 'ObterEstoqueProduto',
      app_key: OMIE_APP_KEY,
      app_secret: OMIE_APP_SECRET,
      param: [{
        cEAN: '',
        nIdProduto: 0,
        cCodigo: codigo_produto_omie,
        xCodigo: '',
        dDia
      }]
    };

    // Sistema de retry (3 tentativas)
    const tentativas = 3;
    const intervaloSegundos = 2;
    let response = null;
    let ultimoErro = null;

    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
      try {
        response = await axios.post('https://app.omie.com.br/api/v1/estoque/resumo/', payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 20000
        });
        break; // Sucesso, sair do loop
      } catch (e) {
        ultimoErro = e;
        console.log(`Tentativa ${tentativa}/${tentativas} ao consultar Omie para o código ${codigo_produto_omie} falhou: ${e.message}`);
        if (tentativa < tentativas) {
          await new Promise(resolve => setTimeout(resolve, intervaloSegundos * 1000));
        }
      }
    }

    if (!response) {
      throw new Error(`Erro ao conectar na API do Omie para o código ${codigo_produto_omie} após ${tentativas} tentativas: ${ultimoErro?.message}`);
    }

    const dados = response.data;

    // Verificar erro da API
    if (dados && dados.faultstring) {
      throw new Error(dados.faultstring);
    }

    // Buscar descrição do produto
    const descricao = buscarPrimeiro(dados, 'cDescricao');
    if (!descricao) {
      throw new Error('Produto não encontrado na API Omie');
    }

    // Buscar estoque
    const estoques = buscarEstoques(dados);
    console.log(`\n===== PRODUTO: ${codigo_produto_omie} =====`);
    console.log(`Estoques encontrados: ${estoques.length}`);

    if (estoques.length === 0) {
      throw new Error('Nenhum local de estoque encontrado');
    }

    // Mostrar TODOS os estoques com detalhes completos
    console.log('\n📦 ESTOQUES DISPONÍVEIS:');
    estoques.forEach((e, i) => {
      console.log(`  ${i + 1}. ${e.cDescricaoLocal}`);
      console.log(`     OBJETO COMPLETO:`, JSON.stringify(e, null, 2));
    });

    // Se foi especificado um estoque, buscar por NOME, senão usar "Estoque Comercial" como padrão
    let escolhido;
    if (nome_local_estoque) {
      console.log(`\n🔍 Procurando estoque: ${nome_local_estoque}`);

      escolhido = estoques.find(e => e.cDescricaoLocal === nome_local_estoque);

      if (!escolhido) {
        console.warn(`❌ Estoque "${nome_local_estoque}" NÃO ENCONTRADO!`);
        console.warn(`⚠️  Usando Estoque Comercial como fallback...`);
        let estoqueComercial = estoques.find(e => e.cDescricaoLocal === 'Estoque Comercial');
        escolhido = estoqueComercial || estoques[0];
      } else {
        console.log(`✅ Estoque encontrado: ${escolhido.cDescricaoLocal} (${escolhido.fisico} unidades)`);
      }
    } else {
      let estoqueComercial = estoques.find(e => e.cDescricaoLocal === 'Estoque Comercial');
      escolhido = estoqueComercial || estoques[0];
    }

    console.log(`\n🎯 ESTOQUE ESCOLHIDO: ${escolhido.cDescricaoLocal} = ${escolhido.fisico}`);
    console.log(`====================================\n`);

    let fisico = escolhido.fisico || 0;
    if (typeof fisico === 'string') {
      fisico = fisico.replace(/\./g, '').replace(',', '.');
    }
    const estoqueAtual = Math.round(parseFloat(fisico) || 0);

    const previsaoSaidaTotal = estoques.reduce((acc, e) => {
      let v = e.nPrevisaoSaida || 0;
      if (typeof v === 'string') {
        v = v.replace(/\./g, '').replace(',', '.');
      }
      return acc + (parseFloat(v) || 0);
    }, 0);
    const previsaoSaida = Math.round(previsaoSaidaTotal);

    const data = lerProdutos();
    const proximoId = data.produtos.length > 0 ? Math.max(...data.produtos.map(p => p.id)) + 1 : 1;
    const proximaOrdem = data.produtos.length > 0 ? Math.max(...data.produtos.map(p => p.ordem || 0)) + 1 : 1;

    const novoProduto = {
      id: proximoId,
      codigo: codigo_produto_omie,
      nome: descricao || '',
      estoque: estoqueAtual,
      previsao_saida: previsaoSaida,
      estoque_minimo: 0,
      previsao_reposicao: null,
      observacao: '',
      categoria_id: categoria_id || 1,
      ordem: proximaOrdem,
      nome_local_estoque: escolhido.cDescricaoLocal || null,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    };

    data.produtos.push(novoProduto);
    salvarProdutos(data);

    res.status(201).json(novoProduto);
  } catch (error) {
    console.error('Erro ao adicionar produto:', error);

    // Capturar erros específicos da API Omie
    if (error.response?.data?.faultstring) {
      const omieError = error.response.data.faultstring;
      return res.status(400).json({ error: `Erro da API Omie: ${omieError}` });
    }

    // Erros genéricos
    res.status(500).json({ error: error.message || 'Erro ao adicionar produto' });
  }
});

app.put('/api/produtos/:id', (req, res) => {
  try {
    const bodySize = JSON.stringify(req.body).length;
    const bodySizeKB = (bodySize / 1024).toFixed(2);
    console.log(`[PUT /api/produtos/${req.params.id}] Body size: ${bodySize} bytes (${bodySizeKB} KB)`);
    console.log(`[PUT /api/produtos/${req.params.id}] Body:`, req.body);

    const data = lerProdutos();
    const index = data.produtos.findIndex(p => p.id == req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const { estoque_minimo, previsao_reposicao, observacao, categoria_id } = req.body;

    data.produtos[index] = {
      ...data.produtos[index],
      estoque_minimo: estoque_minimo !== undefined ? estoque_minimo : data.produtos[index].estoque_minimo,
      previsao_reposicao: previsao_reposicao !== undefined ? previsao_reposicao : data.produtos[index].previsao_reposicao,
      observacao: observacao !== undefined ? observacao : data.produtos[index].observacao,
      categoria_id: categoria_id !== undefined ? categoria_id : data.produtos[index].categoria_id,
      atualizado_em: new Date().toISOString()
    };

    salvarProdutos(data);

    res.json(data.produtos[index]);
  } catch (error) {
    console.error('Erro ao atualizar produto:', error);
    res.status(500).json({ error: 'Erro ao atualizar produto' });
  }
});

app.delete('/api/produtos/:id', (req, res) => {
  try {
    const data = lerProdutos();
    const index = data.produtos.findIndex(p => p.id == req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    data.produtos.splice(index, 1);
    salvarProdutos(data);

    res.json({ message: 'Produto excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir produto:', error);
    res.status(500).json({ error: 'Erro ao excluir produto' });
  }
});

app.post('/api/produtos/:id/mover-cima', (req, res) => {
  try {
    const data = lerProdutos();
    const index = data.produtos.findIndex(p => p.id == req.params.id);

    if (index === -1 || index === 0) {
      return res.status(400).json({ error: 'Não é possível mover' });
    }

    // Trocar ordem
    [data.produtos[index], data.produtos[index - 1]] = [data.produtos[index - 1], data.produtos[index]];

    // Atualizar campos de ordem
    data.produtos.forEach((p, i) => {
      p.ordem = i;
    });

    salvarProdutos(data);
    res.json({ message: 'Produto movido para cima' });
  } catch (error) {
    console.error('Erro ao mover produto:', error);
    res.status(500).json({ error: 'Erro ao mover produto' });
  }
});

app.post('/api/produtos/:id/mover-baixo', (req, res) => {
  try {
    const data = lerProdutos();
    const index = data.produtos.findIndex(p => p.id == req.params.id);

    if (index === -1 || index === data.produtos.length - 1) {
      return res.status(400).json({ error: 'Não é possível mover' });
    }

    // Trocar ordem
    [data.produtos[index], data.produtos[index + 1]] = [data.produtos[index + 1], data.produtos[index]];

    // Atualizar campos de ordem
    data.produtos.forEach((p, i) => {
      p.ordem = i;
    });

    salvarProdutos(data);
    res.json({ message: 'Produto movido para baixo' });
  } catch (error) {
    console.error('Erro ao mover produto:', error);
    res.status(500).json({ error: 'Erro ao mover produto' });
  }
});

app.post('/api/produtos/refresh-omie', async (req, res) => {
  try {
    const data = lerProdutos();
    let atualizados = 0;
    const total = data.produtos.length;
    const erros = [];
    const naoAtualizados = []; // produtos sem estoque retornado pela Omie
    let amostrasLogadas = 0;   // limita log de respostas Omie completas

    // dDia = data de POSICAO do estoque no Omie. A previsao de saida/entrada
    // so inclui pedidos com previsao ATE essa data. Usamos uma data bem no
    // futuro para capturar TODAS as previsoes em aberto (igual a tela web do
    // Omie). A posicao fisica (fisico) NAO muda com a data, entao e seguro.
    const hoje = new Date();
    const dDia = `31/12/${hoje.getFullYear() + 5}`;

    // Função para atualizar UM produto (com retry)
    const atualizarProduto = async (produto, indice, totalProdutos) => {
      const payloadEstoque = {
        call: 'ObterEstoqueProduto',
        app_key: OMIE_APP_KEY,
        app_secret: OMIE_APP_SECRET,
        param: [{
          cEAN: '',
          nIdProduto: 0,
          cCodigo: produto.codigo,
          xCodigo: '',
          dDia
        }]
      };

      const prefixo = `[${indice}/${totalProdutos}] ${produto.codigo}`;
      console.log(`\n📤 ${prefixo} — Enviando requisição...`);
      console.log(`   Payload: ${JSON.stringify(payloadEstoque.param[0])}`);

      // Retry: até 4 tentativas — também tenta de novo se vier resposta VAZIA (rate limit silencioso da Omie)
      const tentativas = 4;
      let responseEstoque = null;
      let ultimoErro = null;
      let respostaVazia = false;

      for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
        try {
          const t0 = Date.now();
          responseEstoque = await axios.post('https://app.omie.com.br/api/v1/estoque/resumo/', payloadEstoque, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 25000
          });
          const tempoMs = Date.now() - t0;

          // Se a resposta veio com cCodigo vazio = rate limit silencioso da Omie. Tentar de novo.
          const dadosResp = responseEstoque.data;
          respostaVazia = dadosResp && dadosResp.cCodigo === '' && (!dadosResp.listaEstoque || dadosResp.listaEstoque.length === 0);

          if (!respostaVazia) {
            const numEstoques = (dadosResp.listaEstoque || []).length;
            console.log(`📥 ${prefixo} — Resposta OK em ${tempoMs}ms — ${numEstoques} locais de estoque retornados`);
            console.log(`   ${JSON.stringify(dadosResp).substring(0, 500)}${JSON.stringify(dadosResp).length > 500 ? '...' : ''}`);
            break; // Resposta válida, sair do loop
          }

          // Resposta vazia — esperar progressivamente mais (backoff) antes de tentar de novo
          console.log(`⚠️  ${prefixo} — Resposta VAZIA em ${tempoMs}ms (tentativa ${tentativa}/${tentativas})`);
          if (tentativa < tentativas) {
            const espera = tentativa * 2000; // 2s, 4s, 6s
            console.log(`   Aguardando ${espera/1000}s antes de tentar novamente...`);
            await new Promise(resolve => setTimeout(resolve, espera));
          }
        } catch (e) {
          ultimoErro = e;
          console.log(`❌ ${prefixo} — Erro na tentativa ${tentativa}/${tentativas}: ${e.message}`);
          if (tentativa < tentativas) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
      }

      if (!responseEstoque) {
        console.error(`❌ ${prefixo} — FALHOU após ${tentativas} tentativas: ${ultimoErro?.message}`);
        erros.push({ codigo: produto.codigo, erro: ultimoErro?.message || 'Timeout' });
        return false;
      }

      const estoques = buscarEstoques(responseEstoque.data);
      if (estoques.length === 0) {
        console.log(`⚠️  ${prefixo} — Sem estoques após retries. Resposta final:`);
        console.log(JSON.stringify(responseEstoque.data, null, 2));
        naoAtualizados.push({
          codigo: produto.codigo,
          nome: produto.nome,
          motivo: respostaVazia ? 'Omie retornou resposta vazia (possível rate limit)' : (responseEstoque.data?.faultstring || 'Sem locais de estoque retornados')
        });
        return false;
      }

      let escolhido;
      if (produto.nome_local_estoque) {
        escolhido = estoques.find(e => e.cDescricaoLocal === produto.nome_local_estoque);
        if (!escolhido) {
          console.warn(`⚠️  ${prefixo} — Estoque "${produto.nome_local_estoque}" não encontrado, usando padrão`);
          const estoqueComercial = estoques.find(e => e.cDescricaoLocal === 'Estoque Comercial');
          escolhido = estoqueComercial || estoques[0];
        }
      } else {
        const estoqueComercial = estoques.find(e => e.cDescricaoLocal === 'Estoque Comercial');
        escolhido = estoqueComercial || estoques[0];
      }

      if (!escolhido) {
        console.error(`❌ ${prefixo} — Nenhum estoque válido encontrado`);
        return false;
      }

      let fisico = escolhido.fisico || 0;
      if (typeof fisico === 'string') {
        fisico = fisico.replace(/\./g, '').replace(',', '.');
      }
      produto.estoque = Math.round(parseFloat(fisico) || 0);

      const previsaoSaidaTotal = estoques.reduce((acc, e) => {
        let v = e.nPrevisaoSaida || 0;
        if (typeof v === 'string') {
          v = v.replace(/\./g, '').replace(',', '.');
        }
        return acc + (parseFloat(v) || 0);
      }, 0);
      produto.previsao_saida = Math.round(previsaoSaidaTotal);

      produto.atualizado_em = new Date().toISOString();
      console.log(`✅ ${prefixo} — Atualizado: "${escolhido.cDescricaoLocal}" = ${produto.estoque} un | Previsão Saída = ${produto.previsao_saida} un`);
      return true;
    };

    // Processar UM produto por vez (individual) para respeitar rate limit da Omie
    const PAUSA_ENTRE_PRODUTOS_MS = 300;
    console.log(`\n🔄 Atualizando ${total} produtos individualmente (1 por vez)...`);
    const inicio = Date.now();

    // Inicializar estado global do progresso
    progressoAtualizacao = {
      ativo: true,
      atual: 0,
      total,
      atualizados: 0,
      codigoAtual: '',
      iniciadoEm: new Date().toISOString()
    };

    for (let i = 0; i < data.produtos.length; i++) {
      const produto = data.produtos[i];

      // Atualizar progresso antes de processar
      progressoAtualizacao.atual = i + 1;
      progressoAtualizacao.codigoAtual = produto.codigo;

      try {
        const ok = await atualizarProduto(produto, i + 1, total);
        if (ok) {
          atualizados++;
          progressoAtualizacao.atualizados = atualizados;
        }
      } catch (e) {
        console.error(`[${produto.codigo}] Erro inesperado:`, e.message);
      }

      // Pausa entre produtos para respeitar rate limit
      if (i + 1 < data.produtos.length) {
        await new Promise(resolve => setTimeout(resolve, PAUSA_ENTRE_PRODUTOS_MS));
      }
    }

    // Finalizar progresso
    progressoAtualizacao.ativo = false;

    const tempoTotal = ((Date.now() - inicio) / 1000).toFixed(1);
    console.log(`\n✅ Concluído em ${tempoTotal}s — ${atualizados}/${total} atualizados, ${erros.length} erros, ${naoAtualizados.length} sem estoque retornado`);

    if (naoAtualizados.length > 0) {
      console.log(`\n⚠️  PRODUTOS SEM ESTOQUE RETORNADO PELA OMIE (${naoAtualizados.length}):`);
      naoAtualizados.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.codigo} — ${p.nome || '(sem nome)'} → ${p.motivo}`);
      });
      console.log('');
    }

    salvarProdutos(data);

    // Atualizar data da última atualização
    const parametros = lerParametros();
    parametros.ultima_atualizacao = new Date().toISOString();
    salvarParametros(parametros);

    res.json({
      message: 'Estoque atualizado com sucesso',
      atualizados,
      total,
      erros,
      naoAtualizados,
      produtos: data.produtos
    });
  } catch (error) {
    console.error('Erro ao atualizar estoque:', error);
    progressoAtualizacao.ativo = false;
    res.status(500).json({ error: 'Erro ao atualizar estoque' });
  }
});

// Endpoint para o frontend consultar o progresso da atualização Omie
// Nota: usar /api/refresh-progress (não /api/produtos/refresh-progress) para evitar
// conflito de rota com /api/produtos/:id
app.get('/api/refresh-progress', (req, res) => {
  res.json(progressoAtualizacao);
});

app.get('/api/last-update', (req, res) => {
  try {
    const parametros = lerParametros();
    res.json({ lastUpdate: parametros.ultima_atualizacao });
  } catch (error) {
    console.error('Erro ao buscar última atualização:', error);
    res.status(500).json({ error: 'Erro ao buscar última atualização' });
  }
});

// ============ ROTAS DE CATEGORIAS ============

app.get('/api/categorias', (req, res) => {
  try {
    const data = lerCategorias();
    res.json(data.categorias || []);
  } catch (error) {
    console.error('Erro ao buscar categorias:', error);
    res.status(500).json({ error: 'Erro ao buscar categorias' });
  }
});

app.get('/api/categorias/:id', (req, res) => {
  try {
    const data = lerCategorias();
    const categoria = data.categorias.find(c => c.id == req.params.id);

    if (!categoria) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    res.json(categoria);
  } catch (error) {
    console.error('Erro ao buscar categoria:', error);
    res.status(500).json({ error: 'Erro ao buscar categoria' });
  }
});

app.post('/api/categorias', (req, res) => {
  try {
    const { nome, cor } = req.body;

    if (!nome) {
      return res.status(400).json({ error: 'Nome da categoria é obrigatório' });
    }

    const data = lerCategorias();
    const proximoId = data.proximoId || (data.categorias.length > 0 ? Math.max(...data.categorias.map(c => c.id)) + 1 : 1);
    const proximaOrdem = data.categorias.length > 0 ? Math.max(...data.categorias.map(c => c.ordem || 0)) + 1 : 1;

    const novaCategoria = {
      id: proximoId,
      nome,
      cor: cor || '#3b82f6',
      ordem: proximaOrdem
    };

    data.categorias.push(novaCategoria);
    data.proximoId = proximoId + 1;

    salvarCategorias(data);

    res.status(201).json(novaCategoria);
  } catch (error) {
    console.error('Erro ao criar categoria:', error);
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

app.put('/api/categorias/:id', (req, res) => {
  try {
    const data = lerCategorias();
    const index = data.categorias.findIndex(c => c.id == req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    const { nome, cor } = req.body;

    data.categorias[index] = {
      ...data.categorias[index],
      nome: nome !== undefined ? nome : data.categorias[index].nome,
      cor: cor !== undefined ? cor : data.categorias[index].cor
    };

    salvarCategorias(data);

    res.json(data.categorias[index]);
  } catch (error) {
    console.error('Erro ao atualizar categoria:', error);
    res.status(500).json({ error: 'Erro ao atualizar categoria' });
  }
});

app.delete('/api/categorias/:id', (req, res) => {
  try {
    const data = lerCategorias();
    const index = data.categorias.findIndex(c => c.id == req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    // Não permitir excluir a categoria padrão
    if (data.categorias[index].nome === 'Sem Categoria') {
      return res.status(400).json({ error: 'Não é possível excluir a categoria padrão' });
    }

    // Mover produtos dessa categoria para "Sem Categoria"
    const produtosData = lerProdutos();
    produtosData.produtos.forEach(p => {
      if (p.categoria_id == req.params.id) {
        p.categoria_id = 1; // "Sem Categoria"
      }
    });
    salvarProdutos(produtosData);

    data.categorias.splice(index, 1);
    salvarCategorias(data);

    res.json({ message: 'Categoria excluída com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir categoria:', error);
    res.status(500).json({ error: 'Erro ao excluir categoria' });
  }
});

app.post('/api/categorias/:id/mover-cima', (req, res) => {
  try {
    const data = lerCategorias();
    const index = data.categorias.findIndex(c => c.id == req.params.id);

    if (index === -1 || index === 0) {
      return res.status(400).json({ error: 'Não é possível mover' });
    }

    // Trocar ordem
    [data.categorias[index], data.categorias[index - 1]] = [data.categorias[index - 1], data.categorias[index]];

    // Atualizar campos de ordem
    data.categorias.forEach((c, i) => {
      c.ordem = i;
    });

    salvarCategorias(data);
    res.json({ message: 'Categoria movida para cima' });
  } catch (error) {
    console.error('Erro ao mover categoria:', error);
    res.status(500).json({ error: 'Erro ao mover categoria' });
  }
});

app.post('/api/categorias/:id/mover-baixo', (req, res) => {
  try {
    const data = lerCategorias();
    const index = data.categorias.findIndex(c => c.id == req.params.id);

    if (index === -1 || index === data.categorias.length - 1) {
      return res.status(400).json({ error: 'Não é possível mover' });
    }

    // Trocar ordem
    [data.categorias[index], data.categorias[index + 1]] = [data.categorias[index + 1], data.categorias[index]];

    // Atualizar campos de ordem
    data.categorias.forEach((c, i) => {
      c.ordem = i;
    });

    salvarCategorias(data);
    res.json({ message: 'Categoria movida para baixo' });
  } catch (error) {
    console.error('Erro ao mover categoria:', error);
    res.status(500).json({ error: 'Erro ao mover categoria' });
  }
});

// ============ INICIALIZAR SERVIDOR ============

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Servidor Estoque rodando em:`);
  console.log(`   Local: http://localhost:${PORT}`);
  console.log(`   Rede:  http://192.168.1.70:${PORT}`);
  console.log(`📊 API disponível em /api`);
  console.log(`\nUse o botão 'Atualizar Omie' para sincronizar o estoque.\n`);

  // Inicializar arquivos se não existirem
  if (!fs.existsSync(PRODUTOS_FILE)) {
    salvarProdutos({ produtos: [] });
  }
  if (!fs.existsSync(CATEGORIAS_FILE)) {
    salvarCategorias({
      categorias: [
        { id: 1, nome: 'Sem Categoria', cor: '#6b7280', ordem: -1 }
      ],
      proximoId: 2
    });
  }
  if (!fs.existsSync(PARAMETROS_FILE)) {
    salvarParametros({ ultima_atualizacao: null });
  }
});
