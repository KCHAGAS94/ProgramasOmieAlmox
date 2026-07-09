import { useState } from 'react';
import { produtoService } from '../services/api';

function FormularioAdicionar({ onAdicionar, categoriaAtual }) {
  const [mostrar, setMostrar] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [estoqueSelecionado, setEstoqueSelecionado] = useState('Estoque Comercial'); // Estoque Comercial por padrão
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  // Lista de estoques disponíveis (usando nome ao invés de código pois a API não retorna código)
  const estoques = [
    { nome: 'Estoque Comercial', descricao: 'Estoque Comercial' },
    { nome: 'Almoxarifado - Materia Prima', descricao: 'Almoxarifado - Materia Prima' },
    { nome: 'Consumivel', descricao: 'Consumivel' },
    { nome: 'Estoque Apontamento Produção', descricao: 'Estoque Apontamento Produção' },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    const codigoTrim = codigo.trim();

    if (!codigoTrim) {
      setErro('Preencha o código do produto.');
      return;
    }

    setCarregando(true);
    setErro('');

    try {
      await produtoService.adicionar(codigoTrim, categoriaAtual, estoqueSelecionado);
      alert('Produto adicionado com sucesso!');
      setCodigo('');
      setEstoqueSelecionado('Estoque Comercial'); // Reset para padrão
      setMostrar(false);
      onAdicionar();
    } catch (error) {
      setErro(error.response?.data?.error || error.message);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Adicionar Produto Acabado</div>
        <button
          type="button"
          className="btn icon"
          onClick={() => setMostrar(!mostrar)}
          style={{ fontSize: '11px', padding: '4px 10px' }}
        >
          {mostrar ? 'Minimizar' : 'Mostrar'}
        </button>
      </div>
      {mostrar && (
        <div>
          {erro && <div className="error-message">{erro}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <label className="small">Código Omie *</label>
              <input
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                required
                disabled={carregando}
                placeholder="Ex: CA-PAPCA279101XX"
              />
            </div>

            <div className="form-row">
              <label className="small">Estoque para Verificação *</label>
              <select
                value={estoqueSelecionado}
                onChange={(e) => setEstoqueSelecionado(e.target.value)}
                required
                disabled={carregando}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px',
                  backgroundColor: 'white',
                }}
              >
                {estoques.map((estoque) => (
                  <option key={estoque.nome} value={estoque.nome}>
                    {estoque.descricao}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" className="btn" disabled={carregando}>
              {carregando ? 'Adicionando...' : 'Adicionar'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default FormularioAdicionar;
