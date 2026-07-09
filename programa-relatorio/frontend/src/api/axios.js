import axios from 'axios';

// Detecta automaticamente o IP/hostname para funcionar em qualquer rede.
// A verificação de autenticação é feita no backend do Menu Principal (porta 4000).
const getBaseURL = () => {
  const hostname = window.location.hostname;
  return `http://${hostname}:4000/api`;
};

const api = axios.create({
  baseURL: getBaseURL(),
  timeout: 10000
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      window.location.href = `http://${window.location.hostname}:3000`;
    }
    return Promise.reject(error);
  }
);

export default api;
