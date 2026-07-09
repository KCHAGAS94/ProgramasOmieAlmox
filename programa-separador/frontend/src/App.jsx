import { useState, useEffect } from 'react';
import axios from 'axios';

// Detecta automaticamente o hostname para funcionar em qualquer rede
const API_BASE = `http://${window.location.hostname}:4001/api`;

// Função para obter usuário logado do localStorage
const obterUsuarioLogado = () => {
  try {
    const usuarioStr = localStorage.getItem('usuario');
    if (usuarioStr) {
      const usuario = JSON.parse(usuarioStr);
      return { nome: usuario.nome || 'Usuário', tipo: usuario.tipo || 'operador' };
    }

    const token = localStorage.getItem('token');
    if (!token) return { nome: 'Usuário Desconhecido', tipo: 'operador' };

    const payloadBase64 = token.split('.')[1];
    const payload = JSON.parse(atob(payloadBase64));
    return { nome: payload.email?.split('@')[0] || 'Usuário', tipo: payload.tipo || 'operador' };
  } catch (error) {
    return { nome: 'Usuário Desconhecido', tipo: 'operador' };
  }
};

// Copia texto pro clipboard. Tenta navigator.clipboard (HTTPS/localhost),
// cai pra document.execCommand('copy') em contexto não seguro (HTTP via IP da rede).
async function copiarTextoCompat(texto) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard falhou, usando fallback:', err);
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = texto;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch (err) {
    console.error('Fallback de cópia falhou:', err);
    return false;
  }
}

function App() {
  const [autenticado, setAutenticado] = useState(false);
  const [numPedido, setNumPedido] = useState('');
  const [pedidoData, setPedidoData] = useState(null);
  const [pedidoCopiado, setPedidoCopiado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ordenar, setOrdenar] = useState('');
  const [abaAtiva, setAbaAtiva] = useState('pesquisar');
  const [itensPendentes, setItensPendentes] = useState([]);
  const [itensConcluidos, setItensConcluidos] = useState([]);
  const [mostrarDebug, setMostrarDebug] = useState(false);
  const [logs, setLogs] = useState([]);
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [observacaoPedido, setObservacaoPedido] = useState('');
  const [salvandoObs, setSalvandoObs] = useState(false);
  const [filtroCodigo, setFiltroCodigo] = useState('');
  const [filtroDescricao, setFiltroDescricao] = useState('');
  const [filtroQtd, setFiltroQtd] = useState('');
  const [filtroDados, setFiltroDados] = useState('');
  const [filtroLocal, setFiltroLocal] = useState('');
  const [filtroPreMontado, setFiltroPreMontado] = useState('');
  const [filtroSeparado, setFiltroSeparado] = useState('todos');
  const [filtroTransferido, setFiltroTransferido] = useState('todos');

  // Sincronização de ajustes de estoque (Omie)
  const [sincAjustes, setSincAjustes] = useState({
    sincronizando: false,
    paginaAtual: 0,
    totalPaginas: 0,
    registrosSalvos: 0,
    mensagem: '',
    erro: null
  });

  // Dark mode
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true';
    }
    return false;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  // Verifica autenticação ao carregar
  useEffect(() => {
    // Primeiro, verifica se há token na URL (vindo do Menu Principal)
    const urlParams = new URLSearchParams(window.location.search);
    const tokenUrl = urlParams.get('token');
    const usuarioUrl = urlParams.get('usuario');

    if (tokenUrl && usuarioUrl) {
      // Salva no localStorage local
      localStorage.setItem('token', tokenUrl);
      localStorage.setItem('usuario', usuarioUrl);

      // Remove os parâmetros da URL para não ficarem expostos
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Depois verifica se está autenticado
    const token = localStorage.getItem('token');
    const usuario = localStorage.getItem('usuario');
    setAutenticado(!!(token && usuario));
  }, []);

  // Pré-carrega ambas as listas ao autenticar
  useEffect(() => {
    if (!autenticado) return;
    carregarItensPendentes();
    carregarItensConcluidos();
  }, [autenticado]);

  // Recarrega ao mudar de aba
  useEffect(() => {
    if (!autenticado) return;
    if (abaAtiva === 'emAndamento') {
      carregarItensPendentes();
    } else if (abaAtiva === 'concluidos') {
      carregarItensConcluidos();
    }
  }, [abaAtiva]);

  const carregarItensPendentes = async () => {
    try {
      const response = await axios.get(`${API_BASE}/itens-pendentes`);
      setItensPendentes(response.data);
    } catch (error) {
      console.error('Erro ao carregar pendentes:', error);
    }
  };

  const carregarItensConcluidos = async () => {
    try {
      const response = await axios.get(`${API_BASE}/itens-concluidos`);
      setItensConcluidos(response.data);
    } catch (error) {
      console.error('Erro ao carregar concluídos:', error);
    }
  };

  const sincronizarAjustesEstoque = async () => {
    try {
      await axios.post(`${API_BASE}/sincronizar-ajustes`);
      const intervalo = setInterval(async () => {
        try {
          const { data } = await axios.get(`${API_BASE}/sincronizar-ajustes/progresso`);
          setSincAjustes({
            sincronizando: data.sincronizando,
            paginaAtual: data.paginaAtual,
            totalPaginas: data.totalPaginas,
            registrosSalvos: data.registrosSalvos,
            mensagem: data.mensagem,
            erro: data.erro
          });
          if (!data.sincronizando) clearInterval(intervalo);
        } catch (err) {
          clearInterval(intervalo);
        }
      }, 1000);
    } catch (error) {
      const msg = error.response?.data?.error || error.message;
      setSincAjustes(s => ({ ...s, erro: msg, mensagem: `❌ ${msg}` }));
    }
  };

  const abrirPedido = async (numPedidoParaAbrir) => {
    setNumPedido(numPedidoParaAbrir);
    setAbaAtiva('pesquisar');

    // Busca o pedido diretamente com o parâmetro
    setLoading(true);
    setError('');

    try {
      const usuarioLogado = obterUsuarioLogado();
      const response = await axios.post(`${API_BASE}/consultar-pedido`, {
        num_pedido: numPedidoParaAbrir,
        refresh: false,
        ordenar,
        usuario: usuarioLogado?.nome || 'Sistema'
      });
      setPedidoData(response.data);
      try {
        const obsRes = await axios.get(`${API_BASE}/observacao/${response.data.pedido_id}`);
        setObservacaoPedido(obsRes.data.observacao?.observacao || '');
      } catch { setObservacaoPedido(''); }
    } catch (error) {
      setError(error.response?.data?.error || error.message);
    } finally {
      setLoading(false);
    }
  };

  const adicionarLog = (mensagem, tipo = 'info') => {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    setLogs(prev => [...prev, { timestamp, mensagem, tipo }]);
  };

  const consultarPedido = async (refresh = false) => {
    if (!numPedido) {
      setError('Digite o número do pedido');
      return;
    }

    setLoading(true);
    setError('');
    setLogs([]);

    adicionarLog(`🔍 Iniciando busca do pedido ${numPedido}...`, 'info');

    try {
      adicionarLog('📡 Conectando com API Omie...', 'info');

      const usuarioLogado2 = obterUsuarioLogado();
      const response = await axios.post(`${API_BASE}/consultar-pedido`, {
        num_pedido: numPedido,
        refresh,
        ordenar,
        usuario: usuarioLogado2?.nome || 'Sistema'
      });

      adicionarLog(`✅ Pedido encontrado! ID: ${response.data.pedido_id}`, 'success');
      adicionarLog(`📦 Total de itens: ${response.data.itens?.length || 0}`, 'info');

      if (response.data.produtos) {
        adicionarLog(`🔧 Produtos consultados: ${response.data.produtos.length}`, 'info');
      }

      setPedidoData(response.data);
      // Carrega observação salva
      try {
        const obsRes = await axios.get(`${API_BASE}/observacao/${response.data.pedido_id}`);
        setObservacaoPedido(obsRes.data.observacao?.observacao || '');
      } catch { setObservacaoPedido(''); }
      adicionarLog('🎉 Consulta concluída com sucesso!', 'success');
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      adicionarLog(`❌ Erro: ${errorMsg}`, 'error');
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const toggleFlag = async (pedidoId, itemDesc, flag) => {
    try {
      const usuarioLogado = obterUsuarioLogado();

      const response = await axios.post(`${API_BASE}/toggle-flag`, {
        pedido_id: pedidoId,
        item_desc: itemDesc,
        flag,
        usuario: usuarioLogado.nome
      });

      // Atualiza o estado local com as informações de auditoria
      setPedidoData(prev => ({
        ...prev,
        itens: prev.itens.map(item =>
          item.descricao === itemDesc
            ? {
                ...item,
                ...response.data.flags
              }
            : item
        )
      }));

      // Só recarrega a lista correspondente à aba ativa (a outra atualiza ao trocar de aba).
      // Quando a aba é "pesquisar", a atualização otimista acima já basta.
      if (abaAtiva === 'emAndamento') {
        carregarItensPendentes();
      } else if (abaAtiva === 'concluidos') {
        carregarItensConcluidos();
      }
    } catch (error) {
      alert('Erro ao atualizar flag: ' + error.message);
    }
  };

  const salvarObservacao = async () => {
    if (!pedidoData) return;
    setSalvandoObs(true);
    try {
      const usuario = obterUsuarioLogado();
      await axios.post(`${API_BASE}/salvar-observacao`, {
        pedidoId: pedidoData.pedido_id,
        observacao: observacaoPedido,
        usuario: usuario?.nome || 'Sistema'
      });
    } catch (error) {
      alert('Erro ao salvar observação: ' + error.message);
    } finally {
      setSalvandoObs(false);
    }
  };

  const concluirPedido = async () => {
    if (!pedidoData) return;
    if (!confirm(`Deseja concluir o pedido P-${pedidoData.num_pedido}?\n\nTodos os itens serão marcados como separado e transferido.`)) return;

    try {
      const usuario = obterUsuarioLogado();
      await axios.post(`${API_BASE}/concluir-pedido`, {
        pedido_id: pedidoData.pedido_id,
        usuario: usuario?.nome || 'Sistema'
      });
      // Recarrega do cache local (sem refresh da API Omie)
      await consultarPedido(false);
      carregarItensPendentes();
      carregarItensConcluidos();
    } catch (error) {
      alert('Erro ao concluir pedido: ' + (error.response?.data?.error || error.message));
    }
  };

  const reverterConclusao = async (pedidoId, numPedido) => {
    if (!confirm(`Deseja reverter a conclusão do pedido P-${numPedido}?\n\nO pedido voltará para "Em Andamento".`)) return;
    try {
      await axios.post(`${API_BASE}/reverter-conclusao`, { pedido_id: pedidoId });
      carregarItensPendentes();
      carregarItensConcluidos();
    } catch (error) {
      alert('Erro ao reverter: ' + (error.response?.data?.error || error.message));
    }
  };

  const deletarPedido = async (pedidoId, numPedido) => {
    if (!confirm(`Tem certeza que deseja EXCLUIR o pedido ${numPedido}?\n\nEsta ação não pode ser desfeita!\nO pedido será removido do banco de dados.`)) {
      return;
    }

    try {
      const usuarioLogado = obterUsuarioLogado();

      const response = await axios.post(`${API_BASE}/deletar-pedido`, {
        pedido_id: pedidoId,
        usuario: usuarioLogado.nome
      });

      // Recarrega as listas
      carregarItensPendentes();
      carregarItensConcluidos();

      alert(response.data.message || 'Pedido excluído com sucesso!');
    } catch (error) {
      alert('Erro ao deletar pedido: ' + (error.response?.data?.error || error.message));
    }
  };

  const ordenarPor = (tipo) => {
    setOrdenar(tipo);
    if (pedidoData) {
      consultarPedido(false);
    }
  };

  const filtrarPedidos = (pedidos) => {
    if (!termoPesquisa.trim()) return pedidos;

    const termo = termoPesquisa.toLowerCase();

    return pedidos.filter(pedido => {
      // Busca no número do pedido
      if (pedido.num_pedido.toString().toLowerCase().includes(termo)) return true;

      // Busca nos itens do pedido
      return pedido.itens.some(item => {
        const codigo = (item.codigo || '').toString().toLowerCase();
        const descricao = (item.descricao || '').toString().toLowerCase();
        const quantidade = (item.quantidade || '').toString().toLowerCase();
        const dados = (item.dados_adicionais_item || '').toString().toLowerCase();
        const local = (item.local || '').toString().toLowerCase();
        const preMontado = (item.pre_montado || '').toString().toLowerCase();

        return codigo.includes(termo) ||
               descricao.includes(termo) ||
               quantidade.includes(termo) ||
               dados.includes(termo) ||
               local.includes(termo) ||
               preMontado.includes(termo);
      });
    });
  };

  const styles = getStyles(darkMode);

  // Tela de não autenticado
  if (!autenticado) {
    return (
      <div style={styles.container}>
        <div style={{
          maxWidth: '600px',
          margin: '100px auto',
          padding: '40px',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{fontSize: '48px', marginBottom: '20px'}}>🔒</div>
          <h2 style={{color: '#1f2937', marginBottom: '16px'}}>Acesso Restrito</h2>
          <p style={{color: '#6b7280', marginBottom: '24px'}}>
            Por favor, faça login através do Menu Principal para acessar este programa.
          </p>
          <button
            style={{
              padding: '12px 24px',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
            onClick={() => window.location.href = `http://${window.location.hostname}:3000`}
          >
            Ir para Menu Principal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div
          style={styles.logo}
          onClick={() => window.location.href = `http://${window.location.hostname}:3000`}
          title="Voltar ao Menu Principal"
        >📦</div>
        <div style={styles.headerText}>
          <h1 style={styles.title}>Pedidos IVOLV</h1>
          <p style={styles.lead}>Busque pelo número do pedido (cNumPedido)</p>
        </div>
        <button
          onClick={sincronizarAjustesEstoque}
          disabled={sincAjustes.sincronizando}
          style={{
            width: '40px', height: '40px', borderRadius: '8px',
            background: darkMode ? '#374151' : '#f3f4f6',
            border: 'none',
            cursor: sincAjustes.sincronizando ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.2s',
            color: darkMode ? '#d1d5db' : '#4b5563'
          }}
          title={sincAjustes.sincronizando ? 'Sincronizando ajustes...' : 'Sincronizar ajustes de estoque (Omie)'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{animation: sincAjustes.sincronizando ? 'spin 1s linear infinite' : 'none'}}>
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
        <button
          onClick={() => setDarkMode(!darkMode)}
          style={{
            width: '40px', height: '40px', borderRadius: '8px',
            background: darkMode ? '#374151' : '#f3f4f6',
            border: 'none', cursor: 'pointer', fontSize: '18px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.2s'
          }}
          title={darkMode ? 'Modo claro' : 'Modo escuro'}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
      </header>

      {(sincAjustes.sincronizando || sincAjustes.mensagem) && (
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto 12px',
          padding: '6px 12px',
          fontSize: '12px',
          color: sincAjustes.erro ? (darkMode ? '#fca5a5' : '#b91c1c') : (darkMode ? '#9ca3af' : '#64748b'),
          background: darkMode ? '#1f2937' : '#f8fafc',
          border: `1px solid ${darkMode ? '#374151' : '#e2e8f0'}`,
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          lineHeight: 1.4
        }}>
          {sincAjustes.sincronizando && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{animation: 'spin 1s linear infinite', flexShrink: 0}}>
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          )}
          <span>
            {sincAjustes.sincronizando && sincAjustes.totalPaginas > 0
              ? `Sincronizando ajustes — página ${sincAjustes.paginaAtual}/${sincAjustes.totalPaginas} · ${sincAjustes.registrosSalvos} registros salvos`
              : (sincAjustes.mensagem || (sincAjustes.sincronizando ? 'Sincronizando ajustes...' : ''))}
          </span>
          {!sincAjustes.sincronizando && sincAjustes.mensagem && (
            <button
              onClick={() => setSincAjustes(s => ({ ...s, mensagem: '', erro: null }))}
              title="Fechar"
              style={{
                marginLeft: 'auto', background: 'transparent', border: 'none',
                cursor: 'pointer', color: 'inherit', padding: '2px 6px',
                fontSize: '14px', lineHeight: 1
              }}
            >×</button>
          )}
        </div>
      )}

      {/* Navegação por abas */}
      <div style={styles.tabsContainer}>
        <div
          style={{
            ...styles.tab,
            ...(abaAtiva === 'pesquisar' ? styles.tabActive : {})
          }}
          onClick={() => setAbaAtiva('pesquisar')}
        >
          🔍 Pesquisar
        </div>
        <div
          style={{
            ...styles.tab,
            ...(abaAtiva === 'emAndamento' ? styles.tabActive : {})
          }}
          onClick={() => setAbaAtiva('emAndamento')}
        >
          ⏳ Em Andamento
          {itensPendentes.length > 0 && (() => {
            const pedidosUnicos = new Set(itensPendentes.map(item => item.num_pedido));
            return (
              <span style={{
                marginLeft: '8px',
                background: '#ef4444',
                color: 'white',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: '700'
              }}>
                {pedidosUnicos.size}
              </span>
            );
          })()}
        </div>
        <div
          style={{
            ...styles.tab,
            ...(abaAtiva === 'concluidos' ? styles.tabActive : {})
          }}
          onClick={() => setAbaAtiva('concluidos')}
        >
          ✅ Concluídos
          {itensConcluidos.length > 0 && (() => {
            const pedidosUnicos = new Set(itensConcluidos.map(item => item.num_pedido));
            return (
              <span style={{
                marginLeft: '8px',
                background: '#10b981',
                color: 'white',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: '700'
              }}>
                {pedidosUnicos.size}
              </span>
            );
          })()}
        </div>
      </div>

      {/* Conteúdo da aba Pesquisar */}
      {abaAtiva === 'pesquisar' && (
        <>
          <div style={styles.card}>
            <label style={styles.label}>Digite o número do pedido (cNumPedido):</label>
            <div style={styles.row}>
              <input
                type="text"
                value={numPedido}
                onChange={(e) => setNumPedido(e.target.value)}
                style={{...styles.input, flex: 1}}
                placeholder="Ex: 12345"
                onKeyPress={(e) => e.key === 'Enter' && consultarPedido(false)}
              />
              <button
                style={{
                  ...styles.button,
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onClick={() => consultarPedido(false)}
                disabled={loading}
              >
                {loading && (
                  <div style={styles.spinner}></div>
                )}
                {loading ? 'Buscando...' : '🔍 Buscar'}
              </button>
            </div>
          </div>

          {error && (
            <div style={{...styles.alert, borderLeft: '4px solid #ef4444'}}>
              <strong>Erro:</strong> {error}
            </div>
          )}

          {pedidoData && (() => {
            const pedidoConcluido = pedidoData.concluido_manual || (pedidoData.itens && pedidoData.itens.length > 0 && pedidoData.itens.every(i => i.transferido));
            return (
            <>
              <div style={styles.card}>
                <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px'}}>
                  <div style={{flex: '0 0 auto'}}>
                    <h2 style={{...styles.cardTitle, margin: 0, display: 'flex', alignItems: 'center', gap: '8px'}}>
                      P-{pedidoData.num_pedido}
                      <button
                        type="button"
                        title={pedidoCopiado ? 'Copiado!' : 'Copiar número do pedido'}
                        onClick={async () => {
                          const texto = `P-${pedidoData.num_pedido}`;
                          const ok = await copiarTextoCompat(texto);
                          if (ok) {
                            setPedidoCopiado(true);
                            setTimeout(() => setPedidoCopiado(false), 1500);
                          } else {
                            setError('Não foi possível copiar. Selecione o texto manualmente.');
                          }
                        }}
                        onMouseEnter={(e) => {
                          if (!pedidoCopiado) {
                            e.currentTarget.style.background = '#e0e7ff';
                            e.currentTarget.style.color = '#4f46e5';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!pedidoCopiado) {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = '#6b7280';
                          }
                        }}
                        style={{
                          marginLeft: '4px',
                          padding: '6px',
                          background: pedidoCopiado ? '#d1fae5' : 'transparent',
                          color: pedidoCopiado ? '#059669' : '#6b7280',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease, color 0.15s ease',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          lineHeight: 0,
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          {pedidoCopiado ? (
                            <polyline points="20 6 9 17 4 12"></polyline>
                          ) : (
                            <>
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </>
                          )}
                        </svg>
                      </button>
                    </h2>
                  </div>
                  <div style={{flex: 1, display: 'flex', alignItems: 'center', gap: '8px'}}>
                    {pedidoConcluido ? (
                      observacaoPedido && (
                        <div style={{
                          flex: 1,
                          height: '38px',
                          padding: '0 12px',
                          display: 'flex',
                          alignItems: 'center',
                          fontSize: '13px',
                          fontStyle: 'italic',
                          color: darkMode ? '#d1d5db' : '#6b7280',
                          background: darkMode ? '#1f2937' : '#f9fafb',
                          border: darkMode ? '2px solid #374151' : '2px solid #e2e8f0',
                          borderRadius: '8px'
                        }}>
                          Obs: {observacaoPedido}
                        </div>
                      )
                    ) : (
                      <>
                        <input
                          type="text"
                          value={observacaoPedido}
                          onChange={(e) => setObservacaoPedido(e.target.value)}
                          placeholder="Observação do pedido..."
                          style={{
                            flex: 1,
                            height: '38px',
                            padding: '0 12px',
                            border: darkMode ? '2px solid #374151' : '2px solid #e2e8f0',
                            borderRadius: '8px',
                            fontSize: '13px',
                            background: darkMode ? '#1f2937' : '#fff',
                            color: darkMode ? '#f3f4f6' : '#1f2937',
                            outline: 'none'
                          }}
                          onKeyPress={(e) => e.key === 'Enter' && salvarObservacao()}
                        />
                        <button
                          style={{
                            ...styles.button,
                            background: '#10b981',
                            padding: '8px 14px',
                            opacity: salvandoObs ? 0.7 : 1,
                            cursor: salvandoObs ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            whiteSpace: 'nowrap'
                          }}
                          onClick={salvarObservacao}
                          disabled={salvandoObs}
                        >
                          {salvandoObs ? '💾 Salvando...' : '💾 Salvar'}
                        </button>
                      </>
                    )}
                  </div>
                  {!pedidoConcluido && (
                    <button
                      style={{
                        ...styles.button,
                        background: '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        whiteSpace: 'nowrap',
                        flex: '0 0 auto'
                      }}
                      onClick={concluirPedido}
                    >
                      ✅ Concluir
                    </button>
                  )}
                  <button
                    style={{
                      ...styles.button,
                      background: '#2563eb',
                      opacity: loading ? 0.7 : 1,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      whiteSpace: 'nowrap',
                      flex: '0 0 auto'
                    }}
                    onClick={() => consultarPedido(true)}
                    disabled={loading}
                  >
                    {loading && (
                      <div style={styles.spinner}></div>
                    )}
                    {loading ? 'Atualizando...' : '🔄 Atualizar'}
                  </button>
                </div>
              </div>

              <div style={{...styles.card, padding: 0, overflow: 'hidden'}}>
                {pedidoData.itens && pedidoData.itens.length > 0 ? (
                  <div style={{overflowX: 'auto'}}>
                    <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'auto'}}>
                      <thead>
                        <tr style={{background: darkMode ? '#1f2937' : '#f8fafc', borderBottom: darkMode ? '2px solid #374151' : '2px solid #e2e8f0'}}>
                          <th style={{padding: '10px 8px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: darkMode ? '#9ca3af' : '#64748b', minWidth: '150px'}}>Código</th>
                          <th style={{padding: '10px 8px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: darkMode ? '#9ca3af' : '#64748b', minWidth: '220px'}}>Descrição</th>
                          <th style={{padding: '10px 6px', textAlign: 'center', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: darkMode ? '#9ca3af' : '#64748b', width: '50px'}}>QTD</th>
                          <th style={{padding: '10px 8px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: darkMode ? '#9ca3af' : '#64748b', minWidth: '180px'}}>Dados adicionais</th>
                          <th style={{padding: '10px 8px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: darkMode ? '#9ca3af' : '#64748b', cursor: 'pointer', userSelect: 'none', width: '110px'}} onClick={() => {
                            if (ordenar === '') ordenarPor('local_az');
                            else if (ordenar === 'local_az') ordenarPor('local_za');
                            else ordenarPor('');
                          }}>
                            <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                              <span>Local</span>
                              {ordenar === 'local_az' && <span style={{color: '#10b981', fontSize: '14px'}}>↑</span>}
                              {ordenar === 'local_za' && <span style={{color: '#10b981', fontSize: '14px'}}>↓</span>}
                            </div>
                          </th>
                          <th style={{padding: '10px 8px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: darkMode ? '#9ca3af' : '#64748b', minWidth: '140px'}}>PRE-MONTADO</th>
                          <th style={{padding: '8px 6px', textAlign: 'center', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: darkMode ? '#9ca3af' : '#64748b', width: '70px'}}>Separado</th>
                          <th style={{padding: '8px 6px', textAlign: 'center', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: darkMode ? '#9ca3af' : '#64748b', width: '80px'}}>Transferido</th>
                          <th style={{padding: '8px 6px', textAlign: 'center', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: darkMode ? '#9ca3af' : '#64748b', width: '80px'}}>Não Separar</th>
                          <th style={{padding: '8px 6px', textAlign: 'center', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: darkMode ? '#9ca3af' : '#64748b', width: '110px'}}>STATUS RM</th>
                        </tr>
                        <tr style={{background: darkMode ? '#111827' : '#f1f5f9'}}>
                          {[
                            [filtroCodigo, setFiltroCodigo],
                            [filtroDescricao, setFiltroDescricao],
                            [filtroQtd, setFiltroQtd],
                            [filtroDados, setFiltroDados],
                            [filtroLocal, setFiltroLocal],
                            [filtroPreMontado, setFiltroPreMontado],
                          ].map(([val, setter], i) => (
                            <th key={i} style={{padding: '4px 8px'}}>
                              <input
                                type="text"
                                value={val}
                                onChange={(e) => setter(e.target.value)}
                                placeholder="Filtrar..."
                                style={{
                                  width: '100%',
                                  padding: '4px 8px',
                                  border: darkMode ? '1px solid #374151' : '1px solid #d1d5db',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  background: darkMode ? '#1f2937' : '#fff',
                                  color: darkMode ? '#f3f4f6' : '#1f2937',
                                  outline: 'none',
                                  boxSizing: 'border-box'
                                }}
                              />
                            </th>
                          ))}
                          {[
                            [filtroSeparado, setFiltroSeparado],
                            [filtroTransferido, setFiltroTransferido],
                          ].map(([val, setter], i) => (
                            <th key={`flag-${i}`} style={{padding: '4px 8px'}}>
                              <select
                                value={val}
                                onChange={(e) => setter(e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '4px 4px',
                                  border: darkMode ? '1px solid #374151' : '1px solid #d1d5db',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  background: darkMode ? '#1f2937' : '#fff',
                                  color: darkMode ? '#f3f4f6' : '#1f2937',
                                  outline: 'none',
                                  boxSizing: 'border-box',
                                  cursor: 'pointer'
                                }}
                              >
                                <option value="todos">Todos</option>
                                <option value="sim">✓</option>
                                <option value="nao">✗</option>
                              </select>
                            </th>
                          ))}
                          <th style={{padding: '4px 8px'}}></th>
                          <th style={{padding: '4px 8px'}}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pedidoData.itens.filter(item => {
                          const cod = (item.codigo || '').toLowerCase();
                          const desc = (item.descricao || '').toLowerCase();
                          const qtd = String(item.quantidade || '');
                          const dados = String(item.dados_adicionais_item || '').toLowerCase();
                          const local = (item.local || '').toLowerCase();
                          const pre = (item.pre_montado || '').toLowerCase();
                          return (
                            (!filtroCodigo || cod.includes(filtroCodigo.toLowerCase())) &&
                            (!filtroDescricao || desc.includes(filtroDescricao.toLowerCase())) &&
                            (!filtroQtd || qtd.includes(filtroQtd)) &&
                            (!filtroDados || dados.includes(filtroDados.toLowerCase())) &&
                            (!filtroLocal || local.includes(filtroLocal.toLowerCase())) &&
                            (!filtroPreMontado || pre.includes(filtroPreMontado.toLowerCase())) &&
                            (filtroSeparado === 'todos' || (filtroSeparado === 'sim' ? item.separado : !item.separado)) &&
                            (filtroTransferido === 'todos' || (filtroTransferido === 'sim' ? item.transferido : !item.transferido)) &&
                            /\b(teclas?|espelhos?)\b/i.test(item.descricao || '')
                          );
                        }).map((item, idx) => {
                          const temKanban = (item.local || '').toLowerCase().includes('kanban');

                          const rowBg = temKanban
                            ? (darkMode ? '#064e3b' : '#d1fae5')
                            : (idx % 2 === 0
                              ? (darkMode ? '#1f2937' : '#ffffff')
                              : (darkMode ? '#111827' : '#f9fafb'));
                          const rowHoverBg = temKanban
                            ? (darkMode ? '#065f46' : '#a7f3d0')
                            : (darkMode ? '#263244' : '#f1f5f9');
                          const borderColor = darkMode ? '#374151' : '#f1f5f9';
                          const textColor = darkMode ? '#d1d5db' : '#4b5563';
                          const textBold = darkMode ? '#f3f4f6' : '#111827';

                          return (
                            <tr
                              key={idx}
                              style={{background: rowBg, transition: 'background 0.15s'}}
                              onMouseEnter={(e) => e.currentTarget.style.background = rowHoverBg}
                              onMouseLeave={(e) => e.currentTarget.style.background = rowBg}
                            >
                              <td style={{padding: '10px 8px', color: textColor, borderBottom: `1px solid ${borderColor}`, fontWeight: 600}}>{item.codigo || '-'}</td>
                              <td style={{padding: '10px 8px', color: textBold, borderBottom: `1px solid ${borderColor}`, fontWeight: 600}}>{item.descricao || '-'}</td>
                              <td style={{padding: '10px 6px', color: textColor, borderBottom: `1px solid ${borderColor}`, textAlign: 'center', fontWeight: 600}}>{item.quantidade}</td>
                              <td style={{padding: '10px 8px', color: textColor, borderBottom: `1px solid ${borderColor}`}}>
                                {(() => {
                                  const dados = item.dados_adicionais_item || '-';
                                  const limpo = String(dados)
                                    .replace(/\[object Object\]/gi, '')
                                    .replace(/\{\}/g, '')
                                    .replace(/\[\]/g, '')
                                    .replace(/,\s*,/g, ',')
                                    .replace(/^\s*,\s*/, '')
                                    .replace(/\s*,\s*$/, '')
                                    .trim();
                                  return limpo || '-';
                                })()}
                              </td>
                              <td style={{padding: '10px 8px', borderBottom: `1px solid ${borderColor}`, fontWeight: 700, color: temKanban ? (darkMode ? '#6ee7b7' : '#059669') : (darkMode ? '#60a5fa' : '#2563eb')}}>{item.local || '-'}</td>
                              <td style={{padding: '10px 8px', color: textColor, borderBottom: `1px solid ${borderColor}`}}>{item.pre_montado || '-'}</td>
                              <td style={{padding: '8px 6px', textAlign: 'center', borderBottom: `1px solid ${borderColor}`}}>
                                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'}}>
                                  <div
                                    onClick={() => !pedidoConcluido && toggleFlag(pedidoData.pedido_id, item.descricao, 'separado')}
                                    style={{
                                      width: '36px', height: '36px', borderRadius: '50%', cursor: pedidoConcluido ? 'default' : 'pointer',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      opacity: pedidoConcluido ? 0.6 : 1,
                                      background: item.separado ? '#10b981' : (darkMode ? '#374151' : '#e5e7eb'),
                                      border: item.separado ? '2px solid #059669' : (darkMode ? '2px solid #4b5563' : '2px solid #d1d5db'),
                                      transition: 'all 0.2s', boxShadow: item.separado ? '0 2px 8px rgba(16, 185, 129, 0.35)' : 'none'
                                    }}
                                    onMouseEnter={(e) => { if (!pedidoConcluido) { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 3px 12px rgba(0,0,0,0.15)'; }}}
                                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = item.separado ? '0 2px 8px rgba(16, 185, 129, 0.35)' : 'none'; }}
                                  >
                                    {item.separado
                                      ? <span style={{color: 'white', fontSize: '18px', lineHeight: 1}}>✓</span>
                                      : <span style={{color: darkMode ? '#6b7280' : '#9ca3af', fontSize: '14px', lineHeight: 1}}>—</span>
                                    }
                                  </div>
                                  {item.modificado_por && (
                                    <div style={{fontSize: '10px', color: darkMode ? '#9ca3af' : '#6b7280', textAlign: 'center', lineHeight: '1.2'}}>
                                      {item.modificado_por}<br />
                                      {item.modificado_em && new Date(item.modificado_em).toLocaleString('pt-BR', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td style={{padding: '8px 6px', textAlign: 'center', borderBottom: `1px solid ${borderColor}`}}>
                                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'}}>
                                  <div
                                    onClick={() => !pedidoConcluido && toggleFlag(pedidoData.pedido_id, item.descricao, 'transferido')}
                                    style={{
                                      width: '36px', height: '36px', borderRadius: '50%', cursor: pedidoConcluido ? 'default' : 'pointer',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      opacity: pedidoConcluido ? 0.6 : 1,
                                      background: item.transferido ? '#10b981' : (darkMode ? '#374151' : '#e5e7eb'),
                                      border: item.transferido ? '2px solid #059669' : (darkMode ? '2px solid #4b5563' : '2px solid #d1d5db'),
                                      transition: 'all 0.2s', boxShadow: item.transferido ? '0 2px 8px rgba(16, 185, 129, 0.35)' : 'none'
                                    }}
                                    onMouseEnter={(e) => { if (!pedidoConcluido) { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 3px 12px rgba(0,0,0,0.15)'; }}}
                                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = item.transferido ? '0 2px 8px rgba(16, 185, 129, 0.35)' : 'none'; }}
                                  >
                                    {item.transferido
                                      ? <span style={{color: 'white', fontSize: '18px', lineHeight: 1}}>✓</span>
                                      : <span style={{color: darkMode ? '#6b7280' : '#9ca3af', fontSize: '14px', lineHeight: 1}}>—</span>
                                    }
                                  </div>
                                  {item.modificado_por && (
                                    <div style={{fontSize: '10px', color: darkMode ? '#9ca3af' : '#6b7280', textAlign: 'center', lineHeight: '1.2'}}>
                                      {item.modificado_por}<br />
                                      {item.modificado_em && new Date(item.modificado_em).toLocaleString('pt-BR', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td style={{padding: '8px 6px', textAlign: 'center', borderBottom: `1px solid ${borderColor}`}}>
                                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'}}>
                                  <div
                                    onClick={() => !pedidoConcluido && toggleFlag(pedidoData.pedido_id, item.descricao, 'kanban')}
                                    style={{
                                      width: '36px', height: '36px', borderRadius: '50%', cursor: pedidoConcluido ? 'default' : 'pointer',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      opacity: pedidoConcluido ? 0.6 : 1,
                                      background: item.kanban ? '#10b981' : (darkMode ? '#374151' : '#e5e7eb'),
                                      border: item.kanban ? '2px solid #059669' : (darkMode ? '2px solid #4b5563' : '2px solid #d1d5db'),
                                      transition: 'all 0.2s', boxShadow: item.kanban ? '0 2px 8px rgba(16, 185, 129, 0.35)' : 'none'
                                    }}
                                    onMouseEnter={(e) => { if (!pedidoConcluido) { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 3px 12px rgba(0,0,0,0.15)'; }}}
                                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = item.kanban ? '0 2px 8px rgba(16, 185, 129, 0.35)' : 'none'; }}
                                  >
                                    {item.kanban
                                      ? <span style={{color: 'white', fontSize: '18px', lineHeight: 1}}>✓</span>
                                      : <span style={{color: darkMode ? '#6b7280' : '#9ca3af', fontSize: '14px', lineHeight: 1}}>—</span>
                                    }
                                  </div>
                                </div>
                              </td>
                              <td style={{padding: '8px 10px', textAlign: 'center', borderBottom: `1px solid ${borderColor}`, fontWeight: 700, color: item.status_rm ? '#10b981' : textColor, whiteSpace: 'nowrap'}}>
                                {item.status_rm || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={styles.muted}>Nenhum item encontrado</p>
                )}
              </div>
            </>
          );})()}

          {/* Console de Logs e Debug - minimizados no final */}
          {pedidoData && (
            <div style={{...styles.card, padding: 0, overflow: 'hidden'}}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 16px',
                  background: darkMode ? '#1f2937' : '#f8fafc',
                  cursor: 'pointer',
                  borderBottom: mostrarDebug ? (darkMode ? '1px solid #374151' : '1px solid #e2e8f0') : 'none'
                }}
                onClick={() => setMostrarDebug(!mostrarDebug)}
              >
                <span style={{fontSize: '13px', fontWeight: 700, color: darkMode ? '#9ca3af' : '#64748b'}}>
                  {mostrarDebug ? '▼' : '▶'} Console / Resposta API Omie
                </span>
                <div style={{display: 'flex', gap: '8px'}}>
                  {logs.length > 0 && (
                    <button
                      style={{
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        padding: '3px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                      onClick={(e) => { e.stopPropagation(); setLogs([]); }}
                    >
                      Limpar Logs
                    </button>
                  )}
                  <button
                    style={{
                      background: '#374151',
                      color: 'white',
                      border: 'none',
                      padding: '3px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(JSON.stringify(pedidoData, null, 2));
                      alert('JSON copiado para a área de transferência!');
                    }}
                  >
                    Copiar JSON
                  </button>
                </div>
              </div>

              {mostrarDebug && (
                <div style={{padding: '12px 16px'}}>
                  {logs.length > 0 && (
                    <div style={{marginBottom: '12px'}}>
                      <h4 style={{fontSize: '12px', fontWeight: 700, margin: '0 0 8px 0', color: darkMode ? '#9ca3af' : '#64748b'}}>Logs</h4>
                      <div style={{
                        background: '#1f2937',
                        borderRadius: '8px',
                        padding: '10px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                        fontSize: '11px'
                      }}>
                        {logs.map((log, idx) => (
                          <div key={idx} style={{
                            color: log.tipo === 'error' ? '#ef4444' : log.tipo === 'success' ? '#10b981' : '#d1d5db',
                            marginBottom: '4px',
                            lineHeight: '1.4'
                          }}>
                            <span style={{ color: '#6b7280' }}>[{log.timestamp}]</span> {log.mensagem}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 style={{fontSize: '12px', fontWeight: 700, margin: '0 0 8px 0', color: darkMode ? '#9ca3af' : '#64748b'}}>Resposta Completa da API Omie</h4>
                    <div style={{
                      background: '#1f2937',
                      borderRadius: '8px',
                      padding: '10px',
                      maxHeight: '300px',
                      overflowY: 'auto'
                    }}>
                      <pre style={{
                        margin: 0,
                        color: '#d1d5db',
                        fontSize: '11px',
                        fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                        whiteSpace: 'pre-wrap',
                        wordWrap: 'break-word',
                        lineHeight: '1.4'
                      }}>
                        {JSON.stringify(pedidoData, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Conteúdo da aba Em Andamento */}
      {abaAtiva === 'emAndamento' && (
        <div style={styles.card}>
          <div style={{marginBottom: '20px'}}>
            <h2 style={styles.cardTitle}>Pedidos em Andamento</h2>
            <p style={styles.muted}>Pedidos com itens ainda não transferidos completamente</p>

            {/* Campo de pesquisa */}
            <div style={{marginTop: '16px'}}>
              <input
                type="text"
                value={termoPesquisa}
                onChange={(e) => setTermoPesquisa(e.target.value)}
                placeholder="🔍 Pesquisa universal - busca em Em Andamento e Concluídos..."
                style={{
                  ...styles.input,
                  marginBottom: 0,
                  fontSize: '13px'
                }}
              />
            </div>
          </div>

          {(() => {
            const pendentesFiltr = filtrarPedidos(itensPendentes);
            const concluidosFiltr = termoPesquisa ? filtrarPedidos(itensConcluidos) : [];
            const temResultados = pendentesFiltr.length > 0 || concluidosFiltr.length > 0;

            if (!temResultados) {
              return (
                <div style={{textAlign: 'center', padding: '40px', color: '#6b7280'}}>
                  <div style={{fontSize: '48px', marginBottom: '16px'}}>
                    {termoPesquisa ? '🔍' : '✅'}
                  </div>
                  <p>{termoPesquisa ? 'Nenhum resultado encontrado' : 'Nenhum pedido pendente'}</p>
                </div>
              );
            }

            return (
              <div style={{marginTop: '20px'}}>
                {/* Resultados de Em Andamento */}
                {pendentesFiltr.length > 0 && (
                  <>
                    {termoPesquisa && (
                      <h3 style={{fontSize: '14px', fontWeight: '700', color: '#ef4444', marginBottom: '12px'}}>
                        ⏳ Em Andamento ({pendentesFiltr.length})
                      </h3>
                    )}
                    {pendentesFiltr.map((pedido, idx) => {
                const totalItens = pedido.itens.length;
                const itensTransferidos = pedido.itens.filter(i => i.transferido).length;
                const percentual = Math.round((itensTransferidos / totalItens) * 100);

                return (
                  <div
                    key={idx}
                    style={{
                      background: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '16px',
                      marginBottom: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onClick={() => abrirPedido(pedido.num_pedido)}
                    onMouseOver={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                      e.currentTarget.style.borderColor = '#2563eb';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.borderColor = '#e5e7eb';
                    }}
                  >
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <div onClick={() => abrirPedido(pedido.num_pedido)} style={{flex: 1, cursor: 'pointer'}}>
                        <div style={{fontSize: '16px', fontWeight: '700', color: '#1f2937', marginBottom: '4px'}}>
                          Pedido P-{pedido.num_pedido}
                        </div>
                        <div style={{fontSize: '13px', color: '#6b7280'}}>
                          {itensTransferidos} de {totalItens} itens transferidos ({percentual}%)
                        </div>
                        {pedido.observacao && (
                          <div style={{fontSize: '12px', color: darkMode ? '#d1d5db' : '#6b7280', marginTop: '4px', fontStyle: 'italic'}}>
                            Obs: {pedido.observacao}
                          </div>
                        )}
                      </div>
                      <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                        <div style={{
                          background: percentual === 100 ? '#10b981' : '#ef4444',
                          color: 'white',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: '600'
                        }}>
                          {percentual}%
                        </div>
                        <button
                          style={{
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            cursor: 'pointer',
                            fontSize: '18px',
                            transition: 'all 0.2s ease'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            deletarPedido(pedido.pedido_id, pedido.num_pedido);
                          }}
                          onMouseOver={(e) => e.target.style.background = '#dc2626'}
                          onMouseOut={(e) => e.target.style.background = '#ef4444'}
                          title="Excluir pedido do banco de dados"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
                  </>
                )}

                {/* Resultados de Concluídos */}
                {concluidosFiltr.length > 0 && (
                  <>
                    {termoPesquisa && (
                      <h3 style={{fontSize: '14px', fontWeight: '700', color: '#10b981', marginTop: '24px', marginBottom: '12px'}}>
                        ✅ Concluídos ({concluidosFiltr.length})
                      </h3>
                    )}
                    {concluidosFiltr.map((pedido, idx) => (
                      <div
                        key={`concluido-${idx}`}
                        style={{
                          background: darkMode ? '#064e3b' : '#f0fdf4',
                          border: darkMode ? '1px solid #065f46' : '1px solid #86efac',
                          borderRadius: '8px',
                          padding: '16px',
                          marginBottom: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onClick={() => abrirPedido(pedido.num_pedido)}
                        onMouseOver={(e) => {
                          e.currentTarget.style.boxShadow = darkMode ? '0 4px 12px rgba(16, 185, 129, 0.3)' : '0 4px 12px rgba(16, 185, 129, 0.2)';
                          e.currentTarget.style.borderColor = '#10b981';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.boxShadow = 'none';
                          e.currentTarget.style.borderColor = darkMode ? '#065f46' : '#86efac';
                        }}
                      >
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                          <div>
                            <div style={{fontSize: '16px', fontWeight: '700', color: darkMode ? '#f3f4f6' : '#1f2937', marginBottom: '4px'}}>
                              Pedido {pedido.num_pedido}
                            </div>
                            <div style={{fontSize: '13px', color: darkMode ? '#6ee7b7' : '#059669'}}>
                              {pedido.itens.length} itens - 100% transferidos ✓
                            </div>
                            <div style={{fontSize: '11px', color: darkMode ? '#9ca3af' : '#6b7280', marginTop: '4px', display: 'flex', gap: '16px', flexWrap: 'wrap'}}>
                              {pedido.criado_em && (
                                <span>Adicionado: {new Date(pedido.criado_em).toLocaleString('pt-BR')} por {pedido.criado_por || '-'}</span>
                              )}
                              {pedido.concluido_em && (
                                <span>Concluido: {new Date(pedido.concluido_em).toLocaleString('pt-BR')} por {pedido.concluido_por || '-'}</span>
                              )}
                            </div>
                            {pedido.observacao && (
                              <div style={{fontSize: '12px', color: darkMode ? '#d1d5db' : '#6b7280', marginTop: '4px', fontStyle: 'italic'}}>
                                Obs: {pedido.observacao}
                              </div>
                            )}
                          </div>
                          <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                            <div style={{
                              background: '#10b981',
                              color: 'white',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              fontSize: '13px',
                              fontWeight: '600'
                            }}>
                              100%
                            </div>
                            <button
                              style={{
                                background: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '6px 12px',
                                cursor: 'pointer',
                                fontSize: '18px',
                                transition: 'all 0.2s ease'
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                deletarPedido(pedido.pedido_id, pedido.num_pedido);
                              }}
                              onMouseOver={(e) => e.target.style.background = '#dc2626'}
                              onMouseOut={(e) => e.target.style.background = '#ef4444'}
                              title="Excluir pedido do banco de dados"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Conteúdo da aba Concluídos */}
      {/* (aba Concluídos usa a mesma lógica abaixo - botão reverter visível apenas para admin) */}
      {abaAtiva === 'concluidos' && (
        <div style={styles.card}>
          <div style={{marginBottom: '20px'}}>
            <h2 style={styles.cardTitle}>Pedidos Concluídos</h2>
            <p style={styles.muted}>Pedidos com 100% dos itens transferidos</p>

            {/* Campo de pesquisa */}
            <div style={{marginTop: '16px'}}>
              <input
                type="text"
                value={termoPesquisa}
                onChange={(e) => setTermoPesquisa(e.target.value)}
                placeholder="🔍 Pesquisa universal - busca em Em Andamento e Concluídos..."
                style={{
                  ...styles.input,
                  marginBottom: 0,
                  fontSize: '13px'
                }}
              />
            </div>
          </div>

          {(() => {
            const concluidosFiltr = filtrarPedidos(itensConcluidos);
            const pendentesFiltr = termoPesquisa ? filtrarPedidos(itensPendentes) : [];
            const temResultados = concluidosFiltr.length > 0 || pendentesFiltr.length > 0;

            if (!temResultados) {
              return (
                <div style={{textAlign: 'center', padding: '40px', color: '#6b7280'}}>
                  <div style={{fontSize: '48px', marginBottom: '16px'}}>
                    {termoPesquisa ? '🔍' : '📋'}
                  </div>
                  <p>{termoPesquisa ? 'Nenhum resultado encontrado' : 'Nenhum pedido concluído'}</p>
                </div>
              );
            }

            return (
              <div style={{marginTop: '20px'}}>
                {/* Resultados de Concluídos */}
                {concluidosFiltr.length > 0 && (
                  <>
                    {termoPesquisa && (
                      <h3 style={{fontSize: '14px', fontWeight: '700', color: '#10b981', marginBottom: '12px'}}>
                        ✅ Concluídos ({concluidosFiltr.length})
                      </h3>
                    )}
                    {concluidosFiltr.map((pedido, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: darkMode ? '#064e3b' : '#f0fdf4',
                          border: darkMode ? '1px solid #065f46' : '1px solid #86efac',
                          borderRadius: '8px',
                          padding: '16px',
                          marginBottom: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onClick={() => abrirPedido(pedido.num_pedido)}
                        onMouseOver={(e) => {
                          e.currentTarget.style.boxShadow = darkMode ? '0 4px 12px rgba(16, 185, 129, 0.3)' : '0 4px 12px rgba(16, 185, 129, 0.2)';
                          e.currentTarget.style.borderColor = '#10b981';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.boxShadow = 'none';
                          e.currentTarget.style.borderColor = darkMode ? '#065f46' : '#86efac';
                        }}
                      >
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                          <div>
                            <div style={{fontSize: '16px', fontWeight: '700', color: darkMode ? '#f3f4f6' : '#1f2937', marginBottom: '4px'}}>
                              Pedido {pedido.num_pedido}
                            </div>
                            <div style={{fontSize: '13px', color: darkMode ? '#6ee7b7' : '#059669'}}>
                              {pedido.itens.length} itens - 100% transferidos ✓
                            </div>
                            <div style={{fontSize: '11px', color: darkMode ? '#9ca3af' : '#6b7280', marginTop: '4px', display: 'flex', gap: '16px', flexWrap: 'wrap'}}>
                              {pedido.criado_em && (
                                <span>Adicionado: {new Date(pedido.criado_em).toLocaleString('pt-BR')} por {pedido.criado_por || '-'}</span>
                              )}
                              {pedido.concluido_em && (
                                <span>Concluido: {new Date(pedido.concluido_em).toLocaleString('pt-BR')} por {pedido.concluido_por || '-'}</span>
                              )}
                            </div>
                            {pedido.observacao && (
                              <div style={{fontSize: '12px', color: darkMode ? '#d1d5db' : '#6b7280', marginTop: '4px', fontStyle: 'italic'}}>
                                Obs: {pedido.observacao}
                              </div>
                            )}
                          </div>
                          <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                            <div style={{
                              background: '#10b981',
                              color: 'white',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              fontSize: '13px',
                              fontWeight: '600'
                            }}>
                              100%
                            </div>
                            {obterUsuarioLogado().tipo === 'admin' && (
                              <button
                                style={{
                                  background: '#f59e0b',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '6px 12px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  transition: 'all 0.2s ease'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  reverterConclusao(pedido.pedido_id, pedido.num_pedido);
                                }}
                                onMouseOver={(e) => e.target.style.background = '#d97706'}
                                onMouseOut={(e) => e.target.style.background = '#f59e0b'}
                                title="Reverter conclusão - voltar para Em Andamento"
                              >
                                ↩ Reverter
                              </button>
                            )}
                            <button
                              style={{
                                background: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '6px 12px',
                                cursor: 'pointer',
                                fontSize: '18px',
                                transition: 'all 0.2s ease'
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                deletarPedido(pedido.pedido_id, pedido.num_pedido);
                              }}
                              onMouseOver={(e) => e.target.style.background = '#dc2626'}
                              onMouseOut={(e) => e.target.style.background = '#ef4444'}
                              title="Excluir pedido do banco de dados"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Resultados de Em Andamento */}
                {pendentesFiltr.length > 0 && (
                  <>
                    {termoPesquisa && (
                      <h3 style={{fontSize: '14px', fontWeight: '700', color: '#ef4444', marginTop: '24px', marginBottom: '12px'}}>
                        ⏳ Em Andamento ({pendentesFiltr.length})
                      </h3>
                    )}
                    {pendentesFiltr.map((pedido, idx) => {
                      const totalItens = pedido.itens.length;
                      const itensTransferidos = pedido.itens.filter(i => i.transferido).length;
                      const percentual = Math.round((itensTransferidos / totalItens) * 100);

                      return (
                        <div
                          key={`pendente-${idx}`}
                          style={{
                            background: '#f9fafb',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            padding: '16px',
                            marginBottom: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onClick={() => abrirPedido(pedido.num_pedido)}
                          onMouseOver={(e) => {
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                            e.currentTarget.style.borderColor = '#2563eb';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.boxShadow = 'none';
                            e.currentTarget.style.borderColor = '#e5e7eb';
                          }}
                        >
                          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                            <div>
                              <div style={{fontSize: '16px', fontWeight: '700', color: '#1f2937', marginBottom: '4px'}}>
                                Pedido P-{pedido.num_pedido}
                              </div>
                              <div style={{fontSize: '13px', color: '#6b7280'}}>
                                {itensTransferidos} de {totalItens} itens transferidos ({percentual}%)
                              </div>
                            </div>
                            <div style={{
                              background: percentual === 100 ? '#10b981' : '#ef4444',
                              color: 'white',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              fontSize: '13px',
                              fontWeight: '600'
                            }}>
                              {percentual}%
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

const getStyles = (dark) => ({
  container: {
    minHeight: '100vh',
    background: dark ? '#111827' : 'linear-gradient(180deg, #f8fbff 0%, #f6f8fb 100%)',
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    padding: '32px 20px',
    color: dark ? '#f3f4f6' : 'inherit',
    transition: 'background 0.3s, color 0.3s'
  },
  header: {
    maxWidth: '1400px',
    margin: '0 auto 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap'
  },
  tabsContainer: {
    maxWidth: '1400px',
    margin: '0 auto 20px',
    display: 'flex',
    gap: '8px',
    borderBottom: dark ? '2px solid #374151' : '2px solid #e5e7eb',
    paddingBottom: '0'
  },
  tab: {
    padding: '12px 24px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    color: dark ? '#9ca3af' : '#6b7280',
    borderBottom: '3px solid transparent',
    transition: 'all 0.2s',
    userSelect: 'none',
    display: 'flex',
    alignItems: 'center'
  },
  tabActive: {
    color: '#2563eb',
    borderBottom: '3px solid #2563eb',
    background: 'rgba(37, 99, 235, 0.05)'
  },
  logo: {
    width: '56px',
    height: '56px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontWeight: '700',
    fontSize: '18px',
    boxShadow: '0 6px 20px rgba(37, 99, 235, 0.18)',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s'
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1
  },
  title: {
    fontSize: '20px',
    margin: 0,
    color: dark ? '#f3f4f6' : '#0f172a'
  },
  lead: {
    margin: 0,
    color: dark ? '#9ca3af' : '#6b7280',
    fontSize: '13px'
  },
  configBtn: {
    background: '#1f2937',
    color: 'white',
    padding: '8px 12px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600'
  },
  card: {
    maxWidth: '1400px',
    margin: '0 auto 16px',
    background: dark ? '#1f2937' : '#ffffff',
    borderRadius: '12px',
    boxShadow: dark ? '0 6px 18px rgba(0, 0, 0, 0.3)' : '0 6px 18px rgba(16, 24, 40, 0.08)',
    padding: '24px'
  },
  alert: {
    maxWidth: '1400px',
    margin: '0 auto 16px',
    background: dark ? '#1e3a5f' : '#eef3ff',
    borderLeft: '4px solid #2563eb',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '14px',
    color: dark ? '#93c5fd' : 'inherit'
  },
  label: {
    display: 'block',
    fontSize: '13px',
    color: dark ? '#9ca3af' : '#6b7280',
    marginBottom: '8px',
    fontWeight: '600'
  },
  input: {
    border: dark ? '2px solid #4b5563' : '2px solid #e5e7eb',
    padding: '12px 14px',
    borderRadius: '8px',
    fontSize: '14px',
    width: '100%',
    marginBottom: '10px',
    transition: 'border-color 0.2s',
    outline: 'none',
    background: dark ? '#374151' : '#ffffff',
    color: dark ? '#f3f4f6' : '#111827'
  },
  row: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center'
  },
  button: {
    background: '#2563eb',
    color: 'white',
    padding: '12px 18px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
    transition: 'background 0.2s',
    whiteSpace: 'nowrap'
  },
  cardTitle: {
    fontSize: '20px',
    margin: '0 0 8px 0',
    color: dark ? '#f3f4f6' : '#0f172a',
    fontWeight: '700'
  },
  muted: {
    color: dark ? '#9ca3af' : '#6b7280',
    fontSize: '13px',
    margin: 0
  },
  tableContainer: {
    overflowX: 'auto',
    overflowY: 'hidden',
    marginTop: '20px',
    border: dark ? '1px solid #374151' : '1px solid #e5e7eb',
    borderRadius: '8px'
  },
  table: {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
    fontSize: '13px',
    minWidth: '1200px'
  },
  th: {
    background: dark ? '#1f2937' : 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
    padding: '14px 16px',
    textAlign: 'left',
    fontWeight: '700',
    fontSize: '12px',
    color: dark ? '#9ca3af' : '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: dark ? '2px solid #374151' : '2px solid #e2e8f0',
    position: 'sticky',
    top: 0,
    whiteSpace: 'nowrap'
  },
  td: {
    padding: '14px 16px',
    borderBottom: dark ? '1px solid #374151' : '1px solid #e5e7eb',
    color: dark ? '#d1d5db' : '#4b5563',
    fontSize: '13px',
    lineHeight: '1.5',
    maxWidth: '300px',
    wordWrap: 'break-word'
  },
  sortHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    justifyContent: 'flex-start'
  },
  sortBtn: {
    border: 'none',
    padding: '6px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: '600',
    transition: 'all 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  flagBtn: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
    transition: 'transform 0.1s, box-shadow 0.2s',
    minWidth: '45px'
  },
  spinner: {
    border: '3px solid rgba(255, 255, 255, 0.3)',
    borderTop: '3px solid white',
    borderRadius: '50%',
    width: '16px',
    height: '16px',
    animation: 'spin 0.8s linear infinite'
  }
});

// Adiciona animação CSS
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  header > div:first-child:hover {
    transform: scale(1.05);
    box-shadow: 0 8px 25px rgba(37, 99, 235, 0.3) !important;
  }
`;
document.head.appendChild(styleSheet);

export default App;
