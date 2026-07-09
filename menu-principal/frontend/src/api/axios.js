import axios from 'axios';

// Detecta automaticamente o IP/hostname para funcionar em qualquer rede
const getBaseURL = () => {
  const hostname = window.location.hostname;
  // Se estiver acessando por IP, usa o mesmo IP para o backend
  // Se estiver acessando por localhost, usa localhost
  return `http://${hostname}:4000/api`;
};

const api = axios.create({
  baseURL: getBaseURL(),
  timeout: 10000
});

// Interceptor para adicionar token em todas as requisições
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para tratar erros de autenticação
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token inválido ou expirado
      localStorage.removeItem('token');
      window.location.reload(); // Volta para tela de login
    }
    return Promise.reject(error);
  }
);

export default api;
