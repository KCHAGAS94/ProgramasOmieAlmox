import { useState, useEffect } from 'react';
import { categoriaService } from '../services/api';

function GerenciadorCategorias({ mostrar, onFechar, onAtualizar }) {
  const [categorias, setCategorias] = useState([]);
  const [novaCategoria, setNovaCategoria] = useState('');
  const [novaCor, setNovaCor] = useState('#2563eb');
  const [editando, setEditando] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (mostrar) {
      carregarCategorias();
    }
  }, [mostrar]);

  const carregarCategorias = async () => {
    try {
      const data = await categoriaService.listar();
      setCategorias(data);
    } catch (error) {
      console.error('Erro ao carregar categorias:', error);
    }
  };

  const handleCriar = async (e) => {
    e.preventDefault();
    if (!novaCategoria.trim()) {
      setErro('O nome da categoria é obrigatório');
      return;
    }

    try {
      await categoriaService.criar(novaCategoria.trim(), novaCor);
      setNovaCategoria('');
      setNovaCor('#2563eb');
      setErro('');
      await carregarCategorias();
      onAtualizar();
    } catch (error) {
      setErro(error.response?.data?.error || error.message);
    }
  };

  const handleAtualizar = async (id, nome, cor) => {
    try {
      await categoriaService.atualizar(id, { nome, cor });
      setEditando(null);
      await carregarCategorias();
      onAtualizar();
    } catch (error) {
      alert('Erro ao atualizar categoria: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleExcluir = async (id) => {
    if (!window.confirm('Excluir categoria? Os produtos serão movidos para "Sem Categoria".')) return;

    try {
      await categoriaService.excluir(id);
      await carregarCategorias();
      onAtualizar();
    } catch (error) {
      alert('Erro ao excluir categoria: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleMoverCima = async (id) => {
    try {
      await categoriaService.moverCima(id);
      await carregarCategorias();
      onAtualizar();
    } catch (error) {
      alert('Erro ao mover categoria: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleMoverBaixo = async (id) => {
    try {
      await categoriaService.moverBaixo(id);
      await carregarCategorias();
      onAtualizar();
    } catch (error) {
      alert('Erro ao mover categoria: ' + (error.response?.data?.error || error.message));
    }
  };

  if (!mostrar) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onFechar}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '20px' }}>Gerenciar Abas</h2>
          <button onClick={onFechar} className="btn icon" style={{ padding: '4px 10px' }}>
            ✕
          </button>
        </div>

        {/* Formulário de criar nova categoria */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-title" style={{ marginBottom: '12px' }}>
            Nova Aba
          </div>
          {erro && <div className="error-message">{erro}</div>}
          <form onSubmit={handleCriar}>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <input
                type="text"
                placeholder="Nome da aba (ex: Plástico, Parafuso)"
                value={novaCategoria}
                onChange={(e) => setNovaCategoria(e.target.value)}
                style={{ flex: 1 }}
              />
              <input
                type="color"
                value={novaCor}
                onChange={(e) => setNovaCor(e.target.value)}
                style={{ width: '60px' }}
                title="Cor da aba"
              />
            </div>
            <button type="submit" className="btn" style={{ width: '100%' }}>
              Criar Aba
            </button>
          </form>
        </div>

        {/* Lista de categorias */}
        <div>
          <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>Abas Existentes</h3>
          {categorias.length === 0 ? (
            <div className="muted" style={{ textAlign: 'center', padding: '20px' }}>
              Nenhuma aba criada ainda
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {categorias.map((cat) => (
                <div
                  key={cat.id}
                  style={{
                    padding: '12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: '#f9fafb',
                  }}
                >
                  {editando === cat.id ? (
                    <>
                      <input
                        type="text"
                        defaultValue={cat.nome}
                        id={`edit-nome-${cat.id}`}
                        style={{ flex: 1 }}
                      />
                      <input
                        type="color"
                        defaultValue={cat.cor}
                        id={`edit-cor-${cat.id}`}
                        style={{ width: '60px' }}
                      />
                      <button
                        onClick={() => {
                          const nome = document.getElementById(`edit-nome-${cat.id}`).value;
                          const cor = document.getElementById(`edit-cor-${cat.id}`).value;
                          handleAtualizar(cat.id, nome, cor);
                        }}
                        className="btn icon"
                        style={{ fontSize: '11px' }}
                      >
                        ✓
                      </button>
                      <button onClick={() => setEditando(null)} className="btn icon" style={{ fontSize: '11px' }}>
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '4px',
                          background: cat.cor,
                        }}
                      />
                      <span style={{ flex: 1, fontWeight: 600 }}>{cat.nome}</span>
                      <button
                        onClick={() => handleMoverCima(cat.id)}
                        style={{
                          width: '28px',
                          height: '28px',
                          background: '#6366f1',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '14px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.background = '#4f46e5';
                          e.target.style.transform = 'scale(1.05)';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = '#6366f1';
                          e.target.style.transform = 'scale(1)';
                        }}
                        title="Mover para cima"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => handleMoverBaixo(cat.id)}
                        style={{
                          width: '28px',
                          height: '28px',
                          background: '#6366f1',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '14px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.background = '#4f46e5';
                          e.target.style.transform = 'scale(1.05)';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.background = '#6366f1';
                          e.target.style.transform = 'scale(1)';
                        }}
                        title="Mover para baixo"
                      >
                        ↓
                      </button>
                      {cat.nome !== 'Sem Categoria' && (
                        <>
                          <button
                            onClick={() => setEditando(cat.id)}
                            style={{
                              width: '28px',
                              height: '28px',
                              background: '#f59e0b',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '14px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.background = '#d97706';
                              e.target.style.transform = 'scale(1.05)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.background = '#f59e0b';
                              e.target.style.transform = 'scale(1)';
                            }}
                            title="Editar aba"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleExcluir(cat.id)}
                            style={{
                              width: '28px',
                              height: '28px',
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '14px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.background = '#dc2626';
                              e.target.style.transform = 'scale(1.05)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.background = '#ef4444';
                              e.target.style.transform = 'scale(1)';
                            }}
                            title="Excluir aba"
                          >
                            🗑️
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GerenciadorCategorias;
