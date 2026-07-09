import { useState } from 'react';
import api from '../api/axios';
import {
  LogIn, AlertCircle, Mail, Lock, Package, ClipboardList,
  Factory, Truck, BarChart3, Loader2
} from 'lucide-react';

function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!email || !senha) {
      setErro('Preencha todos os campos');
      return;
    }

    setErro('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, senha });
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('usuario', JSON.stringify(response.data.usuario));
      onLoginSuccess(response.data.usuario);
    } catch (error) {
      if (error.response) {
        setErro(error.response.data.error || 'Erro ao fazer login');
      } else if (error.request) {
        setErro('Não foi possível conectar ao servidor');
      } else {
        setErro('Erro inesperado: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Coluna Esquerda - Branding (desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary-50 to-primary-100 dark:from-gray-800 dark:to-gray-900">
        <div className="relative z-10 flex flex-col justify-center px-16">
          {/* Logo */}
          <div className="mb-12">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-xl mb-8">
              <Package size={40} className="text-white" />
            </div>
            <h1 className="text-5xl font-bold mb-4 leading-tight text-gray-900 dark:text-gray-100">
              Programas<br />Omie
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 leading-relaxed">
              Plataforma integrada para gestão de pedidos, separação, recebimento e estoque
            </p>
          </div>

          {/* Features */}
          <div className="space-y-6 mt-12">
            <div className="flex items-start gap-4 group">
              <div className="flex-shrink-0 w-12 h-12 bg-primary-100 dark:bg-primary-900/50 rounded-xl flex items-center justify-center group-hover:bg-primary-200 dark:group-hover:bg-primary-900 transition-colors">
                <Package size={24} className="text-primary-700 dark:text-primary-400" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1 text-gray-900 dark:text-gray-100">Separação de Pedidos</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Controle itens separados e transferidos em tempo real</p>
              </div>
            </div>

            <div className="flex items-start gap-4 group">
              <div className="flex-shrink-0 w-12 h-12 bg-primary-100 dark:bg-primary-900/50 rounded-xl flex items-center justify-center group-hover:bg-primary-200 dark:group-hover:bg-primary-900 transition-colors">
                <ClipboardList size={24} className="text-primary-700 dark:text-primary-400" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1 text-gray-900 dark:text-gray-100">Recebimento de NFe</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Compare notas fiscais com pedidos e registre recebimentos</p>
              </div>
            </div>

            <div className="flex items-start gap-4 group">
              <div className="flex-shrink-0 w-12 h-12 bg-primary-100 dark:bg-primary-900/50 rounded-xl flex items-center justify-center group-hover:bg-primary-200 dark:group-hover:bg-primary-900 transition-colors">
                <Factory size={24} className="text-primary-700 dark:text-primary-400" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1 text-gray-900 dark:text-gray-100">Ordens de Produção</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Gerencie OPs e remessas com controle completo</p>
              </div>
            </div>

            <div className="flex items-start gap-4 group">
              <div className="flex-shrink-0 w-12 h-12 bg-primary-100 dark:bg-primary-900/50 rounded-xl flex items-center justify-center group-hover:bg-primary-200 dark:group-hover:bg-primary-900 transition-colors">
                <BarChart3 size={24} className="text-primary-700 dark:text-primary-400" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1 text-gray-900 dark:text-gray-100">Inventário e Estoque</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Contagem física e gestão de produtos acabados</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Coluna Direita - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-16">
        <div className="max-w-md w-full">
          {/* Logo Mobile */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-xl mx-auto mb-4">
              <Package size={32} className="text-white" />
            </div>
          </div>

          {/* Card de Login */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 lg:p-10">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl mb-4 shadow-lg">
                <LogIn className="text-white" size={28} />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Bem-vindo</h2>
              <p className="text-gray-600 dark:text-gray-400 mt-2">Faça login para continuar</p>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="text-gray-400" size={20} />
                  </div>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-12 pl-12 pr-4 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-base
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                               focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                               outline-none transition-all duration-200
                               placeholder:text-gray-400 dark:placeholder:text-gray-500
                               disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="seu@email.com"
                    autoComplete="email"
                    autoFocus
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="senha" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Senha
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="text-gray-400" size={20} />
                  </div>
                  <input
                    id="senha"
                    type="password"
                    required
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    className="w-full h-12 pl-12 pr-4 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-base
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                               focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                               outline-none transition-all duration-200
                               placeholder:text-gray-400 dark:placeholder:text-gray-500
                               disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={loading}
                  />
                </div>
              </div>

              {erro && (
                <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 rounded-lg animate-shake">
                  <AlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-sm text-red-800 dark:text-red-300 font-medium">{erro}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-6 py-4
                           bg-gradient-to-r from-primary-600 to-primary-700 text-white font-bold text-base rounded-xl
                           hover:from-primary-700 hover:to-primary-800
                           focus:outline-none focus:ring-4 focus:ring-primary-500/50
                           transition-all duration-200
                           disabled:opacity-50 disabled:cursor-not-allowed
                           shadow-lg hover:shadow-xl hover:-translate-y-0.5"
              >
                {loading ? (
                  <>
                    <Loader2 size={22} className="animate-spin" />
                    Entrando...
                  </>
                ) : (
                  <>
                    <LogIn size={22} />
                    Entrar no Sistema
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <p className="text-center text-gray-500 dark:text-gray-500 text-sm mt-8">
            © 2026 Programas Omie - Controlart
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
