import axios from 'axios';
import { API_CONFIG, API_KEYS } from '../config/apiConfig';

/**
 * Serviço de API que alterna entre Filial e Matriz
 */

// Cria instância do axios baseado na origem
export const criarClienteAPI = (origem = 'filial') => {
  const config = origem === 'matriz' ? API_CONFIG.matriz : API_CONFIG.filial;
  const apiKey = API_KEYS.getKey(origem);

  const cliente = axios.create({
    baseURL: config.baseURL,
    headers: {
      'Content-Type': 'application/json',
      // Adiciona a API key específica
      'X-API-Key': apiKey,
      // Mantém o token de autenticação do usuário
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });

  // Interceptor para adicionar token em todas as requisições
  cliente.interceptors.request.use(
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

  // Interceptor para tratar erros
  cliente.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        // Token inválido ou expirado
        localStorage.removeItem('token');
        window.location.href = 'http://localhost:3000';
      }
      return Promise.reject(error);
    }
  );

  return cliente;
};

/**
 * Busca produtos com base na origem selecionada
 */
export const buscarProdutos = async (origem = 'filial', filtros = {}) => {
  const api = criarClienteAPI(origem);

  try {
    const response = await api.get('/produtos', { params: filtros });
    return {
      sucesso: true,
      dados: response.data,
      origem: origem
    };
  } catch (error) {
    console.error(`Erro ao buscar produtos da ${origem}:`, error);
    return {
      sucesso: false,
      erro: error.response?.data?.mensagem || 'Erro ao buscar produtos',
      origem: origem
    };
  }
};

/**
 * Busca um produto específico por código
 */
export const buscarProdutoPorCodigo = async (codigo, origem = 'filial') => {
  const api = criarClienteAPI(origem);

  try {
    const response = await api.get(`/produtos/${codigo}`);
    return {
      sucesso: true,
      dados: response.data,
      origem: origem
    };
  } catch (error) {
    console.error(`Erro ao buscar produto ${codigo} da ${origem}:`, error);
    return {
      sucesso: false,
      erro: error.response?.data?.mensagem || 'Produto não encontrado',
      origem: origem
    };
  }
};

/**
 * Busca clientes
 */
export const buscarClientes = async (origem = 'filial', filtros = {}) => {
  const api = criarClienteAPI(origem);

  try {
    const response = await api.get('/clientes', { params: filtros });
    return {
      sucesso: true,
      dados: response.data,
      origem: origem
    };
  } catch (error) {
    console.error(`Erro ao buscar clientes da ${origem}:`, error);
    return {
      sucesso: false,
      erro: error.response?.data?.mensagem || 'Erro ao buscar clientes',
      origem: origem
    };
  }
};

/**
 * Busca fornecedores
 */
export const buscarFornecedores = async (origem = 'filial', filtros = {}) => {
  const api = criarClienteAPI(origem);

  try {
    const response = await api.get('/fornecedores', { params: filtros });
    return {
      sucesso: true,
      dados: response.data,
      origem: origem
    };
  } catch (error) {
    console.error(`Erro ao buscar fornecedores da ${origem}:`, error);
    return {
      sucesso: false,
      erro: error.response?.data?.mensagem || 'Erro ao buscar fornecedores',
      origem: origem
    };
  }
};

export default {
  criarClienteAPI,
  buscarProdutos,
  buscarProdutoPorCodigo,
  buscarClientes,
  buscarFornecedores
};
