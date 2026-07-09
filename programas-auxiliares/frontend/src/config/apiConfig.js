/**
 * Configuração de APIs - Filial e Matriz
 */

// Configurações das APIs
export const API_CONFIG = {
  filial: {
    baseURL: 'http://localhost:5000/api',
    label: 'Filial (Local)',
    icon: '🏪'
  },
  matriz: {
    baseURL: 'http://localhost:5000/api', // Mesma URL, só muda a key
    label: 'Matriz',
    icon: '🏢'
  }
};

// Armazenamento das chaves no localStorage
export const API_KEYS = {
  getFilialKey: () => {
    return localStorage.getItem('api_key_filial') || '';
  },

  getMatrizKey: () => {
    return localStorage.getItem('api_key_matriz') || '';
  },

  setFilialKey: (key) => {
    localStorage.setItem('api_key_filial', key);
  },

  setMatrizKey: (key) => {
    localStorage.setItem('api_key_matriz', key);
  },

  // Retorna a chave baseado na origem selecionada
  getKey: (origem = 'filial') => {
    return origem === 'matriz' ? API_KEYS.getMatrizKey() : API_KEYS.getFilialKey();
  }
};

// Verifica se o usuário pode acessar a matriz
export const podeAcessarMatriz = (usuario) => {
  return usuario?.tipo === 'admin';
};
