import { useState, useEffect } from 'react';
import { produtoService, categoriaService } from './services/api';
import TabelaProdutos from './components/TabelaProdutos';
import FormularioAdicionar from './components/FormularioAdicionar';
import GerenciadorCategorias from './components/GerenciadorCategorias';
import { exportarProdutosCriticos } from './services/pdfService';
import { Tag, RefreshCw, Settings, FileText, Sun, Moon, Loader2 } from 'lucide-react';
import './App.css';

function App() {
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [categoriaAtual, setCategoriaAtual] = useState('todas');
  const [carregando, setCarregando] = useState(true);
  const [atualizandoOmie, setAtualizandoOmie] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0, atualizados: 0, codigoAtual: '' });
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
  const [ordenar, setOrdenar] = useState('');
  const [mostrarGerenciador, setMostrarGerenciador] = useState(false);
  const [editando, setEditando] = useState({});
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  const carregarCategorias = async () => {
    try { const data = await categoriaService.listar(); setCategorias(data); }
    catch (error) { console.error('Erro ao carregar categorias:', error); }
  };

  const carregarProdutos = async (silent = false) => {
    try {
      if (!silent) setCarregando(true);
      const categoriaId = categoriaAtual === 'todas' ? null : categoriaAtual === 'sem' ? 'null' : categoriaAtual;
      const data = await produtoService.listar(ordenar, categoriaId);
      setProdutos(data);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
      if (!silent) alert('Erro ao carregar produtos: ' + (error.response?.data?.error || error.message));
    } finally { if (!silent) setCarregando(false); }
  };

  const carregarUltimaAtualizacao = async () => {
    try {
      const data = await produtoService.lastUpdate();
      if (data.lastUpdate) {
        const date = new Date(data.lastUpdate);
        setUltimaAtualizacao(date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      } else { setUltimaAtualizacao('nunca'); }
    } catch (error) { console.error('Erro ao carregar última atualização:', error); }
  };

  const handleRefreshOmie = async () => {
    if (!window.confirm('Atualizar estoque de todos os produtos via API Omie?')) return;
    setAtualizandoOmie(true);
    setProgresso({ atual: 0, total: 0, atualizados: 0, codigoAtual: '' });

    // Polling do progresso a cada 500ms enquanto a atualização estiver rodando
    const intervalo = setInterval(async () => {
      try {
        const p = await produtoService.refreshProgress();
        if (p && p.total > 0) {
          setProgresso({
            atual: p.atual || 0,
            total: p.total || 0,
            atualizados: p.atualizados || 0,
            codigoAtual: p.codigoAtual || ''
          });
        }
      } catch (e) { /* silencia erros de polling */ }
    }, 500);

    try {
      const result = await produtoService.refreshOmie();
      alert(`Atualização concluída! ${result.atualizados} de ${result.total} produtos atualizados.`);
      await carregarProdutos();
      await carregarUltimaAtualizacao();
    } catch (error) {
      console.error('Erro ao atualizar Omie:', error);
      alert('Erro ao atualizar via Omie: ' + (error.response?.data?.error || error.message));
    } finally {
      clearInterval(intervalo);
      setAtualizandoOmie(false);
      setProgresso({ atual: 0, total: 0, atualizados: 0, codigoAtual: '' });
    }
  };

  const handleOrdenarPorSituacao = () => { setOrdenar(ordenar === 'situacao' ? '' : 'situacao'); };
  const handleAtualizarCategorias = async () => { await carregarCategorias(); await carregarProdutos(); };
  const handleExportarPDF = () => { exportarProdutosCriticos(produtos); };

  useEffect(() => { carregarCategorias(); carregarUltimaAtualizacao(); }, []);
  useEffect(() => { carregarProdutos(); }, [ordenar, categoriaAtual]);

  const getNomeCategoria = () => {
    if (categoriaAtual === 'todas') return 'Todas as Abas';
    if (categoriaAtual === 'sem') return 'Sem Categoria';
    const cat = categorias.find((c) => c.id === categoriaAtual);
    return cat ? cat.nome : 'Produtos Acabados';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      <div className="max-w-[1300px] mx-auto px-3 py-6">

        {/* Header */}
        <div className="flex justify-between items-start mb-5 gap-3 flex-wrap">
          <div className="flex items-center gap-4">
            <div
              onClick={() => window.location.href = `http://${window.location.hostname}:3000`}
              className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center
                         shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 cursor-pointer"
              title="Voltar ao Menu Principal"
            >
              <Tag size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Gestão de Estoque - Produtos Acabados</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Controle de estoque atual e previsão de reabastecimento</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                         hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm"
            >
              {darkMode ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-gray-600" />}
            </button>
            <button onClick={() => setMostrarGerenciador(true)}
              className="px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300
                         rounded-lg font-semibold text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm
                         flex items-center gap-2">
              <Settings size={16} /> Gerenciar Abas
            </button>
            <button
              onClick={handleRefreshOmie}
              disabled={atualizandoOmie}
              className="px-4 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold text-sm rounded-lg
                         shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0
                         flex items-center gap-2"
            >
              {atualizandoOmie ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {atualizandoOmie ? 'Atualizando...' : 'Atualizar Omie'}
              <span className="text-xs opacity-80">(Última: {ultimaAtualizacao || 'nunca'})</span>
            </button>
          </div>
        </div>

        {/* Barra de Progresso da Atualização Omie */}
        {atualizandoOmie && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 mb-5 border border-violet-200 dark:border-violet-700">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 size={18} className="animate-spin text-violet-600" />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Atualizando estoque via Omie...
                </span>
              </div>
              <span className="text-sm font-bold text-violet-600 dark:text-violet-400">
                {progresso.total > 0 ? Math.round((progresso.atual / progresso.total) * 100) : 0}%
              </span>
            </div>

            {/* Barra de progresso */}
            <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-purple-600 transition-all duration-300 ease-out"
                style={{ width: `${progresso.total > 0 ? (progresso.atual / progresso.total) * 100 : 0}%` }}
              />
            </div>

            {/* Detalhes */}
            <div className="flex items-center justify-between mt-2 text-xs text-gray-600 dark:text-gray-400">
              <span>
                {progresso.atual} de {progresso.total} produtos
                {progresso.codigoAtual && <span className="ml-2 font-mono">• Atual: {progresso.codigoAtual}</span>}
              </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                ✓ {progresso.atualizados} atualizados
              </span>
            </div>
          </div>
        )}

        {/* Abas de Categorias */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-3 mb-5 flex gap-2 overflow-x-auto flex-wrap">
          <button
            onClick={() => setCategoriaAtual('todas')}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap
              ${categoriaAtual === 'todas'
                ? 'bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-md'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
          >
            Todas
          </button>
          {categorias.filter(c => c.nome !== 'Sem Categoria').map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategoriaAtual(cat.id)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap max-w-[200px] truncate
                ${categoriaAtual === cat.id
                  ? 'text-white shadow-md'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
              style={categoriaAtual === cat.id ? { background: cat.cor } : undefined}
              title={cat.nome}
            >
              {cat.nome}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="stack">
          <div className="card">
            <div className="card-header">
              <div className="card-title">{getNomeCategoria()}</div>
              <div className="flex gap-2.5 items-center flex-wrap">
                <button onClick={handleExportarPDF}
                  className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg
                             shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-1.5">
                  <FileText size={14} /> Exportar PDF (Abaixo de 2 meses)
                </button>
              </div>
            </div>

            {carregando ? (
              <div className="flex items-center justify-center py-12 gap-3 text-gray-500 dark:text-gray-400">
                <Loader2 size={24} className="animate-spin" /> Carregando produtos...
              </div>
            ) : (
              <TabelaProdutos
                produtos={produtos}
                onAtualizar={carregarProdutos}
                categorias={categorias}
                editando={editando}
                setEditando={setEditando}
                ordenar={ordenar}
                onOrdenar={handleOrdenarPorSituacao}
              />
            )}
          </div>

          <FormularioAdicionar
            onAdicionar={carregarProdutos}
            categoriaAtual={categoriaAtual === 'todas' ? null : categoriaAtual === 'sem' ? null : categoriaAtual}
          />
        </div>

        <GerenciadorCategorias
          mostrar={mostrarGerenciador}
          onFechar={() => setMostrarGerenciador(false)}
          onAtualizar={handleAtualizarCategorias}
        />
      </div>
    </div>
  );
}

export default App;
