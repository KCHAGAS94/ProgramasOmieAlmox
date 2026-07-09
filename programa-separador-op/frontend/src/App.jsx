import { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  Search, RefreshCw, ClipboardList, Clock, CheckCircle2, Link2,
  FileText, X, Save, Lock, Sun, Moon, Settings, Loader2,
  Package, Sparkles, ExternalLink, ChevronRight, Download, Copy, Check
} from 'lucide-react';

// Detecta automaticamente o hostname para funcionar em qualquer rede
const API_BASE = 'http://' + window.location.hostname + ':4003/api';

// Função para obter usuário logado do localStorage
const obterUsuarioLogado = () => {
  try {
    const usuarioStr = localStorage.getItem('usuario');
    if (usuarioStr) {
      const usuario = JSON.parse(usuarioStr);
      return { nome: usuario.nome || 'Usuário' };
    }

    const token = localStorage.getItem('token');
    if (!token) return { nome: 'Usuário Desconhecido' };

    const payloadBase64 = token.split('.')[1];
    const payload = JSON.parse(atob(payloadBase64));
    return { nome: payload.email?.split('@')[0] || 'Usuário' };
  } catch (error) {
    return { nome: 'Usuário Desconhecido' };
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
  const [ops, setOps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [numeroOP, setNumeroOP] = useState('');
  const [opDetalhada, setOpDetalhada] = useState(null);
  const [loadingDetalhes, setLoadingDetalhes] = useState(false);
  const [loadingSincronizacao, setLoadingSincronizacao] = useState(false);
  const [cacheInfo, setCacheInfo] = useState(null);
  const [opCopiado, setOpCopiado] = useState(false);
  const [opCacheAtualizadoEm, setOpCacheAtualizadoEm] = useState(null);
  const [carregadoDoCache, setCarregadoDoCache] = useState(false);
  const [produtosDetalhados, setProdutosDetalhados] = useState([]);
  const [produtoPrincipal, setProdutoPrincipal] = useState(null);
  // Mapa { id_prod | SKU -> soma das quantidades } dos ajustes de estoque da OP atual (coluna Status)
  const [ajustesPorProduto, setAjustesPorProduto] = useState({});
  // Sincronização dos ajustes de estoque com o Omie (botão da coluna Status)
  const [sincronizandoAjustes, setSincronizandoAjustes] = useState(false);
  const [progressoAjustesMsg, setProgressoAjustesMsg] = useState('');
  const [dadosEdicao, setDadosEdicao] = useState({}); // {index: {totalSeparado: '', observacao: ''}}
  const [salvandoEdicoes, setSalvandoEdicoes] = useState(false);
  const [progressoSincronizacao, setProgressoSincronizacao] = useState(null);
  const [infoAuditoria, setInfoAuditoria] = useState(null); // {modificado_por: '', modificado_em: ''}
  const [filtros, setFiltros] = useState({
    codigo: '',
    descricao: '',
    localizacao: '',
    qtd: '',
    totalSeparado: '',
    observacao: '',
    transferido: 'todos' // 'todos', 'marcados', 'desmarcados'
  });
  const [itensPendentes, setItensPendentes] = useState([]);
  const [loadingPendentes, setLoadingPendentes] = useState(false);
  const [itensConcluidos, setItensConcluidos] = useState([]);
  const [abaAtiva, setAbaAtiva] = useState('pesquisar'); // 'pesquisar', 'andamento', 'concluidos'
  const [filtroAndamento, setFiltroAndamento] = useState('');
  const [filtroConcluidos, setFiltroConcluidos] = useState('');
  const [mostrarModalExportar, setMostrarModalExportar] = useState(false);
  const [exportDataInicio, setExportDataInicio] = useState('');
  const [exportDataFim, setExportDataFim] = useState('');
  const [mostrarModalAssociar, setMostrarModalAssociar] = useState(false);
  const [numeroOPFilha, setNumeroOPFilha] = useState('');
  const [associacaoAtual, setAssociacaoAtual] = useState(null); // {tipo, opAtual, opAssociada}
  const [salvandoAssociacao, setSalvandoAssociacao] = useState(false);
  const [opAssociadaDetalhada, setOpAssociadaDetalhada] = useState(null);
  const [produtosAssociados, setProdutosAssociados] = useState([]);
  const [produtoPrincipalAssociado, setProdutoPrincipalAssociado] = useState(null);
  const [dadosEdicaoAssociado, setDadosEdicaoAssociado] = useState({});
  const [loadingAssociada, setLoadingAssociada] = useState(false);
  const [filtrosAssociado, setFiltrosAssociado] = useState({
    codigo: '',
    descricao: '',
    localizacao: '',
    qtd: '',
    totalSeparado: '',
    observacao: '',
    transferido: 'todos'
  });
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true';
    }
    return false;
  });

  // Aplica classe dark no html
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

  // Carrega últimas 20 OPs do cache ao iniciar
  useEffect(() => {
    if (autenticado) {
      carregarUltimasOPs();
      carregarItensPendentes();
      carregarItensConcluidos();
    }
  }, [autenticado]);

  // Busca os ajustes de estoque da OP atual (alimenta a coluna Status)
  useEffect(() => {
    const cNumOP = opDetalhada?.identificacao?.cNumOP;
    if (!cNumOP) {
      setAjustesPorProduto({});
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const resp = await axios.post(API_BASE + '/ajustes-op', { numero_op: cNumOP });
        if (!cancelado) setAjustesPorProduto(resp.data?.ajustes_por_produto || {});
      } catch (err) {
        console.error('[AJUSTES-OP] Erro ao carregar ajustes da OP:', err.message);
        if (!cancelado) setAjustesPorProduto({});
      }
    })();
    return () => { cancelado = true; };
  }, [opDetalhada?.identificacao?.cNumOP]);

  // Status da coluna: compara a QTD do item com a soma dos ajustes de estoque da OP.
  // Igual → "Ok, qtd X"; diferente ou sem ajuste → "-".
  const obterStatusAjuste = (produto) => {
    const chaveId = produto?.codigo_produto != null ? String(produto.codigo_produto) : null;
    const chaveSku = produto?.codigo != null ? String(produto.codigo) : null;
    let totalAjuste;
    if (chaveId != null && ajustesPorProduto[chaveId] != null) {
      totalAjuste = ajustesPorProduto[chaveId];
    } else if (chaveSku != null && ajustesPorProduto[chaveSku] != null) {
      totalAjuste = ajustesPorProduto[chaveSku];
    }
    if (totalAjuste == null) return { texto: '-', ok: false };
    const qtdItem = Number(produto?.quantidade) || 0;
    if (Number(totalAjuste) === qtdItem) {
      return { texto: `Ok, qtd ${qtdItem}`, ok: true };
    }
    return { texto: '-', ok: false };
  };

  // Recarrega o mapa de ajustes da OP atual (usado após a sincronização)
  const recarregarAjustesOP = async () => {
    const cNumOP = opDetalhada?.identificacao?.cNumOP;
    if (!cNumOP) return;
    try {
      const resp = await axios.post(API_BASE + '/ajustes-op', { numero_op: cNumOP });
      setAjustesPorProduto(resp.data?.ajustes_por_produto || {});
    } catch (err) {
      console.error('[AJUSTES-OP] Erro ao recarregar ajustes:', err.message);
    }
  };

  // Dispara a sincronização dos ajustes de estoque com o Omie, acompanha o progresso
  // e, ao finalizar, recarrega a coluna Status com os dados atualizados.
  const sincronizarAjustesEstoque = async () => {
    if (sincronizandoAjustes) return;
    setSincronizandoAjustes(true);
    setProgressoAjustesMsg('Iniciando sincronização...');
    try {
      try {
        await axios.post(API_BASE + '/sincronizar-ajustes');
      } catch (err) {
        // 409 = já existe uma sincronização em andamento; seguimos acompanhando o progresso
        if (err.response?.status !== 409) throw err;
      }

      // Acompanha o progresso até concluir
      await new Promise((resolve) => {
        const intervalo = setInterval(async () => {
          try {
            const { data } = await axios.get(API_BASE + '/sincronizar-ajustes/progresso');
            if (data?.mensagem) setProgressoAjustesMsg(data.mensagem);
            if (!data?.sincronizando) {
              clearInterval(intervalo);
              resolve();
            }
          } catch (e) {
            clearInterval(intervalo);
            resolve();
          }
        }, 1500);
      });

      await recarregarAjustesOP();
    } catch (err) {
      console.error('[AJUSTES] Erro ao sincronizar:', err.message);
      setProgressoAjustesMsg('Erro ao sincronizar: ' + (err.response?.data?.error || err.message));
    } finally {
      setSincronizandoAjustes(false);
      // Limpa a mensagem depois de alguns segundos
      setTimeout(() => setProgressoAjustesMsg(''), 6000);
    }
  };

  const carregarUltimasOPs = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(API_BASE + '/ultimas-ops');
      setOps(response.data.ops || []);
      setCacheInfo({
        total: response.data.total_cache,
        ultima_atualizacao: response.data.ultima_atualizacao
      });
    } catch (error) {
      setError(error.response?.data?.error || error.message);
    } finally {
      setLoading(false);
    }
  };

  const sincronizarCache = async () => {
    setLoadingSincronizacao(true);
    setError('');
    setProgressoSincronizacao({ porcentagem: 0, mensagem: 'Iniciando...', paginaAtual: 0, totalPaginas: 0 });

    // Conecta ao SSE para receber progresso em tempo real
    const eventSource = new EventSource(API_BASE + '/progresso-sincronizacao');

    eventSource.onmessage = (event) => {
      const progresso = JSON.parse(event.data);
      setProgressoSincronizacao(progresso);
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    try {
      const response = await axios.post(API_BASE + '/sincronizar-cache');
      setError('');
      // Atualiza as informações do cache silenciosamente
      setCacheInfo({
        total: response.data.total_ops,
        ultima_atualizacao: response.data.ultima_atualizacao
      });
      await carregarUltimasOPs(); // Recarrega as últimas 20

      // Aguarda um pouco para mostrar 100% antes de fechar
      setTimeout(() => {
        eventSource.close();
        setProgressoSincronizacao(null);
      }, 2000);
    } catch (error) {
      eventSource.close();
      setProgressoSincronizacao(null);
      if (error.response?.status === 429) {
        setError('Muitas requisições à API. Aguarde alguns segundos e tente novamente.');
      } else {
        setError(error.response?.data?.error || error.message);
      }
    } finally {
      setLoadingSincronizacao(false);
    }
  };

  const carregarItensPendentes = async () => {
    setLoadingPendentes(true);
    try {
      console.log('Carregando itens pendentes de transferência...');
      const response = await axios.get(API_BASE + '/itens-pendentes');
      setItensPendentes(response.data.itens || []);
      console.log(`${response.data.total} itens pendentes carregados`);
    } catch (error) {
      console.error('Erro ao carregar itens pendentes:', error);
    } finally {
      setLoadingPendentes(false);
    }
  };

  const carregarItensConcluidos = async () => {
    try {
      console.log('Carregando itens concluídos...');
      const response = await axios.get(API_BASE + '/itens-concluidos');
      setItensConcluidos(response.data.itens || []);
      console.log(`${response.data.total} itens concluídos carregados`);
    } catch (error) {
      console.error('Erro ao carregar itens concluídos:', error);
    }
  };

  const abrirModalExportar = () => {
    setExportDataInicio('');
    setExportDataFim('');
    setMostrarModalExportar(true);
  };

  const exportarConcluidosExcel = () => {
    const inicio = exportDataInicio ? new Date(exportDataInicio + 'T00:00:00') : null;
    const fim = exportDataFim ? new Date(exportDataFim + 'T23:59:59') : null;

    const opsAgrupadas = {};
    itensConcluidos.forEach(item => {
      if (item.modificado_em) {
        const dataItem = new Date(item.modificado_em);
        if (inicio && dataItem < inicio) return;
        if (fim && dataItem > fim) return;
      }
      const opKey = item.cNumOP || item.nCodOP;
      if (!opsAgrupadas[opKey]) {
        opsAgrupadas[opKey] = {
          cNumOP: item.cNumOP,
          nCodOP: item.nCodOP,
          modificado_em: item.modificado_em
        };
      }
    });

    const dados = Object.values(opsAgrupadas)
      .sort((a, b) => {
        const dataA = a.modificado_em ? new Date(a.modificado_em).getTime() : 0;
        const dataB = b.modificado_em ? new Date(b.modificado_em).getTime() : 0;
        return dataB - dataA;
      })
      .map(op => ({
        'OP': op.cNumOP || `OP ${op.nCodOP}`,
        'Data Conclusão': op.modificado_em ? new Date(op.modificado_em).toLocaleString('pt-BR') : '-'
      }));

    if (dados.length === 0) {
      alert('Nenhuma OP encontrada no período selecionado.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Concluídos');
    XLSX.writeFile(wb, `OPs_Concluidas_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`);
    setMostrarModalExportar(false);
  };

  const migrarRegistrosAntigos = async () => {
    if (!confirm('Deseja migrar todos os registros antigos para o formato correto de OP?\n\nIsso buscará o número correto (2026/XXXXX) para todos os registros que ainda usam o código interno.')) {
      return;
    }

    setLoadingSincronizacao(true);
    try {
      console.log('Iniciando migração de registros...');
      const response = await axios.post(API_BASE + '/migrar-edicoes');

      alert(`${response.data.message}\n\nMigrados: ${response.data.totalMigrados}\nErros: ${response.data.totalErros}`);

      // Recarrega os dashboards
      await carregarItensPendentes();
      await carregarItensConcluidos();

      console.log('Migração concluída!');
    } catch (error) {
      console.error('Erro na migração:', error);
      alert('Erro ao migrar registros: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoadingSincronizacao(false);
    }
  };

  const salvarEdicoes = async () => {
    if (!opDetalhada) return;

    setSalvandoEdicoes(true);
    try {
      const nCodOP = opDetalhada.identificacao?.nCodOP;
      const cNumOP = opDetalhada.identificacao?.cNumOP;

      // Monta array de produtos com as edições
      const produtosComEdicao = produtosDetalhados.map((produto, idx) => ({
        codigo: produto.codigo,
        totalSeparado: dadosEdicao[idx]?.totalSeparado || '',
        observacao: dadosEdicao[idx]?.observacao || '',
        transferido: dadosEdicao[idx]?.transferido || false
      }));

      const usuarioLogado = obterUsuarioLogado();

      console.log('Salvando edições para OP:', cNumOP);
      console.log('Produtos:', produtosComEdicao);

      const url = API_BASE + '/salvar-edicoes';
      await axios.post(url, {
        nCodOP: nCodOP,
        cNumOP: cNumOP,
        produtos: produtosComEdicao,
        usuario: usuarioLogado.nome
      });

      console.log('Edições salvas com sucesso!');
      alert('Edições salvas com sucesso!');

      // Atualiza os dashboards
      carregarItensPendentes();
      carregarItensConcluidos();
    } catch (error) {
      console.error('Erro ao salvar edições:', error);
      setError('Erro ao salvar edições: ' + (error.response?.data?.error || error.message));
    } finally {
      setSalvandoEdicoes(false);
    }
  };

  const exportarPDF = async () => {
    if (!opDetalhada) return;

    try {
      console.log('Exportando PDF...');

      const nCodOP = opDetalhada.identificacao?.nCodOP;

      const response = await axios.post(
        API_BASE + '/exportar-op-pdf',
        {
          nCodOP: nCodOP,
          opDetalhada: opDetalhada,
          produtoPrincipal: produtoPrincipal,
          produtosDetalhados: produtosDetalhados,
          dadosEdicao: dadosEdicao
        },
        {
          responseType: 'blob'
        }
      );

      // Cria um link temporário para download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `OP-${opDetalhada.identificacao?.cNumOP}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      console.log('PDF exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      alert('Erro ao exportar PDF: ' + (error.response?.data?.error || error.message));
    }
  };

  // ================== FUNÇÕES DE ASSOCIAÇÃO ==================

  const carregarAssociacao = async (cNumOP) => {
    try {
      const response = await axios.get(API_BASE + '/obter-associacao/' + encodeURIComponent(cNumOP));
      if (response.data.temAssociacao) {
        setAssociacaoAtual({
          tipo: response.data.tipo,
          opAtual: response.data.opAtual,
          opAssociada: response.data.opAssociada
        });
        return response.data.opAssociada;
      } else {
        setAssociacaoAtual(null);
        return null;
      }
    } catch (error) {
      console.error('Erro ao carregar associação:', error);
      setAssociacaoAtual(null);
      return null;
    }
  };

  const associarOP = async () => {
    if (!opDetalhada || !numeroOPFilha.trim()) return;

    setSalvandoAssociacao(true);
    try {
      const cNumOPPai = opDetalhada.identificacao?.cNumOP;
      await axios.post(API_BASE + '/associar-op', {
        cNumOPPai: cNumOPPai,
        cNumOPFilha: numeroOPFilha.trim()
      });

      alert('Associação criada com sucesso!');
      setMostrarModalAssociar(false);
      setNumeroOPFilha('');
      // Recarrega a associação e a OP associada
      const opAssociada = await carregarAssociacao(cNumOPPai);
      if (opAssociada) {
        await carregarOPAssociada(opAssociada);
      }
    } catch (error) {
      alert('Erro: ' + (error.response?.data?.error || error.message));
    } finally {
      setSalvandoAssociacao(false);
    }
  };

  const removerAssociacao = async () => {
    if (!opDetalhada) return;
    if (!confirm('Tem certeza que deseja remover a associação entre as OPs?')) return;

    try {
      const cNumOP = opDetalhada.identificacao?.cNumOP;
      await axios.post(API_BASE + '/remover-associacao', { cNumOP });
      alert('Associação removida com sucesso!');
      setAssociacaoAtual(null);
      setOpAssociadaDetalhada(null);
      setProdutosAssociados([]);
      setProdutoPrincipalAssociado(null);
      setDadosEdicaoAssociado({});
    } catch (error) {
      alert('Erro: ' + (error.response?.data?.error || error.message));
    }
  };

  const carregarOPAssociada = async (cNumOPAssociada) => {
    setLoadingAssociada(true);
    try {
      // Busca no cache
      const cacheResponse = await axios.post(API_BASE + '/buscar-op-cache', {
        numeroOP: cNumOPAssociada
      });
      const nCodOP = cacheResponse.data.op.nCodOP;

      // Busca detalhes
      const detalhesResponse = await axios.post(API_BASE + '/consultar-op', {
        nCodOP: nCodOP
      });
      setOpAssociadaDetalhada(detalhesResponse.data.op);

      // Busca produto principal
      const nCodProduto = detalhesResponse.data.op.identificacao?.nCodProduto;
      if (nCodProduto) {
        try {
          const prodResponse = await axios.post(API_BASE + '/consultar-produto', {
            codigo_produto: nCodProduto
          });
          setProdutoPrincipalAssociado({
            nCodProduto,
            codigo: prodResponse.data.produto.codigo,
            descricao: prodResponse.data.produto.descricao,
            nQtde: detalhesResponse.data.op.identificacao?.nQtde
          });
        } catch (err) {
          console.error('Erro produto principal associado:', err);
        }
      }

      // Busca produtos da estrutura
      const estrutura = detalhesResponse.data.op.estrutura?.estrutura || [];
      const itensDetalhes = detalhesResponse.data.op.itensDetalhes || [];
      const produtos = estrutura.length > 0 ? estrutura : itensDetalhes;

      if (produtos.length > 0) {
        const produtosValidos = [];
        for (let idx = 0; idx < produtos.length; idx++) {
          const item = produtos[idx];
          const codigoProduto = item.nCodProduto || item.nIdProdutoMalha;
          const quantidade = item.nQtde;
          try {
            const response = await axios.post(API_BASE + '/consultar-produto', {
              codigo_produto: codigoProduto
            });
            produtosValidos.push({
              ...response.data.produto,
              quantidade: quantidade
            });
          } catch (err) {
            console.error(`Erro produto associado ${codigoProduto}:`, err);
          }
          if (idx < produtos.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }

        const produtosOrdenados = produtosValidos.sort((a, b) => {
          const locA = (a.modelo || '').toUpperCase();
          const locB = (b.modelo || '').toUpperCase();
          return locA.localeCompare(locB);
        });

        setProdutosAssociados(produtosOrdenados);

        // Carrega edições da OP associada
        if (produtosValidos.length > 0) {
          try {
            const edicResponse = await axios.get(API_BASE + '/obter-edicoes/' + nCodOP);
            const edicaoSalva = edicResponse.data.edicao;
            if (edicaoSalva && edicaoSalva.produtos && edicaoSalva.produtos.length > 0) {
              const novaEdicao = {};
              produtosValidos.forEach((produto, idx) => {
                const edicaoProduto = edicaoSalva.produtos.find(p => p.codigo === produto.codigo);
                if (edicaoProduto) {
                  novaEdicao[idx] = {
                    totalSeparado: edicaoProduto.totalSeparado || '',
                    observacao: edicaoProduto.observacao || '',
                    transferido: edicaoProduto.transferido || false
                  };
                }
              });
              setDadosEdicaoAssociado(novaEdicao);
            }
          } catch (err) {
            console.error('Erro edições associado:', err);
          }
        }
      }
    } catch (error) {
      console.error('Erro ao carregar OP associada:', error);
    } finally {
      setLoadingAssociada(false);
    }
  };

  const carregarEdicoes = async (nCodOP, produtosCarregados) => {
    try {
      console.log('Carregando edições para OP:', nCodOP);
      console.log('Produtos carregados:', produtosCarregados.map(p => p.codigo));

      const response = await axios.get(API_BASE + '/obter-edicoes/' + nCodOP);
      const edicaoSalva = response.data.edicao;

      console.log('Edição salva recebida:', edicaoSalva);

      if (edicaoSalva && edicaoSalva.produtos && edicaoSalva.produtos.length > 0) {
        const novaEdicao = {};

        produtosCarregados.forEach((produto, idx) => {
          const edicaoProduto = edicaoSalva.produtos.find(p => p.codigo === produto.codigo);
          if (edicaoProduto) {
            console.log(`Match encontrado para ${produto.codigo}:`, edicaoProduto);
            novaEdicao[idx] = {
              totalSeparado: edicaoProduto.totalSeparado || '',
              observacao: edicaoProduto.observacao || '',
              transferido: edicaoProduto.transferido || false
            };
          } else {
            console.log(`Nenhum match para ${produto.codigo}`);
          }
        });

        setDadosEdicao(novaEdicao);

        // Carrega informações de auditoria
        if (edicaoSalva.modificado_por || edicaoSalva.modificado_em) {
          setInfoAuditoria({
            modificado_por: edicaoSalva.modificado_por,
            modificado_em: edicaoSalva.modificado_em
          });
        }

        console.log('Edições carregadas:', Object.keys(novaEdicao).length, 'produtos');
        console.log('Dados de edição final:', novaEdicao);
      } else {
        console.log('Nenhuma edição salva encontrada para esta OP');
        setInfoAuditoria(null);
      }
    } catch (error) {
      console.error('Erro ao carregar edições:', error);
      // Não mostra erro pro usuário, apenas loga
    }
  };

  const abrirOP = (numeroOPParaAbrir) => {
    setNumeroOP(numeroOPParaAbrir);
    setAbaAtiva('pesquisar');
    // Chama consultarOP passando o número diretamente
    consultarOP(numeroOPParaAbrir);
  };

  const consultarOP = async (numeroOPParam, forcarAtualizar = false) => {
    // Usa o parâmetro se fornecido (e se for string), senão usa o estado
    const opParaBuscar = (typeof numeroOPParam === 'string' && numeroOPParam) ? numeroOPParam : numeroOP;

    if (!opParaBuscar || !opParaBuscar.trim()) {
      setError('Digite o número da OP');
      return;
    }

    setLoadingDetalhes(true);
    setError('');
    setProdutosDetalhados([]);
    setProdutoPrincipal(null);
    setDadosEdicao({});
    setOpAssociadaDetalhada(null);
    setProdutosAssociados([]);
    setProdutoPrincipalAssociado(null);
    setDadosEdicaoAssociado({});
    setAssociacaoAtual(null);
    setOpCacheAtualizadoEm(null);
    setCarregadoDoCache(false);

    try {
      // 1. Localiza nCodOP a partir do número (busca no cache de lista de OPs)
      let cacheResponse;
      try {
        cacheResponse = await axios.post(API_BASE + '/buscar-op-cache', {
          numeroOP: opParaBuscar.trim()
        });
      } catch (cacheError) {
        if (cacheError.response?.status === 404) {
          await axios.post(API_BASE + '/sincronizar-cache');
          cacheResponse = await axios.post(API_BASE + '/buscar-op-cache', {
            numeroOP: opParaBuscar.trim()
          });
        } else {
          throw cacheError;
        }
      }

      const nCodOP = cacheResponse.data.op.nCodOP;

      // 2. Se não estiver forçando atualização, tenta carregar do cache de detalhes
      if (!forcarAtualizar) {
        try {
          const cacheDetalhesResp = await axios.get(`${API_BASE}/op-detalhes-cache/${nCodOP}`);
          const dados = cacheDetalhesResp.data;
          if (dados?.opDetalhada) {
            setOpDetalhada(dados.opDetalhada);
            setProdutoPrincipal(dados.produtoPrincipal || null);
            setProdutosDetalhados(dados.produtosDetalhados || []);
            setOpCacheAtualizadoEm(dados.atualizadoEm || null);
            setCarregadoDoCache(true);

            // Carrega edições e associação (são locais, mas o cache pode ter sido feito antes de edições)
            if ((dados.produtosDetalhados || []).length > 0) {
              await carregarEdicoes(nCodOP, dados.produtosDetalhados);
            }
            const cNumOPAtual = dados.opDetalhada.identificacao?.cNumOP;
            if (cNumOPAtual) {
              const opAssociada = await carregarAssociacao(cNumOPAtual);
              if (opAssociada) {
                await carregarOPAssociada(opAssociada);
              }
            }
            setLoadingDetalhes(false);
            return;
          }
        } catch (cacheDetErr) {
          if (cacheDetErr.response?.status !== 404) {
            console.warn('[CACHE-DETALHES] Falha ao ler cache, seguindo para Omie:', cacheDetErr.message);
          }
        }
      }

      // 3. Busca completa no Omie (primeira vez ou atualização forçada)
      const detalhesResponse = await axios.post(API_BASE + '/consultar-op', {
        nCodOP: nCodOP
      });

      setOpDetalhada(detalhesResponse.data.op);

      // Busca detalhes do produto principal da OP
      let produtoPrincipalSalvo = null;
      const nCodProdutoPrincipal = detalhesResponse.data.op.identificacao?.nCodProduto;
      if (nCodProdutoPrincipal) {
        try {
          console.log(`Buscando produto principal ${nCodProdutoPrincipal}...`);
          const produtoPrincipalResponse = await axios.post(API_BASE + '/consultar-produto', {
            codigo_produto: nCodProdutoPrincipal
          });
          console.log(`Produto principal retornado:`, produtoPrincipalResponse.data.produto);
          produtoPrincipalSalvo = {
            nCodProduto: nCodProdutoPrincipal,
            codigo: produtoPrincipalResponse.data.produto.codigo,
            descricao: produtoPrincipalResponse.data.produto.descricao,
            nQtde: detalhesResponse.data.op.identificacao?.nQtde
          };
          setProdutoPrincipal(produtoPrincipalSalvo);
        } catch (err) {
          console.error(`ERRO ao buscar produto principal ${nCodProdutoPrincipal}:`, err.response?.data || err.message);
        }
      }

      // Busca detalhes dos produtos - pode estar em estrutura.estrutura ou itensDetalhes
      const estrutura = detalhesResponse.data.op.estrutura?.estrutura || [];
      const itensDetalhes = detalhesResponse.data.op.itensDetalhes || [];
      const produtos = estrutura.length > 0 ? estrutura : itensDetalhes;

      let produtosOrdenadosFinal = [];

      if (produtos.length > 0) {
        console.log(`Encontrados ${produtos.length} produtos na estrutura`);
        console.log('Códigos dos produtos:', produtos.map(item => item.nCodProduto || item.nIdProdutoMalha));

        // Busca produtos SEQUENCIALMENTE com delay para evitar rate limit
        const produtosValidos = [];

        for (let idx = 0; idx < produtos.length; idx++) {
          const item = produtos[idx];
          const codigoProduto = item.nCodProduto || item.nIdProdutoMalha;
          const quantidade = item.nQtde; // Preserva a quantidade do item

          console.log(`[${idx + 1}/${produtos.length}] Buscando produto ${codigoProduto}...`);

          try {
            const response = await axios.post(API_BASE + '/consultar-produto', {
              codigo_produto: codigoProduto
            });
            console.log(`[${idx + 1}/${produtos.length}] Produto ${codigoProduto} retornado com sucesso:`, response.data.produto.codigo);

            // Combina os dados do produto com a quantidade do item
            produtosValidos.push({
              ...response.data.produto,
              quantidade: quantidade  // Adiciona a quantidade do item da OP
            });
          } catch (err) {
            console.error(`[${idx + 1}/${produtos.length}] ERRO ao buscar produto ${codigoProduto}:`, err.response?.data || err.message);
          }

          // Delay de 300ms entre requisições para evitar rate limit
          if (idx < produtos.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }

        console.log(`Total de produtos retornados com sucesso: ${produtosValidos.length} de ${produtos.length}`);
        console.log('Produtos válidos:', produtosValidos.map(p => `${p.codigo} (Qtd: ${p.quantidade})`));

        const produtosFalharam = produtos.length - produtosValidos.length;
        if (produtosFalharam > 0) {
          console.warn(`${produtosFalharam} produto(s) falharam ao buscar`);
        }

        // Ordena produtos por localização (modelo) em ordem alfabética A-Z
        produtosOrdenadosFinal = produtosValidos.sort((a, b) => {
          const localizacaoA = (a.modelo || '').toUpperCase();
          const localizacaoB = (b.modelo || '').toUpperCase();
          return localizacaoA.localeCompare(localizacaoB);
        });

        setProdutosDetalhados(produtosOrdenadosFinal);

        // Carrega as edições salvas após carregar os produtos
        if (produtosValidos.length > 0) {
          await carregarEdicoes(nCodOP, produtosValidos);
        }
      }

      // 4. Persiste no cache de detalhes (mesmo que não tenha produtos — caso o usuário queira ver depois sem chamar Omie)
      try {
        const respSalvarCache = await axios.post(`${API_BASE}/op-detalhes-cache`, {
          nCodOP,
          opDetalhada: detalhesResponse.data.op,
          produtoPrincipal: produtoPrincipalSalvo,
          produtosDetalhados: produtosOrdenadosFinal
        });
        if (respSalvarCache.data?.atualizadoEm) {
          setOpCacheAtualizadoEm(respSalvarCache.data.atualizadoEm);
        }
      } catch (errCache) {
        console.warn('[CACHE-DETALHES] Falha ao salvar cache:', errCache.message);
      }

      // Após carregar a OP principal, verifica se tem associação
      const cNumOPAtual = detalhesResponse.data.op.identificacao?.cNumOP;
      if (cNumOPAtual) {
        const opAssociada = await carregarAssociacao(cNumOPAtual);
        if (opAssociada) {
          await carregarOPAssociada(opAssociada);
        }
      }
    } catch (error) {
      setError(error.response?.data?.error || error.message);
    } finally {
      setLoadingDetalhes(false);
    }
  };

  // Helper: filter input classes for table headers
  const filterInputClass = "w-full px-1.5 py-1 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-700 dark:text-gray-200 outline-none focus:ring-1 focus:ring-primary-500 box-border";
  const filterSelectClass = "w-full px-0.5 py-1 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-700 dark:text-gray-200 box-border";

  // Tela de não autenticado
  if (!autenticado) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-[600px] mx-auto mt-24 p-10 bg-white dark:bg-gray-800 rounded-xl shadow-lg text-center animate-fade-in">
          <div className="flex justify-center mb-5">
            <Lock className="w-12 h-12 text-gray-400 dark:text-gray-500" />
          </div>
          <h2 className="text-gray-800 dark:text-gray-100 mb-4 text-xl font-bold">Acesso Restrito</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Por favor, faça login através do Menu Principal para acessar este programa.
          </p>
          <button
            className="px-6 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg text-sm font-semibold cursor-pointer hover:-translate-y-0.5 hover:shadow-lg transition-all"
            onClick={() => window.location.href = 'http://192.168.1.70:3000'}
          >
            Ir para Menu Principal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8 transition-colors duration-300">
      {/* HEADER */}
      <header className="max-w-[1400px] mx-auto mb-6 flex items-center gap-4">
        <a
          href={`http://${window.location.hostname}:3000`}
          title="Voltar ao Menu Principal"
          className="w-14 h-14 rounded-[10px] bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white shadow-lg shadow-primary-500/30 cursor-pointer hover:scale-105 hover:shadow-xl transition-all"
        >
          <Settings className="w-6 h-6" />
        </a>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 m-0">Separador de OP - IVOLV</h1>
          <p className="text-gray-500 dark:text-gray-400 text-[13px] m-0">Ordens de Produção por data de conclusão</p>
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="ml-4 p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-yellow-400 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          title={darkMode ? 'Modo claro' : 'Modo escuro'}
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* Espaçador para manter layout */}
        <div className="ml-auto"></div>
      </header>

      {/* BARRA DE PROGRESSO DA SINCRONIZAÇÃO */}
      {progressoSincronizacao && (
        <div className="max-w-[1400px] mx-auto mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-5 border-2 border-blue-500 animate-fade-in">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {progressoSincronizacao.mensagem}
            </span>
            <span className="text-lg font-bold text-blue-500">
              {progressoSincronizacao.porcentagem}%
            </span>
          </div>
          <div className="w-full h-6 bg-gray-200 dark:bg-gray-700 rounded-xl overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-blue-400 to-blue-500 rounded-xl transition-[width] duration-300 shadow-[0_2px_8px_rgba(59,130,246,0.4)]"
              style={{ width: `${progressoSincronizacao.porcentagem}%` }}
            />
          </div>
          {progressoSincronizacao.totalPaginas > 0 && (
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center font-medium">
              Página {progressoSincronizacao.paginaAtual} de {progressoSincronizacao.totalPaginas}
            </div>
          )}
        </div>
      )}

      {/* NAVEGAÇÃO DE ABAS */}
      <div className="max-w-[1400px] mx-auto mb-5 flex gap-2 border-b-2 border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setAbaAtiva('pesquisar')}
          className={`px-6 py-3 text-[15px] font-semibold border-none rounded-t-lg transition-all flex items-center gap-2 ${
            abaAtiva === 'pesquisar'
              ? 'border-b-[3px] border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
              : 'border-b-[3px] border-transparent bg-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Search className="w-4 h-4" />
          Pesquisar
        </button>
        <button
          onClick={() => setAbaAtiva('andamento')}
          className={`px-6 py-3 text-[15px] font-semibold border-none rounded-t-lg transition-all relative flex items-center gap-2 ${
            abaAtiva === 'andamento'
              ? 'border-b-[3px] border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300'
              : 'border-b-[3px] border-transparent bg-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Clock className="w-4 h-4" />
          Em Andamento
          {itensPendentes.length > 0 && (() => {
            const opsUnicas = new Set(itensPendentes.map(item => item.cNumOP || item.nCodOP));
            return (
              <span className="absolute top-1 right-1 bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[11px] font-bold">
                {opsUnicas.size}
              </span>
            );
          })()}
        </button>
        <button
          onClick={() => setAbaAtiva('concluidos')}
          className={`px-6 py-3 text-[15px] font-semibold border-none rounded-t-lg transition-all flex items-center gap-2 ${
            abaAtiva === 'concluidos'
              ? 'border-b-[3px] border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'
              : 'border-b-[3px] border-transparent bg-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Concluídos
          {itensConcluidos.length > 0 && (() => {
            const opsUnicas = new Set(itensConcluidos.map(item => item.cNumOP || item.nCodOP));
            return (
              <span className="ml-2 bg-emerald-500 text-white rounded-full px-2 py-0.5 text-[11px] font-bold">
                {opsUnicas.size}
              </span>
            );
          })()}
        </button>
      </div>

      {/* CONTEÚDO DA ABA PESQUISAR */}
      {abaAtiva === 'pesquisar' && (
        <>
          <div className="max-w-[1400px] mx-auto mb-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 animate-fade-in">
            <label className="block text-[13px] text-gray-500 dark:text-gray-400 mb-2 font-semibold">Consultar detalhes de uma OP:</label>
            <div className="flex gap-2.5 items-end flex-wrap">
              <div className="flex-1 max-w-[400px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Digite o número da OP (ex: 2026/19695)"
                  value={numeroOP}
                  onChange={(e) => setNumeroOP(e.target.value)}
                  className="h-12 w-full pl-12 pr-4 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                  onKeyDown={(e) => e.key === 'Enter' && consultarOP()}
                />
              </div>
              <button
                className={`flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg font-semibold text-sm shadow-lg hover:-translate-y-0.5 hover:shadow-xl transition-all ml-7 ${loadingDetalhes ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                onClick={consultarOP}
                disabled={loadingDetalhes}
              >
                {loadingDetalhes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {loadingDetalhes ? 'Consultando...' : 'Consultar'}
              </button>
            </div>
          </div>

          {error && (
            <div className="max-w-[1400px] mx-auto mb-4 bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 p-3 rounded-lg text-sm text-red-700 dark:text-red-300 animate-shake">
              <strong>Erro:</strong> {error}
            </div>
          )}

          {opDetalhada && (
            <div className="max-w-[1400px] mx-auto mb-4 bg-primary-50 dark:bg-gray-800 rounded-xl shadow-lg p-6 border-l-4 border-primary-500 animate-fade-in">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 m-0 flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-primary-600" />
                    OP-{opDetalhada.identificacao?.cNumOP}
                    <button
                      type="button"
                      title={opCopiado ? 'Copiado!' : 'Copiar número da OP'}
                      onClick={async () => {
                        const texto = `OP-${opDetalhada.identificacao?.cNumOP ?? ''}`;
                        const ok = await copiarTextoCompat(texto);
                        if (ok) {
                          setOpCopiado(true);
                          setTimeout(() => setOpCopiado(false), 1500);
                        } else {
                          setError('Não foi possível copiar. Selecione o texto manualmente.');
                        }
                      }}
                      className={`ml-1 p-1.5 rounded-md transition-colors ${
                        opCopiado
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                          : 'text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {opCopiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      title="Atualizar dados da OP no Omie"
                      disabled={loadingDetalhes}
                      onClick={() => consultarOP(opDetalhada.identificacao?.cNumOP, true)}
                      className={`ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border transition-colors ${
                        loadingDetalhes
                          ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 border-gray-200 dark:border-gray-600 cursor-not-allowed'
                          : 'bg-white dark:bg-gray-700 text-primary-700 dark:text-primary-300 border-primary-300 dark:border-primary-700 hover:bg-primary-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingDetalhes ? 'animate-spin' : ''}`} />
                      Atualizar
                    </button>
                  </h2>
                  {opCacheAtualizadoEm && (
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 ml-7 flex items-center gap-1.5">
                      {carregadoDoCache ? (
                        <>
                          <Clock className="w-3 h-3" />
                          <span>Dados em cache · atualizado em {new Date(opCacheAtualizadoEm).toLocaleString('pt-BR')}</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          <span>Atualizado agora a partir do Omie</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-3 items-center flex-wrap">
                  {associacaoAtual ? (
                    <button
                      className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg font-semibold text-sm shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer"
                      onClick={removerAssociacao}
                    >
                      <Link2 className="w-4 h-4" />
                      Remover Associação
                    </button>
                  ) : (
                    <button
                      className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-violet-500 to-violet-600 text-white rounded-lg font-semibold text-sm shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer"
                      onClick={() => setMostrarModalAssociar(true)}
                    >
                      <Link2 className="w-4 h-4" />
                      Associar OP
                    </button>
                  )}
                  <button
                    className={`flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg font-semibold text-sm shadow-md transition-all ${sincronizandoAjustes ? 'opacity-70 cursor-not-allowed' : 'hover:-translate-y-0.5 hover:shadow-lg cursor-pointer'}`}
                    onClick={sincronizarAjustesEstoque}
                    disabled={sincronizandoAjustes}
                    title="Sincronizar ajustes de estoque do Omie e atualizar a coluna Status"
                  >
                    <RefreshCw className={`w-4 h-4 ${sincronizandoAjustes ? 'animate-spin' : ''}`} />
                    {sincronizandoAjustes ? 'Sincronizando...' : 'Sincronizar Ajustes'}
                  </button>
                  <button
                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold text-sm shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer"
                    onClick={exportarPDF}
                  >
                    <FileText className="w-4 h-4" />
                    Exportar PDF
                  </button>
                  <button
                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg font-semibold text-sm shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer"
                    onClick={() => {
                      setOpDetalhada(null);
                      setProdutosDetalhados([]);
                      setDadosEdicao({});
                      setInfoAuditoria(null);
                      setAssociacaoAtual(null);
                      setOpAssociadaDetalhada(null);
                      setProdutosAssociados([]);
                      setProdutoPrincipalAssociado(null);
                      setDadosEdicaoAssociado({});
                    }}
                  >
                    <X className="w-4 h-4" />
                    Fechar
                  </button>
                </div>
              </div>

              {/* Mensagem de progresso da sincronização de ajustes */}
              {progressoAjustesMsg && (
                <div className="mb-4 px-3.5 py-2.5 rounded-md text-sm flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300">
                  {sincronizandoAjustes && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                  <span>{progressoAjustesMsg}</span>
                </div>
              )}

              {/* BADGE DE ASSOCIAÇÃO */}
              {associacaoAtual && (
                <div className="bg-violet-100 dark:bg-violet-900/30 border border-violet-300 dark:border-violet-700 rounded-lg px-4 py-3 mb-4 flex items-center gap-2.5">
                  <Link2 className="w-5 h-5 text-violet-700 dark:text-violet-400" />
                  <span className="text-[13px] text-violet-800 dark:text-violet-300 font-semibold">
                    OP Associada: {associacaoAtual.opAssociada} ({associacaoAtual.tipo === 'pai' ? 'esta é a PAI' : 'esta é a FILHA'})
                  </span>
                  {loadingAssociada && <Loader2 className="w-4 h-4 animate-spin text-violet-600" />}
                </div>
              )}

              {/* MODAL ASSOCIAR OP */}
              {mostrarModalAssociar && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-8 max-w-[450px] w-[90%] shadow-2xl animate-fade-in">
                    <h3 className="m-0 mb-2 text-gray-800 dark:text-gray-100 text-lg font-bold flex items-center gap-2">
                      <Link2 className="w-5 h-5 text-violet-600" />
                      Associar OP Filha
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 text-[13px] m-0 mb-1.5">
                      <strong>OP Pai:</strong> {opDetalhada.identificacao?.cNumOP} (atual)
                    </p>
                    <p className="text-gray-500 dark:text-gray-400 text-[13px] m-0 mb-5">
                      Digite abaixo o número da OP filha. Ao pesquisar qualquer uma das duas, ambas serão exibidas.
                    </p>
                    <input
                      type="text"
                      placeholder="Número da OP filha (ex: 2026/19695)"
                      value={numeroOPFilha}
                      onChange={(e) => setNumeroOPFilha(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && associarOP()}
                      className="w-full h-12 px-3.5 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-[15px] mb-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 box-border"
                      autoFocus
                    />
                    <div className="flex gap-3 justify-end">
                      <button
                        className="px-5 py-2.5 bg-gray-500 text-white rounded-lg font-semibold text-sm cursor-pointer hover:bg-gray-600 transition-colors"
                        onClick={() => { setMostrarModalAssociar(false); setNumeroOPFilha(''); }}
                      >
                        Cancelar
                      </button>
                      <button
                        className={`flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-500 to-violet-600 text-white rounded-lg font-semibold text-sm shadow-md hover:-translate-y-0.5 transition-all ${salvandoAssociacao ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                        onClick={associarOP}
                        disabled={salvandoAssociacao || !numeroOPFilha.trim()}
                      >
                        {salvandoAssociacao && <Loader2 className="w-4 h-4 animate-spin" />}
                        {salvandoAssociacao ? 'Associando...' : <><Link2 className="w-4 h-4" /> Associar</>}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* INFORMAÇÕES DO PRODUTO PRINCIPAL */}
              {produtoPrincipal && (
                <div className="bg-white dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 mb-5">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0 mb-3 uppercase tracking-wide">
                    Produto Principal
                  </h3>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
                    <div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold mb-1">Código</div>
                      <div className="text-sm text-gray-900 dark:text-gray-100 font-medium">{produtoPrincipal.codigo || '-'}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold mb-1">Descrição</div>
                      <div className="text-sm text-gray-900 dark:text-gray-100 font-medium">{produtoPrincipal.descricao || '-'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold mb-1">Quantidade</div>
                      <div className="text-sm text-gray-900 dark:text-gray-100 font-medium">{produtoPrincipal.nQtde}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* TABELA DE PRODUTOS */}
              {produtosDetalhados.length > 0 && (() => {
                // Aplica filtros mantendo o índice original
                const produtosFiltrados = produtosDetalhados.map((produto, idx) => ({ produto, idx })).filter(({ produto, idx }) => {
                  if (filtros.codigo && !String(produto.codigo || '').toLowerCase().includes(filtros.codigo.toLowerCase())) return false;
                  if (filtros.descricao && !String(produto.descricao || '').toLowerCase().includes(filtros.descricao.toLowerCase())) return false;
                  if (filtros.localizacao && !String(produto.modelo || '').toLowerCase().includes(filtros.localizacao.toLowerCase())) return false;
                  if (filtros.qtd && !String(produto.quantidade || '').includes(filtros.qtd)) return false;
                  if (filtros.totalSeparado && !String(dadosEdicao[idx]?.totalSeparado || '').includes(filtros.totalSeparado)) return false;
                  if (filtros.observacao && !String(dadosEdicao[idx]?.observacao || '').toLowerCase().includes(filtros.observacao.toLowerCase())) return false;
                  if (filtros.transferido === 'marcados' && !dadosEdicao[idx]?.transferido) return false;
                  if (filtros.transferido === 'desmarcados' && dadosEdicao[idx]?.transferido) return false;
                  return true;
                });

                return (
                  <>
                    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mt-5 mb-3 flex items-center gap-2">
                      <Package className="w-4 h-4 text-primary-600" />
                      Detalhes dos Produtos {produtosFiltrados.length !== produtosDetalhados.length && `(${produtosFiltrados.length} de ${produtosDetalhados.length})`}
                    </h3>
                    <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-700 border-b-2 border-gray-200 dark:border-gray-600">
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[80px]">TRANSF.</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[110px]">Código</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[300px]">Descrição</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[120px]">Localização</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[50px]">QTD</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[70px]">TOT SEP</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[160px]">Observação</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[120px]">Status</th>
                          </tr>
                          <tr className="bg-gray-100 dark:bg-gray-700">
                            <th className="p-1">
                              <select
                                value={filtros.transferido}
                                onChange={(e) => setFiltros({...filtros, transferido: e.target.value})}
                                className={filterSelectClass}
                              >
                                <option value="todos">Todos</option>
                                <option value="marcados">&#10003;</option>
                                <option value="desmarcados">&#10007;</option>
                              </select>
                            </th>
                            <th className="p-1">
                              <input type="text" placeholder="Filtrar..." value={filtros.codigo}
                                onChange={(e) => setFiltros({...filtros, codigo: e.target.value})}
                                className={filterInputClass} />
                            </th>
                            <th className="p-1">
                              <input type="text" placeholder="Filtrar..." value={filtros.descricao}
                                onChange={(e) => setFiltros({...filtros, descricao: e.target.value})}
                                className={filterInputClass} />
                            </th>
                            <th className="p-1">
                              <input type="text" placeholder="Filtrar..." value={filtros.localizacao}
                                onChange={(e) => setFiltros({...filtros, localizacao: e.target.value})}
                                className={filterInputClass} />
                            </th>
                            <th className="p-1">
                              <input type="text" placeholder="..." value={filtros.qtd}
                                onChange={(e) => setFiltros({...filtros, qtd: e.target.value})}
                                className={filterInputClass} />
                            </th>
                            <th className="p-1">
                              <input type="text" placeholder="..." value={filtros.totalSeparado}
                                onChange={(e) => setFiltros({...filtros, totalSeparado: e.target.value})}
                                className={filterInputClass} />
                            </th>
                            <th className="p-1">
                              <input type="text" placeholder="Filtrar..." value={filtros.observacao}
                                onChange={(e) => setFiltros({...filtros, observacao: e.target.value})}
                                className={filterInputClass} />
                            </th>
                            <th className="p-1"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {produtosFiltrados.map(({ produto, idx }) => (
                            <tr key={idx} className={`${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'} hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors`}>
                              <td className="px-4 py-3.5 text-center text-gray-600 dark:text-gray-300">
                                <input
                                  type="checkbox"
                                  checked={dadosEdicao[idx]?.transferido || false}
                                  onChange={(e) => setDadosEdicao({
                                    ...dadosEdicao,
                                    [idx]: { ...dadosEdicao[idx], transferido: e.target.checked }
                                  })}
                                  className="w-[18px] h-[18px] cursor-pointer accent-primary-600"
                                />
                              </td>
                              <td className="px-4 py-3.5 font-semibold text-gray-900 dark:text-white overflow-hidden text-ellipsis whitespace-nowrap">{produto.codigo || '-'}</td>
                              <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300 overflow-hidden text-ellipsis whitespace-nowrap">{produto.descricao || '-'}</td>
                              <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300 overflow-hidden text-ellipsis whitespace-nowrap">{produto.modelo || '-'}</td>
                              <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">{produto.quantidade || '-'}</td>
                              <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={dadosEdicao[idx]?.totalSeparado || ''}
                                  onChange={(e) => setDadosEdicao({
                                    ...dadosEdicao,
                                    [idx]: { ...dadosEdicao[idx], totalSeparado: e.target.value.replace(/[^0-9]/g, '') }
                                  })}
                                  className="w-full px-1.5 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-700 dark:text-gray-200 outline-none focus:ring-1 focus:ring-primary-500 box-border"
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                                <input
                                  type="text"
                                  value={dadosEdicao[idx]?.observacao || ''}
                                  onChange={(e) => setDadosEdicao({
                                    ...dadosEdicao,
                                    [idx]: { ...dadosEdicao[idx], observacao: e.target.value }
                                  })}
                                  className="w-full px-1.5 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-700 dark:text-gray-200 outline-none focus:ring-1 focus:ring-primary-500 box-border"
                                  placeholder="Obs..."
                                />
                              </td>
                              <td className="px-4 py-3.5">
                                {(() => {
                                  const st = obterStatusAjuste(produto);
                                  return (
                                    <span className={`text-xs font-semibold ${st.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
                                      {st.texto}
                                    </span>
                                  );
                                })()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Informações de Auditoria */}
                    {infoAuditoria && (
                      <div className="mt-3 px-3.5 py-2.5 bg-primary-50 dark:bg-primary-900/20 border border-primary-300 dark:border-primary-700 rounded-md text-xs text-primary-800 dark:text-primary-300">
                        <strong>Última modificação:</strong> {infoAuditoria.modificado_por} em {new Date(infoAuditoria.modificado_em).toLocaleString('pt-BR')}
                      </div>
                    )}

                    {/* Botão Salvar */}
                    <div className="flex justify-end mt-4">
                      <button
                        className={`flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg font-semibold text-[15px] shadow-lg hover:-translate-y-0.5 hover:shadow-xl transition-all ${salvandoEdicoes ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                        onClick={salvarEdicoes}
                        disabled={salvandoEdicoes}
                      >
                        {salvandoEdicoes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {salvandoEdicoes ? 'Salvando...' : 'Salvar Edições'}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* OP ASSOCIADA */}
          {opAssociadaDetalhada && associacaoAtual && (
            <div className="max-w-[1400px] mx-auto mb-4 bg-violet-50 dark:bg-gray-800 rounded-xl shadow-lg p-6 border-l-4 border-violet-500 animate-fade-in">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 m-0 flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-violet-600" />
                  OP Associada ({associacaoAtual.tipo === 'pai' ? 'Filha' : 'Pai'}) - {opAssociadaDetalhada.identificacao?.cNumOP}
                </h2>
                <button
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-violet-500 to-violet-600 text-white rounded-lg font-semibold text-sm shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer"
                  onClick={() => abrirOP(opAssociadaDetalhada.identificacao?.cNumOP)}
                >
                  <ExternalLink className="w-4 h-4" />
                  Abrir esta OP
                </button>
              </div>

              {/* Produto Principal Associado */}
              {produtoPrincipalAssociado && (
                <div className="bg-white dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 mb-5">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0 mb-3 uppercase tracking-wide">
                    Produto Principal
                  </h3>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
                    <div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold mb-1">Código</div>
                      <div className="text-sm text-gray-900 dark:text-gray-100 font-medium">{produtoPrincipalAssociado.codigo || '-'}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold mb-1">Descrição</div>
                      <div className="text-sm text-gray-900 dark:text-gray-100 font-medium">{produtoPrincipalAssociado.descricao || '-'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold mb-1">Quantidade</div>
                      <div className="text-sm text-gray-900 dark:text-gray-100 font-medium">{produtoPrincipalAssociado.nQtde}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tabela de Produtos Associados */}
              {produtosAssociados.length > 0 && (() => {
                const produtosFiltradosAssoc = produtosAssociados.map((produto, idx) => ({ produto, idx })).filter(({ produto, idx }) => {
                  if (filtrosAssociado.codigo && !String(produto.codigo || '').toLowerCase().includes(filtrosAssociado.codigo.toLowerCase())) return false;
                  if (filtrosAssociado.descricao && !String(produto.descricao || '').toLowerCase().includes(filtrosAssociado.descricao.toLowerCase())) return false;
                  if (filtrosAssociado.localizacao && !String(produto.modelo || '').toLowerCase().includes(filtrosAssociado.localizacao.toLowerCase())) return false;
                  if (filtrosAssociado.qtd && !String(produto.quantidade || '').includes(filtrosAssociado.qtd)) return false;
                  if (filtrosAssociado.totalSeparado && !String(dadosEdicaoAssociado[idx]?.totalSeparado || '').includes(filtrosAssociado.totalSeparado)) return false;
                  if (filtrosAssociado.observacao && !String(dadosEdicaoAssociado[idx]?.observacao || '').toLowerCase().includes(filtrosAssociado.observacao.toLowerCase())) return false;
                  if (filtrosAssociado.transferido === 'marcados' && !dadosEdicaoAssociado[idx]?.transferido) return false;
                  if (filtrosAssociado.transferido === 'desmarcados' && dadosEdicaoAssociado[idx]?.transferido) return false;
                  return true;
                });

                return (
                  <>
                    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mt-5 mb-3 flex items-center gap-2">
                      <Package className="w-4 h-4 text-violet-600" />
                      Detalhes dos Produtos {produtosFiltradosAssoc.length !== produtosAssociados.length && `(${produtosFiltradosAssoc.length} de ${produtosAssociados.length})`}
                    </h3>
                    <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-700 border-b-2 border-gray-200 dark:border-gray-600">
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[80px]">TRANSF.</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[110px]">Código</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[300px]">Descrição</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[120px]">Localização</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[50px]">QTD</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[70px]">TOT SEP</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 w-[160px]">Observação</th>
                          </tr>
                          <tr className="bg-gray-100 dark:bg-gray-700">
                            <th className="p-1">
                              <select value={filtrosAssociado.transferido}
                                onChange={(e) => setFiltrosAssociado({...filtrosAssociado, transferido: e.target.value})}
                                className={filterSelectClass}>
                                <option value="todos">Todos</option>
                                <option value="marcados">&#10003;</option>
                                <option value="desmarcados">&#10007;</option>
                              </select>
                            </th>
                            <th className="p-1">
                              <input type="text" placeholder="Filtrar..." value={filtrosAssociado.codigo}
                                onChange={(e) => setFiltrosAssociado({...filtrosAssociado, codigo: e.target.value})}
                                className={filterInputClass} />
                            </th>
                            <th className="p-1">
                              <input type="text" placeholder="Filtrar..." value={filtrosAssociado.descricao}
                                onChange={(e) => setFiltrosAssociado({...filtrosAssociado, descricao: e.target.value})}
                                className={filterInputClass} />
                            </th>
                            <th className="p-1">
                              <input type="text" placeholder="Filtrar..." value={filtrosAssociado.localizacao}
                                onChange={(e) => setFiltrosAssociado({...filtrosAssociado, localizacao: e.target.value})}
                                className={filterInputClass} />
                            </th>
                            <th className="p-1">
                              <input type="text" placeholder="..." value={filtrosAssociado.qtd}
                                onChange={(e) => setFiltrosAssociado({...filtrosAssociado, qtd: e.target.value})}
                                className={filterInputClass} />
                            </th>
                            <th className="p-1">
                              <input type="text" placeholder="..." value={filtrosAssociado.totalSeparado}
                                onChange={(e) => setFiltrosAssociado({...filtrosAssociado, totalSeparado: e.target.value})}
                                className={filterInputClass} />
                            </th>
                            <th className="p-1">
                              <input type="text" placeholder="Filtrar..." value={filtrosAssociado.observacao}
                                onChange={(e) => setFiltrosAssociado({...filtrosAssociado, observacao: e.target.value})}
                                className={filterInputClass} />
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {produtosFiltradosAssoc.map(({ produto, idx }) => (
                            <tr key={idx} className={`${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'} hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors`}>
                              <td className="px-4 py-3.5 text-center text-gray-600 dark:text-gray-300">
                                <input
                                  type="checkbox"
                                  checked={dadosEdicaoAssociado[idx]?.transferido || false}
                                  disabled
                                  className="w-[18px] h-[18px]"
                                />
                              </td>
                              <td className="px-4 py-3.5 font-semibold text-gray-900 dark:text-white overflow-hidden text-ellipsis whitespace-nowrap">{produto.codigo || '-'}</td>
                              <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300 overflow-hidden text-ellipsis whitespace-nowrap">{produto.descricao || '-'}</td>
                              <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300 overflow-hidden text-ellipsis whitespace-nowrap">{produto.modelo || '-'}</td>
                              <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">{produto.quantidade || '-'}</td>
                              <td className="px-4 py-3.5 font-semibold text-gray-900 dark:text-white">{dadosEdicaoAssociado[idx]?.totalSeparado || '-'}</td>
                              <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">{dadosEdicaoAssociado[idx]?.observacao || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </>
      )}

      {/* CONTEÚDO DA ABA EM ANDAMENTO */}
      {abaAtiva === 'andamento' && (
        <div className="max-w-[1400px] mx-auto mb-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 animate-fade-in">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 m-0 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Itens Aguardando Transferência
            </h2>
            <button
              className={`flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg font-semibold text-sm shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all ${loadingPendentes ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
              onClick={carregarItensPendentes}
              disabled={loadingPendentes}
            >
              {loadingPendentes ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {loadingPendentes ? 'Carregando...' : 'Atualizar'}
            </button>
          </div>

          {/* Filtro */}
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Filtrar por número da OP, responsável..."
              value={filtroAndamento}
              onChange={(e) => setFiltroAndamento(e.target.value)}
              className="w-full h-10 pl-10 pr-4 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          {itensPendentes.length > 0 ? (() => {
            const opsAgrupadas = {};
            itensPendentes.forEach(item => {
              const opKey = item.cNumOP || item.nCodOP;
              if (!opsAgrupadas[opKey]) {
                opsAgrupadas[opKey] = {
                  cNumOP: item.cNumOP,
                  nCodOP: item.nCodOP,
                  itens: [],
                  modificado_por: item.modificado_por,
                  modificado_em: item.modificado_em
                };
              }
              opsAgrupadas[opKey].itens.push(item);
            });

            let opsOrdenadas = Object.values(opsAgrupadas).sort((a, b) => {
              const dataA = a.modificado_em ? new Date(a.modificado_em).getTime() : 0;
              const dataB = b.modificado_em ? new Date(b.modificado_em).getTime() : 0;
              return dataB - dataA;
            });

            if (filtroAndamento.trim()) {
              const termo = filtroAndamento.toLowerCase();
              opsOrdenadas = opsOrdenadas.filter(op =>
                (op.cNumOP || '').toString().toLowerCase().includes(termo) ||
                (op.nCodOP || '').toString().toLowerCase().includes(termo) ||
                (op.modificado_por || '').toLowerCase().includes(termo)
              );
            }

            return (
              <div className="max-h-[500px] overflow-y-auto overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700 border-b-2 border-gray-200 dark:border-gray-600">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">OP</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Itens Pendentes</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Modificado Por</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {opsOrdenadas.map((op, idx) => (
                      <tr key={idx} className={`${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'} hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors`}>
                        <td
                          className="px-4 py-3.5 font-semibold text-blue-600 dark:text-blue-400 cursor-pointer underline hover:text-blue-800 dark:hover:text-blue-300"
                          onClick={() => abrirOP(op.cNumOP || op.nCodOP)}
                          title="Clique para abrir esta OP"
                        >
                          {op.cNumOP || `OP ${op.nCodOP}`}
                        </td>
                        <td className="px-4 py-3.5 text-center text-gray-600 dark:text-gray-300">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500 text-white">
                            {op.itens.length} {op.itens.length === 1 ? 'item' : 'itens'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">{op.modificado_por}</td>
                        <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                          {op.modificado_em ? new Date(op.modificado_em).toLocaleString('pt-BR') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })() : (
            <div className="py-10 text-center bg-white/50 dark:bg-gray-800/50 rounded-lg">
              <Sparkles className="w-12 h-12 mx-auto mb-4 text-amber-600 dark:text-amber-400" />
              <div className="text-lg font-semibold text-amber-800 dark:text-amber-300">Nenhum item pendente!</div>
              <div className="text-sm mt-2 text-amber-700 dark:text-amber-400">
                Todos os itens foram transferidos.
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONTEÚDO DA ABA CONCLUÍDOS */}
      {abaAtiva === 'concluidos' && (
        <div className="max-w-[1400px] mx-auto mb-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 animate-fade-in">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 m-0 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Itens Concluídos
            </h2>
            <div className="flex items-center gap-2">
              <button
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold text-sm shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer"
                onClick={abrirModalExportar}
                disabled={itensConcluidos.length === 0}
              >
                <Download className="w-4 h-4" />
                Exportar Excel
              </button>
              <button
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg font-semibold text-sm shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer"
                onClick={carregarItensConcluidos}
              >
                <RefreshCw className="w-4 h-4" />
                Atualizar
              </button>
            </div>
          </div>

          {/* Filtro */}
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Filtrar por número da OP, responsável..."
              value={filtroConcluidos}
              onChange={(e) => setFiltroConcluidos(e.target.value)}
              className="w-full h-10 pl-10 pr-4 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          {itensConcluidos.length > 0 ? (() => {
            const opsAgrupadas = {};
            itensConcluidos.forEach(item => {
              const opKey = item.cNumOP || item.nCodOP;
              if (!opsAgrupadas[opKey]) {
                opsAgrupadas[opKey] = {
                  cNumOP: item.cNumOP,
                  nCodOP: item.nCodOP,
                  itens: [],
                  modificado_por: item.modificado_por,
                  modificado_em: item.modificado_em
                };
              }
              opsAgrupadas[opKey].itens.push(item);
            });

            let opsOrdenadas = Object.values(opsAgrupadas).sort((a, b) => {
              const dataA = a.modificado_em ? new Date(a.modificado_em).getTime() : 0;
              const dataB = b.modificado_em ? new Date(b.modificado_em).getTime() : 0;
              return dataB - dataA;
            });

            if (filtroConcluidos.trim()) {
              const termo = filtroConcluidos.toLowerCase();
              opsOrdenadas = opsOrdenadas.filter(op =>
                (op.cNumOP || '').toString().toLowerCase().includes(termo) ||
                (op.nCodOP || '').toString().toLowerCase().includes(termo) ||
                (op.modificado_por || '').toLowerCase().includes(termo)
              );
            }

            return (
              <div className="max-h-[500px] overflow-y-auto overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700 border-b-2 border-gray-200 dark:border-gray-600">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">OP</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Itens Concluídos</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Modificado Por</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {opsOrdenadas.map((op, idx) => (
                      <tr key={idx} className={`${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'} hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors`}>
                        <td
                          className="px-4 py-3.5 font-semibold text-blue-600 dark:text-blue-400 cursor-pointer underline hover:text-blue-800 dark:hover:text-blue-300"
                          onClick={() => abrirOP(op.cNumOP || op.nCodOP)}
                          title="Clique para abrir esta OP"
                        >
                          {op.cNumOP || `OP ${op.nCodOP}`}
                        </td>
                        <td className="px-4 py-3.5 text-center text-gray-600 dark:text-gray-300">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500 text-white">
                            {op.itens.length} {op.itens.length === 1 ? 'item' : 'itens'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">{op.modificado_por}</td>
                        <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                          {op.modificado_em ? new Date(op.modificado_em).toLocaleString('pt-BR') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })() : (
            <div className="py-10 text-center bg-white/50 dark:bg-gray-800/50 rounded-lg">
              <Package className="w-12 h-12 mx-auto mb-4 text-emerald-600 dark:text-emerald-400" />
              <div className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">Nenhum item concluído ainda</div>
              <div className="text-sm mt-2 text-emerald-700 dark:text-emerald-400">
                Marque os checkboxes e salve para registrar itens transferidos.
              </div>
            </div>
          )}
        </div>
      )}
      {/* MODAL EXPORTAR EXCEL */}
      {mostrarModalExportar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setMostrarModalExportar(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Download className="w-5 h-5 text-blue-500" />
                Exportar Concluídos
              </h3>
              <button onClick={() => setMostrarModalExportar(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Selecione o período para exportar:</p>

            <div className="flex flex-col gap-3 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data Início</label>
                <input
                  type="date"
                  value={exportDataInicio}
                  onChange={e => setExportDataInicio(e.target.value)}
                  className="w-full h-10 px-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data Fim</label>
                <input
                  type="date"
                  value={exportDataFim}
                  onChange={e => setExportDataFim(e.target.value)}
                  className="w-full h-10 px-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setMostrarModalExportar(false)}
                className="px-4 py-2 border-2 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={exportarConcluidosExcel}
                disabled={!exportDataInicio || !exportDataFim}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold text-sm shadow-md hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                <Download className="w-4 h-4" />
                Exportar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
