import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  maxContentLength: 100 * 1024 * 1024, // 100MB
  maxBodyLength: 100 * 1024 * 1024, // 100MB
});

export const produtoService = {
  // Listar todos os produtos
  listar: async (ordenar = '', categoriaId = null) => {
    const params = { ordenar };
    if (categoriaId !== null) {
      params.categoria_id = categoriaId;
    }
    const response = await api.get('/produtos', { params });
    return response.data;
  },

  // Buscar produto por ID
  buscar: async (id) => {
    const response = await api.get(`/produtos/${id}`);
    return response.data;
  },

  // Adicionar novo produto
  adicionar: async (codigo, categoriaId = null, nomeLocalEstoque = null) => {
    const response = await api.post('/produtos', {
      codigo_produto_omie: codigo,
      categoria_id: categoriaId,
      nome_local_estoque: nomeLocalEstoque
    });
    return response.data;
  },

  // Atualizar produto
  atualizar: async (id, dados) => {
    const response = await api.put(`/produtos/${id}`, dados);
    return response.data;
  },

  // Excluir produto
  excluir: async (id) => {
    const response = await api.delete(`/produtos/${id}`);
    return response.data;
  },

  // Mover produto para cima
  moverCima: async (id) => {
    const response = await api.post(`/produtos/${id}/mover-cima`);
    return response.data;
  },

  // Mover produto para baixo
  moverBaixo: async (id) => {
    const response = await api.post(`/produtos/${id}/mover-baixo`);
    return response.data;
  },

  // Atualizar via Omie (timeout maior pois processa todos os produtos)
  refreshOmie: async () => {
    const response = await api.post('/produtos/refresh-omie', null, {
      timeout: 600000 // 10 minutos
    });
    return response.data;
  },

  // Consultar progresso da atualização Omie em andamento
  refreshProgress: async () => {
    const response = await api.get('/refresh-progress');
    return response.data;
  },

  // Obter última atualização
  lastUpdate: async () => {
    const response = await api.get('/last-update');
    return response.data;
  },
};

export const categoriaService = {
  // Listar todas as categorias
  listar: async () => {
    const response = await api.get('/categorias');
    return response.data;
  },

  // Buscar categoria por ID
  buscar: async (id) => {
    const response = await api.get(`/categorias/${id}`);
    return response.data;
  },

  // Criar nova categoria
  criar: async (nome, cor = '#2563eb') => {
    const response = await api.post('/categorias', { nome, cor });
    return response.data;
  },

  // Atualizar categoria
  atualizar: async (id, dados) => {
    const response = await api.put(`/categorias/${id}`, dados);
    return response.data;
  },

  // Excluir categoria
  excluir: async (id) => {
    const response = await api.delete(`/categorias/${id}`);
    return response.data;
  },

  // Mover categoria para cima
  moverCima: async (id) => {
    const response = await api.post(`/categorias/${id}/mover-cima`);
    return response.data;
  },

  // Mover categoria para baixo
  moverBaixo: async (id) => {
    const response = await api.post(`/categorias/${id}/mover-baixo`);
    return response.data;
  },
};

export default api;
