import { useState, useEffect } from 'react';
import api from './api/axios';
import LoginPage from './components/LoginPage';
import GerenciarUsuarios from './components/GerenciarUsuarios';
import Configuracoes from './components/Configuracoes';
import {
  LayoutGrid, LogOut, Users, Loader2, Lock, Sun, Moon, Settings,
  Package, ClipboardList, Factory, Truck, BoxIcon, BarChart3, Tag, Wrench, FileText
} from 'lucide-react';

const iconeMap = {
  separador: Package,
  recebimento: ClipboardList,
  'separador-op': Factory,
  'separador-remessa': Truck,
  'requisicao-material': BoxIcon,
  inventario: BarChart3,
  estoque: Tag,
  auxiliares: Wrench,
  relatorio: FileText
};

function App() {
  const [usuarioLogado, setUsuarioLogado] = useState(null);
  const [telaAtual, setTelaAtual] = useState('login');
  const [programasVisiveis, setProgramasVisiveis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');

  const programas = [
    { id: 'separador', nome: 'Separador IVOLV', descricao: 'Consulta pedidos de venda, marca itens como separado/transferido', url: 'http://localhost:3001', cor: 'from-blue-500 to-blue-600', corBg: 'bg-blue-500' },
    { id: 'recebimento', nome: 'Recebimento NFe', descricao: 'Compara NFe com Pedidos, registra recebimentos físicos', url: 'http://localhost:3002', cor: 'from-purple-500 to-purple-600', corBg: 'bg-purple-500' },
    { id: 'separador-op', nome: 'Separador de OP', descricao: 'Lista e gerencia Ordens de Produção por data de conclusão', url: 'http://localhost:3003', cor: 'from-amber-500 to-amber-600', corBg: 'bg-amber-500' },
    { id: 'separador-remessa', nome: 'Separador de Remessa', descricao: 'Gerencia separação de pedidos para remessa e expedição', url: 'http://localhost:3004', cor: 'from-emerald-500 to-emerald-600', corBg: 'bg-emerald-500' },
    { id: 'requisicao-material', nome: 'Requisição de Material', descricao: 'Solicite materiais do almoxarifado com aprovação', url: 'http://localhost:3011', cor: 'from-cyan-500 to-cyan-600', corBg: 'bg-cyan-500' },
    { id: 'inventario', nome: 'Inventário', descricao: 'Controle e contagem de estoque físico', url: 'http://localhost:3007', cor: 'from-violet-500 to-violet-600', corBg: 'bg-violet-500' },
    { id: 'estoque', nome: 'Gestão de Estoque', descricao: 'Gerencie estoque de produtos acabados com categorias e alertas', url: 'http://localhost:3005', cor: 'from-teal-500 to-teal-600', corBg: 'bg-teal-500' },
    { id: 'auxiliares', nome: 'Programas Auxiliares', descricao: 'Ferramentas e utilitários do sistema', url: 'http://localhost:3008', cor: 'from-pink-500 to-pink-600', corBg: 'bg-pink-500' },
    { id: 'relatorio', nome: 'Relatório', descricao: 'Relatórios do sistema', url: 'http://localhost:3009', cor: 'from-indigo-500 to-indigo-600', corBg: 'bg-indigo-500' }
  ];

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  useEffect(() => { verificarAutenticacao(); }, []);

  const verificarAutenticacao = async () => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); setTelaAtual('login'); return; }
    try {
      const response = await api.get('/auth/verificar');
      setUsuarioLogado(response.data.usuario);
      await carregarProgramasVisiveis(response.data.usuario);
      setTelaAtual('menu');
    } catch (error) {
      console.error('Erro ao verificar autenticação:', error);
      localStorage.removeItem('token');
      setTelaAtual('login');
    } finally { setLoading(false); }
  };

  const carregarProgramasVisiveis = async (usuario) => {
    if (usuario.tipo === 'admin') { setProgramasVisiveis(programas); return; }
    try {
      const response = await api.get(`/permissoes/${usuario.id}`);
      const programasFiltrados = programas.filter(prog =>
        response.data.permissoes.some(perm => perm.programaId === prog.id)
      );
      setProgramasVisiveis(programasFiltrados);
    } catch (error) {
      console.error('Erro ao carregar permissões:', error);
      setProgramasVisiveis([]);
    }
  };

  const handleLoginSuccess = (usuario) => {
    setUsuarioLogado(usuario);
    carregarProgramasVisiveis(usuario);
    setTelaAtual('menu');
  };

  const handleLogout = () => {
    if (confirm('Deseja realmente sair?')) {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      setUsuarioLogado(null);
      setProgramasVisiveis([]);
      setTelaAtual('login');
    }
  };

  const abrirPrograma = (url) => {
    const token = localStorage.getItem('token');
    const usuario = localStorage.getItem('usuario');
    const hostname = window.location.hostname;
    const urlDinamica = url.replace('localhost', hostname);
    const urlComToken = `${urlDinamica}?token=${encodeURIComponent(token)}&usuario=${encodeURIComponent(usuario)}`;
    window.open(urlComToken, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center transition-colors">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={40} className="text-primary-500 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400 font-semibold">Carregando...</p>
        </div>
      </div>
    );
  }

  if (telaAtual === 'login') return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  if (telaAtual === 'gerenciar-usuarios') return <GerenciarUsuarios onVoltar={() => setTelaAtual('menu')} usuarioLogado={usuarioLogado} />;
  if (telaAtual === 'configuracoes') return <Configuracoes onVoltar={() => setTelaAtual('menu')} />;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300 p-6 md:p-8">
      {/* Header */}
      <header className="max-w-[1100px] mx-auto mb-8 flex items-center justify-between gap-6 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg">
            <LayoutGrid size={32} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Programas Omie</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Bem-vindo, <strong>{usuarioLogado?.nome}</strong>
              {usuarioLogado?.tipo === 'admin' ? ' (Admin)' : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                       hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm"
          >
            {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-600" />}
          </button>
          {usuarioLogado?.tipo === 'admin' && (
            <button
              className="px-4 py-2.5 bg-gradient-to-r from-violet-500 to-violet-600 text-white font-semibold rounded-lg
                         shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200
                         flex items-center gap-2 text-sm"
              onClick={() => setTelaAtual('gerenciar-usuarios')}
            >
              <Users size={18} /> Gerenciar Usuários
            </button>
          )}
          {usuarioLogado?.tipo === 'admin' && (
            <button
              className="px-4 py-2.5 bg-gradient-to-r from-slate-600 to-slate-700 text-white font-semibold rounded-lg
                         shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200
                         flex items-center gap-2 text-sm"
              onClick={() => setTelaAtual('configuracoes')}
            >
              <Settings size={18} /> Configurações
            </button>
          )}
          <button
            className="px-4 py-2.5 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg
                       shadow-md hover:shadow-lg transition-all duration-200
                       flex items-center gap-2 text-sm"
            onClick={handleLogout}
          >
            <LogOut size={18} /> Sair
          </button>
        </div>
      </header>

      {programasVisiveis.length === 0 ? (
        <div className="max-w-lg mx-auto mt-20 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-12 text-center animate-fade-in">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center">
            <Lock size={36} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">Nenhum programa disponível</h2>
          <p className="text-gray-500 dark:text-gray-400">
            Você não tem permissão para acessar nenhum programa.<br />Entre em contato com o administrador.
          </p>
        </div>
      ) : (
        <>
          <div className="max-w-[1100px] mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
            {programasVisiveis.map((programa) => {
              const Icon = iconeMap[programa.id] || Package;
              return (
                <div
                  key={programa.id}
                  className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 flex flex-col items-center text-center
                             hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
                >
                  <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${programa.cor} flex items-center justify-center mb-4 shadow-md`}>
                    <Icon size={36} className="text-white" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{programa.nome}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">{programa.descricao}</p>
                  <button
                    className={`w-full py-3 px-6 ${programa.corBg} text-white font-semibold rounded-lg
                               shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200
                               focus:ring-4 focus:ring-primary-500/50 focus:outline-none`}
                    onClick={() => abrirPrograma(programa.url)}
                  >
                    Abrir Programa
                  </button>
                </div>
              );
            })}
          </div>

          <footer className="max-w-[1100px] mx-auto mt-12 text-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Para iniciar os programas, use o script <strong>start.bat</strong>
            </p>
          </footer>
        </>
      )}
    </div>
  );
}

export default App;
