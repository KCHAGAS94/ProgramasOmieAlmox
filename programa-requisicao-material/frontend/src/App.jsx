import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Package, Sun, Moon, Lock, ClipboardList, PlusCircle, Search,
  Check, X, Trash2, PackageCheck, ClipboardCheck, Bell, ChevronLeft,
  ChevronRight, Loader2, MailOpen, Wrench, AlertTriangle, History, Clock
} from 'lucide-react';

// Detecta automaticamente o hostname para funcionar em qualquer rede
const API_BASE = `http://${window.location.hostname}:4011/api`;

// Função para obter usuário logado do localStorage
const obterUsuarioLogado = () => {
  try {
    const usuarioStr = localStorage.getItem('usuario');
    if (usuarioStr) {
      const usuario = JSON.parse(usuarioStr);
      return {
        nome: usuario.nome || 'Usuário',
        email: usuario.email || '',
        tipo: usuario.tipo || 'operador',
        almoxarifado: usuario.almoxarifado === true
      };
    }

    const token = localStorage.getItem('token');
    if (!token) return { nome: 'Usuário Desconhecido', email: '', tipo: 'operador', almoxarifado: false };

    const payloadBase64 = token.split('.')[1];
    const payload = JSON.parse(atob(payloadBase64));
    return {
      nome: payload.email?.split('@')[0] || 'Usuário',
      email: payload.email || '',
      tipo: payload.tipo || 'operador',
      almoxarifado: payload.almoxarifado === true
    };
  } catch (error) {
    return { nome: 'Usuário Desconhecido', email: '', tipo: 'operador', almoxarifado: false };
  }
};

function App() {
  const [autenticado, setAutenticado] = useState(false);
  const [requisicoes, setRequisicoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState('lista'); // 'lista' ou 'nova'
  const [usuarioLogado, setUsuarioLogado] = useState(null);
  const [modalEntrega, setModalEntrega] = useState(false);
  const [requisicaoEntrega, setRequisicaoEntrega] = useState(null);
  const [quantidadesEntrega, setQuantidadesEntrega] = useState({});
  // Ajuste de requisição reprovada (somente o solicitante que criou)
  const [modalAjuste, setModalAjuste] = useState(false);
  const [requisicaoAjuste, setRequisicaoAjuste] = useState(null);
  const [itensAjuste, setItensAjuste] = useState([]);
  const [motivoAjuste, setMotivoAjuste] = useState('');
  const [opAjuste, setOpAjuste] = useState('');
  const [salvandoAjuste, setSalvandoAjuste] = useState(false);
  // Histórico imutável da requisição
  const [modalHistorico, setModalHistorico] = useState(false);
  const [requisicaoHistorico, setRequisicaoHistorico] = useState(null);
  // Filtro de situação (único): pendentes | aprovadas | entregues | rejeitadas | todas
  const [filtroSituacao, setFiltroSituacao] = useState('pendentes');
  const [busca, setBusca] = useState('');
  const [paginaAtual, setPaginaAtual] = useState(1);
  const ITENS_POR_PAGINA = 20;
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true';
    }
    return false;
  });

  // Sistema de notificações
  const [notificacao, setNotificacao] = useState(null);
  const [ultimaVerificacao, setUltimaVerificacao] = useState(Date.now());

  // Formulário de nova requisição
  const [produtoBusca, setProdutoBusca] = useState('');
  const [produtoSelecionado, setProdutoSelecionado] = useState(null);
  const [quantidade, setQuantidade] = useState('');
  const [itensAdicionados, setItensAdicionados] = useState([]);
  const [motivo, setMotivo] = useState('');
  const [ordemProducao, setOrdemProducao] = useState('');
  const [produtosSugeridos, setProdutosSugeridos] = useState([]);
  const [buscandoProdutos, setBuscandoProdutos] = useState(false);

  // Dark mode toggle
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

    if (token && usuario) {
      setAutenticado(true);
      setUsuarioLogado(obterUsuarioLogado());
    }
  }, []);

  // Carrega requisições ao autenticar
  useEffect(() => {
    if (autenticado) {
      carregarRequisicoes();
    }
  }, [autenticado]);

  // Sistema de notificações em tempo real (polling a cada 30 segundos)
  useEffect(() => {
    if (!autenticado || !usuarioLogado) return;

    // Só verifica para usuários com permissão de almoxarifado
    if (usuarioLogado.tipo !== 'admin' && !usuarioLogado.almoxarifado) return;

    const verificarNovasRequisicoes = async () => {
      try {
        const response = await axios.get(`${API_BASE}/requisicoes`);
        const requisicoes = response.data.requisicoes || [];

        // Filtra requisições pendentes criadas após a última verificação
        const novasPendentes = requisicoes.filter(req => {
          const dataSolicitacao = new Date(req.data_solicitacao).getTime();
          return req.status === 'pendente' && dataSolicitacao > ultimaVerificacao;
        });

        if (novasPendentes.length > 0) {
          // Toca som de notificação (beep nativo do browser)
          const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGS57OihUBELTKXh8bllHAU2jdXu0HwwBSh+zPDckjwIF2K67OmkUxELTKXh8bllHAU1jdXu0XwwBSh+zPDckjwKF2O77O2mVRQMUKvl87VpIAU9k9j01IEyByt5yO/bjjsIF2K67OmkUxELTKXh8bllHAU1jdXu0XwwBSh+zPDckjwKF2O77O2mVRQMUKvl87VpIAU9k9j01IEyByt5yO/bjjsIGGS57OihUBELTKXh8bllHAU2jdXu0HwwBSh+zPDckjwIF2K67OmkUxELTKXh8bllHAU1jdXu0XwwBSh+zPDckjwKF2O77O2mVRQMUKvl87VpIAU9k9j01IEyByt5yO/bjjsIF2K67OmkUxELTKXh8bllHAU1jdXu0XwwBSh+zPDckjwKF2O77O2mVRQMUKvl87VpIAU9k9j01IEyByt5yO/bjjsIGGS57OihUBELTKXh8bllHAU2jdXu0HwwBSh+zPDckjwIF2K67OmkUxELTKXh8bllHAU1jdXu0XwwBSh+zPDckjwKF2O77O2mVRQMUKvl87VpIAU9k9j01IEyByt5yO/bjjsIF2K67OmkUxELTKXh8bllHAU1jdXu0XwwBSh+zPDckjwKF2O77O2mVRQMUKvl87VpIAU9k9j01IEyByt5yO/bjjsIGGS57OihUBELTKXh8bllHAU2jdXu0HwwBSh+zPDckjwIF2K67OmkUxELTKXh8bllHAU1jdXu0XwwBSh+zPDckjwKF2O77O2mVRQMUKvl87VpIAU9k9j01IEyByt5yO/bjjsIF2K67OmkUxELTKXh8bllHAU1jdXu0XwwBSh+zPDckjwKF2O77O2mVRQMUKvl87VpIAU9k9j01IEyByt5yO/bjjsIGGS57OihUBELTKXh8bllHAU2jdXu0HwwBSh+zPDckjwIF2K67OmkUxELTKXh8bllHAU1jdXu0XwwBSh+zPDckjwKF2O77O2mVRQMUKvl87VpIAU9k9j01IEyByt5yO/bjjsIF2K67OmkUxELTKXh8bllHAU1jdXu0XwwBSh+zPDckjwKF2O77O2mVRQMUKvl87VpIAU9k9j01IEyByt5yO/bjjs=');
          audio.play().catch(() => {}); // Ignora erro se navegador bloquear áudio

          setNotificacao({
            quantidade: novasPendentes.length,
            requisicoes: novasPendentes
          });

          // Atualiza a lista de requisições
          setRequisicoes(requisicoes);
        }

        setUltimaVerificacao(Date.now());
      } catch (error) {
        console.error('Erro ao verificar novas requisições:', error);
      }
    };

    // Verifica imediatamente
    verificarNovasRequisicoes();

    // Configura verificação periódica a cada 30 segundos
    const intervalo = setInterval(verificarNovasRequisicoes, 30000);

    return () => clearInterval(intervalo);
  }, [autenticado, usuarioLogado, ultimaVerificacao]);

  const carregarRequisicoes = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_BASE}/requisicoes`);
      setRequisicoes(response.data.requisicoes || []);
    } catch (error) {
      setError(error.response?.data?.error || error.message);
    } finally {
      setLoading(false);
    }
  };

  const buscarProdutos = async (busca) => {
    if (!busca || busca.length < 2) {
      setProdutosSugeridos([]);
      return;
    }

    setBuscandoProdutos(true);
    try {
      const response = await axios.get(`${API_BASE}/produtos`, {
        params: { busca }
      });

      // Filtrar apenas produtos que começam com "CA-"
      const produtosFiltrados = (response.data.produtos || []).filter(produto =>
        produto.codigo && produto.codigo.toUpperCase().startsWith('CA-')
      );

      setProdutosSugeridos(produtosFiltrados);
    } catch (error) {
      console.error('Erro ao buscar produtos:', error);
      setProdutosSugeridos([]);
    } finally {
      setBuscandoProdutos(false);
    }
  };

  const handleProdutoBuscaChange = (e) => {
    const valor = e.target.value;
    setProdutoBusca(valor);
    buscarProdutos(valor);
  };

  const selecionarProduto = async (produto) => {
    // Busca modelo atualizado da API Omie se tiver codigo_produto
    let modeloAtualizado = produto.modelo || '';

    if (produto.codigo_produto) {
      try {
        console.log(`Buscando modelo do produto ${produto.codigo_produto} na API Omie...`);
        const response = await axios.get(`${API_BASE}/produtos/${produto.codigo_produto}`);

        if (response.data.success && response.data.modelo) {
          modeloAtualizado = response.data.modelo;
          console.log(`Modelo encontrado: ${modeloAtualizado}`);
        }
      } catch (error) {
        console.warn('Erro ao buscar modelo da Omie, usando modelo do cache:', error);
        // Em caso de erro, usa o modelo do cache local
      }
    }

    // Atualiza o produto selecionado com o modelo mais recente
    setProdutoSelecionado({
      ...produto,
      modelo: modeloAtualizado
    });

    setProdutoBusca(`${produto.codigo} - ${produto.descricao}`);
    setProdutosSugeridos([]);
  };

  const adicionarItem = () => {
    if (!produtoSelecionado) {
      setError('Selecione um produto da lista');
      return;
    }

    if (!quantidade || Number(quantidade) <= 0) {
      setError('Digite uma quantidade válida');
      return;
    }

    // Verifica se o produto já foi adicionado
    const jaAdicionado = itensAdicionados.find(item => item.produto_codigo === produtoSelecionado.codigo);
    if (jaAdicionado) {
      setError('Este produto já foi adicionado');
      return;
    }

    const novoItem = {
      produto_codigo: produtoSelecionado.codigo,
      produto_descricao: produtoSelecionado.descricao,
      produto_modelo: produtoSelecionado.modelo || '',
      quantidade: Number(quantidade)
    };

    setItensAdicionados([...itensAdicionados, novoItem]);

    // Limpa campos do produto
    setProdutoBusca('');
    setProdutoSelecionado(null);
    setQuantidade('');
    setError('');
  };

  const removerItem = (produtoCodigo) => {
    setItensAdicionados(itensAdicionados.filter(item => item.produto_codigo !== produtoCodigo));
  };

  const criarRequisicao = async (e) => {
    e.preventDefault();

    if (itensAdicionados.length === 0) {
      setError('Adicione pelo menos um item à requisição');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await axios.post(`${API_BASE}/requisicoes`, {
        itens: itensAdicionados,
        motivo,
        ordem_producao: ordemProducao,
        solicitante_nome: usuarioLogado.nome,
        solicitante_email: usuarioLogado.email
      });

      alert('Requisição criada com sucesso!');

      // Limpa formulário
      setProdutoBusca('');
      setProdutoSelecionado(null);
      setQuantidade('');
      setItensAdicionados([]);
      setMotivo('');
      setOrdemProducao('');

      // Volta para lista e recarrega
      setView('lista');
      carregarRequisicoes();
    } catch (error) {
      setError(error.response?.data?.error || error.message);
    } finally {
      setLoading(false);
    }
  };

  const aprovarRequisicao = async (id) => {
    if (!confirm('Deseja aprovar esta requisição?')) return;

    try {
      await axios.put(`${API_BASE}/requisicoes/${id}/aprovar`, {
        aprovado_por: usuarioLogado.nome
      });
      alert('Requisição aprovada!');
      carregarRequisicoes();
    } catch (error) {
      alert('Erro ao aprovar: ' + error.message);
    }
  };

  const rejeitarRequisicao = async (id) => {
    const motivo = prompt('Motivo da reprovação (obrigatório):');
    if (motivo === null) return; // usuário cancelou
    if (!motivo.trim()) {
      alert('O motivo da reprovação é obrigatório.');
      return;
    }

    try {
      await axios.put(`${API_BASE}/requisicoes/${id}/rejeitar`, {
        rejeitado_por: usuarioLogado.nome,
        motivo_rejeicao: motivo.trim()
      });
      alert('Requisição reprovada!');
      carregarRequisicoes();
    } catch (error) {
      alert('Erro ao reprovar: ' + (error.response?.data?.error || error.message));
    }
  };

  // Identifica se o usuário logado é quem criou a requisição
  const ehSolicitante = (req) => {
    if (!usuarioLogado || !req) return false;
    const emailMatch = req.solicitante_email && usuarioLogado.email &&
      String(req.solicitante_email).toLowerCase() === String(usuarioLogado.email).toLowerCase();
    const nomeMatch = req.solicitante_nome && usuarioLogado.nome &&
      String(req.solicitante_nome).toLowerCase() === String(usuarioLogado.nome).toLowerCase();
    return emailMatch || nomeMatch;
  };

  const abrirModalAjuste = (req) => {
    setRequisicaoAjuste(req);
    const itens = (req.itens || []).map(item => ({
      produto_codigo: item.produto_codigo,
      produto_descricao: item.produto_descricao || '',
      produto_modelo: item.produto_modelo || '',
      quantidade: item.quantidade_solicitada || item.quantidade || 0
    }));
    setItensAjuste(itens);
    setMotivoAjuste(req.motivo || '');
    setOpAjuste(req.ordem_producao || '');
    setModalAjuste(true);
  };

  const removerItemAjuste = (codigo) => {
    setItensAjuste(prev => prev.filter(it => it.produto_codigo !== codigo));
  };

  const alterarQuantidadeAjuste = (codigo, valor) => {
    setItensAjuste(prev => prev.map(it => it.produto_codigo === codigo ? { ...it, quantidade: valor } : it));
  };

  const processarAjuste = async () => {
    if (itensAjuste.length === 0) {
      alert('A requisição precisa ter pelo menos um item.');
      return;
    }
    for (const item of itensAjuste) {
      if (!item.quantidade || Number(item.quantidade) <= 0) {
        alert(`Informe uma quantidade válida para ${item.produto_codigo}.`);
        return;
      }
    }

    setSalvandoAjuste(true);
    try {
      await axios.put(`${API_BASE}/requisicoes/${requisicaoAjuste.id}/ajustar`, {
        itens: itensAjuste.map(it => ({
          produto_codigo: it.produto_codigo,
          produto_descricao: it.produto_descricao,
          produto_modelo: it.produto_modelo,
          quantidade: Number(it.quantidade)
        })),
        motivo: motivoAjuste,
        ordem_producao: opAjuste,
        solicitante_email: usuarioLogado.email,
        solicitante_nome: usuarioLogado.nome
      });
      alert('Requisição ajustada e reenviada para análise do almoxarifado!');
      setModalAjuste(false);
      setRequisicaoAjuste(null);
      setItensAjuste([]);
      setMotivoAjuste('');
      setOpAjuste('');
      carregarRequisicoes();
    } catch (error) {
      alert('Erro ao ajustar: ' + (error.response?.data?.error || error.message));
    } finally {
      setSalvandoAjuste(false);
    }
  };

  const entregarRequisicao = async (id) => {
    if (!confirm('Confirmar entrega COMPLETA desta requisição?\n\nTodos os itens serão marcados como entregues.')) return;

    try {
      await axios.put(`${API_BASE}/requisicoes/${id}/entregar`, {
        entregue_por: usuarioLogado.nome
      });
      alert('Requisição marcada como entregue!');
      carregarRequisicoes();
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      alert('Erro ao marcar entrega: ' + errorMsg);
      console.error('Erro completo:', error);
    }
  };

  const abrirModalEntregaParcial = (requisicao) => {
    setRequisicaoEntrega(requisicao);

    // Inicializa quantidades com o restante a entregar de cada item
    const quantidades = {};
    requisicao.itens.forEach(item => {
      const solicitado = item.quantidade_solicitada || item.quantidade || 0;
      const entregue = item.quantidade_entregue || 0;
      const restante = solicitado - entregue;
      quantidades[item.produto_codigo] = restante;
    });

    setQuantidadesEntrega(quantidades);
    setModalEntrega(true);
  };

  const processarEntregaParcial = async () => {
    // Valida se pelo menos um item tem quantidade > 0
    const entregas = Object.entries(quantidadesEntrega)
      .filter(([_, qtd]) => Number(qtd) > 0)
      .map(([codigo, qtd]) => ({
        produto_codigo: codigo,
        quantidade: Number(qtd)
      }));

    if (entregas.length === 0) {
      alert('Informe pelo menos uma quantidade para entregar');
      return;
    }

    // Valida quantidades
    for (const item of requisicaoEntrega.itens) {
      const qtdEntrega = Number(quantidadesEntrega[item.produto_codigo] || 0);
      const solicitado = item.quantidade_solicitada || item.quantidade || 0;
      const entregue = item.quantidade_entregue || 0;
      const restante = solicitado - entregue;

      if (qtdEntrega > restante) {
        alert(`${item.produto_descricao}:\nQuantidade a entregar (${qtdEntrega}) maior que o restante (${restante})`);
        return;
      }
    }

    try {
      await axios.put(`${API_BASE}/requisicoes/${requisicaoEntrega.id}/entregar`, {
        entregue_por: usuarioLogado.nome,
        entregas
      });

      alert('Entrega parcial registrada com sucesso!');
      setModalEntrega(false);
      setRequisicaoEntrega(null);
      setQuantidadesEntrega({});
      carregarRequisicoes();
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      alert('Erro ao registrar entrega: ' + errorMsg);
      console.error('Erro completo:', error);
    }
  };

  const excluirRequisicao = async (id, descricao) => {
    if (!confirm(`ATENÇÃO!\n\nDeseja realmente EXCLUIR esta requisição?\n\n${descricao}\n\nEsta ação não pode ser desfeita!`)) return;

    try {
      await axios.delete(`${API_BASE}/requisicoes/${id}`, {
        params: {
          solicitante_email: usuarioLogado?.email,
          solicitante_nome: usuarioLogado?.nome,
          tipo: usuarioLogado?.tipo
        }
      });
      alert('Requisição excluída com sucesso!');
      carregarRequisicoes();
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      alert('Erro ao excluir: ' + errorMsg);
      console.error('Erro completo:', error);
    }
  };

  // Verifica se a requisição corresponde ao filtro de situação selecionado
  const correspondeSituacao = (req) => {
    switch (filtroSituacao) {
      case 'pendentes': return req.status === 'pendente';
      // Aprovadas/parciais são tratadas como entregues
      case 'entregues': return req.status === 'entregue' || req.status === 'aprovada' || req.status === 'parcial';
      case 'rejeitadas': return req.status === 'rejeitada';
      default: return true; // todas
    }
  };

  // Formata uma duração em ms para algo legível (ex: "2 dias 3h 10min")
  const formatarDuracao = (ms) => {
    if (ms == null || isNaN(ms) || ms < 0) return '-';
    const totalMin = Math.floor(ms / 60000);
    const dias = Math.floor(totalMin / 1440);
    const horas = Math.floor((totalMin % 1440) / 60);
    const minutos = totalMin % 60;
    const partes = [];
    if (dias > 0) partes.push(`${dias} dia${dias > 1 ? 's' : ''}`);
    if (horas > 0) partes.push(`${horas}h`);
    if (minutos > 0 || partes.length === 0) partes.push(`${minutos}min`);
    return partes.join(' ');
  };

  // Calcula o tempo de criação até a aprovação de uma requisição (ms) ou null
  const tempoAteAprovacao = (req) => {
    if (req?.tempo_ate_aprovacao_ms != null) return req.tempo_ate_aprovacao_ms;
    if (req?.data_solicitacao && req?.data_aprovacao) {
      return new Date(req.data_aprovacao) - new Date(req.data_solicitacao);
    }
    return null;
  };

  const abrirModalHistorico = (req) => {
    setRequisicaoHistorico(req);
    setModalHistorico(true);
  };

  // Cor/rótulo do evento do histórico
  const estiloEvento = (acao) => {
    switch (acao) {
      case 'criacao': return { cor: 'bg-blue-500', rotulo: 'Criação' };
      case 'aprovacao': return { cor: 'bg-emerald-500', rotulo: 'Aprovação' };
      case 'reprovacao': return { cor: 'bg-red-500', rotulo: 'Reprovação' };
      case 'ajuste': return { cor: 'bg-amber-500', rotulo: 'Ajuste' };
      case 'entrega': return { cor: 'bg-indigo-500', rotulo: 'Entrega' };
      case 'entrega_parcial': return { cor: 'bg-indigo-400', rotulo: 'Entrega parcial' };
      default: return { cor: 'bg-gray-400', rotulo: acao };
    }
  };

  const getStatusBadgeClasses = (status) => {
    const base = 'px-2.5 py-0.5 rounded-full text-xs font-medium';
    switch (status) {
      case 'pendente':
        return `${base} bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300`;
      case 'aprovada':
        return `${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300`;
      case 'rejeitada':
        return `${base} bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300`;
      case 'parcial':
        return `${base} bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300`;
      case 'entregue':
        return `${base} bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300`;
      default:
        return `${base} bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400`;
    }
  };

  // Tela de não autenticado
  if (!autenticado) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8 transition-colors duration-300">
        <div className="max-w-xl mx-auto mt-24 p-10 bg-white dark:bg-gray-800 rounded-xl shadow-lg text-center animate-fade-in">
          <div className="mx-auto mb-5 w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            <Lock className="w-8 h-8 text-gray-400 dark:text-gray-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Acesso Restrito</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Por favor, faça login através do Menu Principal para acessar este programa.
          </p>
          <button
            className="px-6 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg font-semibold text-sm shadow-lg hover:-translate-y-0.5 hover:shadow-xl transition-all duration-200 cursor-pointer"
            onClick={() => window.location.href = `http://${window.location.hostname}:3000`}
          >
            Ir para Menu Principal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8 transition-colors duration-300">
      {/* Header */}
      <header className="max-w-[1400px] mx-auto mb-6 flex items-center gap-4">
        <a
          href={`http://${window.location.hostname}:3000`}
          title="Voltar ao Menu Principal"
          className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/30 hover:scale-105 hover:shadow-xl transition-all duration-200 cursor-pointer"
        >
          <Package className="w-7 h-7 text-white" />
        </a>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 m-0">Requisição de Material</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 m-0">Solicite materiais do almoxarifado</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {usuarioLogado?.nome} ({usuarioLogado?.tipo})
          </span>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200 cursor-pointer border-0"
            title={darkMode ? 'Modo claro' : 'Modo escuro'}
          >
            {darkMode ? (
              <Sun className="w-5 h-5 text-amber-400" />
            ) : (
              <Moon className="w-5 h-5 text-gray-600" />
            )}
          </button>
        </div>
      </header>

      {/* Navegação */}
      <div className="max-w-[1400px] mx-auto mb-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 animate-fade-in">
        <div className="flex gap-3">
          <button
            className={`flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 cursor-pointer border-2 ${
              view === 'lista'
                ? 'bg-gradient-to-r from-primary-600 to-primary-700 text-white border-primary-600 shadow-lg'
                : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-primary-400'
            }`}
            onClick={() => setView('lista')}
          >
            <ClipboardList className="w-4 h-4" />
            Minhas Requisições
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 cursor-pointer border-2 ${
              view === 'nova'
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-emerald-500 shadow-lg'
                : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-emerald-400'
            }`}
            onClick={() => setView('nova')}
          >
            <PlusCircle className="w-4 h-4" />
            Nova Requisição
          </button>
        </div>
      </div>

      {error && (
        <div className="max-w-[1400px] mx-auto mb-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-3 rounded-lg text-sm text-red-800 dark:text-red-300 animate-shake">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {/* View: Lista de Requisições */}
      {view === 'lista' && (
        <div className="max-w-[1400px] mx-auto mb-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 animate-fade-in">
          <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 m-0">Requisições</h2>

            <div className="flex gap-2 flex-wrap">
              {(() => {
                const contar = (situacao) => requisicoes.filter(r => {
                  if (situacao === 'pendentes') return r.status === 'pendente';
                  if (situacao === 'entregues') return r.status === 'entregue' || r.status === 'aprovada' || r.status === 'parcial';
                  if (situacao === 'rejeitadas') return r.status === 'rejeitada';
                  return true;
                }).length;

                const filtros = [
                  { id: 'pendentes', label: 'Pendentes', cor: 'bg-amber-500 hover:bg-amber-600' },
                  { id: 'entregues', label: 'Entregues', cor: 'bg-blue-500 hover:bg-blue-600' },
                  { id: 'rejeitadas', label: 'Rejeitadas', cor: 'bg-red-500 hover:bg-red-600' },
                  { id: 'todas', label: 'Todas', cor: 'bg-indigo-500 hover:bg-indigo-600' },
                ];

                return filtros.map(f => {
                  const ativo = filtroSituacao === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => { setFiltroSituacao(f.id); setPaginaAtual(1); }}
                      className={`px-4 py-2 rounded-lg cursor-pointer text-sm font-semibold transition-all duration-200 border-0 hover:-translate-y-0.5 flex items-center gap-2 ${
                        ativo ? `${f.cor} text-white shadow-lg` : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                      }`}
                    >
                      {f.label}
                      <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold ${ativo ? 'bg-white/25' : 'bg-gray-300 dark:bg-gray-600'}`}>
                        {contar(f.id)}
                      </span>
                    </button>
                  );
                });
              })()}
            </div>
          </div>

          {/* Campo de Busca */}
          <div className="mb-5 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por nº pedido, produto, OP ou solicitante..."
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPaginaAtual(1);
              }}
              className="w-full h-12 pl-12 pr-4 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          {loading ? (
            <div className="text-center py-10">
              <Loader2 className="w-10 h-10 text-primary-600 animate-spin mx-auto" />
              <p className="mt-4 text-gray-500 dark:text-gray-400">Carregando...</p>
            </div>
          ) : requisicoes.length === 0 ? (
            <div className="text-center py-16">
              <MailOpen className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-base text-gray-500 dark:text-gray-400">
                Nenhuma requisição encontrada
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700 border-b-2 border-gray-200 dark:border-gray-600">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Produtos</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Local</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">OP</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Solicitante</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Observação</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {(() => {
                    // Filtra requisições por status
                    const requisicoesFiltradasStatus = requisicoes.filter(correspondeSituacao);

                    // Filtra por busca
                    const requisicoesFiltradas = requisicoesFiltradasStatus.filter(req => {
                      if (!busca) return true;

                      const buscaLower = busca.toLowerCase();
                      const idMatch = (req.id || '').toLowerCase().includes(buscaLower);
                      const opMatch = (req.ordem_producao || '').toLowerCase().includes(buscaLower);
                      const solicitanteMatch = (req.solicitante_nome || '').toLowerCase().includes(buscaLower);

                      // Busca nos itens (produtos)
                      const produtosMatch = req.itens ? req.itens.some(item =>
                        (item.produto_codigo || '').toLowerCase().includes(buscaLower) ||
                        (item.produto_descricao || '').toLowerCase().includes(buscaLower)
                      ) : false;

                      // Busca no produto antigo (compatibilidade)
                      const produtoAntigoMatch =
                        (req.produto_codigo || '').toLowerCase().includes(buscaLower) ||
                        (req.produto_descricao || '').toLowerCase().includes(buscaLower);

                      return idMatch || opMatch || solicitanteMatch || produtosMatch || produtoAntigoMatch;
                    });

                    // Ordena por data (mais recente primeiro)
                    const requisicoesOrdenadas = requisicoesFiltradas.sort((a, b) => {
                      return new Date(b.data_solicitacao) - new Date(a.data_solicitacao);
                    });

                    // Calcula paginação
                    const totalPaginas = Math.ceil(requisicoesOrdenadas.length / ITENS_POR_PAGINA);
                    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
                    const fim = inicio + ITENS_POR_PAGINA;
                    const requisicoesPaginadas = requisicoesOrdenadas.slice(inicio, fim);

                    // Renderiza as requisições
                    return requisicoesPaginadas.map((req, idx) => (
                    <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-4 py-3.5 font-semibold text-gray-900 dark:text-white">
                        <div className="text-xs font-bold text-blue-500">
                          {req.id}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                        {new Date(req.data_solicitacao).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                        {req.itens ? (
                          <div>
                            {req.itens.map((item, i) => (
                              <div key={i} className={`${i < req.itens.length - 1 ? 'mb-2 pb-2 border-b border-gray-200 dark:border-gray-700' : ''}`}>
                                <div className="text-[11px] text-gray-500 dark:text-gray-400">{item.produto_codigo}</div>
                                <div className="text-[13px] font-medium text-gray-800 dark:text-gray-200">{item.produto_descricao}</div>
                                <div className="text-xs text-blue-500 font-semibold">
                                  {item.quantidade_entregue > 0 ? (
                                    <span>{item.quantidade_entregue} / {item.quantidade_solicitada || item.quantidade}</span>
                                  ) : (
                                    <span>Qtd: {item.quantidade_solicitada || item.quantidade}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div>
                            <div className="text-[11px] text-gray-500 dark:text-gray-400">{req.produto_codigo}</div>
                            <div className="text-[13px] font-medium text-gray-800 dark:text-gray-200">{req.produto_descricao}</div>
                            <div className="text-xs text-blue-500 font-semibold">Qtd: {req.quantidade}</div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                        {req.itens ? (
                          <div>
                            {req.itens.map((item, i) => (
                              <div key={i} className={`${i < req.itens.length - 1 ? 'mb-2 pb-2 border-b border-gray-200 dark:border-gray-700' : ''}`}>
                                <div className="text-[13px] font-medium text-emerald-500">
                                  {item.produto_modelo || '-'}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[13px] font-medium text-emerald-500">
                            {req.produto_modelo || '-'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                        <div className="text-xs font-medium text-blue-500">
                          {req.ordem_producao || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                        <span className={getStatusBadgeClasses(req.status)}>
                          {req.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">{req.solicitante_nome}</td>
                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                        <div className={`text-xs text-gray-500 dark:text-gray-400 ${!req.motivo ? 'italic' : ''}`}>
                          {req.motivo || '-'}
                        </div>
                        {req.status === 'rejeitada' && req.motivo_rejeicao && (
                          <div className="mt-1 text-xs text-red-600 dark:text-red-400 flex items-start gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span><strong>Reprovação:</strong> {req.motivo_rejeicao}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-center">
                            <button
                              className="px-3 h-8 bg-gray-600 hover:bg-gray-700 text-white rounded-md flex items-center justify-center gap-1.5 text-xs font-semibold shadow-sm hover:scale-105 transition-all duration-150 cursor-pointer border-0"
                              onClick={() => abrirModalHistorico(req)}
                              title="Ver histórico de alterações (não editável)"
                            >
                              <History className="w-4 h-4" /> Histórico
                            </button>
                          </div>
                          {(usuarioLogado?.tipo === 'admin' || usuarioLogado?.almoxarifado) && req.status === 'pendente' && (
                            <div className="flex gap-2 justify-center">
                              <button
                                className="w-8 h-8 bg-emerald-500 hover:bg-emerald-600 text-white rounded-md flex items-center justify-center shadow-sm hover:scale-105 transition-all duration-150 cursor-pointer border-0"
                                onClick={() => aprovarRequisicao(req.id)}
                                title="Aprovar requisição"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                className="w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-md flex items-center justify-center shadow-sm hover:scale-105 transition-all duration-150 cursor-pointer border-0"
                                onClick={() => rejeitarRequisicao(req.id)}
                                title="Reprovar requisição (somente almoxarifado)"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                          {req.status === 'rejeitada' && ehSolicitante(req) && (
                            <div className="flex justify-center">
                              <button
                                className="px-3 h-8 bg-amber-500 hover:bg-amber-600 text-white rounded-md flex items-center justify-center gap-1.5 text-xs font-semibold shadow-sm hover:scale-105 transition-all duration-150 cursor-pointer border-0"
                                onClick={() => abrirModalAjuste(req)}
                                title="Ajustar requisição reprovada e reenviar para análise"
                              >
                                <Wrench className="w-4 h-4" /> Ajuste
                              </button>
                            </div>
                          )}
                          {(usuarioLogado?.tipo === 'admin' || usuarioLogado?.almoxarifado) && (req.status === 'aprovada' || req.status === 'parcial') && (
                            <div className="flex gap-2 justify-center">
                              <button
                                className="w-8 h-8 bg-emerald-500 hover:bg-emerald-600 text-white rounded-md flex items-center justify-center shadow-sm hover:scale-105 transition-all duration-150 cursor-pointer border-0"
                                onClick={() => entregarRequisicao(req.id)}
                                title="Entregar todos os itens restantes"
                              >
                                <PackageCheck className="w-4 h-4" />
                              </button>
                              <button
                                className="w-8 h-8 bg-blue-500 hover:bg-blue-600 text-white rounded-md flex items-center justify-center shadow-sm hover:scale-105 transition-all duration-150 cursor-pointer border-0"
                                onClick={() => abrirModalEntregaParcial(req)}
                                title="Entregar quantidades específicas"
                              >
                                <ClipboardCheck className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                          {(usuarioLogado?.tipo === 'admin' || ehSolicitante(req)) && (req.status === 'pendente' || req.status === 'rejeitada') && (
                            <div className="flex justify-center">
                              <button
                                className="w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-md flex items-center justify-center shadow-sm hover:scale-105 transition-all duration-150 cursor-pointer border-0"
                                onClick={() => {
                                  const descricao = req.itens
                                    ? `${req.itens.length} item(ns) - OP: ${req.ordem_producao || 'N/A'}`
                                    : `${req.produto_codigo} - OP: ${req.ordem_producao || 'N/A'}`;
                                  excluirRequisicao(req.id, descricao);
                                }}
                                title="Excluir requisição (enquanto não aprovada)"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                    ));
                  })()}
                </tbody>
              </table>

              {/* Controles de Paginação */}
              {(() => {
                const requisicoesFiltradasStatus = requisicoes.filter(correspondeSituacao);

                const requisicoesFiltradas = requisicoesFiltradasStatus.filter(req => {
                  if (!busca) return true;
                  const buscaLower = busca.toLowerCase();
                  const opMatch = (req.ordem_producao || '').toLowerCase().includes(buscaLower);
                  const solicitanteMatch = (req.solicitante_nome || '').toLowerCase().includes(buscaLower);
                  const produtosMatch = req.itens ? req.itens.some(item =>
                    (item.produto_codigo || '').toLowerCase().includes(buscaLower) ||
                    (item.produto_descricao || '').toLowerCase().includes(buscaLower)
                  ) : false;
                  const produtoAntigoMatch =
                    (req.produto_codigo || '').toLowerCase().includes(buscaLower) ||
                    (req.produto_descricao || '').toLowerCase().includes(buscaLower);
                  return opMatch || solicitanteMatch || produtosMatch || produtoAntigoMatch;
                });

                const totalPaginas = Math.ceil(requisicoesFiltradas.length / ITENS_POR_PAGINA);

                if (totalPaginas <= 1) return null;

                return (
                  <div className="flex justify-between items-center mt-5 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Mostrando {((paginaAtual - 1) * ITENS_POR_PAGINA) + 1} - {Math.min(paginaAtual * ITENS_POR_PAGINA, requisicoesFiltradas.length)} de {requisicoesFiltradas.length}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setPaginaAtual(Math.max(1, paginaAtual - 1))}
                        disabled={paginaAtual === 1}
                        className={`flex items-center gap-1 px-3 py-2 rounded-md text-sm font-semibold border-0 transition-all duration-200 ${
                          paginaAtual === 1
                            ? 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                            : 'bg-blue-500 text-white cursor-pointer hover:bg-blue-600'
                        }`}
                      >
                        <ChevronLeft className="w-4 h-4" /> Anterior
                      </button>

                      <div className="flex gap-1">
                        {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                          let pagina;
                          if (totalPaginas <= 5) {
                            pagina = i + 1;
                          } else if (paginaAtual <= 3) {
                            pagina = i + 1;
                          } else if (paginaAtual >= totalPaginas - 2) {
                            pagina = totalPaginas - 4 + i;
                          } else {
                            pagina = paginaAtual - 2 + i;
                          }

                          return (
                            <button
                              key={pagina}
                              onClick={() => setPaginaAtual(pagina)}
                              className={`px-3 py-2 rounded-md text-sm font-semibold min-w-[40px] cursor-pointer transition-all duration-200 ${
                                paginaAtual === pagina
                                  ? 'bg-blue-500 text-white border border-blue-500'
                                  : 'bg-white dark:bg-gray-700 text-blue-500 dark:text-blue-400 border border-blue-500 dark:border-blue-400 hover:bg-blue-50 dark:hover:bg-gray-600'
                              }`}
                            >
                              {pagina}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        onClick={() => setPaginaAtual(Math.min(totalPaginas, paginaAtual + 1))}
                        disabled={paginaAtual === totalPaginas}
                        className={`flex items-center gap-1 px-3 py-2 rounded-md text-sm font-semibold border-0 transition-all duration-200 ${
                          paginaAtual === totalPaginas
                            ? 'bg-gray-200 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                            : 'bg-blue-500 text-white cursor-pointer hover:bg-blue-600'
                        }`}
                      >
                        Próxima <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Modal: Entrega Parcial */}
      {modalEntrega && requisicaoEntrega && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-5" onClick={() => setModalEntrega(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-[700px] w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-5 pb-3 border-b-2 border-gray-200 dark:border-gray-700 flex items-center gap-2">
              <Package className="w-5 h-5 text-primary-600" /> Entrega Parcial
            </h2>

            <div className="mb-5">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                <strong className="text-gray-700 dark:text-gray-300">Requisição:</strong> {requisicaoEntrega.id}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <strong className="text-gray-700 dark:text-gray-300">OP:</strong> {requisicaoEntrega.ordem_producao || '-'}
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2 font-semibold">Informe as quantidades a entregar:</label>

              {requisicaoEntrega.itens.map((item) => {
                const solicitado = item.quantidade_solicitada || item.quantidade || 0;
                const entregue = item.quantidade_entregue || 0;
                const restante = solicitado - entregue;

                return (
                  <div key={item.produto_codigo} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg mb-3 border border-gray-200 dark:border-gray-600">
                    <div className="mb-2">
                      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {item.produto_codigo}
                      </div>
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {item.produto_descricao}
                      </div>
                      {item.produto_modelo && (
                        <div className="text-[11px] text-emerald-500 font-semibold">
                          Modelo: {item.produto_modelo}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3 items-center flex-wrap">
                      <div className="text-[13px] text-gray-500 dark:text-gray-400">
                        <span className="font-semibold">Solicitado:</span> {solicitado}
                      </div>
                      {entregue > 0 && (
                        <div className="text-[13px] text-emerald-500 font-semibold">
                          Já entregue: {entregue}
                        </div>
                      )}
                      <div className="text-[13px] text-red-500 font-semibold">
                        Restante: {restante}
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1 font-semibold">
                        Quantidade a entregar agora:
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={restante}
                        value={quantidadesEntrega[item.produto_codigo] || 0}
                        onChange={(e) => setQuantidadesEntrega({
                          ...quantidadesEntrega,
                          [item.produto_codigo]: e.target.value
                        })}
                        className="max-w-[150px] h-12 px-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-base font-semibold text-blue-500 bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setModalEntrega(false)}
                className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold text-sm transition-all duration-200 cursor-pointer border-0 hover:-translate-y-0.5"
              >
                Cancelar
              </button>
              <button
                onClick={processarEntregaParcial}
                className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-lg font-semibold text-sm shadow-lg transition-all duration-200 cursor-pointer border-0 hover:-translate-y-0.5 flex items-center gap-2"
              >
                <Check className="w-4 h-4" /> Confirmar Entrega
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Histórico imutável da Requisição */}
      {modalHistorico && requisicaoHistorico && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-5" onClick={() => setModalHistorico(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-[640px] w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1 pb-3 border-b-2 border-gray-200 dark:border-gray-700 flex items-center gap-2">
              <History className="w-5 h-5 text-gray-600 dark:text-gray-300" /> Histórico — {requisicaoHistorico.id}
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Registro de alterações não editável.
            </p>

            {/* Tempo de criação até aprovação */}
            {(() => {
              const ms = tempoAteAprovacao(requisicaoHistorico);
              if (ms == null) return null;
              return (
                <div className="mb-5 p-4 bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-emerald-500 rounded-lg flex items-center gap-2">
                  <Clock className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div className="text-sm text-emerald-800 dark:text-emerald-300">
                    <strong>Tempo da criação até a aprovação:</strong> {formatarDuracao(ms)}
                  </div>
                </div>
              );
            })()}

            {/* Linha do tempo */}
            {(() => {
              const eventos = Array.isArray(requisicaoHistorico.historico) ? requisicaoHistorico.historico : [];
              if (eventos.length === 0) {
                return (
                  <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                    Nenhum evento registrado para esta requisição.
                  </div>
                );
              }
              return (
                <ol className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-3">
                  {eventos.map((ev, i) => {
                    const { cor, rotulo } = estiloEvento(ev.acao);
                    return (
                      <li key={i} className="mb-5 ml-5">
                        <span className={`absolute -left-[9px] w-4 h-4 rounded-full ${cor} ring-4 ring-white dark:ring-gray-800`}></span>
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{rotulo}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(ev.data).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        {ev.descricao && (
                          <div className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">{ev.descricao}</div>
                        )}
                        <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                          Por: {ev.usuario || 'Sistema'}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              );
            })()}

            <div className="flex justify-end mt-2">
              <button
                onClick={() => setModalHistorico(false)}
                className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold text-sm transition-all duration-200 cursor-pointer border-0 hover:-translate-y-0.5"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ajuste de Requisição Reprovada */}
      {modalAjuste && requisicaoAjuste && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-5" onClick={() => setModalAjuste(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-[700px] w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-5 pb-3 border-b-2 border-gray-200 dark:border-gray-700 flex items-center gap-2">
              <Wrench className="w-5 h-5 text-amber-500" /> Ajustar Requisição {requisicaoAjuste.id}
            </h2>

            {/* Motivo da reprovação do almoxarifado */}
            {requisicaoAjuste.motivo_rejeicao && (
              <div className="mb-5 p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded-lg">
                <div className="text-xs font-bold uppercase tracking-wide text-red-600 dark:text-red-400 mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> Motivo da reprovação
                </div>
                <div className="text-sm text-red-800 dark:text-red-300">{requisicaoAjuste.motivo_rejeicao}</div>
                {requisicaoAjuste.rejeitado_por && (
                  <div className="text-[11px] text-red-500 dark:text-red-400 mt-1">Reprovado por: {requisicaoAjuste.rejeitado_por}</div>
                )}
              </div>
            )}

            <div className="mb-5">
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2 font-semibold">Itens da requisição</label>
              {itensAjuste.length === 0 ? (
                <div className="p-4 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 text-center">
                  Nenhum item — a requisição precisa de pelo menos um item.
                </div>
              ) : (
                itensAjuste.map((item) => (
                  <div key={item.produto_codigo} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg mb-3 border border-gray-200 dark:border-gray-600">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">{item.produto_codigo}</div>
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{item.produto_descricao}</div>
                        {item.produto_modelo && (
                          <div className="text-[11px] text-emerald-500 font-semibold">Modelo: {item.produto_modelo}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removerItemAjuste(item.produto_codigo)}
                        className="w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-md flex items-center justify-center cursor-pointer border-0 transition-all duration-150 hover:scale-105 shrink-0"
                        title="Remover item"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="mt-3">
                      <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1 font-semibold">Quantidade</label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantidade}
                        onChange={(e) => alterarQuantidadeAjuste(item.produto_codigo, e.target.value)}
                        className="max-w-[150px] h-12 px-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-base font-semibold text-blue-500 bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mb-5">
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2 font-semibold">Ordem de Produção</label>
              <input
                type="text"
                value={opAjuste}
                onChange={(e) => setOpAjuste(e.target.value)}
                className="w-full h-12 px-4 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                placeholder="Ex: OP-2024-001"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2 font-semibold">Motivo / Observação</label>
              <textarea
                value={motivoAjuste}
                onChange={(e) => setMotivoAjuste(e.target.value)}
                className="w-full min-h-[90px] px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 resize-y"
                placeholder="Descreva o motivo da requisição..."
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setModalAjuste(false)}
                className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold text-sm transition-all duration-200 cursor-pointer border-0 hover:-translate-y-0.5"
              >
                Cancelar
              </button>
              <button
                onClick={processarAjuste}
                disabled={salvandoAjuste}
                className={`px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-lg font-semibold text-sm shadow-lg transition-all duration-200 cursor-pointer border-0 hover:-translate-y-0.5 flex items-center gap-2 ${salvandoAjuste ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {salvandoAjuste ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><Check className="w-4 h-4" /> Salvar e Reenviar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup de Notificação */}
      {notificacao && (
        <div className="fixed top-5 right-5 z-[2000] animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[400px] max-w-[calc(100vw-40px)] overflow-hidden border-3 border-emerald-500">
            <div className="flex items-center gap-4 p-5 bg-gradient-to-r from-primary-500 to-primary-700 text-white">
              <Bell className="w-8 h-8 animate-bounce" />
              <div>
                <h3 className="m-0 text-lg font-bold">Nova Requisição!</h3>
                <p className="m-0 mt-1 text-sm opacity-95">
                  {notificacao.quantidade === 1
                    ? '1 nova requisição pendente'
                    : `${notificacao.quantidade} novas requisições pendentes`}
                </p>
              </div>
            </div>

            <div className="p-4 max-h-[300px] overflow-y-auto">
              {notificacao.requisicoes.slice(0, 3).map((req) => (
                <div key={req.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg mb-2 border border-gray-200 dark:border-gray-600">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(req.data_solicitacao).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {req.solicitante_nome}
                  </div>
                  <div className="text-[13px] text-blue-500">
                    OP: {req.ordem_producao || 'N/A'} - {req.itens?.length || 1} item(ns)
                  </div>
                </div>
              ))}
              {notificacao.quantidade > 3 && (
                <div className="text-[13px] text-gray-500 dark:text-gray-400 text-center mt-2">
                  + {notificacao.quantidade - 3} mais...
                </div>
              )}
            </div>

            <div className="flex gap-3 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
              <button
                onClick={() => setNotificacao(null)}
                className="flex-1 px-4 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold text-sm transition-all duration-200 cursor-pointer border-0"
              >
                Fechar
              </button>
              <button
                onClick={() => {
                  setNotificacao(null);
                  setView('lista');
                  carregarRequisicoes();
                }}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg font-semibold text-sm shadow-lg transition-all duration-200 cursor-pointer border-0 hover:-translate-y-0.5"
              >
                Ver Requisições
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View: Nova Requisição */}
      {view === 'nova' && (
        <div className="max-w-[1400px] mx-auto mb-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 animate-fade-in">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5">Nova Requisição</h2>

          <form onSubmit={criarRequisicao}>
            <div className="mb-5">
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2 font-semibold">Produto</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Digite o código ou descrição do produto..."
                  value={produtoBusca}
                  onChange={handleProdutoBuscaChange}
                  className="w-full h-12 pl-12 pr-4 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 placeholder-gray-400 dark:placeholder-gray-500"
                />

                {/* Lista de sugestões */}
                {produtosSugeridos.length > 0 && (
                  <div className="absolute left-0 top-full mt-1 w-full bg-white dark:bg-gray-800 border-2 border-primary-500 rounded-lg max-h-[300px] overflow-y-auto shadow-xl z-[1000]">
                    {produtosSugeridos.map((produto) => (
                      <div
                        key={produto.codigo}
                        className="px-4 py-3 cursor-pointer border-b border-gray-100 dark:border-gray-700 hover:bg-primary-50 dark:hover:bg-gray-700 transition-colors duration-200"
                        onClick={() => selecionarProduto(produto)}
                      >
                        <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                          {produto.codigo}
                        </div>
                        <div className="text-[13px] text-gray-500 dark:text-gray-400">
                          {produto.descricao}
                        </div>
                        {produto.modelo && (
                          <div className="text-[11px] text-emerald-500 font-semibold">
                            Modelo: {produto.modelo}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {buscandoProdutos && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Buscando produtos...
                  </p>
                )}
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2 font-semibold">Quantidade</label>
              <div className="flex gap-3">
                <input
                  type="number"
                  min="1"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  className="flex-1 h-12 px-4 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={adicionarItem}
                  className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-lg font-semibold text-sm shadow-lg transition-all duration-200 cursor-pointer border-0 hover:-translate-y-0.5 whitespace-nowrap flex items-center gap-2"
                >
                  <PlusCircle className="w-4 h-4" /> Adicionar Item
                </button>
              </div>
            </div>

            {/* Lista de itens adicionados */}
            {itensAdicionados.length > 0 && (
              <div className="mb-5">
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2 font-semibold">Itens Adicionados ({itensAdicionados.length})</label>
                <div className="border-2 border-gray-200 dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-700/50">
                  {itensAdicionados.map((item, idx) => (
                    <div key={item.produto_codigo} className="flex items-center p-3 bg-white dark:bg-gray-800 rounded-md mb-2 border border-gray-200 dark:border-gray-600">
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                          {item.produto_codigo}
                        </div>
                        <div className="text-[13px] text-gray-500 dark:text-gray-400">
                          {item.produto_descricao}
                        </div>
                        {item.produto_modelo && (
                          <div className="text-[11px] text-emerald-500 font-semibold">
                            Modelo: {item.produto_modelo}
                          </div>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-blue-500 mr-3">
                        Qtd: {item.quantidade}
                      </div>
                      <button
                        type="button"
                        onClick={() => removerItem(item.produto_codigo)}
                        className="w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-md flex items-center justify-center cursor-pointer border-0 transition-all duration-150 hover:scale-105"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-5">
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2 font-semibold">Ordem de Produção</label>
              <input
                type="text"
                value={ordemProducao}
                onChange={(e) => setOrdemProducao(e.target.value)}
                className="w-full h-12 px-4 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 placeholder-gray-400 dark:placeholder-gray-500"
                placeholder="Ex: OP-2024-001"
              />
            </div>

            <div className="mb-5">
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2 font-semibold">Motivo / Observação</label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="w-full min-h-[100px] px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 placeholder-gray-400 dark:placeholder-gray-500 resize-y"
                placeholder="Descreva o motivo da requisição..."
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className={`px-6 py-3 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-lg font-semibold text-sm shadow-lg transition-all duration-200 cursor-pointer border-0 hover:-translate-y-0.5 flex items-center gap-2 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                disabled={loading}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                ) : (
                  <><Check className="w-4 h-4" /> Criar Requisição</>
                )}
              </button>
              <button
                type="button"
                className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold text-sm transition-all duration-200 cursor-pointer border-0 hover:-translate-y-0.5"
                onClick={() => setView('lista')}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
