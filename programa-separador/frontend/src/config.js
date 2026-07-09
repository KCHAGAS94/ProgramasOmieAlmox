// Detecta automaticamente o hostname para funcionar em qualquer rede
export const getApiUrl = (port) => {
  const hostname = window.location.hostname;
  return `http://${hostname}:${port}`;
};
