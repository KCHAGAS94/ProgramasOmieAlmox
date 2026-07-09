import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Search, Package, Loader2, Sun, Moon } from 'lucide-react';

const API_BASE = `http://${window.location.hostname}:4008/api`;

export default function ConsultarProduto({ onVoltar, usuario }) {
  const [termo, setTermo] = useState('');
  const [sugestoes, setSugestoes] = useState([]);
  const [loadingSugestoes, setLoadingSugestoes] = useState(false);
  const [produtoSelecionado, setProdutoSelecionado] = useState(null);
  const [detalhes, setDetalhes] = useState(null);
  const [estoque, setEstoque] = useState([]);
  const [loadingDetalhes, setLoadingDetalhes] = useState(false);
  const [loadingEstoque, setLoadingEstoque] = useState(false);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const inputRef = useRef(null);
  const sugestoesRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  // Fecha sugestões ao clicar fora
  useEffect(() => {
    const handleClick = (e) => {
      if (sugestoesRef.current && !sugestoesRef.current.contains(e.target) && !inputRef.current.contains(e.target)) {
        setMostrarSugestoes(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const buscarSugestoes = (valor) => {
    setTermo(valor);
    if (timerRef.current) clearTimeout(timerRef.current);

    if (valor.trim().length < 2) {
      setSugestoes([]);
      setMostrarSugestoes(false);
      return;
    }

    timerRef.current = setTimeout(async () => {
      setLoadingSugestoes(true);
      try {
        const response = await fetch(`${API_BASE}/buscar-produtos?termo=${encodeURIComponent(valor.trim())}`);
        const data = await response.json();
        setSugestoes(data.produtos || []);
        setMostrarSugestoes(true);
      } catch (error) {
        console.error('Erro ao buscar:', error);
      } finally {
        setLoadingSugestoes(false);
      }
    }, 300);
  };

  const selecionarProduto = async (produto) => {
    setProdutoSelecionado(produto);
    setTermo(produto.codigo);
    setMostrarSugestoes(false);
    setSugestoes([]);
    setLoadingDetalhes(true);
    setDetalhes(null);
    setEstoque([]);

    try {
      // Primeira API - dados do produto
      const produtoRes = await fetch(`${API_BASE}/consultar-produto-omie`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo_produto: produto.codigo_produto })
      });
      const produtoData = await produtoRes.json();
      if (produtoData.success) setDetalhes(produtoData.produto);
      setLoadingDetalhes(false);

      // Delay antes da segunda API
      setLoadingEstoque(true);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Segunda API - estoque (sequencial, após o produto)
      const estoqueRes = await fetch(`${API_BASE}/consultar-estoque-omie`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo_produto: produto.codigo_produto })
      });
      const estoqueData = await estoqueRes.json();
      console.log('[FRONT] Resposta estoque:', estoqueData);
      if (estoqueData.success && estoqueData.estoque && estoqueData.estoque.length > 0) {
        setEstoque(estoqueData.estoque);
      }
    } catch (error) {
      console.error('Erro ao consultar detalhes:', error);
    } finally {
      setLoadingDetalhes(false);
      setLoadingEstoque(false);
    }
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'} transition-colors duration-300 p-6 md:p-8`}>
      {/* Header */}
      <header className="max-w-[900px] mx-auto mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <button
            onClick={onVoltar}
            className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 transition-all cursor-pointer"
          >
            <ArrowLeft size={24} className="text-white" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Consultar Produto</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Busque por código ou descrição</p>
          </div>
        </div>
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm cursor-pointer"
        >
          {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-600" />}
        </button>
      </header>

      {/* Campo de busca com sugestões */}
      <div className="max-w-[900px] mx-auto mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={termo}
            onChange={(e) => buscarSugestoes(e.target.value)}
            onFocus={() => sugestoes.length > 0 && setMostrarSugestoes(true)}
            placeholder="Digite o código do produto (ex: CA-PPCAR...)"
            className="w-full h-14 pl-12 pr-12 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all placeholder-gray-400"
          />
          {loadingSugestoes && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-500 animate-spin" />
          )}

          {/* Dropdown de sugestões */}
          {mostrarSugestoes && sugestoes.length > 0 && (
            <div
              ref={sugestoesRef}
              className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-xl shadow-2xl z-50 max-h-[400px] overflow-y-auto"
            >
              {sugestoes.map((p, idx) => (
                <div
                  key={idx}
                  onClick={() => selecionarProduto(p)}
                  className="px-4 py-3 cursor-pointer hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                >
                  <div className="font-mono text-sm font-bold text-primary-600 dark:text-primary-400">{p.codigo}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{p.descricao}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detalhes do produto */}
      {loadingDetalhes && (
        <div className="max-w-[900px] mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-lg p-10 flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400 font-semibold">Consultando produto na Omie...</p>
        </div>
      )}

      {detalhes && !loadingDetalhes && (
        <div className="max-w-[900px] mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          {/* Cabeçalho do produto */}
          <div className="flex items-center gap-4 mb-6 pb-5 border-b-2 border-gray-100 dark:border-gray-700">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-md flex-shrink-0">
              <Package className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{detalhes.codigo || '-'}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{detalhes.descricao || '-'}</p>
            </div>
          </div>

          {/* Dados principais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Código</p>
              <p className="text-lg font-bold font-mono text-gray-900 dark:text-white">{detalhes.codigo || '-'}</p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Descrição</p>
              <p className="text-base font-medium text-gray-900 dark:text-white">{detalhes.descricao || '-'}</p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Modelo (Localização)</p>
              <p className="text-lg font-bold text-primary-600 dark:text-primary-400">{detalhes.modelo || '-'}</p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Características</p>
              <p className="text-base font-medium text-gray-900 dark:text-white">
                {detalhes.caracteristicas && Array.isArray(detalhes.caracteristicas)
                  ? detalhes.caracteristicas.map(c => c.cConteudo).filter(Boolean).join(', ') || 'Nenhuma'
                  : 'Nenhuma'}
              </p>
            </div>
          </div>

          {/* Estoque */}
          <div className="mt-6 pt-5 border-t-2 border-gray-100 dark:border-gray-700">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-4">Estoque</h3>
            {loadingEstoque ? (
              <div className="flex items-center gap-3 py-4">
                <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Consultando estoque...</p>
              </div>
            ) : estoque.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {estoque.filter(local => local.fisico > 0).map((local, i) => (
                  <div key={i} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 flex justify-between items-center">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{local.descricaoLocal}</p>
                    <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{local.fisico} <span className="text-sm text-gray-400">{detalhes?.unidade || ''}</span></span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Sem dados de estoque</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
