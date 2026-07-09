import { useState, useEffect } from 'react';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  BarChart3, ClipboardList, Plus, RefreshCw, Search, Lock,
  ArrowLeft, FileText, CheckCircle, Save, Trash2, Edit3,
  Package, MapPin, Wrench, Store, AlertTriangle, X, Sun, Moon,
  ChevronDown, Clock, User, Info
} from 'lucide-react';

// Detecta automaticamente o hostname para funcionar em qualquer rede
const API_URL = `http://${window.location.hostname}:4007/api`;

// Função para obter usuário logado do localStorage
const obterUsuarioLogado = () => {
  try {
    // Tenta buscar o usuário salvo pelo menu principal
    const usuarioStr = localStorage.getItem('usuario');
    if (usuarioStr) {
      const usuario = JSON.parse(usuarioStr);
      return {
        nome: usuario.nome || 'Usuário',
        email: usuario.email || ''
      };
    }

    // Fallback: tenta decodificar do token JWT
    const token = localStorage.getItem('token');
    if (!token) return { nome: 'Usuário Desconhecido' };

    // Decodifica o token JWT (apenas a parte do payload, sem validar assinatura)
    const payloadBase64 = token.split('.')[1];
    const payload = JSON.parse(atob(payloadBase64));

    // Retorna email do usuário como nome se não tiver nome
    return {
      nome: payload.email?.split('@')[0] || 'Usuário',
      email: payload.email || ''
    };
  } catch (error) {
    console.error('Erro ao obter usuário logado:', error);
    return { nome: 'Usuário Desconhecido' };
  }
};

function App() {
  // Mapeamento de locais de estoque para exibição
  const localEstoqueMap = {
    'almoxarifado': 'Almoxarifado',
    'comercial': 'Comercial',
    'consumivel': 'Consumível',
    'estoque_comercial': 'Estoque Comercial'
  };

  const [autenticado, setAutenticado] = useState(false);
  const [inventarios, setInventarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('lista'); // 'lista', 'novo', 'editar' ou 'sincronizar'
  const [inventarioEditando, setInventarioEditando] = useState(null);
  const [novoInventario, setNovoInventario] = useState({
    nome: '',
    descricao: '',
    localEstoque: 'almoxarifado' // 'almoxarifado', 'comercial', 'consumivel', 'estoque_comercial'
  });

  // Dark mode state
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  // Estados para sincronização de produtos
  const [produtos, setProdutos] = useState({
    total: 0,
    ultima_sincronizacao: null,
    lista: [] // Lista completa de produtos
  });
  const [sincronizando, setSincronizando] = useState(false);
  const [progressoSync, setProgressoSync] = useState({
    paginaAtual: 0,
    totalPaginas: 0,
    produtosSincronizados: 0,
    mensagem: ''
  });
  const [progressoCriacao, setProgressoCriacao] = useState({
    ativo: false,
    porcentagem: 0,
    mensagem: ''
  });

  // Estados para seleção de modelo/local
  const [modeloSelecionado, setModeloSelecionado] = useState('');
  const [produtosDoModelo, setProdutosDoModelo] = useState([]);
  const [buscarModelo, setBuscarModelo] = useState('');
  const [mostrarDropdown, setMostrarDropdown] = useState(false);

  // Estado para filtro na tabela do inventário
  const [filtroTabela, setFiltroTabela] = useState('');
  // Filtros por coluna da tabela de produtos
  const [filtrosColuna, setFiltrosColuna] = useState({
    codigo: '',
    descricao: '',
    modelo: '',
    qtdSistema: '',
    contagem1: '',
    contagem2: '',
    contagem3: '',
    difFinal: '',
    observacao: ''
  });
  const [abaLista, setAbaLista] = useState('andamento'); // 'andamento' ou 'concluídos'

  // Dark mode toggle effect
  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
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

  // Carregar inventários e produtos ao iniciar
  useEffect(() => {
    if (autenticado) {
      carregarInventarios();
      carregarProdutos();
    }
  }, [autenticado]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.modelo-selector')) {
        setMostrarDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const carregarInventarios = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/inventarios`);
      if (response.data.success) {
        setInventarios(response.data.inventarios);
      }
    } catch (error) {
      console.error('Erro ao carregar inventários:', error);
      alert('Erro ao carregar inventários: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Função para obter modelos únicos
  const obterModelosUnicos = () => {
    const modelos = new Set();
    produtos.lista.forEach(produto => {
      if (produto.modelo && produto.modelo.trim()) {
        modelos.add(produto.modelo.trim());
      }
    });
    return Array.from(modelos).sort();
  };

  // Função para selecionar produtos por modelo
  const selecionarProdutosPorModelo = (modelo) => {
    setModeloSelecionado(modelo);
    setBuscarModelo(modelo);
    setMostrarDropdown(false);

    if (!modelo) {
      setProdutosDoModelo([]);
      return;
    }

    const produtosFiltrados = produtos.lista.filter(
      produto => produto.modelo && produto.modelo.trim() === modelo
    );

    setProdutosDoModelo(produtosFiltrados);
  };

  // Função para selecionar TODOS os produtos dos modelos filtrados
  const selecionarTodosProdutosFiltrados = () => {
    if (!buscarModelo) return;

    const modelosFiltrados = filtrarModelos();
    setModeloSelecionado(`Busca: ${buscarModelo.toUpperCase()} (${modelosFiltrados.length} locais)`);
    setMostrarDropdown(false);

    // Pega todos os produtos que pertencem a qualquer um dos modelos filtrados
    const todosProdutosFiltrados = produtos.lista.filter(produto => {
      if (!produto.modelo) return false;
      return modelosFiltrados.includes(produto.modelo.trim());
    });

    setProdutosDoModelo(todosProdutosFiltrados);
  };

  // Função para contar total de produtos dos modelos filtrados
  const contarProdutosFiltrados = () => {
    const modelosFiltrados = filtrarModelos();
    return produtos.lista.filter(produto => {
      if (!produto.modelo) return false;
      return modelosFiltrados.includes(produto.modelo.trim());
    }).length;
  };

  // Função para remover produto da lista de produtos do modelo
  const removerProduto = (codigoProduto) => {
    setProdutosDoModelo(produtosDoModelo.filter(p => p.codigo_produto !== codigoProduto));
  };

  // Função para filtrar modelos baseado na busca
  const filtrarModelos = () => {
    const modelos = obterModelosUnicos();
    if (!buscarModelo) return modelos;

    const termoBusca = buscarModelo.toLowerCase();

    return modelos.filter(modelo => {
      // Divide o modelo por "/" para pegar todos os locais
      const locais = modelo.split('/').map(local => local.trim());

      // Verifica se algum dos locais COMEÇA com o termo buscado
      return locais.some(local =>
        local.toLowerCase().startsWith(termoBusca)
      );
    });
  };

  const criarInventario = async () => {
    if (!novoInventario.nome.trim()) {
      alert('Digite um nome para o inventário');
      return;
    }

    if (produtosDoModelo.length === 0) {
      alert('Selecione um modelo para adicionar produtos ao inventário');
      return;
    }

    try {
      setLoading(true);

      // 5%
      setProgressoCriacao({ ativo: true, porcentagem: 5, mensagem: 'Iniciando criação...' });
      await new Promise(resolve => setTimeout(resolve, 250));

      // 10%
      setProgressoCriacao({ ativo: true, porcentagem: 10, mensagem: 'Preparando produtos...' });
      await new Promise(resolve => setTimeout(resolve, 250));

      // 15%
      setProgressoCriacao({ ativo: true, porcentagem: 15, mensagem: 'Validando dados...' });
      await new Promise(resolve => setTimeout(resolve, 250));

      // Prepara os produtos para o inventário com campos de contagem
      const produtosInventario = produtosDoModelo.map(produto => ({
        codigo: produto.codigo,
        codigo_produto: produto.codigo_produto,
        descricao: produto.descricao,
        modelo: produto.modelo,
        quantidade_sistema: 0, // Será preenchido pelo backend
        quantidade_contada: 0,
        diferenca: 0,
        observacao: ''
      }));

      // 20%
      setProgressoCriacao({ ativo: true, porcentagem: 20, mensagem: `Processando ${produtosInventario.length} produtos...` });
      await new Promise(resolve => setTimeout(resolve, 250));

      // 30%
      setProgressoCriacao({ ativo: true, porcentagem: 30, mensagem: 'Preparando requisição...' });
      await new Promise(resolve => setTimeout(resolve, 250));

      const usuarioLogado = obterUsuarioLogado();

      // 40%
      setProgressoCriacao({ ativo: true, porcentagem: 40, mensagem: 'Conectando com Omie...' });
      await new Promise(resolve => setTimeout(resolve, 250));

      // 50%
      setProgressoCriacao({ ativo: true, porcentagem: 50, mensagem: 'Consultando estoques no Omie...' });
      await new Promise(resolve => setTimeout(resolve, 200));

      const response = await axios.post(`${API_URL}/inventarios`, {
        nome: novoInventario.nome,
        descricao: novoInventario.descricao,
        localEstoque: novoInventario.localEstoque,
        produtos: produtosInventario,
        criado_por: usuarioLogado.nome
      });

      // 70%
      setProgressoCriacao({ ativo: true, porcentagem: 70, mensagem: 'Recebendo dados...' });
      await new Promise(resolve => setTimeout(resolve, 250));

      // 85%
      setProgressoCriacao({ ativo: true, porcentagem: 85, mensagem: 'Finalizando...' });
      await new Promise(resolve => setTimeout(resolve, 250));

      // 95%
      setProgressoCriacao({ ativo: true, porcentagem: 95, mensagem: 'Quase pronto...' });
      await new Promise(resolve => setTimeout(resolve, 250));

      if (response.data.success) {
        // 100%
        setProgressoCriacao({ ativo: true, porcentagem: 100, mensagem: 'Inventário criado com sucesso!' });

        // Aguarda 1 segundo para mostrar 100%
        await new Promise(resolve => setTimeout(resolve, 1000));

        alert('Inventário criado com sucesso! Estoques consultados automaticamente.');
        setNovoInventario({ nome: '', descricao: '', localEstoque: 'almoxarifado' });
        setModeloSelecionado('');
        setProdutosDoModelo([]);
        setBuscarModelo('');
        setMostrarDropdown(false);
        setView('lista');
        carregarInventarios();
      }
    } catch (error) {
      console.error('Erro ao criar inventário:', error);
      alert('Erro ao criar inventário: ' + error.message);
    } finally {
      setLoading(false);
      setProgressoCriacao({ ativo: false, porcentagem: 0, mensagem: '' });
    }
  };

  const abrirInventario = (inventario) => {
    setInventarioEditando(JSON.parse(JSON.stringify(inventario))); // Clone profundo
    setFiltroTabela(''); // Limpa o filtro ao abrir
    setFiltrosColuna({ codigo: '', descricao: '', modelo: '', qtdSistema: '', contagem1: '', contagem2: '', contagem3: '', difFinal: '', observacao: '' }); // Limpa filtros por coluna
    setView('editar');
  };

  // Função para filtrar e ordenar produtos da tabela
  const obterProdutosFiltradosOrdenados = () => {
    if (!inventarioEditando || !inventarioEditando.produtos) return [];

    let produtosFiltrados = inventarioEditando.produtos;

    // Filtra produtos com quantidade_sistema = 0
    produtosFiltrados = produtosFiltrados.filter(produto => produto.quantidade_sistema > 0);

    // Aplica filtro de busca se houver
    if (filtroTabela.trim()) {
      const termo = filtroTabela.toLowerCase();
      produtosFiltrados = produtosFiltrados.filter(produto => {
        const codigo = (produto.codigo || '').toLowerCase();
        const descricao = (produto.descricao || '').toLowerCase();
        const modelo = (produto.modelo || '').toLowerCase();

        return codigo.includes(termo) ||
               descricao.includes(termo) ||
               modelo.includes(termo);
      });
    }

    // Aplica filtros por coluna (combinam entre si com E)
    const fc = filtrosColuna;
    const temFiltroColuna = Object.values(fc).some(v => (v || '').trim() !== '');
    if (temFiltroColuna) {
      const inclui = (valor, termo) =>
        termo.trim() === '' || String(valor ?? '').toLowerCase().includes(termo.trim().toLowerCase());

      produtosFiltrados = produtosFiltrados.filter(produto => {
        const difFinal = calcularDiferencaFinal(produto);
        return inclui(produto.codigo, fc.codigo) &&
               inclui(produto.descricao, fc.descricao) &&
               inclui(produto.modelo, fc.modelo) &&
               inclui(produto.quantidade_sistema, fc.qtdSistema) &&
               inclui(produto.quantidade_contada, fc.contagem1) &&
               inclui(produto.quantidade_contada_2, fc.contagem2) &&
               inclui(produto.quantidade_contada_3, fc.contagem3) &&
               inclui(difFinal, fc.difFinal) &&
               inclui(produto.observacao, fc.observacao);
      });
    }

    // ORDENAÇÃO INTELIGENTE:
    // Agrupa produtos com diferença no topo, sem diferença embaixo
    return produtosFiltrados.sort((a, b) => {
      // Se a 3a contagem está habilitada: produtos com diferença na 2a contagem vem primeiro
      if (inventarioEditando.mostrar_contagem_3) {
        // Só considera diferença se a 2a contagem foi realmente preenchida (não é null)
        const temContagem2A = a.quantidade_contada_2 !== null && a.quantidade_contada_2 !== undefined;
        const temContagem2B = b.quantidade_contada_2 !== null && b.quantidade_contada_2 !== undefined;

        const diferencaA = temContagem2A ? (a.quantidade_contada_2 - a.quantidade_sistema) : 0;
        const diferencaB = temContagem2B ? (b.quantidade_contada_2 - b.quantidade_sistema) : 0;

        const temDiferencaA = (temContagem2A && diferencaA !== 0) ? 1 : 0;
        const temDiferencaB = (temContagem2B && diferencaB !== 0) ? 1 : 0;

        // Ordena: produtos com diferença primeiro (1 > 0)
        if (temDiferencaB !== temDiferencaA) {
          return temDiferencaB - temDiferencaA;
        }
      }
      // Se a 2a contagem está habilitada: produtos com diferença na 1a contagem vem primeiro
      else if (inventarioEditando.mostrar_contagem_2) {
        // Compara a 1a contagem com o sistema
        const diferencaA = (a.quantidade_contada || 0) - a.quantidade_sistema;
        const diferencaB = (b.quantidade_contada || 0) - b.quantidade_sistema;
        const temDiferencaA = diferencaA !== 0 ? 1 : 0;
        const temDiferencaB = diferencaB !== 0 ? 1 : 0;

        // Ordena: produtos com diferença primeiro (1 > 0)
        if (temDiferencaB !== temDiferencaA) {
          return temDiferencaB - temDiferencaA;
        }
      }

      // Dentro de cada grupo, ordena por modelo A-Z
      const modeloA = (a.modelo || '').toLowerCase();
      const modeloB = (b.modelo || '').toLowerCase();
      return modeloA.localeCompare(modeloB);
    });
  };

  const atualizarQuantidadeContada = (produto, valor, contagem = 1) => {
    const novoInv = { ...inventarioEditando };

    // Se o valor for vazio, mantém null. Senão, converte para número
    const valorNumerico = (valor === '' || valor === null || valor === undefined)
      ? null
      : parseFloat(valor);

    // Encontra o produto pelo código (identificador único)
    const produtoIndex = novoInv.produtos.findIndex(p => p.codigo === produto.codigo);

    if (produtoIndex !== -1) {
      const prod = novoInv.produtos[produtoIndex];

      if (contagem === 1) {
        prod.quantidade_contada = valorNumerico === null ? 0 : valorNumerico;
        prod.diferenca = (valorNumerico === null ? 0 : valorNumerico) - prod.quantidade_sistema;
      } else if (contagem === 2) {
        prod.quantidade_contada_2 = valorNumerico;
      } else if (contagem === 3) {
        prod.quantidade_contada_3 = valorNumerico;
      }

      setInventarioEditando(novoInv);
    }
  };

  const atualizarObservacao = (produto, valor) => {
    const novoInv = { ...inventarioEditando };
    const produtoIndex = novoInv.produtos.findIndex(p => p.codigo === produto.codigo);

    if (produtoIndex !== -1) {
      novoInv.produtos[produtoIndex].observacao = valor;
      setInventarioEditando(novoInv);
    }
  };

  // Função para calcular diferença final (baseada na última contagem preenchida)
  const calcularDiferencaFinal = (produto) => {
    if (produto.quantidade_contada_3 !== null && produto.quantidade_contada_3 !== undefined) {
      return produto.quantidade_contada_3 - produto.quantidade_sistema;
    } else if (produto.quantidade_contada_2 !== null && produto.quantidade_contada_2 !== undefined) {
      return produto.quantidade_contada_2 - produto.quantidade_sistema;
    } else {
      return (produto.quantidade_contada || 0) - produto.quantidade_sistema;
    }
  };

  // Verificar se há produtos com diferença na contagem especificada
  const temDiferenca = (contagem = 1) => {
    if (!inventarioEditando || !inventarioEditando.produtos) return false;

    return inventarioEditando.produtos.some(produto => {
      if (contagem === 1) {
        const dif = (produto.quantidade_contada || 0) - produto.quantidade_sistema;
        return dif !== 0;
      } else if (contagem === 2) {
        if (produto.quantidade_contada_2 === null || produto.quantidade_contada_2 === undefined) return false;
        const dif = produto.quantidade_contada_2 - produto.quantidade_sistema;
        return dif !== 0;
      }
      return false;
    });
  };

  // Habilitar 2a ou 3a contagem
  const habilitarContagem = (numero) => {
    const novoInv = { ...inventarioEditando };

    if (numero === 2) {
      novoInv.mostrar_contagem_2 = true;
      // NÃO inicializa valores! Mantém null até serem preenchidos
    } else if (numero === 3) {
      novoInv.mostrar_contagem_3 = true;
      // NÃO inicializa valores! Mantém null até serem preenchidos
    }

    setInventarioEditando(novoInv);
  };

  // Contar produtos com diferença
  const contarProdutosComDiferenca = (contagem = 1) => {
    if (!inventarioEditando || !inventarioEditando.produtos) return 0;

    return inventarioEditando.produtos.filter(produto => {
      if (contagem === 1) {
        const dif = (produto.quantidade_contada || 0) - produto.quantidade_sistema;
        return dif !== 0;
      } else if (contagem === 2) {
        if (produto.quantidade_contada_2 === null || produto.quantidade_contada_2 === undefined) return false;
        const dif = produto.quantidade_contada_2 - produto.quantidade_sistema;
        return dif !== 0;
      } else if (contagem === 'final') {
        const dif = calcularDiferencaFinal(produto);
        return dif !== 0;
      }
      return false;
    }).length;
  };

  const salvarInventario = async () => {
    try {
      setLoading(true);
      const usuarioLogado = obterUsuarioLogado();

      const response = await axios.put(`${API_URL}/inventarios/${inventarioEditando.id}`, {
        ...inventarioEditando,
        modificado_por: usuarioLogado.nome
      });

      if (response.data.success) {
        alert('Inventário salvo com sucesso!');
        carregarInventarios();
        setView('lista');
        setInventarioEditando(null);
      }
    } catch (error) {
      console.error('Erro ao salvar inventário:', error);
      alert('Erro ao salvar inventário: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const concluirInventario = async (id, nome) => {
    if (!confirm(`ATENÇÃO!\n\nDeseja realmente CONCLUIR este inventário?\n\n"${nome}"\n\nApós concluir, o status mudará para "Concluído".`)) {
      return;
    }

    try {
      setLoading(true);
      const usuarioLogado = obterUsuarioLogado();

      const response = await axios.put(`${API_URL}/inventarios/${id}/concluir`, {
        concluido_por: usuarioLogado.nome
      });

      if (response.data.success) {
        alert('Inventário concluído com sucesso!');
        // Atualiza o inventário editando com o status atualizado
        setInventarioEditando(response.data.inventario);
        carregarInventarios();
      }
    } catch (error) {
      console.error('Erro ao concluir inventário:', error);
      alert('Erro ao concluir inventário: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const exportarParaPDF = () => {
    try {
      console.log('Iniciando exportação para PDF...');

      // Cria documento PDF em orientação horizontal (landscape)
      const doc = new jsPDF('landscape', 'mm', 'a4');
      console.log('PDF criado com sucesso');

      // Configurações
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;

      // Cabeçalho
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('RELATÓRIO DE INVENTÁRIO', pageWidth / 2, 15, { align: 'center' });

      // Informações do inventário
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const dataFormatada = formatarData(inventarioEditando.data_criacao);
      const localEstoqueTexto = localEstoqueMap[inventarioEditando.localEstoque] || inventarioEditando.localEstoque;

      doc.text(`Inventário: ${inventarioEditando.nome}`, margin, 25);
      doc.text(`Local: ${localEstoqueTexto}`, margin, 30);
      doc.text(`Data: ${dataFormatada}`, margin, 35);
      if (inventarioEditando.descricao) {
        doc.text(`Descrição: ${inventarioEditando.descricao}`, margin, 40);
      }

      // Prepara dados da tabela
      const produtosFiltrados = obterProdutosFiltradosOrdenados();
      const tableData = produtosFiltrados.map((produto, index) => {
        const row = [
          index + 1,
          produto.codigo || '',
          produto.descricao || '',
          produto.modelo || '',
          produto.quantidade_sistema || 0,
          produto.quantidade_contada || 0
        ];

        // Adiciona 2a contagem se habilitada
        if (inventarioEditando.mostrar_contagem_2) {
          row.push(produto.quantidade_contada_2 || 0);
        }

        // Adiciona 3a contagem se habilitada
        if (inventarioEditando.mostrar_contagem_3) {
          row.push(produto.quantidade_contada_3 || 0);
        }

        // Diferença final
        const diferencaFinal = calcularDiferencaFinal(produto);
        row.push(diferencaFinal);

        // Observação
        row.push(produto.observacao || '');

        return row;
      });

      // Cabeçalhos da tabela
      const tableHeaders = ['#', 'Código', 'Descrição', 'Modelo', 'Qtd. Sistema', '1a Contagem'];

      if (inventarioEditando.mostrar_contagem_2) {
        tableHeaders.push('2a Contagem');
      }
      if (inventarioEditando.mostrar_contagem_3) {
        tableHeaders.push('3a Contagem');
      }

      tableHeaders.push('Diferença');
      tableHeaders.push('Observação');

      // Cria tabela
      doc.autoTable({
        head: [tableHeaders],
        body: tableData,
        startY: inventarioEditando.descricao ? 45 : 40,
        margin: { left: margin, right: margin },
        styles: {
          fontSize: 8,
          cellPadding: 2
        },
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' }, // #
          1: { cellWidth: 30 }, // Código
          2: { cellWidth: 'auto' }, // Descrição
          3: { cellWidth: 25 }, // Modelo
          4: { cellWidth: 20, halign: 'right' }, // Qtd Sistema
          5: { cellWidth: 20, halign: 'right' }, // 1a Contagem
        },
        didParseCell: function(data) {
          // Colore a linha se houver diferença
          if (data.section === 'body') {
            const rowData = tableData[data.row.index];
            const diferencaIndex = inventarioEditando.mostrar_contagem_3 ? 8 :
                                   inventarioEditando.mostrar_contagem_2 ? 7 : 6;
            const diferenca = rowData[diferencaIndex];

            if (diferenca !== 0) {
              data.cell.styles.fillColor = [254, 243, 199]; // Amarelo claro
            }

            // Colore a célula de diferença
            if (data.column.index === diferencaIndex) {
              data.cell.styles.fontStyle = 'bold';
              if (diferenca > 0) {
                data.cell.styles.textColor = [37, 99, 235]; // Azul
              } else if (diferenca < 0) {
                data.cell.styles.textColor = [239, 68, 68]; // Vermelho
              } else {
                data.cell.styles.textColor = [16, 185, 129]; // Verde
              }
            }
          }
        }
      });

      // Rodapé com resumo
      const finalY = doc.lastAutoTable.finalY + 10;
      const totalProdutos = produtosFiltrados.length;
      const produtosComDiferenca = contarProdutosComDiferenca('final');

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Total de Produtos: ${totalProdutos}`, margin, finalY);
      doc.text(`Produtos com Diferença: ${produtosComDiferenca}`, margin, finalY + 6);
      doc.text(`Produtos Conferidos: ${totalProdutos - produtosComDiferenca}`, margin, finalY + 12);

      // Gera nome do arquivo
      const nomeArquivo = `Inventário_${inventarioEditando.nome.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

      console.log('Salvando PDF:', nomeArquivo);

      // Salva o PDF
      doc.save(nomeArquivo);

      console.log('PDF exportado com sucesso!');
      alert('PDF gerado com sucesso!');

    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF: ' + error.message);
    }
  };

  const deletarInventario = async (id) => {
    if (!confirm('Deseja realmente deletar este inventário?')) {
      return;
    }

    try {
      setLoading(true);
      const response = await axios.delete(`${API_URL}/inventarios/${id}`);
      if (response.data.success) {
        alert('Inventário deletado com sucesso!');
        carregarInventarios();
      }
    } catch (error) {
      console.error('Erro ao deletar inventário:', error);
      alert('Erro ao deletar inventário: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const carregarProdutos = async () => {
    try {
      const response = await axios.get(`${API_URL}/produtos`);
      if (response.data.success) {
        setProdutos({
          total: response.data.total,
          ultima_sincronizacao: response.data.ultima_sincronizacao,
          lista: response.data.produtos || []
        });
      }
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
    }
  };

  const iniciarSincronizacao = async () => {
    try {
      setSincronizando(true);

      const response = await axios.post(`${API_URL}/sincronizar-produtos`);
      if (response.data.success) {
        // Inicia polling para acompanhar progresso
        verificarProgresso();
      }
    } catch (error) {
      console.error('Erro ao iniciar sincronização:', error);
      alert('Erro ao iniciar sincronização: ' + error.message);
      setSincronizando(false);
    }
  };

  const verificarProgresso = async () => {
    try {
      const response = await axios.get(`${API_URL}/sincronizar-produtos/progresso`);
      if (response.data.success) {
        setProgressoSync({
          paginaAtual: response.data.paginaAtual,
          totalPaginas: response.data.totalPaginas,
          produtosSincronizados: response.data.produtosSincronizados,
          mensagem: response.data.mensagem
        });

        // Se ainda está sincronizando, verifica novamente em 1 segundo
        if (response.data.sincronizando) {
          setTimeout(verificarProgresso, 1000);
        } else {
          setSincronizando(false);
          carregarProdutos();
          if (response.data.mensagem.includes('✅')) {
            alert('Sincronização concluída com sucesso!');
            setView('lista');
          }
        }
      }
    } catch (error) {
      console.error('Erro ao verificar progresso:', error);
      setSincronizando(false);
    }
  };

  const formatarData = (isoString) => {
    if (!isoString) return 'Nunca';
    const data = new Date(isoString);
    return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR');
  };

  // Tela de não autenticado
  if (!autenticado) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-5">
        <div className="max-w-lg w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-10 text-center animate-fade-in">
          <div className="w-20 h-20 mx-auto mb-6 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <Lock className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Acesso Restrito</h2>
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
      <header className="max-w-[1400px] mx-auto mb-6 flex items-center gap-4 flex-wrap">
        <div
          className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center text-white shadow-lg cursor-pointer hover:scale-105 hover:shadow-xl transition-all duration-200"
          onClick={() => window.location.href = `http://${window.location.hostname}:3000`}
          title="Voltar ao Menu Principal"
        >
          <BarChart3 className="w-7 h-7" />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 m-0">
            Programa Inventário - IVOLV
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 m-0">
            Controle e contagem de estoque
          </p>
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-yellow-400 hover:bg-gray-300 dark:hover:bg-gray-600 transition-all duration-200 cursor-pointer"
          title={darkMode ? 'Modo Claro' : 'Modo Escuro'}
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* Sync button */}
        <button
          className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-white text-sm font-semibold shadow-lg transition-all duration-200 cursor-pointer ml-auto ${
            sincronizando
              ? 'bg-primary-500 opacity-70 cursor-not-allowed'
              : 'bg-gradient-to-r from-primary-600 to-primary-700 hover:-translate-y-0.5'
          }`}
          onClick={iniciarSincronizacao}
          disabled={sincronizando}
        >
          <div className="flex items-center gap-1.5">
            {sincronizando ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span>{sincronizando ? 'Sincronizando...' : 'Atualizar Base de Produtos'}</span>
          </div>
          {produtos.ultima_sincronizacao && !sincronizando && (
            <span className="text-xs text-white/80 whitespace-nowrap border-l border-white/30 pl-3">
              {formatarData(produtos.ultima_sincronizacao)}
            </span>
          )}
        </button>
      </header>

      {/* BARRA DE PROGRESSO DA SINCRONIZAÇÃO */}
      {sincronizando && progressoSync.totalPaginas > 0 && (
        <div className="max-w-[1400px] mx-auto mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-5 border-2 border-primary-500 animate-fade-in">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {progressoSync.mensagem || 'Carregando produtos...'}
            </span>
            <span className="text-2xl font-bold text-primary-500">
              {Math.round((progressoSync.paginaAtual / progressoSync.totalPaginas) * 100)}%
            </span>
          </div>
          <div className="w-full h-8 bg-gray-200 dark:bg-gray-700 rounded-2xl overflow-hidden shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-primary-500 via-primary-400 to-primary-500 animate-progress-shimmer rounded-2xl transition-all duration-500 shadow-[0_2px_8px_rgba(72,187,120,0.4)]"
              style={{ width: `${(progressoSync.paginaAtual / progressoSync.totalPaginas) * 100}%` }}
            />
          </div>
          <div className="flex justify-around mt-6 gap-6">
            <div className="flex flex-col items-center flex-1 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide mb-2">Página</span>
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {progressoSync.paginaAtual} / {progressoSync.totalPaginas}
              </span>
            </div>
            <div className="flex flex-col items-center flex-1 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide mb-2">Produtos Sincronizados</span>
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {progressoSync.produtosSincronizados}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-[1400px] mx-auto">
        {/* TOOLBAR */}
        <div className="flex gap-3 mb-6">
          <button
            className={`px-6 py-3 rounded-lg font-semibold text-sm text-white shadow-lg transition-all duration-200 cursor-pointer flex items-center gap-2 hover:-translate-y-0.5 ${
              view === 'lista'
                ? 'bg-gradient-to-r from-primary-600 to-primary-700'
                : 'bg-gray-500 hover:bg-gray-600'
            }`}
            onClick={() => setView('lista')}
          >
            <ClipboardList className="w-4 h-4" />
            Lista de Inventários
          </button>
          <button
            className={`px-6 py-3 rounded-lg font-semibold text-sm text-white shadow-lg transition-all duration-200 cursor-pointer flex items-center gap-2 hover:-translate-y-0.5 ${
              view === 'novo'
                ? 'bg-gradient-to-r from-primary-600 to-primary-700'
                : 'bg-gray-500 hover:bg-gray-600'
            }`}
            onClick={() => setView('novo')}
          >
            <Plus className="w-4 h-4" />
            Novo Inventário
          </button>
        </div>

        {/* ===== VIEW: LISTA ===== */}
        {view === 'lista' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 animate-fade-in">
            {/* Abas Em Andamento / Concluídos */}
            <div className="flex gap-2 mb-5 border-b-2 border-gray-200 dark:border-gray-700">
              <button
                className={`px-5 py-2.5 border-none rounded-t-lg cursor-pointer font-semibold text-sm transition-all duration-200 ${
                  abaLista === 'andamento'
                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border-b-[3px] border-amber-500'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-b-[3px] border-transparent'
                }`}
                onClick={() => setAbaLista('andamento')}
              >
                <Clock className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                Em Andamento ({inventarios.filter(i => i.status !== 'concluido').length})
              </button>
              <button
                className={`px-5 py-2.5 border-none rounded-t-lg cursor-pointer font-semibold text-sm transition-all duration-200 ${
                  abaLista === 'concluidos'
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border-b-[3px] border-green-500'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-b-[3px] border-transparent'
                }`}
                onClick={() => setAbaLista('concluidos')}
              >
                <CheckCircle className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                Concluídos ({inventarios.filter(i => i.status === 'concluido').length})
              </button>
            </div>

            {/* Campo de busca/filtro */}
            {inventarios.length > 0 && (
              <div className="mb-5">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Pesquisar por nome, descrição ou criador..."
                    value={filtroTabela}
                    onChange={(e) => setFiltroTabela(e.target.value)}
                    className="w-full h-12 pl-12 pr-4 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                  />
                </div>
              </div>
            )}

            {loading ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <RefreshCw className="w-10 h-10 mx-auto mb-4 animate-spin text-primary-500" />
                <p>Carregando...</p>
              </div>
            ) : inventarios.length === 0 ? (
              <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                <Package className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                <p className="text-lg">Nenhum inventário cadastrado</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                  Clique em "Novo Inventário" para começar
                </p>
              </div>
            ) : (() => {
              // Filtrar por aba (status) e depois por busca
              const inventariosPorAba = inventarios.filter(inv =>
                abaLista === 'concluidos' ? inv.status === 'concluido' : inv.status !== 'concluido'
              );

              const inventariosFiltrados = inventariosPorAba.filter(inv => {
                if (!filtroTabela.trim()) return true;
                const busca = filtroTabela.toLowerCase();
                return (
                  (inv.nome && inv.nome.toLowerCase().includes(busca)) ||
                  (inv.descricao && inv.descricao.toLowerCase().includes(busca)) ||
                  (inv.criado_por && inv.criado_por.toLowerCase().includes(busca))
                );
              });

              if (inventariosFiltrados.length === 0) {
                return (
                  <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                    {filtroTabela ? (
                      <Search className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                    ) : abaLista === 'concluidos' ? (
                      <ClipboardList className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                    ) : (
                      <CheckCircle className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                    )}
                    <p className="text-lg">
                      {filtroTabela
                        ? 'Nenhum inventário encontrado'
                        : abaLista === 'concluidos'
                          ? 'Nenhum inventário concluído'
                          : 'Nenhum inventário em andamento'}
                    </p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                      {filtroTabela
                        ? 'Tente ajustar os termos de pesquisa'
                        : abaLista === 'concluidos'
                          ? 'Inventários concluídos aparecerão aqui'
                          : 'Clique em "Novo Inventário" para começar'}
                    </p>
                  </div>
                );
              }

              return (
                <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  {filtroTabela && (
                    <div className="mb-3 text-sm text-gray-500 dark:text-gray-400">
                      Mostrando {inventariosFiltrados.length} de {inventariosPorAba.length} inventário(s)
                    </div>
                  )}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-700 border-b-2 border-gray-200 dark:border-gray-600">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Nome</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Descrição</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 text-center">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Criado por</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Data</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 text-center">Produtos</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {inventariosFiltrados.map((inv, idx) => (
                        <tr
                          key={inv.id}
                          className={`${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'} hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors`}
                        >
                          <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300 font-semibold text-gray-900 dark:text-white">
                            {inv.nome}
                          </td>
                          <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300 max-w-[300px]">
                            {inv.descricao || '-'}
                          </td>
                          <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300 text-center">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              inv.status === 'concluido'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                            }`}>
                              {inv.status === 'concluido' ? (
                                <><CheckCircle className="w-3 h-3 inline mr-1 -mt-0.5" /> Concluído</>
                              ) : (
                                <><Clock className="w-3 h-3 inline mr-1 -mt-0.5" /> Em Andamento</>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                            {inv.criado_por || 'N/A'}
                          </td>
                          <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                            {formatarData(inv.data_criacao)}
                          </td>
                          <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300 text-center font-semibold text-gray-900 dark:text-white">
                            {inv.produtos?.length || 0}
                          </td>
                          <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                            <div className="flex gap-2 justify-center">
                              <button
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold transition-colors flex items-center gap-1"
                                onClick={() => abrirInventario(inv)}
                              >
                                <Edit3 className="w-3 h-3" /> Abrir
                              </button>
                              <button
                                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-md text-xs font-semibold transition-colors flex items-center gap-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deletarInventario(inv.id);
                                }}
                              >
                                <Trash2 className="w-3 h-3" /> Deletar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}

        {/* ===== VIEW: NOVO ===== */}
        {view === 'novo' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 animate-fade-in">
            <div className="mb-8 text-center">
              <h2 className="text-2xl md:text-3xl font-bold mb-2 bg-gradient-to-r from-primary-600 to-primary-700 bg-clip-text text-transparent">
                Criar Novo Inventário
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Preencha as informações abaixo para criar um novo inventário
              </p>
            </div>

            <div className="w-full">
              {produtos.total === 0 ? (
                <div className="p-8 bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 border-3 border-amber-400 dark:border-amber-600 rounded-2xl text-center">
                  <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-amber-500" />
                  <h3 className="text-xl font-bold text-amber-800 dark:text-amber-300 mb-3">
                    Base de Produtos Não Sincronizada
                  </h3>
                  <p className="text-amber-700 dark:text-amber-400 mb-6">
                    Você precisa sincronizar a base de produtos da Omie antes de criar um inventário.
                  </p>
                  <button
                    className="px-8 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg font-semibold text-base shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex items-center gap-2 mx-auto"
                    onClick={iniciarSincronizacao}
                  >
                    <RefreshCw className="w-5 h-5" />
                    Sincronizar Produtos Agora
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* COLUNA ESQUERDA - Informações do Inventário */}
                    <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-xl border-2 border-gray-200 dark:border-gray-600 h-fit">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5 flex items-center gap-2.5">
                        <ClipboardList className="w-6 h-6 text-primary-600" />
                        Informações do Inventário
                      </h3>

                      <div className="mb-5">
                        <label className="block mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Nome do Inventário *</label>
                        <input
                          type="text"
                          className="w-full h-12 px-4 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                          placeholder="Ex: Inventário Janeiro 2026"
                          value={novoInventario.nome}
                          onChange={(e) => setNovoInventario({ ...novoInventario, nome: e.target.value })}
                        />
                      </div>

                      <div className="mb-5">
                        <label className="block mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Descrição (opcional)</label>
                        <textarea
                          className="w-full min-h-[120px] px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 resize-y focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                          placeholder="Detalhes sobre este inventário..."
                          value={novoInventario.descricao}
                          onChange={(e) => setNovoInventario({ ...novoInventario, descricao: e.target.value })}
                        />
                      </div>

                      <div className="mb-5">
                        <label className="block mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Local de Estoque *</label>
                        <div className="grid grid-cols-2 gap-2.5 mt-2">
                          <button
                            type="button"
                            className={`flex flex-col items-center gap-1 p-4 rounded-lg border-2 font-bold text-sm transition-all duration-200 cursor-pointer ${
                              novoInventario.localEstoque === 'almoxarifado'
                                ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white border-primary-500 shadow-lg shadow-primary-500/30'
                                : 'bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-500 hover:border-primary-400'
                            }`}
                            onClick={() => setNovoInventario({ ...novoInventario, localEstoque: 'almoxarifado' })}
                          >
                            <Package className="w-6 h-6" />
                            <span>Almoxarifado</span>
                          </button>
                          <button
                            type="button"
                            className={`flex flex-col items-center gap-1 p-4 rounded-lg border-2 font-bold text-sm transition-all duration-200 cursor-pointer ${
                              novoInventario.localEstoque === 'consumivel'
                                ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white border-primary-500 shadow-lg shadow-primary-500/30'
                                : 'bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-500 hover:border-primary-400'
                            }`}
                            onClick={() => setNovoInventario({ ...novoInventario, localEstoque: 'consumivel' })}
                          >
                            <Wrench className="w-6 h-6" />
                            <span>Consumível</span>
                          </button>
                          <button
                            type="button"
                            className={`col-span-2 flex flex-col items-center gap-1 p-4 rounded-lg border-2 font-bold text-sm transition-all duration-200 cursor-pointer ${
                              novoInventario.localEstoque === 'estoque_comercial'
                                ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white border-primary-500 shadow-lg shadow-primary-500/30'
                                : 'bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-500 hover:border-primary-400'
                            }`}
                            onClick={() => setNovoInventario({ ...novoInventario, localEstoque: 'estoque_comercial' })}
                          >
                            <Store className="w-6 h-6" />
                            <span>Estoque Comercial</span>
                          </button>
                        </div>
                        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                          <p className="m-0 text-sm text-blue-800 dark:text-blue-300 leading-relaxed flex items-start gap-2">
                            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>
                              {novoInventario.localEstoque === 'almoxarifado' && 'Será usado o saldo do Almoxarifado / Matéria Prima'}
                              {novoInventario.localEstoque === 'consumivel' && 'Será usado o saldo do local Consumível'}
                              {novoInventario.localEstoque === 'estoque_comercial' && 'Será usado o saldo do Estoque Comercial'}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* COLUNA DIREITA - Seleção de Produtos */}
                    <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-gray-700/50 dark:to-gray-700/30 p-6 rounded-xl border-2 border-gray-200 dark:border-gray-600 h-fit">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5 flex items-center gap-2.5">
                        <Search className="w-6 h-6 text-primary-600" />
                        Selecionar Produtos
                      </h3>

                      <div className="mb-5">
                        <label className="block mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Buscar Local (Modelo) *</label>
                        <div className="modelo-selector relative">
                          <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                            <input
                              type="text"
                              className="w-full h-12 pl-12 pr-12 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                              placeholder="Digite para buscar e pressione Enter..."
                              value={buscarModelo}
                              onChange={(e) => {
                                setBuscarModelo(e.target.value);
                                setMostrarDropdown(true);
                                if (!e.target.value) {
                                  setModeloSelecionado('');
                                  setProdutosDoModelo([]);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && buscarModelo && filtrarModelos().length > 0) {
                                  e.preventDefault();
                                  selecionarTodosProdutosFiltrados();
                                }
                              }}
                              onFocus={() => setMostrarDropdown(true)}
                              autoComplete="off"
                            />
                            {buscarModelo && (
                              <button
                                type="button"
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center cursor-pointer shadow-md transition-all duration-200"
                                onClick={() => {
                                  setBuscarModelo('');
                                  setModeloSelecionado('');
                                  setProdutosDoModelo([]);
                                  setMostrarDropdown(false);
                                }}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {mostrarDropdown && filtrarModelos().length > 0 && (
                            <div className="absolute top-full left-0 right-0 max-h-[250px] overflow-y-auto bg-white dark:bg-gray-800 border-2 border-primary-500 rounded-lg mt-1 shadow-xl z-[1000]">
                              <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border-b-2 border-gray-200 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">
                                {filtrarModelos().length} {filtrarModelos().length === 1 ? 'local encontrado' : 'locais encontrados'}
                              </div>

                              {buscarModelo && (
                                <div
                                  className="px-4 py-3.5 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-bold cursor-pointer border-b-2 border-primary-700 text-sm flex items-center justify-between hover:from-primary-600 hover:to-primary-700 transition-all duration-200"
                                  onClick={selecionarTodosProdutosFiltrados}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <CheckCircle className="w-5 h-5" />
                                    <span>Selecionar TODOS os produtos</span>
                                  </div>
                                  <div className="bg-white/25 px-3.5 py-1.5 rounded-2xl text-sm font-bold">
                                    {contarProdutosFiltrados()} itens
                                  </div>
                                </div>
                              )}

                              {filtrarModelos().map((modelo) => (
                                <div
                                  key={modelo}
                                  className={`px-4 py-3.5 cursor-pointer border-b border-gray-100 dark:border-gray-700 text-sm text-gray-800 dark:text-gray-200 transition-colors duration-150 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${
                                    modeloSelecionado === modelo ? 'bg-blue-50 dark:bg-blue-900/20 font-semibold' : ''
                                  }`}
                                  onClick={() => selecionarProdutosPorModelo(modelo)}
                                >
                                  <MapPin className="w-4 h-4 text-gray-400" />
                                  {modelo}
                                </div>
                              ))}
                            </div>
                          )}

                          {mostrarDropdown && filtrarModelos().length === 0 && buscarModelo && (
                            <div className="absolute top-full left-0 right-0 bg-white dark:bg-gray-800 border-2 border-primary-500 rounded-lg mt-1 shadow-xl z-[1000]">
                              <div className="text-center p-5 text-gray-400 dark:text-gray-500">
                                <Search className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                                Nenhum modelo encontrado
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {modeloSelecionado && (
                        <div className="mt-5 p-5 bg-white dark:bg-gray-800 rounded-xl border-2 border-primary-500 shadow-md">
                          <div className="flex justify-between items-center mb-4">
                            <h4 className="m-0 text-base font-bold text-primary-700 dark:text-primary-400 flex items-center gap-2">
                              <Package className="w-5 h-5" />
                              Produtos Selecionados
                            </h4>
                            <span className="px-4 py-1.5 rounded-2xl text-sm font-bold bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md">
                              {produtosDoModelo.length} produtos
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-3 p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
                            <strong>Local:</strong> {modeloSelecionado}
                          </div>

                          <div className="max-h-[400px] overflow-y-auto flex flex-col gap-2">
                            {produtosDoModelo.map((produto, index) => (
                              <div
                                key={index}
                                className="flex justify-between items-center p-3.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg gap-3 transition-colors duration-150 hover:bg-gray-100 dark:hover:bg-gray-600"
                              >
                                <div className="flex-1">
                                  <div className="font-bold text-gray-900 dark:text-gray-100 mb-1 text-sm">
                                    {produto.codigo}
                                  </div>
                                  <div className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                                    {produto.descricao}
                                  </div>
                                </div>
                                <div className="text-xs text-gray-400 dark:text-gray-500 text-right mr-3 font-semibold">
                                  ID: {produto.codigo_produto}
                                </div>
                                <button
                                  onClick={() => removerProduto(produto.codigo_produto)}
                                  className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg px-3.5 py-2 cursor-pointer text-sm font-bold transition-all duration-200 shadow-md hover:from-red-600 hover:to-red-700 hover:scale-105 flex items-center gap-1.5"
                                  title="Remover produto do inventário"
                                >
                                  <X className="w-3.5 h-3.5" /> Remover
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Barra de Progresso */}
                  {progressoCriacao.ativo && (
                    <div className="mb-6 p-6 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-3 border-primary-500 rounded-2xl shadow-lg animate-fade-in">
                      <div className="mb-3 flex justify-between items-center">
                        <span className="text-sm font-bold text-primary-800 dark:text-primary-300">
                          {progressoCriacao.mensagem}
                        </span>
                        <span className="text-2xl font-extrabold text-primary-500">
                          {progressoCriacao.porcentagem}%
                        </span>
                      </div>
                      <div className="w-full h-8 bg-white dark:bg-gray-700 rounded-2xl overflow-hidden shadow-inner">
                        <div
                          className="h-full bg-gradient-to-r from-primary-500 via-primary-400 to-primary-500 animate-progress-shimmer rounded-2xl transition-all duration-300 shadow-[0_2px_8px_rgba(72,187,120,0.4)] flex items-center justify-end pr-3"
                          style={{ width: `${progressoCriacao.porcentagem}%` }}
                        >
                          {progressoCriacao.porcentagem > 10 && (
                            <Clock className="w-4 h-4 text-white" />
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Botões de Ação */}
                  <div className="flex gap-4 mt-8 p-6 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <button
                      className={`flex-1 px-8 py-4 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg font-semibold text-base shadow-lg transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 ${
                        loading || produtosDoModelo.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-0.5'
                      }`}
                      onClick={criarInventario}
                      disabled={loading || produtosDoModelo.length === 0}
                    >
                      {loading ? (
                        <><RefreshCw className="w-5 h-5 animate-spin" /> Criando...</>
                      ) : (
                        <><CheckCircle className="w-5 h-5" /> Criar Inventário</>
                      )}
                    </button>
                    <button
                      className="px-8 py-4 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-lg font-semibold text-base shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex items-center gap-2"
                      onClick={() => {
                        setNovoInventario({ nome: '', descricao: '', localEstoque: 'almoxarifado' });
                        setModeloSelecionado('');
                        setProdutosDoModelo([]);
                        setBuscarModelo('');
                        setMostrarDropdown(false);
                        setView('lista');
                      }}
                    >
                      <X className="w-5 h-5" /> Cancelar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ===== VIEW: EDITAR ===== */}
        {view === 'editar' && inventarioEditando && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 animate-fade-in">
            <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 m-0">{inventarioEditando.nome}</h2>
                <p className="mt-1 text-gray-500 dark:text-gray-400 text-sm">
                  {inventarioEditando.descricao || 'Sem descrição'}
                </p>
                <p className="mt-2 text-gray-500 dark:text-gray-400 text-sm flex items-center gap-1.5">
                  <Package className="w-4 h-4" />
                  Local: {localEstoqueMap[inventarioEditando.localEstoque] || inventarioEditando.localEstoque}
                </p>
                <p className="mt-1 text-gray-500 dark:text-gray-400 text-xs flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  Criado por: <strong>{inventarioEditando.criado_por || 'N/A'}</strong>
                  <span className="mx-1">|</span>
                  <Clock className="w-3.5 h-3.5" />
                  {formatarData(inventarioEditando.data_criacao)}
                </p>
                {inventarioEditando.modificado_por && inventarioEditando.modificado_por !== inventarioEditando.criado_por && (
                  <p className="mt-1 text-gray-500 dark:text-gray-400 text-xs flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5" />
                    Modificado por: <strong>{inventarioEditando.modificado_por}</strong>
                    <span className="mx-1">|</span>
                    <Clock className="w-3.5 h-3.5" />
                    {formatarData(inventarioEditando.data_modificacao)}
                  </p>
                )}
              </div>
              <button
                className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold text-sm shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex items-center gap-2"
                onClick={() => {
                  setView('lista');
                  setInventarioEditando(null);
                  setFiltroTabela('');
                }}
              >
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
            </div>

            {/* Campo de filtro */}
            <div className="mb-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    className="w-full h-11 pl-10 pr-10 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                    placeholder="Filtrar por código, descrição ou modelo..."
                    value={filtroTabela}
                    onChange={(e) => setFiltroTabela(e.target.value)}
                    autoComplete="off"
                  />
                  {filtroTabela && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center cursor-pointer transition-all duration-200"
                      onClick={() => setFiltroTabela('')}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-lg text-sm text-gray-800 dark:text-gray-200 font-semibold whitespace-nowrap">
                  {obterProdutosFiltradosOrdenados().length} de {inventarioEditando.produtos.length} produtos
                </div>
              </div>
            </div>

            {/* Botões de habilitar contagens */}
            {!inventarioEditando.mostrar_contagem_2 && temDiferenca(1) && (
              <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-500 rounded-lg animate-fade-in">
                <div className="flex justify-between items-center flex-wrap gap-3">
                  <div>
                    <span className="text-base font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      {contarProdutosComDiferenca(1)} produto{contarProdutosComDiferenca(1) !== 1 ? 's' : ''} com diferença na 1a contagem
                    </span>
                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                      Faça uma segunda contagem para confirmar os valores
                    </p>
                  </div>
                  <button
                    className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold text-sm whitespace-nowrap shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex items-center gap-2"
                    onClick={() => habilitarContagem(2)}
                    disabled={inventarioEditando?.status === 'concluido'}
                  >
                    <RefreshCw className="w-4 h-4" /> Habilitar 2a Contagem
                  </button>
                </div>
              </div>
            )}

            {inventarioEditando.mostrar_contagem_2 && !inventarioEditando.mostrar_contagem_3 && temDiferenca(2) && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border-2 border-red-500 rounded-lg animate-fade-in">
                <div className="flex justify-between items-center flex-wrap gap-3">
                  <div>
                    <span className="text-base font-semibold text-red-800 dark:text-red-300 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      {contarProdutosComDiferenca(2)} produto{contarProdutosComDiferenca(2) !== 1 ? 's' : ''} ainda com diferença na 2a contagem
                    </span>
                    <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                      Faça uma terceira contagem para conferência final
                    </p>
                  </div>
                  <button
                    className="px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold text-sm whitespace-nowrap shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex items-center gap-2"
                    onClick={() => habilitarContagem(3)}
                    disabled={inventarioEditando?.status === 'concluido'}
                  >
                    <RefreshCw className="w-4 h-4" /> Habilitar 3a Contagem
                  </button>
                </div>
              </div>
            )}

            {/* TABELA DE PRODUTOS */}
            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700 border-b-2 border-gray-200 dark:border-gray-600">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Código</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Descrição</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Modelo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 text-right">Qtd. Sistema</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 text-right">1a Contagem</th>
                    {inventarioEditando.mostrar_contagem_2 && (
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 text-right">2a Contagem</th>
                    )}
                    {inventarioEditando.mostrar_contagem_3 && (
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 text-right">3a Contagem</th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 text-right">Dif. Final</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 min-w-[200px]">Observação</th>
                  </tr>
                  <tr className="bg-gray-100 dark:bg-gray-700/70">
                    {(() => {
                      const filtroInputClass = "w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-primary-500";
                      const campo = (chave, alinhar = '') => (
                        <th className="px-2 py-1.5">
                          <input
                            type="text"
                            placeholder="Filtrar..."
                            value={filtrosColuna[chave]}
                            onChange={(e) => setFiltrosColuna({ ...filtrosColuna, [chave]: e.target.value })}
                            className={`${filtroInputClass} ${alinhar}`}
                          />
                        </th>
                      );
                      return (
                        <>
                          <th className="px-2 py-1.5"></th>
                          {campo('codigo')}
                          {campo('descricao')}
                          {campo('modelo')}
                          {campo('qtdSistema', 'text-right')}
                          {campo('contagem1', 'text-right')}
                          {inventarioEditando.mostrar_contagem_2 && campo('contagem2', 'text-right')}
                          {inventarioEditando.mostrar_contagem_3 && campo('contagem3', 'text-right')}
                          {campo('difFinal', 'text-right')}
                          {campo('observacao')}
                        </>
                      );
                    })()}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {obterProdutosFiltradosOrdenados().map((produto, index) => {
                    const diferencaFinal = calcularDiferencaFinal(produto);

                    // Verifica se a 1a contagem está correta (para habilitar/desabilitar 2a contagem)
                    const diferenca1Contagem = (produto.quantidade_contada || 0) - produto.quantidade_sistema;
                    const esta1ContagemCorreta = diferenca1Contagem === 0;

                    // Verifica se a 2a contagem está correta (para habilitar/desabilitar 3a contagem)
                    const diferenca2Contagem = produto.quantidade_contada_2 !== null && produto.quantidade_contada_2 !== undefined
                      ? produto.quantidade_contada_2 - produto.quantidade_sistema
                      : null;
                    const esta2ContagemCorreta = diferenca2Contagem !== null && diferenca2Contagem === 0;

                    return (
                      <tr
                        key={produto.codigo}
                        className={`${
                          diferencaFinal !== 0
                            ? 'bg-amber-50 dark:bg-amber-900/10'
                            : index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'
                        } hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors`}
                      >
                        <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">{index + 1}</td>
                        <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300 font-semibold text-gray-900 dark:text-white">{produto.codigo}</td>
                        <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">{produto.descricao}</td>
                        <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">{produto.modelo}</td>
                        <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300 text-right font-semibold text-gray-900 dark:text-white">
                          {produto.quantidade_sistema}
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={produto.quantidade_contada}
                            onChange={(e) => atualizarQuantidadeContada(produto, e.target.value, 1)}
                            disabled={inventarioEditando?.status === 'concluido'}
                            className={`w-[100px] px-2 py-1.5 border-2 rounded-md text-sm text-right outline-none transition-all duration-200 ${
                              inventarioEditando?.status === 'concluido'
                                ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                                : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500'
                            }`}
                          />
                        </td>
                        {inventarioEditando.mostrar_contagem_2 && (
                          <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={produto.quantidade_contada_2 || 0}
                              onChange={(e) => atualizarQuantidadeContada(produto, e.target.value, 2)}
                              disabled={inventarioEditando?.status === 'concluido' || esta1ContagemCorreta}
                              className={`w-[100px] px-2 py-1.5 border-2 rounded-md text-sm text-right outline-none transition-all duration-200 ${
                                inventarioEditando?.status === 'concluido' || esta1ContagemCorreta
                                  ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                                  : 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-500 focus:border-amber-500'
                              }`}
                            />
                          </td>
                        )}
                        {inventarioEditando.mostrar_contagem_3 && (
                          <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={produto.quantidade_contada_3 || 0}
                              onChange={(e) => atualizarQuantidadeContada(produto, e.target.value, 3)}
                              disabled={inventarioEditando?.status === 'concluido' || esta2ContagemCorreta}
                              className={`w-[100px] px-2 py-1.5 border-2 rounded-md text-sm text-right outline-none transition-all duration-200 ${
                                inventarioEditando?.status === 'concluido' || esta2ContagemCorreta
                                  ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                                  : 'border-red-500 bg-red-50 dark:bg-red-900/20 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-red-500 focus:border-red-500'
                              }`}
                            />
                          </td>
                        )}
                        <td className={`px-4 py-3.5 text-right font-semibold text-[15px] ${
                          diferencaFinal === 0
                            ? 'text-green-500'
                            : diferencaFinal > 0
                              ? 'text-blue-500'
                              : 'text-red-500'
                        }`}>
                          {diferencaFinal > 0 ? '+' : ''}{diferencaFinal}
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                          <input
                            type="text"
                            value={produto.observacao || ''}
                            onChange={(e) => atualizarObservacao(produto, e.target.value)}
                            placeholder="Observações..."
                            disabled={inventarioEditando?.status === 'concluido'}
                            className={`w-full px-2 py-1.5 border-2 rounded-md text-sm outline-none transition-all duration-200 ${
                              inventarioEditando?.status === 'concluido'
                                ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                                : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500'
                            }`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Resumo do inventário */}
            <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/50 border-2 border-gray-200 dark:border-gray-600 rounded-lg flex gap-6 flex-wrap">
              <div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total de Produtos</div>
                <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                  {inventarioEditando.produtos.length}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Com Diferença</div>
                <div className={`text-2xl font-bold ${contarProdutosComDiferenca('final') > 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {contarProdutosComDiferenca('final')}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Conferidos</div>
                <div className="text-2xl font-bold text-green-500">
                  {inventarioEditando.produtos.length - contarProdutosComDiferenca('final')}
                </div>
              </div>
              {inventarioEditando.mostrar_contagem_2 && (
                <div>
                  <div className="text-sm text-amber-500 mb-1">2a Contagem</div>
                  <div className="text-2xl font-bold text-amber-500 flex items-center gap-2">
                    <CheckCircle className="w-6 h-6" /> Ativa
                  </div>
                </div>
              )}
              {inventarioEditando.mostrar_contagem_3 && (
                <div>
                  <div className="text-sm text-red-500 mb-1">3a Contagem</div>
                  <div className="text-2xl font-bold text-red-500 flex items-center gap-2">
                    <CheckCircle className="w-6 h-6" /> Ativa
                  </div>
                </div>
              )}
            </div>

            {/* Botões de ação */}
            <div className="flex gap-3 mt-6 justify-end flex-wrap">
              <button
                className="px-5 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg font-semibold text-sm shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex items-center gap-2"
                onClick={exportarParaPDF}
              >
                <FileText className="w-4 h-4" /> Exportar PDF
              </button>
              {inventarioEditando?.status !== 'concluido' && (
                <button
                  className="px-5 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold text-sm shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  onClick={() => concluirInventario(inventarioEditando.id, inventarioEditando.nome)}
                  disabled={loading}
                >
                  <CheckCircle className="w-4 h-4" /> Concluir Inventário
                </button>
              )}
              <button
                className={`px-5 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg font-semibold text-sm shadow-lg transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                  loading || inventarioEditando?.status === 'concluido'
                    ? 'opacity-60 cursor-not-allowed'
                    : 'hover:-translate-y-0.5'
                }`}
                onClick={salvarInventario}
                disabled={loading || inventarioEditando?.status === 'concluido'}
              >
                {loading ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Salvando...</>
                ) : (
                  <><Save className="w-4 h-4" /> Salvar Inventário</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ===== VIEW: SINCRONIZAR ===== */}
        {view === 'sincronizar' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 animate-fade-in">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Sincronização de Produtos</h2>

            {sincronizando ? (
              <div className="text-center py-12">
                <h2 className="text-2xl text-gray-800 dark:text-gray-100 mb-8 flex items-center justify-center gap-3">
                  <RefreshCw className="w-7 h-7 animate-spin text-primary-500" />
                  Sincronizando Base de Produtos
                </h2>

                {progressoSync.totalPaginas > 0 && (
                  <div className="mt-8 max-w-[600px] mx-auto">
                    {/* Header com mensagem e porcentagem */}
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {progressoSync.mensagem || 'Carregando produtos...'}
                      </span>
                      <span className="text-2xl font-bold text-primary-500">
                        {Math.round((progressoSync.paginaAtual / progressoSync.totalPaginas) * 100)}%
                      </span>
                    </div>

                    {/* Barra de progresso animada */}
                    <div className="w-full h-8 bg-gray-200 dark:bg-gray-700 rounded-2xl overflow-hidden shadow-inner">
                      <div
                        className="h-full bg-gradient-to-r from-primary-500 via-primary-400 to-primary-500 animate-progress-shimmer rounded-2xl transition-all duration-500 shadow-[0_2px_8px_rgba(72,187,120,0.4)]"
                        style={{ width: `${(progressoSync.paginaAtual / progressoSync.totalPaginas) * 100}%` }}
                      />
                    </div>

                    {/* Informações detalhadas */}
                    <div className="flex justify-around mt-6 gap-6">
                      <div className="flex flex-col items-center flex-1 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide mb-2">Página</span>
                        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                          {progressoSync.paginaAtual} / {progressoSync.totalPaginas}
                        </span>
                      </div>
                      <div className="flex flex-col items-center flex-1 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide mb-2">Produtos</span>
                        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                          {progressoSync.produtosSincronizados}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Spinner inicial antes de começar */}
                {progressoSync.totalPaginas === 0 && (
                  <div className="text-center mt-8">
                    <RefreshCw className="w-10 h-10 mx-auto mb-4 animate-spin text-primary-500" />
                    <p className="text-gray-500 dark:text-gray-400">Iniciando sincronização...</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-16">
                <CheckCircle className="w-16 h-16 mx-auto mb-4 text-primary-500" />
                <p className="text-lg font-bold text-primary-500">
                  Sincronização concluída!
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  {produtos.total} produtos atualizados
                </p>
                <button
                  className="mt-6 px-6 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg font-semibold text-sm shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                  onClick={() => setView('lista')}
                >
                  Voltar para Lista
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
