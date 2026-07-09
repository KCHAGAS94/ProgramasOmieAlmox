import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, Sun, Moon, AlertCircle, Search, Clock, CheckCircle2, Inbox, ChevronRight } from 'lucide-react';

const API_BASE = `http://${window.location.hostname}:4008/api`;

export default function ConsultaNfe({ onVoltar, usuario }) {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');

  // Abas: 'pesquisa' | 'andamento' | 'concluidos'
  const [aba, setAba] = useState('pesquisa');

  // Busca
  const [numeroBusca, setNumeroBusca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultadoBusca, setResultadoBusca] = useState(null);

  // Listas (em andamento / concluídos)
  const [lista, setLista] = useState([]);
  const [loadingLista, setLoadingLista] = useState(false);
  const [expandidas, setExpandidas] = useState({}); // { [chave]: true } — linhas expandidas

  const toggleExpandir = (chave) => setExpandidas(prev => ({ ...prev, [chave]: !prev[chave] }));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  // Carrega a lista ao trocar de aba
  useEffect(() => {
    if (aba === 'andamento') carregarPesquisadas('em_andamento');
    else if (aba === 'concluidos') carregarPesquisadas('concluido');
  }, [aba]);

  const carregarPesquisadas = async (status) => {
    setLoadingLista(true);
    try {
      const res = await fetch(`${API_BASE}/consulta-nfe/pesquisadas?status=${status}`);
      const data = await res.json();
      setLista(data.notas || []);
    } catch (e) {
      console.error('Erro ao carregar lista:', e);
      setLista([]);
    } finally {
      setLoadingLista(false);
    }
  };

  const buscarNota = async () => {
    const num = numeroBusca.replace(/\D/g, '');
    if (!num) return;
    setBuscando(true);
    setResultadoBusca(null);
    try {
      const res = await fetch(`${API_BASE}/consulta-nfe/buscar?numero=${encodeURIComponent(num)}`);
      const texto = await res.text();
      let data;
      try {
        data = JSON.parse(texto);
      } catch {
        throw new Error('O servidor não respondeu corretamente. Reinicie o backend (porta 4008).');
      }
      setResultadoBusca(data);
    } catch (e) {
      setResultadoBusca({ encontrada: false, mensagem: e.message });
    } finally {
      setBuscando(false);
    }
  };

  // Marca/desmarca a flag de concluído
  const toggleConcluido = async (chave, concluido) => {
    try {
      await fetch(`${API_BASE}/consulta-nfe/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chave, concluido })
      });
      // Atualiza o resultado da busca (se estiver visível)
      setResultadoBusca(prev =>
        prev && prev.notas
          ? { ...prev, notas: prev.notas.map(n => n.chave === chave ? { ...n, status: concluido ? 'concluido' : 'em_andamento' } : n) }
          : prev
      );
      // Recarrega a lista da aba atual (a nota sai do tab atual)
      if (aba === 'andamento') carregarPesquisadas('em_andamento');
      else if (aba === 'concluidos') carregarPesquisadas('concluido');
    } catch (e) {
      console.error('Erro ao atualizar status:', e);
    }
  };

  // ---- Tabela de itens (reutilizada no card e na linha expandida) ----
  const TabelaItens = (itens) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-100 dark:bg-gray-700 text-left">
            <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">#</th>
            <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Código</th>
            <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Descrição</th>
            <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Local</th>
            <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 text-right">Qtd</th>
            <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Un</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {(itens || []).map((it, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'}>
              <td className="px-4 py-2.5 text-gray-500">{i + 1}</td>
              <td className="px-4 py-2.5 font-mono text-gray-900 dark:text-white whitespace-nowrap">{it.codigo}</td>
              <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{it.descricao}</td>
              <td className="px-4 py-2.5 font-semibold text-primary-600 dark:text-primary-400 whitespace-nowrap">{it.local || '-'}</td>
              <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-white">{it.quantidade}</td>
              <td className="px-4 py-2.5 text-gray-500">{it.unidade}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ---- Card de uma nota (cabeçalho + flag concluído + itens) ----
  const NotaCard = (nota, key) => {
    const concluido = nota.status === 'concluido';
    return (
      <div key={key} className="mt-5 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        {/* Cabeçalho */}
        <div className="bg-gray-50 dark:bg-gray-700/50 p-4 flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <div>
              <span className="text-xs font-bold text-gray-400 uppercase">NFe</span>
              <p className="font-bold text-gray-900 dark:text-white">{nota.numero}{nota.serie ? ` / série ${nota.serie}` : ''}</p>
            </div>
            <div>
              <span className="text-xs font-bold text-gray-400 uppercase">Emissão</span>
              <p className="font-semibold text-gray-900 dark:text-white">{nota.emissao || '-'}</p>
            </div>
            {nota.destinatario && (
              <div>
                <span className="text-xs font-bold text-gray-400 uppercase">Destinatário</span>
                <p className="font-semibold text-gray-900 dark:text-white">{nota.destinatario}</p>
              </div>
            )}
          </div>

          {/* Flag Concluído */}
          <label className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer select-none border-2 transition-colors ${
            concluido
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-400 dark:border-emerald-600 text-emerald-700 dark:text-emerald-300'
              : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'
          }`}>
            <input
              type="checkbox"
              checked={concluido}
              onChange={(e) => toggleConcluido(nota.chave, e.target.checked)}
              className="w-4 h-4 accent-emerald-600 cursor-pointer"
            />
            <span className="text-sm font-semibold">Concluído</span>
          </label>
        </div>

        {nota.chave && (
          <div className="px-4 pt-3">
            <span className="text-xs font-bold text-gray-400 uppercase">Chave</span>
            <p className="font-mono text-xs text-gray-600 dark:text-gray-300 break-all">{nota.chave}</p>
          </div>
        )}

        {/* Itens */}
        <div className="mt-2">
          {TabelaItens(nota.itens)}
        </div>
      </div>
    );
  };

  // ---- Linha compacta de nota (usada nas abas Em andamento / Concluídos) ----
  const NotaLinha = (nota, key) => {
    const concluido = nota.status === 'concluido';
    const qtdItens = (nota.itens || []).length;
    const aberta = !!expandidas[nota.chave];
    return (
      <div key={key} className="border border-gray-200 dark:border-gray-700 rounded-xl mb-2 overflow-hidden bg-white dark:bg-gray-800">
        <div
          onClick={() => toggleExpandir(nota.chave)}
          className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <ChevronRight className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${aberta ? 'rotate-90' : ''}`} />
            <div className="min-w-0">
              <p className="font-bold text-gray-900 dark:text-white">
                NF {nota.numero}{nota.serie ? ` / série ${nota.serie}` : ''}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {qtdItens} {qtdItens === 1 ? 'item' : 'itens'}
                {nota.emissao ? ` · ${nota.emissao}` : ''}
                {nota.destinatario ? ` · ${nota.destinatario}` : ''}
              </p>
            </div>
          </div>
          <label
            onClick={(e) => e.stopPropagation()}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer select-none border-2 shrink-0 transition-colors ${
              concluido
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-400 dark:border-emerald-600 text-emerald-700 dark:text-emerald-300'
                : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'
            }`}
          >
            <input
              type="checkbox"
              checked={concluido}
              onChange={(e) => toggleConcluido(nota.chave, e.target.checked)}
              className="w-4 h-4 accent-emerald-600 cursor-pointer"
            />
            <span className="text-sm font-semibold">Concluído</span>
          </label>
        </div>

        {/* Itens (expandido) */}
        {aberta && (
          <div className="border-t border-gray-200 dark:border-gray-700">
            {nota.chave && (
              <div className="px-4 pt-3">
                <span className="text-xs font-bold text-gray-400 uppercase">Chave</span>
                <p className="font-mono text-xs text-gray-600 dark:text-gray-300 break-all">{nota.chave}</p>
              </div>
            )}
            <div className="mt-2">
              {TabelaItens(nota.itens)}
            </div>
          </div>
        )}
      </div>
    );
  };

  const TabButton = ({ id, label, icon: Icon }) => (
    <button
      onClick={() => setAba(id)}
      className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${
        aba === id
          ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-md'
          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'} transition-colors duration-300 p-6 md:p-8`}>
      {/* Header */}
      <header className="max-w-[800px] mx-auto mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <button
            onClick={onVoltar}
            className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 transition-all cursor-pointer"
          >
            <ArrowLeft size={24} className="text-white" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Consulta NFe</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Pesquise uma nota e acompanhe a conferência</p>
          </div>
        </div>
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm cursor-pointer"
        >
          {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-600" />}
        </button>
      </header>

      <main className="max-w-[800px] mx-auto">
        {/* Abas */}
        <div className="flex gap-2 mb-5 flex-wrap">
          <TabButton id="pesquisa" label="Pesquisa" icon={Search} />
          <TabButton id="andamento" label="Em andamento" icon={Clock} />
          <TabButton id="concluidos" label="Concluídos" icon={CheckCircle2} />
        </div>

        {/* ===== ABA PESQUISA ===== */}
        {aba === 'pesquisa' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-md flex-shrink-0">
                <Search className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Consultar nota</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Digite o número da NFe (ex: 1011) ou a chave de 44 dígitos</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  inputMode="numeric"
                  value={numeroBusca}
                  onChange={(e) => setNumeroBusca(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && buscarNota()}
                  placeholder="Número da nota ou chave de 44 dígitos..."
                  className="w-full h-12 pl-12 pr-4 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all placeholder-gray-400"
                />
              </div>
              <button
                onClick={buscarNota}
                disabled={buscando || !numeroBusca}
                className={`px-6 rounded-xl font-semibold text-white flex items-center gap-2 transition-all shadow-lg ${
                  buscando || !numeroBusca
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:-translate-y-0.5 cursor-pointer'
                }`}
              >
                {buscando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                Buscar
              </button>
            </div>

            {resultadoBusca && !resultadoBusca.encontrada && (
              <div className="mt-5 rounded-xl p-4 border bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  {resultadoBusca.mensagem || `Nota ${resultadoBusca.numero} não encontrada.`}
                </p>
              </div>
            )}

            {resultadoBusca && resultadoBusca.encontrada && resultadoBusca.notas?.map((nota, ni) => NotaCard(nota, ni))}
          </div>
        )}

        {/* ===== ABAS EM ANDAMENTO / CONCLUÍDOS ===== */}
        {(aba === 'andamento' || aba === 'concluidos') && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
              {aba === 'andamento' ? 'Notas em andamento' : 'Notas concluídas'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {aba === 'andamento'
                ? 'Notas pesquisadas que ainda não foram marcadas como concluídas.'
                : 'Notas marcadas como concluídas.'}
            </p>

            {loadingLista ? (
              <div className="py-12 flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                <p className="text-sm">Carregando...</p>
              </div>
            ) : lista.length === 0 ? (
              <div className="py-12 flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
                <Inbox className="w-10 h-10" />
                <p className="text-sm font-medium">
                  {aba === 'andamento' ? 'Nenhuma nota em andamento.' : 'Nenhuma nota concluída.'}
                </p>
              </div>
            ) : (
              lista.map((nota, ni) => NotaLinha(nota, nota.chave || ni))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
