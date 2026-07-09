import { useState, useEffect, useRef } from 'react';
import api from './api/axios';
import { Loader2, Sun, Moon, LayoutGrid, ChevronLeft, ChevronRight, RefreshCw, Download, X, FileSpreadsheet, FileText } from 'lucide-react';

const API_BASE = `http://${window.location.hostname}:4009/api`;

const FILTROS_VAZIOS = { estoque: '', codigo: '', descricao: '', quantidade: '', obs: '', operacao: '', tipo: '', data_inicio: '', data_fim: '' };
const TIPO_LABEL = { ENT: 'Entrada', TRF: 'Transferência', SLD: 'Saldo', SAI: 'Saída', OP: 'O.P.', OPP: 'O.P.P' };
const labelTipo = (t) => TIPO_LABEL[(t || '').toUpperCase()] || t || '-';
const inputFiltroClass = "w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-primary-500";

const corTipo = (t) => {
  switch ((t || '').toUpperCase()) {
    case 'ENT': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
    case 'SAI': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    case 'TRF': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'SLD': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    case 'OP': return 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300';
    case 'OPP': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
    default: return '';
  }
};

// ===== Filtro de Tipo com múltipla seleção (checkboxes) =====
function FiltroTipoMulti({ tipos, valor, onChange }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const btnRef = useRef(null);
  const selecionados = valor ? valor.split(',').filter(Boolean) : [];

  const toggle = (t) => {
    const set = new Set(selecionados);
    if (set.has(t)) set.delete(t); else set.add(t);
    onChange([...set].join(','));
  };

  const abrir = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    setAberto(o => !o);
  };

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e) => {
      if (btnRef.current && !btnRef.current.contains(e.target) && !e.target.closest('[data-tipo-menu]')) setAberto(false);
    };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [aberto]);

  const rotulo = selecionados.length === 0 ? 'Todos'
    : selecionados.length === 1 ? labelTipo(selecionados[0])
    : `${selecionados.length} tipos`;

  return (
    <>
      <button ref={btnRef} type="button" onClick={abrir}
        className={`${inputFiltroClass} cursor-pointer text-left flex items-center justify-between gap-1`}>
        <span className="truncate">{rotulo}</span>
        <span className="text-gray-400 text-[10px]">▼</span>
      </button>
      {aberto && (
        <div data-tipo-menu
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl py-1 max-h-64 overflow-auto"
          style={{ top: pos.top, left: pos.left, minWidth: Math.max(pos.width, 150) }}>
          <button type="button" onClick={() => { onChange(''); }}
            className="w-full text-left px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700">
            Limpar (Todos)
          </button>
          {tipos.map(t => (
            <label key={t} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
              <input type="checkbox" checked={selecionados.includes(t)} onChange={() => toggle(t)} className="accent-primary-600" />
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${corTipo(t)}`}>{labelTipo(t)}</span>
            </label>
          ))}
        </div>
      )}
    </>
  );
}

// ===== Tabela reutilizável (Ajustes / Ordem de Produção / Geral) =====
function TabelaRelatorio({ endpoint, fonte, tipos, reloadKey, labelData = 'Data' }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(false);
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [filtrosAplicados, setFiltrosAplicados] = useState(FILTROS_VAZIOS);
  const [ordenacao, setOrdenacao] = useState({ coluna: null, direcao: null });
  // Exportação
  const [showExport, setShowExport] = useState(false);
  const [expFormato, setExpFormato] = useState('excel');
  const [expEscopo, setExpEscopo] = useState('filtrado');

  const exportar = () => {
    const params = new URLSearchParams({ fonte, formato: expFormato, escopo: expEscopo });
    if (expEscopo === 'filtrado') {
      const f = filtrosAplicados;
      if (f.estoque.trim()) params.set('estoque', f.estoque.trim());
      if (f.codigo.trim()) params.set('codigo', f.codigo.trim());
      if (f.descricao.trim()) params.set('descricao', f.descricao.trim());
      if (f.quantidade.trim()) params.set('quantidade', f.quantidade.trim());
      if (f.obs.trim()) params.set('obs', f.obs.trim());
      if (f.operacao.trim()) params.set('operacao', f.operacao.trim());
      if (f.tipo) params.set('tipo', f.tipo);
      if (f.data_inicio) params.set('data_inicio', f.data_inicio);
      if (f.data_fim) params.set('data_fim', f.data_fim);
      if (ordenacao.coluna) { params.set('ordenar', ordenacao.coluna); params.set('direcao', ordenacao.direcao); }
    }
    window.open(`${API_BASE}/relatorio/exportar?${params.toString()}`, '_blank');
    setShowExport(false);
  };

  // Debounce dos filtros
  useEffect(() => {
    const t = setTimeout(() => { setFiltrosAplicados(filtros); setPagina(1); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  // Carrega ao mudar página / filtros / ordenação / reload externo
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, filtrosAplicados, ordenacao, reloadKey]);

  const carregar = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pagina: String(pagina), limite: '50' });
      const f = filtrosAplicados;
      if (f.estoque.trim()) params.set('estoque', f.estoque.trim());
      if (f.codigo.trim()) params.set('codigo', f.codigo.trim());
      if (f.descricao.trim()) params.set('descricao', f.descricao.trim());
      if (f.quantidade.trim()) params.set('quantidade', f.quantidade.trim());
      if (f.obs.trim()) params.set('obs', f.obs.trim());
      if (f.operacao.trim()) params.set('operacao', f.operacao.trim());
      if (f.tipo) params.set('tipo', f.tipo);
      if (f.data_inicio) params.set('data_inicio', f.data_inicio);
      if (f.data_fim) params.set('data_fim', f.data_fim);
      if (ordenacao.coluna) { params.set('ordenar', ordenacao.coluna); params.set('direcao', ordenacao.direcao); }
      const res = await fetch(`${API_BASE}${endpoint}?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setRows(data.rows || []);
        setTotal(data.total || 0);
        setTotalPaginas(data.total_paginas || 1);
      }
    } catch (e) {
      console.error('Erro ao carregar:', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const setFiltro = (campo, valor) => setFiltros(prev => ({ ...prev, [campo]: valor }));
  const limparFiltros = () => setFiltros(FILTROS_VAZIOS);
  const temFiltro = Object.values(filtros).some(v => (v || '') !== '');

  const ordenarPor = (coluna) => {
    setOrdenacao(prev => {
      if (prev.coluna !== coluna) return { coluna, direcao: 'asc' };
      if (prev.direcao === 'asc') return { coluna, direcao: 'desc' };
      return { coluna: null, direcao: null };
    });
    setPagina(1);
  };

  const SortTh = ({ col, label, align = 'left', width = '' }) => {
    const ativo = ordenacao.coluna === col;
    const seta = ativo ? (ordenacao.direcao === 'asc' ? '▲' : '▼') : '↕';
    const alignText = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
    const alignFlex = align === 'right' ? 'flex-row-reverse' : align === 'center' ? 'justify-center' : '';
    return (
      <th
        onClick={() => ordenarPor(col)}
        title="Clique para ordenar (A-Z, Z-A, original)"
        className={`sticky top-0 z-20 bg-gray-50 dark:bg-gray-700 px-3 h-8 ${alignText} ${width} text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-600`}
      >
        <span className={`inline-flex items-center gap-1 ${alignFlex}`}>
          {label}
          <span className={ativo ? 'text-primary-500' : 'text-gray-300 dark:text-gray-500'}>{seta}</span>
        </span>
      </th>
    );
  };

  const thFiltro = "sticky top-8 z-20 bg-gray-100 dark:bg-gray-700/95 px-2 py-1.5 border-b-2 border-gray-200 dark:border-gray-600";

  return (
    <>
      {/* Barra: contagem + limpar filtros + exportar */}
      <div className="flex flex-wrap gap-3 mb-2 items-center justify-between shrink-0">
        <span className="text-sm text-gray-500 dark:text-gray-400">{total.toLocaleString('pt-BR')} registro(s)</span>
        <div className="flex items-center gap-2">
          {temFiltro && (
            <button onClick={limparFiltros} className="px-3 py-1 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
              Limpar filtros
            </button>
          )}
          <button onClick={() => setShowExport(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-emerald-700 hover:-translate-y-0.5 transition-all shadow">
            <Download className="w-4 h-4" /> Exportar
          </button>
        </div>
      </div>

      {/* Modal de exportação */}
      {showExport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowExport(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Download className="w-5 h-5 text-emerald-600" /> Exportar relatório</h3>
              <button onClick={() => setShowExport(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X className="w-5 h-5" /></button>
            </div>

            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Formato</p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <button onClick={() => setExpFormato('excel')} className={`flex items-center justify-center gap-2 py-3 rounded-lg border-2 font-semibold text-sm transition-colors ${expFormato === 'excel' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
                <FileSpreadsheet className="w-5 h-5" /> Excel
              </button>
              <button onClick={() => setExpFormato('pdf')} className={`flex items-center justify-center gap-2 py-3 rounded-lg border-2 font-semibold text-sm transition-colors ${expFormato === 'pdf' ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
                <FileText className="w-5 h-5" /> PDF
              </button>
            </div>

            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">O que exportar</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button onClick={() => setExpEscopo('filtrado')} className={`py-2.5 rounded-lg border-2 font-semibold text-sm transition-colors ${expEscopo === 'filtrado' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
                Filtrado ({total.toLocaleString('pt-BR')})
              </button>
              <button onClick={() => setExpEscopo('total')} className={`py-2.5 rounded-lg border-2 font-semibold text-sm transition-colors ${expEscopo === 'total' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
                Total (tudo)
              </button>
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowExport(false)} className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
              <button onClick={exportar} className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-emerald-700 hover:-translate-y-0.5 transition-all shadow flex items-center gap-2">
                <Download className="w-4 h-4" /> Exportar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="flex-1 min-h-0 overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <SortTh col="estoque" label="Estoque" />
              <SortTh col="codigo" label="Código" />
              <SortTh col="descricao" label="Descrição" />
              <SortTh col="data" label={labelData} />
              <SortTh col="tipo" label="Tipo" align="center" />
              <SortTh col="quantidade" label="Qtd" align="right" width="w-[64px]" />
              <SortTh col="obs" label="Observação" />
              <SortTh col="operacao" label="Operação" />
            </tr>
            <tr>
              <th className={thFiltro}><input value={filtros.estoque} onChange={(e) => setFiltro('estoque', e.target.value)} placeholder="Filtrar..." className={inputFiltroClass} /></th>
              <th className={thFiltro}><input value={filtros.codigo} onChange={(e) => setFiltro('codigo', e.target.value)} placeholder="Filtrar..." className={inputFiltroClass} /></th>
              <th className={thFiltro}><input value={filtros.descricao} onChange={(e) => setFiltro('descricao', e.target.value)} placeholder="Filtrar..." className={inputFiltroClass} /></th>
              <th className={thFiltro}>
                <div className="flex flex-col gap-1">
                  <input type="date" value={filtros.data_inicio} onChange={(e) => setFiltro('data_inicio', e.target.value)} title="De" className={inputFiltroClass} />
                  <input type="date" value={filtros.data_fim} onChange={(e) => setFiltro('data_fim', e.target.value)} title="Até" className={inputFiltroClass} />
                </div>
              </th>
              <th className={thFiltro}>
                <FiltroTipoMulti tipos={tipos} valor={filtros.tipo} onChange={(v) => setFiltro('tipo', v)} />
              </th>
              <th className={`${thFiltro} w-[64px]`}><input value={filtros.quantidade} onChange={(e) => setFiltro('quantidade', e.target.value)} placeholder="Qtd" className={`${inputFiltroClass} text-right`} /></th>
              <th className={thFiltro}><input value={filtros.obs} onChange={(e) => setFiltro('obs', e.target.value)} placeholder="Filtrar..." className={inputFiltroClass} /></th>
              <th className={thFiltro}><input value={filtros.operacao} onChange={(e) => setFiltro('operacao', e.target.value)} placeholder="Filtrar..." className={inputFiltroClass} /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400"><Loader2 className="w-7 h-7 animate-spin mx-auto mb-2 text-primary-500" /> Carregando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">Nenhum registro encontrado.</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i} className={`text-[13px] ${i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'} hover:bg-blue-50 dark:hover:bg-gray-700/50`}>
                  <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.estoque || '-'}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-900 dark:text-white whitespace-nowrap">{r.codigo || '-'}</td>
                  <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{r.descricao || '-'}</td>
                  <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">{r.data || '-'}</td>
                  <td className="px-3 py-1.5 text-center">
                    {r.tipo ? <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${corTipo(r.tipo)}`}>{labelTipo(r.tipo)}</span> : <span className="text-gray-300 dark:text-gray-600">-</span>}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-semibold ${Number(r.quantidade) < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{r.quantidade}</td>
                  <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{r.obs || '-'}</td>
                  <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.operacao || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between mt-3 flex-wrap gap-3 shrink-0">
        <span className="text-sm text-gray-500 dark:text-gray-400">Página {pagina} de {totalPaginas}</span>
        <div className="flex gap-2">
          <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina <= 1 || loading} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"><ChevronLeft className="w-4 h-4" /> Anterior</button>
          <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas || loading} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">Próxima <ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
    </>
  );
}

function App() {
  const [autenticado, setAutenticado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [usuario, setUsuario] = useState(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [tipos, setTipos] = useState([]);
  const [aba, setAba] = useState('geral'); // 'geral' | 'ajustes' | 'op'
  const [reloadKey, setReloadKey] = useState(0);

  // Atualização completa (Ajustes → OP → Consultar OPs), orquestrada no backend
  const [atualizando, setAtualizando] = useState(false);
  const [statusAtualizacao, setStatusAtualizacao] = useState(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  useEffect(() => { verificarAutenticacao(); }, []);

  const verificarAutenticacao = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    const usuarioParam = urlParams.get('usuario');
    if (tokenParam && usuarioParam) {
      localStorage.setItem('token', tokenParam);
      localStorage.setItem('usuario', usuarioParam);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = `http://${window.location.hostname}:3000`; return; }
    try {
      const response = await api.get('/auth/verificar');
      setUsuario(response.data.usuario);
      setAutenticado(true);
    } catch (error) {
      console.error('Erro ao verificar autenticação:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      window.location.href = `http://${window.location.hostname}:3000`;
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (!autenticado) return;
    fetch(`${API_BASE}/relatorio/tipos`).then(r => r.json()).then(d => setTipos(d.tipos || [])).catch(() => {});
  }, [autenticado]);

  const recarregarTabela = () => setReloadKey(k => k + 1);

  // Dispara a atualização completa (Ajustes → OP → Consultar OPs) no backend.
  const iniciarAtualizacao = async () => {
    if (atualizando) return;
    setAtualizando(true);
    setStatusAtualizacao({ rodando: true, etapa: 'ajustes', passo: 1, totalPassos: 3, mensagem: 'Iniciando atualização...', detalhe: {} });
    try {
      await fetch(`${API_BASE}/relatorio/atualizar-tudo`, { method: 'POST' });
    } catch {
      /* 409 = já em andamento; o polling assume o estado real */
    }
  };

  // Ao montar (e ao voltar de outra página), verifica se há atualização em andamento e retoma a barra.
  useEffect(() => {
    if (!autenticado) return;
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/relatorio/atualizar-tudo/progresso`);
        const d = await r.json();
        if (cancelado) return;
        if (d.rodando) {
          setStatusAtualizacao(d);
          setAtualizando(true);
        }
      } catch { /* ignora */ }
    })();
    return () => { cancelado = true; };
  }, [autenticado]);

  // Enquanto estiver atualizando, faz polling do progresso. Recarrega a tabela ao concluir.
  useEffect(() => {
    if (!atualizando) return;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`${API_BASE}/relatorio/atualizar-tudo/progresso`);
        const d = await r.json();
        setStatusAtualizacao(d);
        if (!d.rodando) {
          clearInterval(iv);
          setAtualizando(false);
          recarregarTabela();
          // Some com a barra de conclusão/erro após alguns segundos
          setTimeout(() => setStatusAtualizacao(null), 8000);
        }
      } catch {
        clearInterval(iv);
        setAtualizando(false);
      }
    }, 1500);
    return () => clearInterval(iv);
  }, [atualizando]);

  if (carregando) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center gap-4 transition-colors">
        <Loader2 size={40} className="text-primary-500 animate-spin" />
        <p className="text-gray-500 dark:text-gray-400 font-semibold">Verificando autenticação...</p>
      </div>
    );
  }
  if (!autenticado) return null;

  const endpointAtual = aba === 'ajustes' ? '/relatorio/ajustes' : aba === 'op' ? '/relatorio/op-movimentos' : '/relatorio/geral';
  // Inclui no filtro de tipo os códigos extras conforme a aba.
  // Geral mostra tudo (OP concluídas + OPP a produzir); aba OP só OP.
  const tiposParaTabela =
    aba === 'ajustes' ? tipos :
    aba === 'op' ? [...tipos, 'OP'] :
    [...tipos, 'OP', 'OPP']; // geral

  return (
    <div className="h-screen overflow-hidden bg-gray-50 dark:bg-gray-900 transition-colors duration-300 p-4 flex flex-col">
      {/* Header */}
      <header className="mb-3 flex items-center justify-between gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-3">
          <a href={`http://${window.location.hostname}:3000`} title="Voltar ao Menu Principal" className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow hover:scale-105 transition-all duration-200 shrink-0">
            <LayoutGrid size={22} className="text-white" />
          </a>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">Relatório</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Movimentos de estoque</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={iniciarAtualizacao} disabled={atualizando}
            title="Atualiza tudo em sequência: Ajustes → Ordens de Produção → Consulta de detalhes (pendentes + novas)"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold text-sm text-white shadow transition-all ${atualizando ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-primary-600 to-primary-700 hover:-translate-y-0.5 cursor-pointer'}`}>
            <RefreshCw className={`w-4 h-4 ${atualizando ? 'animate-spin' : ''}`} />
            {atualizando ? 'Atualizando...' : 'Atualizar'}
          </button>
          <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm">
            {darkMode ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-gray-600" />}
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 h-full flex flex-col min-h-0">
          {/* Abas */}
          <div className="flex gap-2 mb-3 shrink-0 border-b border-gray-200 dark:border-gray-700">
            {[{ id: 'geral', label: 'Geral' }, { id: 'ajustes', label: 'Ajustes de Estoque' }, { id: 'op', label: 'Ordem de Produção' }, { id: 'aproduzir', label: 'O.P. a Produzir' }].map(t => (
              <button key={t.id} onClick={() => setAba(t.id)}
                className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors ${aba === t.id ? 'border-primary-600 text-primary-700 dark:text-primary-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Barra de status da atualização completa (sobrevive à navegação) */}
          {statusAtualizacao && (statusAtualizacao.rodando || statusAtualizacao.etapa === 'erro' || statusAtualizacao.etapa === 'concluido') && (() => {
            const s = statusAtualizacao;
            const det = s.detalhe || {};
            const pct = det.total > 0 ? Math.min(100, Math.round((det.atual / det.total) * 100)) : 0;
            const erro = s.etapa === 'erro';
            const concluido = s.etapa === 'concluido';
            const cor = erro
              ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200'
              : concluido
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200'
                : 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700 text-primary-800 dark:text-primary-200';
            const barra = erro ? 'bg-red-500' : concluido ? 'bg-emerald-500' : 'bg-primary-500';
            return (
              <div className={`mb-2 px-3 py-2 rounded-lg text-sm border shrink-0 ${cor}`}>
                <div className="flex items-center gap-2">
                  {s.rodando && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                  <span className="font-semibold">
                    {s.rodando && s.totalPassos ? `Passo ${s.passo}/${s.totalPassos} — ` : ''}{s.mensagem}
                  </span>
                </div>
                {det.sub && s.rodando && (
                  <div className="text-xs mt-1 opacity-80">{det.sub}</div>
                )}
                {s.rodando && det.total > 0 && (
                  <div className="mt-1.5">
                    <div className="w-full h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-full ${barra} transition-all duration-300`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-xs mt-0.5">{det.atual} de {det.total} ({pct}%)</div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Tabela (uma instância por aba) */}
          {aba === 'aproduzir' ? (
            <TabelaRelatorio key={aba} endpoint="/relatorio/op-a-produzir" fonte="aproduzir" tipos={['OPP']} reloadKey={reloadKey} labelData="Previsão" />
          ) : (
            <TabelaRelatorio key={aba} endpoint={endpointAtual} fonte={aba} tipos={tiposParaTabela} reloadKey={reloadKey} />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
