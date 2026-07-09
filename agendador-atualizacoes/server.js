const express = require('express');
const cron = require('node-cron');
const axios = require('axios');

const app = express();
const PORT = 4099;

app.use(express.json());

// Histórico de execuções
let historicoExecucoes = [];
let execucaoAtual = null;

// Função para formatar data/hora
function formatarDataHora(data) {
  const d = new Date(data);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Função para executar uma atualização
async function executarAtualizacao(nome, url, timeout = 300000) {
  const inicio = Date.now();
  console.log(`\n[${formatarDataHora(new Date())}] 🔄 Iniciando: ${nome}`);

  try {
    const response = await axios.post(url, {}, {
      timeout,
      headers: { 'Content-Type': 'application/json' }
    });

    const duracao = Math.round((Date.now() - inicio) / 1000);
    console.log(`[${formatarDataHora(new Date())}] ✅ ${nome} - Concluído em ${duracao}s`);

    return {
      nome,
      status: 'sucesso',
      duracao,
      mensagem: response.data?.message || 'Atualização concluída',
      horario: new Date().toISOString()
    };
  } catch (error) {
    const duracao = Math.round((Date.now() - inicio) / 1000);
    const mensagemErro = error.response?.data?.error || error.message;
    console.log(`[${formatarDataHora(new Date())}] ❌ ${nome} - Erro após ${duracao}s: ${mensagemErro}`);

    return {
      nome,
      status: 'erro',
      duracao,
      mensagem: mensagemErro,
      horario: new Date().toISOString()
    };
  }
}

// Função para executar todas as atualizações em sequência
async function executarSequenciaAtualizacoes() {
  if (execucaoAtual) {
    console.log('⚠️  Já existe uma execução em andamento. Ignorando...');
    return;
  }

  const inicioTotal = Date.now();
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`🚀 INICIANDO SEQUÊNCIA DE ATUALIZAÇÕES`);
  console.log(`   Data/Hora: ${formatarDataHora(new Date())}`);
  console.log('═══════════════════════════════════════════════════════');

  execucaoAtual = {
    inicio: new Date().toISOString(),
    atualizacoes: []
  };

  // 1. Separador de OP
  const resultadoOP = await executarAtualizacao(
    'Separador de OP',
    'http://localhost:4003/api/sincronizar-cache',
    300000 // 5 minutos
  );
  execucaoAtual.atualizacoes.push(resultadoOP);

  // 2. Separador de Remessa
  const resultadoRemessa = await executarAtualizacao(
    'Separador de Remessa',
    'http://localhost:4004/api/sincronizar-cache',
    300000 // 5 minutos
  );
  execucaoAtual.atualizacoes.push(resultadoRemessa);

  // 3. Programa Inventário
  const resultadoInventario = await executarAtualizacao(
    'Programa Inventário',
    'http://localhost:4007/api/sincronizar-produtos',
    600000 // 10 minutos (pode ser mais demorado)
  );
  execucaoAtual.atualizacoes.push(resultadoInventario);

  // 4. Gestão de Estoque
  const resultadoEstoque = await executarAtualizacao(
    'Gestão de Estoque',
    'http://localhost:4005/api/produtos/refresh-omie',
    300000 // 5 minutos
  );
  execucaoAtual.atualizacoes.push(resultadoEstoque);

  const duracaoTotal = Math.round((Date.now() - inicioTotal) / 1000);
  execucaoAtual.fim = new Date().toISOString();
  execucaoAtual.duracaoTotal = duracaoTotal;

  // Contar sucessos e erros
  const sucessos = execucaoAtual.atualizacoes.filter(a => a.status === 'sucesso').length;
  const erros = execucaoAtual.atualizacoes.filter(a => a.status === 'erro').length;

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`✅ SEQUÊNCIA CONCLUÍDA`);
  console.log(`   Tempo Total: ${duracaoTotal}s`);
  console.log(`   Sucessos: ${sucessos} | Erros: ${erros}`);
  console.log('═══════════════════════════════════════════════════════\n');

  // Adicionar ao histórico (manter apenas últimas 10 execuções)
  historicoExecucoes.unshift({ ...execucaoAtual });
  if (historicoExecucoes.length > 10) {
    historicoExecucoes = historicoExecucoes.slice(0, 10);
  }

  execucaoAtual = null;
}

// Agendar para executar todos os dias às 21:00
cron.schedule('0 21 * * *', () => {
  console.log('\n⏰ Agendamento disparado às 21:00');
  executarSequenciaAtualizacoes();
}, {
  timezone: "America/Sao_Paulo"
});

// Rota para executar manualmente
app.post('/api/executar-agora', async (req, res) => {
  if (execucaoAtual) {
    return res.status(400).json({
      error: 'Já existe uma execução em andamento',
      execucaoAtual
    });
  }

  // Executar em background
  executarSequenciaAtualizacoes();

  res.json({
    message: 'Sequência de atualizações iniciada',
    horario: new Date().toISOString()
  });
});

// Rota para verificar status
app.get('/api/status', (req, res) => {
  res.json({
    agendamento: '21:00 (todos os dias)',
    execucaoEmAndamento: execucaoAtual !== null,
    execucaoAtual: execucaoAtual,
    ultimaExecucao: historicoExecucoes[0] || null,
    totalExecucoes: historicoExecucoes.length
  });
});

// Rota para ver histórico
app.get('/api/historico', (req, res) => {
  res.json({
    historico: historicoExecucoes
  });
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    message: 'Agendador de Atualizações - OK',
    agendamento: '21:00 (todos os dias)',
    timezone: 'America/Sao_Paulo',
    status: 'ativo'
  });
});

app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AGENDADOR DE ATUALIZAÇÕES AUTOMÁTICAS                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\n✅ Servidor rodando na porta ${PORT}`);
  console.log(`⏰ Agendado para: 21:00 (todos os dias)`);
  console.log(`🌎 Timezone: America/Sao_Paulo`);
  console.log('\n📋 Sequência de atualizações:');
  console.log('   1. Separador de OP');
  console.log('   2. Separador de Remessa');
  console.log('   3. Programa Inventário');
  console.log('   4. Gestão de Estoque');
  console.log('\n💡 Endpoints disponíveis:');
  console.log(`   POST http://localhost:${PORT}/api/executar-agora - Executar manualmente`);
  console.log(`   GET  http://localhost:${PORT}/api/status - Ver status`);
  console.log(`   GET  http://localhost:${PORT}/api/historico - Ver histórico\n`);
});
