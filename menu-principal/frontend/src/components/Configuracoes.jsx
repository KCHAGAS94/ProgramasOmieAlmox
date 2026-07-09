import { useState, useEffect, useRef } from 'react';
import api from '../api/axios';
import {
  ArrowLeft, UploadCloud, RefreshCw, RotateCcw, Loader2,
  HardDriveDownload, Info, CheckCircle2, AlertTriangle, Server
} from 'lucide-react';

function formatarData(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

function formatarTamanho(bytes) {
  if (!bytes && bytes !== 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Configuracoes({ onVoltar }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState(null); // { tipo: 'ok'|'erro', texto }

  // Formulario de upload
  const [arquivo, setArquivo] = useState(null);
  const [versao, setVersao] = useState('');
  const [observacao, setObservacao] = useState('');
  const [reiniciarApos, setReiniciarApos] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const inputFileRef = useRef(null);

  // Estado de reinicio
  const [reiniciando, setReiniciando] = useState(false);

  useEffect(() => {
    carregarInfo();
  }, []);

  const carregarInfo = async () => {
    try {
      setLoading(true);
      const resp = await api.get('/sistema/info');
      setInfo(resp.data);
      setErro('');
    } catch (e) {
      console.error('Erro ao carregar informacoes do sistema:', e);
      setErro(e.response?.data?.error || 'Erro ao carregar informacoes do sistema.');
    } finally {
      setLoading(false);
    }
  };

  // Aguarda o servidor voltar apos um reinicio, entao recarrega a pagina.
  const aguardarServidorVoltar = () => {
    setReiniciando(true);
    let tentativas = 0;
    const intervalo = setInterval(async () => {
      tentativas++;
      try {
        const resp = await api.get('/sistema/status', { timeout: 3000 });
        if (resp.data?.status === 'ok') {
          clearInterval(intervalo);
          // Pequena folga para o frontend (Vite) tambem voltar.
          setTimeout(() => window.location.reload(), 1500);
        }
      } catch {
        // ainda reiniciando
      }
      if (tentativas > 60) { // ~2 min
        clearInterval(intervalo);
        setReiniciando(false);
        setMensagem({ tipo: 'erro', texto: 'O servidor demorou para voltar. Verifique a janela do supervisor no PC do servidor.' });
      }
    }, 2000);
  };

  const handleEscolherArquivo = (e) => {
    const f = e.target.files?.[0] || null;
    setArquivo(f);
    setMensagem(null);
  };

  const handleEnviar = async (e) => {
    e.preventDefault();
    setMensagem(null);

    if (!arquivo) {
      setMensagem({ tipo: 'erro', texto: 'Selecione um arquivo .zip de atualizacao.' });
      return;
    }
    if (!arquivo.name.toLowerCase().endsWith('.zip')) {
      setMensagem({ tipo: 'erro', texto: 'O arquivo precisa ser um .zip.' });
      return;
    }
    if (!confirm('Aplicar esta atualizacao? Um backup automatico sera criado antes.')) {
      return;
    }

    const formData = new FormData();
    formData.append('pacote', arquivo);
    if (versao.trim()) formData.append('versao', versao.trim());
    if (observacao.trim()) formData.append('observacao', observacao.trim());
    formData.append('reiniciar', reiniciarApos ? 'true' : 'false');

    try {
      setEnviando(true);
      setProgresso(0);
      const resp = await api.post('/sistema/atualizar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 0, // sem timeout: upload pode demorar
        onUploadProgress: (evt) => {
          if (evt.total) setProgresso(Math.round((evt.loaded / evt.total) * 100));
        }
      });

      const data = resp.data;
      let texto = `Atualizacao aplicada! ${data.aplicados} arquivo(s). Backup: ${data.backup}.`;
      if (data.ignorados?.length) {
        texto += ` ${data.ignorados.length} entrada(s) ignorada(s) (protegidas/invalidas).`;
      }
      setMensagem({ tipo: 'ok', texto });

      // Limpa formulario
      setArquivo(null);
      setVersao('');
      setObservacao('');
      if (inputFileRef.current) inputFileRef.current.value = '';

      if (data.reinicio?.reiniciando) {
        aguardarServidorVoltar();
      } else {
        if (data.reinicio?.mensagem) {
          setMensagem({ tipo: 'erro', texto: texto + ' ' + data.reinicio.mensagem });
        }
        carregarInfo();
      }
    } catch (e) {
      console.error('Erro ao enviar atualizacao:', e);
      setMensagem({ tipo: 'erro', texto: e.response?.data?.error || 'Erro ao enviar atualizacao.' });
    } finally {
      setEnviando(false);
      setProgresso(0);
    }
  };

  const handleReiniciar = async () => {
    if (!confirm('Reiniciar o servidor agora?')) return;
    setMensagem(null);
    try {
      await api.post('/sistema/reiniciar');
      aguardarServidorVoltar();
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e.response?.data?.error || 'Erro ao reiniciar.' });
    }
  };

  const handleRestaurar = async (nomeBackup) => {
    if (!confirm(`Restaurar o backup "${nomeBackup}"? Os arquivos atuais serao substituidos (um backup de seguranca sera criado antes).`)) {
      return;
    }
    setMensagem(null);
    try {
      const resp = await api.post('/sistema/restaurar', {
        backup: nomeBackup,
        reiniciar: info?.supervisor === true
      }, { timeout: 0 });
      const data = resp.data;
      setMensagem({ tipo: 'ok', texto: `Backup restaurado: ${data.restaurado} (${data.aplicados} arquivos).` });
      if (data.reinicio?.reiniciando) {
        aguardarServidorVoltar();
      } else {
        carregarInfo();
      }
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e.response?.data?.error || 'Erro ao restaurar backup.' });
    }
  };

  // ----- Overlay de reinicio -----
  if (reiniciando) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center transition-colors p-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-12 text-center max-w-md">
          <Loader2 size={48} className="text-primary-500 animate-spin mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Reiniciando...</h2>
          <p className="text-gray-500 dark:text-gray-400">
            Aguarde enquanto o servidor reinicia. A pagina sera recarregada automaticamente quando voltar.
          </p>
        </div>
      </div>
    );
  }

  const versaoInfo = info?.versao;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300 p-6 md:p-8">
      <div className="max-w-[1000px] mx-auto">
        {/* Header */}
        <header className="mb-8 flex items-center gap-4 flex-wrap">
          <button
            onClick={onVoltar}
            className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                       hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm"
          >
            <ArrowLeft size={20} className="text-gray-600 dark:text-gray-300" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-lg">
              <Server size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Configuracoes</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Atualizacao remota do sistema</p>
            </div>
          </div>
        </header>

        {/* Mensagem global */}
        {mensagem && (
          <div className={`mb-6 rounded-xl p-4 flex items-start gap-3 ${
            mensagem.tipo === 'ok'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}>
            {mensagem.tipo === 'ok'
              ? <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
              : <AlertTriangle size={20} className="mt-0.5 shrink-0" />}
            <span className="text-sm">{mensagem.texto}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
            <Loader2 size={20} className="animate-spin" /> Carregando...
          </div>
        ) : erro ? (
          <div className="rounded-xl p-4 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800">
            {erro}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ---- Card: Versao instalada ---- */}
            <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Info size={20} className="text-primary-500" />
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Versao instalada</h2>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 dark:text-gray-400">Versao</dt>
                  <dd className="font-semibold text-gray-900 dark:text-gray-100">{versaoInfo?.versao || '-'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 dark:text-gray-400">Ultima atualizacao</dt>
                  <dd className="font-semibold text-gray-900 dark:text-gray-100">{formatarData(versaoInfo?.data)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500 dark:text-gray-400">Aplicada por</dt>
                  <dd className="font-semibold text-gray-900 dark:text-gray-100">{versaoInfo?.autor || '-'}</dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-gray-500 dark:text-gray-400">Observacao</dt>
                  <dd className="text-gray-700 dark:text-gray-300">{versaoInfo?.observacao || '-'}</dd>
                </div>
              </dl>

              <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-700">
                <div className={`text-xs px-3 py-2 rounded-lg inline-flex items-center gap-2 ${
                  info?.supervisor
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                    : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                }`}>
                  <Server size={14} />
                  {info?.supervisor
                    ? 'Supervisor ativo - reinicio remoto disponivel'
                    : 'Sem supervisor - reinicio remoto indisponivel (use INICIAR_SUPERVISOR.bat)'}
                </div>
                <button
                  onClick={handleReiniciar}
                  disabled={!info?.supervisor}
                  className="mt-4 w-full py-2.5 px-4 bg-gray-600 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed
                             text-white font-semibold rounded-lg shadow-md transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <RefreshCw size={16} /> Reiniciar servidor
                </button>
              </div>
            </section>

            {/* ---- Card: Enviar atualizacao ---- */}
            <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <UploadCloud size={20} className="text-primary-500" />
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Enviar atualizacao</h2>
              </div>

              <form onSubmit={handleEnviar} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Pacote (.zip)
                  </label>
                  <input
                    ref={inputFileRef}
                    type="file"
                    accept=".zip"
                    onChange={handleEscolherArquivo}
                    className="block w-full text-sm text-gray-600 dark:text-gray-300
                               file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
                               file:text-sm file:font-semibold file:bg-primary-500 file:text-white
                               hover:file:bg-primary-600 file:cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Versao (opcional)
                    </label>
                    <input
                      type="text"
                      value={versao}
                      onChange={(e) => setVersao(e.target.value)}
                      placeholder="ex: 1.2.0"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                                 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm
                                 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Observacao (opcional)
                  </label>
                  <textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    rows={2}
                    placeholder="O que mudou nesta versao?"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm
                               focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reiniciarApos}
                    onChange={(e) => setReiniciarApos(e.target.checked)}
                    className="w-4 h-4 rounded accent-primary-500"
                  />
                  Reiniciar o servidor apos aplicar
                </label>

                {enviando && progresso > 0 && (
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div className="bg-primary-500 h-2 transition-all" style={{ width: `${progresso}%` }} />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700
                             disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-md
                             transition-all flex items-center justify-center gap-2 text-sm"
                >
                  {enviando
                    ? <><Loader2 size={16} className="animate-spin" /> Enviando {progresso > 0 ? `(${progresso}%)` : ''}...</>
                    : <><UploadCloud size={16} /> Aplicar atualizacao</>}
                </button>
              </form>
            </section>

            {/* ---- Card: Backups ---- */}
            <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <HardDriveDownload size={20} className="text-primary-500" />
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  Backups <span className="text-sm font-normal text-gray-400">(ultimos {info?.backups?.length || 0})</span>
                </h2>
              </div>

              {(!info?.backups || info.backups.length === 0) ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum backup ainda. O primeiro backup e criado automaticamente na proxima atualizacao.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <th className="py-2 pr-4 font-medium">Criado em</th>
                        <th className="py-2 pr-4 font-medium">Versao</th>
                        <th className="py-2 pr-4 font-medium">Rotulo</th>
                        <th className="py-2 pr-4 font-medium">Tamanho</th>
                        <th className="py-2 font-medium text-right">Acao</th>
                      </tr>
                    </thead>
                    <tbody>
                      {info.backups.map((b) => (
                        <tr key={b.nome} className="border-b border-gray-100 dark:border-gray-700/50">
                          <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">{formatarData(b.criadoEm)}</td>
                          <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">{b.versaoNoMomento?.versao || '-'}</td>
                          <td className="py-2 pr-4 text-gray-500 dark:text-gray-400">{b.rotulo || '-'}</td>
                          <td className="py-2 pr-4 text-gray-500 dark:text-gray-400">{formatarTamanho(b.tamanhoBytes)}</td>
                          <td className="py-2 text-right">
                            <button
                              onClick={() => handleRestaurar(b.nome)}
                              className="py-1.5 px-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg
                                         shadow-sm transition-all inline-flex items-center gap-1.5 text-xs"
                            >
                              <RotateCcw size={14} /> Restaurar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

export default Configuracoes;
