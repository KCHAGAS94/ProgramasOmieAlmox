import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  Truck, RefreshCw, Search, Lock, ArrowLeft, X, ChevronUp, ChevronDown,
  ClipboardList, Package, Save, CheckCircle, FileText, FileSpreadsheet,
  Trash2, Eye, FolderOpen, Plus, Minus, Sun, Moon, ArrowRight, Filter,
  Globe, Clock
} from 'lucide-react';

// Detecta automaticamente o hostname para funcionar em qualquer rede
const API_BASE = `http://${window.location.hostname}:4004/api`;

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

function App() {
  const [autenticado, setAutenticado] = useState(false);
  const [remessas, setRemessas] = useState([]);
  const [remessasEmAndamento, setRemessasEmAndamento] = useState([]);
  const [remessasConcluidas, setRemessasConcluidas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [numeroRemessa, setNumeroRemessa] = useState('');
  const [remessaDetalhada, setRemessaDetalhada] = useState(null);
  const [loadingDetalhes, setLoadingDetalhes] = useState(false);
  const [loadingSincronizacao, setLoadingSincronizacao] = useState(false);
  const [cacheInfo, setCacheInfo] = useState(null);
  const [produtosDetalhados, setProdutosDetalhados] = useState([]);
  const [dadosEdicao, setDadosEdicao] = useState({});
  const [salvandoEdicoes, setSalvandoEdicoes] = useState(false);
  const [progressoSincronizacao, setProgressoSincronizacao] = useState(null);
  const [modalEntradasAberto, setModalEntradasAberto] = useState(false);
  const [produtoSelecionado, setProdutoSelecionado] = useState(null);
  const [novaQuantidade, setNovaQuantidade] = useState('');
  const [modalExportarEntradas, setModalExportarEntradas] = useState(false);
  const [infoAuditoria, setInfoAuditoria] = useState(null);
  const [statusRemessaAtual, setStatusRemessaAtual] = useState(null);
  const [ordenarPorLocal, setOrdenarPorLocal] = useState(false);
  const [progressoCarregamento, setProgressoCarregamento] = useState(null);
  const [abaAtiva, setAbaAtiva] = useState('pesquisar'); // 'pesquisar', 'andamento' ou 'concluidas'
  const [filtroRemessa, setFiltroRemessa] = useState('');
  const [filtros, setFiltros] = useState({
    codigo: '',
    descricao: '',
    estoque: '',
    local: '',
    requerido: '',
    separado: '',
    dif: '',
    observacao: ''
  });
  const [paginaAndamento, setPaginaAndamento] = useState(1);
  const [paginaConcluidas, setPaginaConcluidas] = useState(1);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true';
    }
    return false;
  });

  const ITENS_POR_PAGINA = 10;

  // Dark mode toggle
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  // Calcula produtos ordenados (usado na tabela e no PDF)
  const produtosOrdenados = useMemo(() => {
    return produtosDetalhados.slice().sort((a, b) => {
      if (ordenarPorLocal) {
        return (a.modelo || '').localeCompare(b.modelo || '');
      }
      return (a.modelo || '').localeCompare(b.modelo || '');
    });
  }, [produtosDetalhados, ordenarPorLocal]);

  // Filtra remessas em andamento
  const remessasEmAndamentoFiltradas = useMemo(() => {
    if (!filtroRemessa.trim()) return remessasEmAndamento;
    const filtro = filtroRemessa.trim().toLowerCase();
    return remessasEmAndamento.filter(r =>
      r.cNumeroRemessa?.toLowerCase().includes(filtro)
    );
  }, [remessasEmAndamento, filtroRemessa]);

  // Filtra remessas concluídas
  const remessasConcluidasFiltradas = useMemo(() => {
    if (!filtroRemessa.trim()) return remessasConcluidas;
    const filtro = filtroRemessa.trim().toLowerCase();
    return remessasConcluidas.filter(r =>
      r.cNumeroRemessa?.toLowerCase().includes(filtro)
    );
  }, [remessasConcluidas, filtroRemessa]);

  // Paginação para Em Andamento
  const remessasAndamentoPaginadas = useMemo(() => {
    const inicio = (paginaAndamento - 1) * ITENS_POR_PAGINA;
    const fim = inicio + ITENS_POR_PAGINA;
    return remessasEmAndamentoFiltradas.slice(inicio, fim);
  }, [remessasEmAndamentoFiltradas, paginaAndamento]);

  const totalPaginasAndamento = Math.ceil(remessasEmAndamentoFiltradas.length / ITENS_POR_PAGINA);

  // Paginação para Concluídas
  const remessasConcluidasPaginadas = useMemo(() => {
    const inicio = (paginaConcluidas - 1) * ITENS_POR_PAGINA;
    const fim = inicio + ITENS_POR_PAGINA;
    return remessasConcluidasFiltradas.slice(inicio, fim);
  }, [remessasConcluidasFiltradas, paginaConcluidas]);

  const totalPaginasConcluidas = Math.ceil(remessasConcluidasFiltradas.length / ITENS_POR_PAGINA);

  // Resetar página quando filtro mudar
  useEffect(() => {
    setPaginaAndamento(1);
    setPaginaConcluidas(1);
  }, [filtroRemessa]);

  // Verifica autenticação ao carregar
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenUrl = urlParams.get('token');
    const usuarioUrl = urlParams.get('usuario');

    if (tokenUrl && usuarioUrl) {
      localStorage.setItem('token', tokenUrl);
      localStorage.setItem('usuario', usuarioUrl);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const token = localStorage.getItem('token');
    const usuario = localStorage.getItem('usuario');
    setAutenticado(!!(token && usuario));
  }, []);

  // Carrega últimas 20 Remessas do cache ao iniciar
  useEffect(() => {
    if (autenticado) {
      carregarUltimasRemessas();
      carregarRemessasPorStatus();
    }
  }, [autenticado]);

  const carregarRemessasPorStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE}/listar-remessas-por-status`);
      setRemessasEmAndamento(response.data.em_andamento || []);
      setRemessasConcluidas(response.data.concluidos || []);
    } catch (error) {
      console.error('Erro ao carregar remessas por status:', error);
    }
  };

  const carregarUltimasRemessas = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_BASE}/ultimas-remessas`);
      setRemessas(response.data.remessas || []);
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

    const eventSource = new EventSource(`${API_BASE}/progresso-sincronizacao`);

    eventSource.onmessage = (event) => {
      const progresso = JSON.parse(event.data);
      setProgressoSincronizacao(progresso);
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    try {
      const response = await axios.post(`${API_BASE}/sincronizar-cache`);
      setError('');
      setCacheInfo({
        total: response.data.total_remessas,
        ultima_atualizacao: response.data.ultima_atualizacao
      });
      await carregarUltimasRemessas();

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

  const carregarRemessaSalva = async (nCodRem) => {
    setAbaAtiva('pesquisar');
    setLoadingDetalhes(true);
    setError('');
    setProdutosDetalhados([]);
    setDadosEdicao({});

    try {
      console.log('Tentando carregar remessa do banco local:', nCodRem);

      const localResponse = await axios.get(`${API_BASE}/obter-remessa-salva/${nCodRem}`);

      if (localResponse.data.encontrada) {
        console.log('Remessa carregada do banco local!');

        setRemessaDetalhada(localResponse.data.remessa);
        setProdutosDetalhados(localResponse.data.produtos);

        await carregarEdicoes(nCodRem, localResponse.data.produtos);

        setLoadingDetalhes(false);
        return;
      }
    } catch (error) {
      console.log('Remessa não encontrada no banco local, buscando do OMIE...');
    }

    try {
      await consultarRemessaDoOmie(nCodRem);
    } catch (error) {
      setError('Erro ao carregar remessa: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoadingDetalhes(false);
    }
  };

  const consultarRemessa = async () => {
    if (!numeroRemessa.trim()) {
      setError('Digite o número da Remessa');
      return;
    }

    setLoadingDetalhes(true);
    setError('');

    try {
      let cacheResponse;
      try {
        cacheResponse = await axios.post(`${API_BASE}/buscar-remessa-cache`, {
          numeroRemessa: numeroRemessa.trim()
        });
      } catch (cacheError) {
        if (cacheError.response?.status === 404) {
          await axios.post(`${API_BASE}/sincronizar-cache`);
          cacheResponse = await axios.post(`${API_BASE}/buscar-remessa-cache`, {
            numeroRemessa: numeroRemessa.trim()
          });
        } else {
          throw cacheError;
        }
      }

      const nCodRem = cacheResponse.data.remessa.nCodRem;

      await carregarRemessaSalva(nCodRem);
    } catch (error) {
      setError(error.response?.data?.error || error.message);
      setLoadingDetalhes(false);
    }
  };

  const consultarRemessaDoOmie = async (nCodRem) => {
    console.log('Buscando remessa do OMIE:', nCodRem);

    const detalhesResponse = await axios.post(`${API_BASE}/consultar-remessa`, {
      nCodRem: nCodRem
    });

    setRemessaDetalhada(detalhesResponse.data.remessa);

    const produtos = detalhesResponse.data.remessa.produtos || [];

    console.log(`Encontrados ${produtos.length} produtos na remessa`);

    if (produtos.length > 0) {
      const produtosDetalhesCompletos = [];

      setProgressoCarregamento({
        atual: 0,
        total: produtos.length,
        porcentagem: 0,
        mensagem: 'Iniciando carregamento...'
      });

      for (let idx = 0; idx < produtos.length; idx++) {
        const produto = produtos[idx];
        const codigoProduto = produto.nCodProd;
        const quantidade = produto.nQtde;

        console.log(`[${idx + 1}/${produtos.length}] Buscando detalhes do produto ${codigoProduto}...`);

        try {
          const response = await axios.post(`${API_BASE}/consultar-produto`, {
            codigo_produto: codigoProduto
          });

          console.log(`[${idx + 1}/${produtos.length}] Produto ${codigoProduto} retornado`);

          let estoqueFisico = '-';
          try {
            const estoqueResponse = await axios.post(`${API_BASE}/consultar-estoque`, {
              nIdProduto: codigoProduto
            });

            const listaEstoque = estoqueResponse.data.estoque?.listaEstoque || [];

            if (listaEstoque.length > 0) {
              console.log(`Produto ${codigoProduto}: ${listaEstoque.length} locais de estoque encontrados`);

              const almoxarifado = listaEstoque.find(local =>
                local.cDescricaoLocal === "Almoxarifado - Materia Prima"
              );

              if (almoxarifado && almoxarifado.fisico !== undefined) {
                estoqueFisico = almoxarifado.fisico;
                console.log(`Estoque físico do produto ${codigoProduto}: ${estoqueFisico}`);
              } else {
                console.log(`Almoxarifado - Matéria Prima não encontrado para produto ${codigoProduto}`);
              }
            } else {
              console.log(`Nenhum local de estoque encontrado para produto ${codigoProduto}`);
            }
          } catch (estoqueErr) {
            console.error(`Erro ao buscar estoque do produto ${codigoProduto}:`, estoqueErr.message);
          }

          produtosDetalhesCompletos.push({
            indiceOriginal: idx,
            codigo: response.data.produto.codigo || '-',
            descricao: response.data.produto.descricao || '-',
            modelo: response.data.produto.modelo || '-',
            nQtde: quantidade,
            estoqueFisico: estoqueFisico
          });
        } catch (err) {
          console.error(`[${idx + 1}/${produtos.length}] Erro ao buscar produto ${codigoProduto}:`, err.message);

          produtosDetalhesCompletos.push({
            indiceOriginal: idx,
            codigo: codigoProduto,
            descricao: 'Erro ao carregar',
            modelo: '-',
            nQtde: quantidade,
            estoqueFisico: '-'
          });
        }

        const progresso = Math.round(((idx + 1) / produtos.length) * 100);
        setProgressoCarregamento({
          atual: idx + 1,
          total: produtos.length,
          porcentagem: progresso,
          mensagem: `Carregando produto ${idx + 1} de ${produtos.length}...`
        });

        if (idx < produtos.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      console.log(`Total de produtos carregados: ${produtosDetalhesCompletos.length}`);
      setProdutosDetalhados(produtosDetalhesCompletos);

      const nCodRemParaCarregar = detalhesResponse.data.remessa.cabec?.nCodRem || detalhesResponse.data.remessa.nCodRem;
      await carregarEdicoes(nCodRemParaCarregar, produtosDetalhesCompletos);

      setProgressoCarregamento(null);
    } else {
      console.log('Nenhum produto encontrado na remessa');
      setProgressoCarregamento(null);
    }
  };

  const salvarEdicoes = async () => {
    if (!remessaDetalhada) return;

    setSalvandoEdicoes(true);
    try {
      const usuarioLogado = obterUsuarioLogado();
      const nCodRem = remessaDetalhada.cabec?.nCodRem || remessaDetalhada.nCodRem;

      const produtosComEdicao = produtosDetalhados.map((produto) => ({
        codigo: produto.codigo,
        totalSeparado: dadosEdicao[produto.indiceOriginal]?.totalSeparado || '',
        observacao: dadosEdicao[produto.indiceOriginal]?.observacao || '',
        entradas: dadosEdicao[produto.indiceOriginal]?.entradas || []
      }));

      console.log('Salvando edições para Remessa:', nCodRem);

      await axios.post(`${API_BASE}/salvar-edicoes`, {
        nCodRem: nCodRem,
        produtos: produtosComEdicao,
        usuario: usuarioLogado.nome,
        remessaCompleta: remessaDetalhada,
        produtosCompletos: produtosDetalhados
      });

      console.log('Edições salvas com sucesso!');
      alert('Edições salvas com sucesso!');

      carregarRemessasPorStatus();
    } catch (error) {
      console.error('Erro ao salvar edições:', error);
      setError('Erro ao salvar edições: ' + (error.response?.data?.error || error.message));
    } finally {
      setSalvandoEdicoes(false);
    }
  };

  const concluirRemessa = async () => {
    if (!remessaDetalhada) return;

    const confirmar = window.confirm('Deseja marcar esta remessa como concluída?');
    if (!confirmar) return;

    try {
      const usuarioLogado = obterUsuarioLogado();
      const nCodRem = remessaDetalhada.cabec?.nCodRem || remessaDetalhada.nCodRem;

      console.log('Marcando remessa como concluída:', nCodRem);

      await axios.post(`${API_BASE}/concluir-remessa`, {
        nCodRem: nCodRem,
        usuario: usuarioLogado.nome
      });

      alert('Remessa marcada como concluída!');

      carregarRemessasPorStatus();

      setRemessaDetalhada(null);
      setProdutosDetalhados([]);
      setDadosEdicao({});
    } catch (error) {
      console.error('Erro ao concluir remessa:', error);
      alert('Erro ao concluir remessa: ' + (error.response?.data?.error || error.message));
    }
  };

  const excluirRemessa = async (nCodRem, cNumeroRemessa) => {
    const confirmar = window.confirm(`Tem certeza que deseja excluir a remessa ${cNumeroRemessa}?\n\nEsta ação não pode ser desfeita!`);
    if (!confirmar) return;

    try {
      console.log('Excluindo remessa:', nCodRem);

      await axios.delete(`${API_BASE}/excluir-remessa/${nCodRem}`);

      alert('Remessa excluída com sucesso!');

      carregarRemessasPorStatus();

      if (remessaDetalhada && (remessaDetalhada.cabec?.nCodRem === nCodRem || remessaDetalhada.nCodRem === nCodRem)) {
        setRemessaDetalhada(null);
        setProdutosDetalhados([]);
        setDadosEdicao({});
      }
    } catch (error) {
      console.error('Erro ao excluir remessa:', error);
      alert('Erro ao excluir remessa: ' + (error.response?.data?.error || error.message));
    }
  };

  const atualizarQuantidades = async (nCodRem, cNumeroRemessa) => {
    const confirmar = window.confirm(`Deseja sincronizar a remessa ${cNumeroRemessa} com o Omie?\n\n- Quantidades requeridas serão atualizadas\n- Itens novos serão adicionados\n- Itens removidos no Omie serão excluídos\n- As quantidades já separadas dos itens existentes serão mantidas`);
    if (!confirmar) return;

    try {
      console.log('Sincronizando remessa com o Omie:', nCodRem);

      const response = await axios.post(`${API_BASE}/atualizar-quantidades/${nCodRem}`);

      const resumo = response.data?.resumo;
      let mensagem = 'Remessa sincronizada com sucesso!';
      if (resumo) {
        const partes = [`Total: ${resumo.total} produto(s)`];
        if (resumo.novos > 0) partes.push(`${resumo.novos} novo(s)`);
        if (resumo.removidos > 0) partes.push(`${resumo.removidos} removido(s)`);
        mensagem += `\n\n${partes.join(' • ')}`;
      }
      alert(mensagem);

      carregarRemessasPorStatus();

      if (remessaDetalhada && (remessaDetalhada.cabec?.nCodRem === nCodRem || remessaDetalhada.nCodRem === nCodRem)) {
        await carregarRemessaSalva(nCodRem);
      }
    } catch (error) {
      console.error('Erro ao sincronizar remessa:', error);
      alert('Erro ao sincronizar remessa: ' + (error.response?.data?.error || error.message));
    }
  };

  const carregarEdicoes = async (nCodRem, produtosCarregados) => {
    try {
      console.log('Carregando edições para Remessa:', nCodRem);

      const response = await axios.get(`${API_BASE}/obter-edicoes/${nCodRem}`);
      const edicaoSalva = response.data.edicao;

      setStatusRemessaAtual(edicaoSalva?.status || null);

      if (edicaoSalva && edicaoSalva.produtos && edicaoSalva.produtos.length > 0) {
        const novaEdicao = {};

        produtosCarregados.forEach((produto) => {
          const edicaoProduto = edicaoSalva.produtos.find(p => p.codigo === produto.codigo);
          if (edicaoProduto) {
            novaEdicao[produto.indiceOriginal] = {
              totalSeparado: edicaoProduto.totalSeparado || '',
              observacao: edicaoProduto.observacao || '',
              entradas: edicaoProduto.entradas || []
            };
          }
        });

        setDadosEdicao(novaEdicao);

        if (edicaoSalva.modificado_por || edicaoSalva.modificado_em) {
          setInfoAuditoria({
            modificado_por: edicaoSalva.modificado_por,
            modificado_em: edicaoSalva.modificado_em
          });
        }

        console.log('Edições carregadas:', Object.keys(novaEdicao).length, 'produtos');
      } else {
        setInfoAuditoria(null);
      }
    } catch (error) {
      console.error('Erro ao carregar edições:', error);
      setInfoAuditoria(null);
      setStatusRemessaAtual(null);
    }
  };

  const abrirModalEntradas = (idx) => {
    setProdutoSelecionado(idx);
    setModalEntradasAberto(true);
    setNovaQuantidade('');
  };

  const fecharModalEntradas = () => {
    setModalEntradasAberto(false);
    setProdutoSelecionado(null);
    setNovaQuantidade('');
  };

  const adicionarEntrada = () => {
    if (!novaQuantidade || parseFloat(novaQuantidade) <= 0) {
      alert('Digite uma quantidade válida');
      return;
    }

    const entradas = dadosEdicao[produtoSelecionado]?.entradas || [];
    const novaEntrada = {
      quantidade: parseFloat(novaQuantidade),
      data: new Date().toLocaleString('pt-BR')
    };

    const novasEntradas = [...entradas, novaEntrada];
    const totalSeparado = novasEntradas.reduce((sum, e) => sum + e.quantidade, 0);

    setDadosEdicao({
      ...dadosEdicao,
      [produtoSelecionado]: {
        ...dadosEdicao[produtoSelecionado],
        entradas: novasEntradas,
        totalSeparado: totalSeparado.toString()
      }
    });

    setNovaQuantidade('');
  };

  const removerEntrada = (idxEntrada) => {
    const entradas = dadosEdicao[produtoSelecionado]?.entradas || [];
    const novasEntradas = entradas.filter((_, i) => i !== idxEntrada);
    const totalSeparado = novasEntradas.reduce((sum, e) => sum + e.quantidade, 0);

    setDadosEdicao({
      ...dadosEdicao,
      [produtoSelecionado]: {
        ...dadosEdicao[produtoSelecionado],
        entradas: novasEntradas,
        totalSeparado: totalSeparado.toString()
      }
    });
  };

  const exportarPDF = () => {
    try {
      console.log('Iniciando exportação PDF...');

      if (!remessaDetalhada || produtosDetalhados.length === 0) {
        alert('Nenhum dado para exportar');
        return;
      }

      console.log('Criando documento PDF...');
      const doc = new jsPDF('landscape', 'mm', 'a4');

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(`Remessa ${remessaDetalhada.cabec?.cNumeroRemessa || remessaDetalhada.cNumeroRemessa}`, 14, 15);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 22);

      console.log('Preparando dados da tabela...');
      const produtosParaPDF = produtosOrdenados.slice().sort((a, b) => {
        return (a.modelo || '').localeCompare(b.modelo || '');
      });

      const dadosTabela = produtosParaPDF.map((produto) => {
        const quantidade = parseFloat(produto.nQtde) || 0;
        const separado = parseFloat(dadosEdicao[produto.indiceOriginal]?.totalSeparado) || 0;
        const diferenca = separado - quantidade;

        return [
          produto.codigo,
          produto.descricao,
          produto.estoqueFisico,
          produto.modelo,
          quantidade,
          separado,
          '',
          diferenca,
          dadosEdicao[produto.indiceOriginal]?.observacao || ''
        ];
      });

      console.log('Criando tabela...');
      autoTable(doc, {
        startY: 28,
        head: [['Código', 'Descrição', 'Estoque', 'LOCAL', 'Requerido', 'Separado', 'Separado fisicamente', 'DIF.', 'Observação']],
        body: dadosTabela,
        styles: {
          fontSize: 8,
          cellPadding: 2
        },
        headStyles: {
          fillColor: [16, 185, 129],
          textColor: 255,
          fontStyle: 'bold'
        },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 70 },
          2: { cellWidth: 20 },
          3: { cellWidth: 20 },
          4: { cellWidth: 22 },
          5: { cellWidth: 22 },
          6: { cellWidth: 28 },
          7: { cellWidth: 18 },
          8: { cellWidth: 47 }
        },
        didParseCell: function(data) {
          if (data.column.index === 7 && data.section === 'body') {
            const valor = parseFloat(data.cell.text[0]);
            const separado = parseFloat(dadosTabela[data.row.index][5]);

            if (separado > 0 && valor === 0) {
              data.cell.styles.textColor = [16, 185, 129];
            } else {
              data.cell.styles.textColor = [239, 68, 68];
            }
          }
        }
      });

      const nomeArquivo = `Remessa_${remessaDetalhada.cabec?.cNumeroRemessa || remessaDetalhada.cNumeroRemessa}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;
      console.log('Salvando PDF:', nomeArquivo);
      doc.save(nomeArquivo);
      console.log('PDF exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      alert('Erro ao exportar PDF: ' + error.message);
    }
  };

  const montarDadosEntradas = () => {
    const linhas = [];
    produtosDetalhados.forEach((produto) => {
      const edicao = dadosEdicao[produto.indiceOriginal];
      if (edicao && edicao.entradas && edicao.entradas.length > 0) {
        edicao.entradas.forEach((entrada) => {
          const qtd = parseInt(entrada.quantidade) || 0;
          linhas.push({
            codigo: produto.codigo,
            descricao: produto.descricao,
            quantidade: `${qtd} UNIDADES`,
          });
        });
      }
    });
    return linhas;
  };

  const exportarEntradasExcel = () => {
    try {
      if (!remessaDetalhada || produtosDetalhados.length === 0) {
        alert('Nenhum dado para exportar');
        return;
      }

      const linhas = montarDadosEntradas();
      if (linhas.length === 0) {
        alert('Nenhuma entrada registrada para exportar');
        return;
      }

      const dadosPlanilha = linhas.map(l => ({
        'Código': l.codigo,
        'Descrição': l.descricao,
        'Quantidade': l.quantidade,
        'Observação': ''
      }));

      const ws = XLSX.utils.json_to_sheet(dadosPlanilha);
      ws['!cols'] = [
        { wch: 20 },
        { wch: 50 },
        { wch: 20 },
        { wch: 30 }
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Entradas');
      const nomeArquivo = `Entradas_Remessa_${remessaDetalhada.cabec?.cNumeroRemessa || remessaDetalhada.cNumeroRemessa}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`;
      XLSX.writeFile(wb, nomeArquivo);
      setModalExportarEntradas(false);
    } catch (error) {
      console.error('Erro ao exportar entradas Excel:', error);
      alert('Erro ao exportar entradas: ' + error.message);
    }
  };

  const exportarEntradas = () => {
    try {
      if (!remessaDetalhada || produtosDetalhados.length === 0) {
        alert('Nenhum dado para exportar');
        return;
      }

      const dadosTabela = [];
      produtosDetalhados.forEach((produto) => {
        const edicao = dadosEdicao[produto.indiceOriginal];
        if (edicao && edicao.entradas && edicao.entradas.length > 0) {
          edicao.entradas.forEach((entrada) => {
            const qtd = parseInt(entrada.quantidade) || 0;
            dadosTabela.push([
              produto.codigo,
              produto.descricao,
              `${qtd} UNIDADES`,
              ''
            ]);
          });
        }
      });

      if (dadosTabela.length === 0) {
        alert('Nenhuma entrada registrada para exportar');
        return;
      }

      const doc = new jsPDF('landscape', 'mm', 'a4');

      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(`Entradas - Remessa ${remessaDetalhada.cabec?.cNumeroRemessa || remessaDetalhada.cNumeroRemessa}`, 14, 15);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}  |  Total de entradas: ${dadosTabela.length}`, 14, 22);

      autoTable(doc, {
        startY: 28,
        head: [['Código', 'Descrição', 'Quantidade', 'Observação']],
        body: dadosTabela,
        styles: {
          fontSize: 8,
          cellPadding: 2
        },
        headStyles: {
          fillColor: [139, 92, 246],
          textColor: 255,
          fontStyle: 'bold'
        },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 120 },
          2: { cellWidth: 40 },
          3: { cellWidth: 50 }
        }
      });

      const nomeArquivo = `Entradas_Remessa_${remessaDetalhada.cabec?.cNumeroRemessa || remessaDetalhada.cNumeroRemessa}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;
      doc.save(nomeArquivo);
      setModalExportarEntradas(false);
    } catch (error) {
      console.error('Erro ao exportar entradas:', error);
      alert('Erro ao exportar entradas: ' + error.message);
    }
  };

  // Tela de nao autenticado
  if (!autenticado) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-5 animate-fade-in">
        <div className="max-w-lg w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-10 text-center">
          <div className="w-16 h-16 mx-auto mb-6 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <Lock className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Acesso Restrito</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Por favor, faça login através do Menu Principal para acessar este programa.
          </p>
          <button
            className="px-6 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg font-semibold text-sm shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
            onClick={() => window.location.href = `http://${window.location.hostname}:3000`}
          >
            Ir para Menu Principal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-5 md:p-8 transition-colors duration-300">
      {/* HEADER */}
      <header className="max-w-[1400px] mx-auto mb-6 flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white shadow-lg hover:scale-105 transition-transform duration-200 cursor-pointer"
          onClick={() => window.location.href = `http://${window.location.hostname}:3000`}
          title="Voltar ao Menu Principal"
        >
          <Truck className="w-7 h-7" />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white m-0">Separador de Remessa - IVOLV</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 m-0">Gerenciamento de separação de remessas</p>
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="ml-4 p-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-yellow-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200 cursor-pointer"
          title={darkMode ? 'Modo claro' : 'Modo escuro'}
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <div className="ml-auto"></div>
      </header>

      {/* BARRA DE PROGRESSO DA SINCRONIZACAO */}
      {progressoSincronizacao && (
        <div className="max-w-[1400px] mx-auto mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-5 border-2 border-primary-500 animate-fade-in">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {progressoSincronizacao.mensagem}
            </span>
            <span className="text-lg font-bold text-primary-600">
              {progressoSincronizacao.porcentagem}%
            </span>
          </div>
          <div className="w-full h-6 bg-gray-200 dark:bg-gray-700 rounded-xl overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-500 via-primary-400 to-primary-500 rounded-xl transition-all duration-300 shadow-md"
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

      {/* BARRA DE PROGRESSO DO CARREGAMENTO DO OMIE */}
      {progressoCarregamento && (
        <div className="max-w-[1400px] mx-auto mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-5 border-2 border-primary-500 animate-fade-in">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary-500" />
              {progressoCarregamento.mensagem}
            </span>
            <span className="text-lg font-bold text-primary-600">
              {progressoCarregamento.porcentagem}%
            </span>
          </div>
          <div className="w-full h-6 bg-gray-200 dark:bg-gray-700 rounded-xl overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-500 via-primary-400 to-primary-500 rounded-xl transition-all duration-300 shadow-md"
              style={{ width: `${progressoCarregamento.porcentagem}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center font-medium">
            Produto {progressoCarregamento.atual} de {progressoCarregamento.total}
          </div>
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
          {remessasEmAndamento.length > 0 && (
            <span className="absolute top-1 right-1 bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[11px] font-bold">
              {remessasEmAndamento.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setAbaAtiva('concluidas')}
          className={`px-6 py-3 text-[15px] font-semibold border-none rounded-t-lg transition-all flex items-center gap-2 ${
            abaAtiva === 'concluidas'
              ? 'border-b-[3px] border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'
              : 'border-b-[3px] border-transparent bg-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          Concluídas
          {remessasConcluidas.length > 0 && (
            <span className="ml-2 bg-emerald-500 text-white rounded-full px-2 py-0.5 text-[11px] font-bold">
              {remessasConcluidas.length}
            </span>
          )}
        </button>
      </div>

      {/* CONTEÚDO DA ABA PESQUISAR */}
      {abaAtiva === 'pesquisar' && (
        <>
          <div className="max-w-[1400px] mx-auto mb-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 animate-fade-in">
            <label className="block text-sm text-gray-500 dark:text-gray-400 mb-2 font-semibold">
              Consultar detalhes de uma Remessa:
            </label>
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 max-w-md relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Digite o número da Remessa"
                  value={numeroRemessa}
                  onChange={(e) => setNumeroRemessa(e.target.value)}
                  className="w-full h-12 pl-12 pr-4 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                  onKeyPress={(e) => e.key === 'Enter' && consultarRemessa()}
                />
              </div>
              <button
                className={`flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg font-semibold text-sm shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer ${loadingDetalhes ? 'opacity-70 cursor-not-allowed' : ''}`}
                onClick={consultarRemessa}
                disabled={loadingDetalhes}
              >
                {loadingDetalhes ? <div className="spinner text-white" /> : <Search className="w-4 h-4" />}
                {loadingDetalhes ? 'Consultando...' : 'Consultar'}
              </button>
            </div>
          </div>

          {/* ERROR */}
          {error && (
            <div className="max-w-[1400px] mx-auto mb-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-3 rounded-lg text-sm text-red-700 dark:text-red-400 animate-shake">
              <strong>Erro:</strong> {error}
            </div>
          )}
        </>
      )}

      {/* CONTEÚDO DA ABA EM ANDAMENTO */}
      {abaAtiva === 'andamento' && (
        <div className="max-w-[1400px] mx-auto mb-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 animate-fade-in">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 m-0 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Remessas em Andamento
            </h2>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Filtrar por número da remessa..."
                value={filtroRemessa}
                onChange={(e) => setFiltroRemessa(e.target.value)}
                className="w-72 h-10 pl-10 pr-4 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
              />
            </div>
          </div>

          <div className="animate-fade-in">
              {remessasEmAndamentoFiltradas.length > 0 ? (
                <>
                  <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700 border-b-2 border-gray-200 dark:border-gray-600">
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Remessa</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Modificado Por</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Data</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {remessasAndamentoPaginadas.map((remessa) => (
                          <tr key={remessa.nCodRem} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                            <td className="px-4 py-3.5 font-semibold text-gray-900 dark:text-white">{remessa.cNumeroRemessa}</td>
                            <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">{remessa.modificado_por}</td>
                            <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">{new Date(remessa.modificado_em).toLocaleString('pt-BR')}</td>
                            <td className="px-4 py-3.5">
                              <div className="flex gap-2">
                                <button
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold transition-colors"
                                  onClick={() => carregarRemessaSalva(remessa.nCodRem)}
                                >
                                  <FolderOpen className="w-3.5 h-3.5" /> Abrir
                                </button>
                                <button
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-md text-xs font-semibold transition-colors"
                                  onClick={() => excluirRemessa(remessa.nCodRem, remessa.cNumeroRemessa)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginacao */}
                  {totalPaginasAndamento > 1 && (
                    <div className="flex justify-center items-center gap-2 mt-4 p-2.5">
                      <button
                        onClick={() => setPaginaAndamento(prev => Math.max(1, prev - 1))}
                        disabled={paginaAndamento === 1}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
                          paginaAndamento === 1
                            ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                            : 'bg-amber-500 text-white hover:bg-amber-600 shadow'
                        }`}
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Anterior
                      </button>

                      <div className="flex gap-1">
                        {Array.from({ length: totalPaginasAndamento }, (_, i) => i + 1).map(num => (
                          <button
                            key={num}
                            onClick={() => setPaginaAndamento(num)}
                            className={`px-3 py-1.5 border-none rounded cursor-pointer text-sm transition-all duration-200 ${
                              paginaAndamento === num
                                ? 'bg-amber-500 text-white font-semibold shadow'
                                : 'bg-white dark:bg-gray-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-gray-600'
                            }`}
                          >
                            {num}
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={() => setPaginaAndamento(prev => Math.min(totalPaginasAndamento, prev + 1))}
                        disabled={paginaAndamento === totalPaginasAndamento}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
                          paginaAndamento === totalPaginasAndamento
                            ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                            : 'bg-amber-500 text-white hover:bg-amber-600 shadow'
                        }`}
                      >
                        Próxima <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-center text-amber-800 dark:text-amber-300 py-5">
                  {filtroRemessa ? 'Nenhuma remessa encontrada com esse filtro' : 'Nenhuma remessa em andamento'}
                </p>
              )}
            </div>
        </div>
      )}

      {/* CONTEÚDO DA ABA CONCLUÍDAS */}
      {abaAtiva === 'concluidas' && (
        <div className="max-w-[1400px] mx-auto mb-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 animate-fade-in">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 m-0 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Remessas Concluídas
            </h2>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Filtrar por número da remessa..."
                value={filtroRemessa}
                onChange={(e) => setFiltroRemessa(e.target.value)}
                className="w-72 h-10 pl-10 pr-4 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
              />
            </div>
          </div>

          <div className="animate-fade-in">
            {remessasConcluidasFiltradas.length > 0 ? (
                <>
                  <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700 border-b-2 border-gray-200 dark:border-gray-600">
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Remessa</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Concluído Por</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Data</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {remessasConcluidasPaginadas.map((remessa) => (
                          <tr key={remessa.nCodRem} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                            <td className="px-4 py-3.5 font-semibold text-gray-900 dark:text-white">{remessa.cNumeroRemessa}</td>
                            <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">{remessa.concluido_por}</td>
                            <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">{new Date(remessa.concluido_em).toLocaleString('pt-BR')}</td>
                            <td className="px-4 py-3.5">
                              <div className="flex gap-2">
                                <button
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white rounded-md text-xs font-semibold transition-colors"
                                  onClick={() => carregarRemessaSalva(remessa.nCodRem)}
                                >
                                  <Eye className="w-3.5 h-3.5" /> Ver
                                </button>
                                <button
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-md text-xs font-semibold transition-colors"
                                  onClick={() => excluirRemessa(remessa.nCodRem, remessa.cNumeroRemessa)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginacao */}
                  {totalPaginasConcluidas > 1 && (
                    <div className="flex justify-center items-center gap-2 mt-4 p-2.5">
                      <button
                        onClick={() => setPaginaConcluidas(prev => Math.max(1, prev - 1))}
                        disabled={paginaConcluidas === 1}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
                          paginaConcluidas === 1
                            ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                            : 'bg-primary-500 text-white hover:bg-primary-600 shadow'
                        }`}
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Anterior
                      </button>

                      <div className="flex gap-1">
                        {Array.from({ length: totalPaginasConcluidas }, (_, i) => i + 1).map(num => (
                          <button
                            key={num}
                            onClick={() => setPaginaConcluidas(num)}
                            className={`px-3 py-1.5 border-none rounded cursor-pointer text-sm transition-all duration-200 ${
                              paginaConcluidas === num
                                ? 'bg-primary-500 text-white font-semibold shadow'
                                : 'bg-white dark:bg-gray-700 text-primary-800 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-gray-600'
                            }`}
                          >
                            {num}
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={() => setPaginaConcluidas(prev => Math.min(totalPaginasConcluidas, prev + 1))}
                        disabled={paginaConcluidas === totalPaginasConcluidas}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
                          paginaConcluidas === totalPaginasConcluidas
                            ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                            : 'bg-primary-500 text-white hover:bg-primary-600 shadow'
                        }`}
                      >
                        Próxima <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-center text-primary-800 dark:text-primary-300 py-5">
                  {filtroRemessa ? 'Nenhuma remessa encontrada com esse filtro' : 'Nenhuma remessa concluída'}
                </p>
              )}
            </div>
        </div>
      )}

      {/* DETALHES DA REMESSA - só aparece na aba pesquisar */}
      {abaAtiva === 'pesquisar' && remessaDetalhada && (
        <div className="max-w-[1400px] mx-auto mb-4 bg-primary-50 dark:bg-gray-800 rounded-xl shadow-lg p-6 border-l-4 border-primary-500 animate-fade-in">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 m-0">
              <ClipboardList className="w-6 h-6 text-primary-600" />
              Detalhes da Remessa-{remessaDetalhada.cabec?.cNumeroRemessa || remessaDetalhada.cNumeroRemessa}
            </h2>
            <div className="flex gap-2">
              <button
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold text-sm shadow hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                onClick={() => atualizarQuantidades(
                  remessaDetalhada.cabec?.nCodRem || remessaDetalhada.nCodRem,
                  remessaDetalhada.cabec?.cNumeroRemessa || remessaDetalhada.cNumeroRemessa
                )}
              >
                <RefreshCw className="w-4 h-4" /> Atualizar Quantidades
              </button>
              <button
                className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold text-sm shadow hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                onClick={() => {
                  setRemessaDetalhada(null);
                  setProdutosDetalhados([]);
                  setDadosEdicao({});
                  setInfoAuditoria(null);
                }}
              >
                <X className="w-4 h-4" /> Fechar
              </button>
            </div>
          </div>

          {/* Info da remessa */}
          <div className="bg-white dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 mb-5">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mt-0 mb-3">
              Informações da Remessa
            </h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold mb-1">Número</div>
                <div className="text-sm text-gray-900 dark:text-white font-medium">
                  {remessaDetalhada.cabec?.cNumeroRemessa || remessaDetalhada.cNumeroRemessa || '-'}
                </div>
              </div>
            </div>
          </div>

          {/* TABELA DE PRODUTOS */}
          {produtosDetalhados.length > 0 && (() => {
            const produtosFiltrados = produtosOrdenados.map((produto, idx) => ({ produto, idx })).filter(({ produto }) => {
              if (filtros.codigo && !String(produto.codigo || '').toLowerCase().includes(filtros.codigo.toLowerCase())) return false;
              if (filtros.descricao && !String(produto.descricao || '').toLowerCase().includes(filtros.descricao.toLowerCase())) return false;
              if (filtros.estoque && !String(produto.estoqueFisico || '').toLowerCase().includes(filtros.estoque.toLowerCase())) return false;
              if (filtros.local && !String(produto.modelo || '').toLowerCase().includes(filtros.local.toLowerCase())) return false;
              if (filtros.requerido && !String(produto.nQtde || '').includes(filtros.requerido)) return false;
              if (filtros.separado && !String(dadosEdicao[produto.indiceOriginal]?.totalSeparado || '').includes(filtros.separado)) return false;
              if (filtros.dif) {
                const quantidade = parseFloat(produto.nQtde) || 0;
                const separado = parseFloat(dadosEdicao[produto.indiceOriginal]?.totalSeparado) || 0;
                const diferenca = separado - quantidade;
                if (!String(diferenca).includes(filtros.dif)) return false;
              }
              if (filtros.observacao && !String(dadosEdicao[produto.indiceOriginal]?.observacao || '').toLowerCase().includes(filtros.observacao.toLowerCase())) return false;
              return true;
            });

            return (
              <>
                <h3 className="text-base font-bold text-gray-900 dark:text-white mt-5 mb-3 flex items-center gap-2">
                  <Package className="w-5 h-5 text-primary-600" />
                  Itens da Remessa {produtosFiltrados.length !== produtosDetalhados.length && `(${produtosFiltrados.length} de ${produtosDetalhados.length})`}
                  {produtosFiltrados.length === produtosDetalhados.length && `(${produtosDetalhados.length})`}
                </h3>
                <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-700 border-b-2 border-gray-200 dark:border-gray-600">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap overflow-hidden" style={{ width: '100px' }}>Código</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap overflow-hidden" style={{ width: '280px' }}>Descrição</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap overflow-hidden" style={{ width: '65px' }}>Estoque</th>
                        <th
                          className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap overflow-hidden cursor-pointer select-none transition-colors ${
                            ordenarPorLocal
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}
                          style={{ width: '55px' }}
                          onClick={() => setOrdenarPorLocal(!ordenarPorLocal)}
                          title="Clique para ordenar A-Z"
                        >
                          LOCAL {ordenarPorLocal && <ChevronDown className="w-3 h-3 inline" />}
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap overflow-hidden" style={{ width: '70px' }}>Requerido</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap overflow-hidden" style={{ width: '85px' }}>Separado</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap overflow-hidden" style={{ width: '45px' }}>DIF.</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap overflow-hidden" style={{ width: '250px' }}>Observação</th>
                      </tr>
                      {/* Filter row */}
                      <tr className="bg-gray-100 dark:bg-gray-600">
                        {['codigo', 'descricao', 'estoque', 'local', 'requerido', 'separado', 'dif', 'observacao'].map((field) => (
                          <th key={field} className="p-1">
                            <input
                              type="text"
                              placeholder="Filtrar..."
                              value={filtros[field]}
                              onChange={(e) => setFiltros({ ...filtros, [field]: e.target.value })}
                              className="w-full px-1.5 py-1 border border-gray-300 dark:border-gray-500 rounded text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-primary-500 box-border"
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {produtosFiltrados.map(({ produto, idx }) => (
                        <tr key={idx} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
                          <td className="px-4 py-3.5 text-xs font-semibold text-gray-900 dark:text-white whitespace-nowrap overflow-hidden text-ellipsis">
                            {produto.codigo}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">
                            {produto.descricao}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-semibold text-primary-600 dark:text-primary-400 text-right whitespace-nowrap overflow-hidden">
                            {produto.estoqueFisico}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis">
                            {produto.modelo}
                          </td>
                          <td className="px-4 py-3.5 text-xs font-semibold text-gray-900 dark:text-white text-right whitespace-nowrap overflow-hidden">
                            {produto.nQtde}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap overflow-hidden">
                            <div className="flex gap-0.5 items-center">
                              <div
                                onClick={() => abrirModalEntradas(produto.indiceOriginal)}
                                className={`flex-1 p-1.5 border-2 rounded text-xs text-right font-semibold whitespace-nowrap overflow-hidden transition-all duration-200 cursor-pointer
                                  ${statusRemessaAtual === 'concluido'
                                    ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    : 'border-primary-500 dark:border-primary-400 bg-primary-50 dark:bg-primary-900/30 text-gray-900 dark:text-white hover:bg-primary-100 dark:hover:bg-primary-900/50 hover:border-primary-600'}`}
                              >
                                {dadosEdicao[produto.indiceOriginal]?.totalSeparado || '0'}
                                {dadosEdicao[produto.indiceOriginal]?.entradas?.length > 0 && (
                                  <span className="text-[9px] text-primary-600 dark:text-primary-400 ml-0.5">
                                    ({dadosEdicao[produto.indiceOriginal].entradas.length})
                                  </span>
                                )}
                              </div>
                              {statusRemessaAtual !== 'concluido' && (
                                <button
                                  onClick={() => abrirModalEntradas(produto.indiceOriginal)}
                                  className="p-1.5 px-2 border-none rounded bg-primary-600 hover:bg-primary-700 text-white cursor-pointer text-sm transition-colors duration-200"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-xs font-semibold text-right whitespace-nowrap overflow-hidden">
                            {(() => {
                              const quantidade = parseFloat(produto.nQtde) || 0;
                              const separado = parseFloat(dadosEdicao[produto.indiceOriginal]?.totalSeparado) || 0;
                              const diferenca = separado - quantidade;

                              let corClass = 'text-red-500';
                              if (separado > 0 && diferenca === 0) {
                                corClass = 'text-primary-600 dark:text-primary-400';
                              }

                              return <span className={corClass}>{diferenca}</span>;
                            })()}
                          </td>
                          <td className="px-4 py-3.5 overflow-hidden">
                            <input
                              type="text"
                              placeholder="Observação..."
                              value={dadosEdicao[produto.indiceOriginal]?.observacao || ''}
                              onChange={(e) => {
                                if (statusRemessaAtual === 'concluido') return;
                                setDadosEdicao({
                                  ...dadosEdicao,
                                  [produto.indiceOriginal]: {
                                    ...dadosEdicao[produto.indiceOriginal],
                                    observacao: e.target.value
                                  }
                                });
                              }}
                              disabled={statusRemessaAtual === 'concluido'}
                              className={`w-full p-1.5 border rounded text-xs outline-none transition-all duration-200 box-border
                                ${statusRemessaAtual === 'concluido'
                                  ? 'border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-default'
                                  : 'border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-primary-500 focus:border-primary-500'}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Informacoes de Auditoria */}
                {infoAuditoria && (
                  <div className="mt-3 px-3.5 py-2.5 bg-primary-50 dark:bg-primary-900/20 border border-primary-300 dark:border-primary-700 rounded-md text-xs text-primary-800 dark:text-primary-300 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    <strong>Última modificação:</strong> {infoAuditoria.modificado_por} em {new Date(infoAuditoria.modificado_em).toLocaleString('pt-BR')}
                  </div>
                )}

                {/* Botoes de acao */}
                <div className="mt-5 flex gap-3 justify-end flex-wrap">
                  {statusRemessaAtual !== 'concluido' && (
                    <>
                      <button
                        className={`inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg font-semibold text-sm shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer ${salvandoEdicoes ? 'opacity-70 cursor-not-allowed' : ''}`}
                        onClick={salvarEdicoes}
                        disabled={salvandoEdicoes}
                      >
                        {salvandoEdicoes ? <div className="spinner text-white" /> : <Save className="w-4 h-4" />}
                        {salvandoEdicoes ? 'Salvando...' : 'Salvar Edições'}
                      </button>
                      <button
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold text-sm shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                        onClick={concluirRemessa}
                      >
                        <CheckCircle className="w-4 h-4" /> Concluir Remessa
                      </button>
                    </>
                  )}
                  {statusRemessaAtual === 'concluido' && (
                    <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg font-semibold text-sm">
                      <CheckCircle className="w-4 h-4" /> Remessa Concluída
                    </div>
                  )}
                  <button
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold text-sm shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                    onClick={exportarPDF}
                  >
                    <FileText className="w-4 h-4" /> Exportar PDF
                  </button>
                  <button
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-semibold text-sm shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                    onClick={() => setModalExportarEntradas(true)}
                  >
                    <Package className="w-4 h-4" /> Exportar Entradas
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* MODAL ESCOLHER FORMATO EXPORTACAO ENTRADAS */}
      {modalExportarEntradas && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
          onClick={() => setModalExportarEntradas(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl p-8 max-w-md w-[90%] shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="m-0 mb-2 text-gray-900 dark:text-white text-lg font-bold flex items-center gap-2">
              <Package className="w-5 h-5 text-purple-500" /> Exportar Entradas
            </h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm m-0 mb-6">
              Escolha o formato de exportação:
            </p>
            <div className="flex gap-3">
              <button
                className="flex-1 flex items-center justify-center gap-2 py-3.5 px-5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold text-base shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                onClick={exportarEntradas}
              >
                <FileText className="w-5 h-5" /> PDF
              </button>
              <button
                className="flex-1 flex items-center justify-center gap-2 py-3.5 px-5 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg font-semibold text-base shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                onClick={exportarEntradasExcel}
              >
                <FileSpreadsheet className="w-5 h-5" /> Excel
              </button>
            </div>
            <button
              className="w-full mt-3 py-2.5 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold text-sm cursor-pointer transition-colors duration-200"
              onClick={() => setModalExportarEntradas(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE ENTRADAS MULTIPLAS */}
      {modalEntradasAberto && produtoSelecionado !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]" onClick={fecharModalEntradas}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-[90%] max-w-xl max-h-[80vh] flex flex-col shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white m-0 flex items-center gap-2">
                <Package className="w-5 h-5 text-primary-600" />
                Entradas - {produtosDetalhados[produtoSelecionado]?.codigo}
              </h3>
              <button
                onClick={fecharModalEntradas}
                className="bg-transparent border-none text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-6 overflow-y-auto flex-1">
              <div className="mb-4 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-500 dark:border-primary-700">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Quantidade Total Necessária</div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">
                  {produtosDetalhados[produtoSelecionado]?.nQtde}
                </div>
              </div>

              {statusRemessaAtual !== 'concluido' && (
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2 text-gray-900 dark:text-white">
                  Adicionar Nova Entrada
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Quantidade"
                    value={novaQuantidade}
                    onChange={(e) => setNovaQuantidade(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && adicionarEntrada()}
                    className="flex-1 h-11 px-3 border border-gray-300 dark:border-gray-500 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500 transition-all duration-200"
                  />
                  <button
                    onClick={adicionarEntrada}
                    className="px-5 py-2.5 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg text-sm font-semibold shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                  >
                    Adicionar
                  </button>
                </div>
              </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-semibold text-gray-900 dark:text-white">
                    Histórico de Entradas
                  </label>
                  <div className="text-sm font-bold text-primary-600 dark:text-primary-400">
                    Total: {dadosEdicao[produtoSelecionado]?.totalSeparado || '0'}
                  </div>
                </div>

                {dadosEdicao[produtoSelecionado]?.entradas?.length > 0 ? (
                  <div className="max-h-72 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    {dadosEdicao[produtoSelecionado].entradas.map((entrada, idxEntrada) => (
                      <div
                        key={idxEntrada}
                        className={`flex justify-between items-center p-3 ${
                          idxEntrada < dadosEdicao[produtoSelecionado].entradas.length - 1
                            ? 'border-b border-gray-200 dark:border-gray-700'
                            : ''
                        } ${idxEntrada % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/70'}`}
                      >
                        <div className="flex-1">
                          <div className="text-base font-semibold text-gray-900 dark:text-white">
                            {entrada.quantidade} unidades
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {entrada.data}
                          </div>
                        </div>
                        {statusRemessaAtual !== 'concluido' && (
                        <button
                          onClick={() => removerEntrada(idxEntrada)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-medium cursor-pointer transition-colors duration-200"
                        >
                          <Minus className="w-3 h-3" /> Remover
                        </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-gray-500 dark:text-gray-400 text-sm bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
                    Nenhuma entrada registrada
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={fecharModalEntradas}
                className="px-5 py-2.5 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold text-sm cursor-pointer transition-colors duration-200"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
