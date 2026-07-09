import { useState, useEffect } from 'react';
import CalculadoraPecas from './components/CalculadoraPecas';
import ConfiguracaoAPIKeys from './components/ConfiguracaoAPIKeys';
import ExemploCadastroComOrigem from './components/ExemploCadastroComOrigem';
import ConsultarProduto from './components/ConsultarProduto';
import ConsultaNfe from './components/ConsultaNfe';
import api from './api/axios';
import { Wrench, Scale, Search, Loader2, Sun, Moon, FileText } from 'lucide-react';

function App() {
  const [telaAtual, setTelaAtual] = useState('menu');
  const [autenticado, setAutenticado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [usuario, setUsuario] = useState(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');

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
    } finally { setCarregando(false); }
  };

  if (carregando) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center gap-4 transition-colors">
        <Loader2 size={40} className="text-primary-500 animate-spin" />
        <p className="text-gray-500 dark:text-gray-400 font-semibold">Verificando autenticação...</p>
      </div>
    );
  }

  if (!autenticado) return null;

  if (telaAtual === 'calculadora-pecas') return <CalculadoraPecas onVoltar={() => setTelaAtual('menu')} usuario={usuario} />;
  if (telaAtual === 'config-api') return <ConfiguracaoAPIKeys onVoltar={() => setTelaAtual('menu')} usuario={usuario} />;
  if (telaAtual === 'exemplo-cadastro') return <ExemploCadastroComOrigem onVoltar={() => setTelaAtual('menu')} usuario={usuario} />;
  if (telaAtual === 'consultar-produto') return <ConsultarProduto onVoltar={() => setTelaAtual('menu')} usuario={usuario} />;
  if (telaAtual === 'consulta-nfe') return <ConsultaNfe onVoltar={() => setTelaAtual('menu')} usuario={usuario} />;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300 p-6 md:p-8">
      {/* Header */}
      <header className="max-w-[1100px] mx-auto mb-8 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <a
            href={`http://${window.location.hostname}:3000`}
            title="Voltar ao Menu Principal"
            className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center
                       shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
          >
            <Wrench size={32} className="text-white" />
          </a>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Programas Auxiliares</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Bem-vindo, <strong>{usuario?.nome || 'Usuário'}</strong>
              {usuario?.tipo === 'admin' ? ' (Admin)' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                     hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm"
        >
          {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-600" />}
        </button>
      </header>

      {/* Cards Grid */}
      <main className="max-w-[1100px] mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 flex flex-col items-center text-center
                          hover:shadow-xl hover:-translate-y-1 transition-all duration-200">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center mb-4 shadow-md">
              <Scale size={32} className="text-white" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Calculadora de Peças</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">Calcule quantidade de peças por peso</p>
            <button
              className="w-full py-3 px-6 bg-gradient-to-r from-primary-600 to-primary-700 text-white font-semibold rounded-lg
                         shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200
                         focus:ring-4 focus:ring-primary-500/50 focus:outline-none"
              onClick={() => setTelaAtual('calculadora-pecas')}
            >
              Abrir
            </button>
          </div>

          {/* Consultar Produto */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 flex flex-col items-center text-center
                          hover:shadow-xl hover:-translate-y-1 transition-all duration-200">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center mb-4 shadow-md">
              <Search size={32} className="text-white" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Consultar Produto</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">Busque produtos por código ou descrição</p>
            <button
              className="w-full py-3 px-6 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-semibold rounded-lg
                         shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200
                         focus:ring-4 focus:ring-emerald-500/50 focus:outline-none"
              onClick={() => setTelaAtual('consultar-produto')}
            >
              Abrir
            </button>
          </div>

          {/* Consulta NFe */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 flex flex-col items-center text-center
                          hover:shadow-xl hover:-translate-y-1 transition-all duration-200">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center mb-4 shadow-md">
              <FileText size={32} className="text-white" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Consulta NFe</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">Sincroniza as notas fiscais do Omie (ListarNF)</p>
            <button
              className="w-full py-3 px-6 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-semibold rounded-lg
                         shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200
                         focus:ring-4 focus:ring-indigo-500/50 focus:outline-none"
              onClick={() => setTelaAtual('consulta-nfe')}
            >
              Abrir
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
