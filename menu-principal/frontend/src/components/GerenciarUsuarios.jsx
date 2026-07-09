import { useState, useEffect } from 'react';
import api from '../api/axios';

const PROGRAMAS_DISPONIVEIS = [
  { id: 'separador', nome: 'Programa Separador' },
  { id: 'recebimento', nome: 'Programa Recebimento NFe' },
  { id: 'separador-op', nome: 'Separador de OP' },
  { id: 'separador-remessa', nome: 'Separador de Remessa' },
  { id: 'inventario', nome: 'Programa Inventário' },
  { id: 'requisicao-material', nome: 'Requisição de Material' },
  { id: 'estoque', nome: 'Gestão de Estoque' },
  { id: 'auxiliares', nome: 'Programas Auxiliares' },
  { id: 'relatorio', nome: 'Relatório' }
];

function GerenciarUsuarios({ onVoltar, usuarioLogado }) {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [erro, setErro] = useState('');

  // Formulário
  const [formNome, setFormNome] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formSenha, setFormSenha] = useState('');
  const [formTipo, setFormTipo] = useState('operador');
  const [formAlmoxarifado, setFormAlmoxarifado] = useState(false);
  const [formPermissoes, setFormPermissoes] = useState({});

  useEffect(() => {
    carregarUsuarios();
  }, []);

  const carregarUsuarios = async () => {
    try {
      setLoading(true);
      const response = await api.get('/usuarios');
      setUsuarios(response.data.usuarios);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
      setErro('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  const abrirModalNovo = () => {
    setUsuarioEditando(null);
    setFormNome('');
    setFormEmail('');
    setFormSenha('');
    setFormTipo('operador');
    setFormAlmoxarifado(false);
    setFormPermissoes({});
    setErro('');
    setModalAberto(true);
  };

  const abrirModalEditar = async (usuario) => {
    setUsuarioEditando(usuario);
    setFormNome(usuario.nome);
    setFormEmail(usuario.email);
    setFormSenha(''); // Senha vazia em edição
    setFormTipo(usuario.tipo);
    setFormAlmoxarifado(usuario.almoxarifado === true);
    setErro('');

    // Carrega permissões do usuário
    try {
      const response = await api.get(`/permissoes/${usuario.id}`);
      const permissoesMap = {};
      response.data.permissoes.forEach(p => {
        permissoesMap[p.programaId] = p.nivel;
      });
      setFormPermissoes(permissoesMap);
    } catch (error) {
      console.error('Erro ao carregar permissões:', error);
      setFormPermissoes({});
    }

    setModalAberto(true);
  };

  const fecharModal = () => {
    setModalAberto(false);
    setUsuarioEditando(null);
    setErro('');
  };

  const handlePermissaoChange = (programaId, nivel) => {
    setFormPermissoes(prev => {
      if (nivel === null) {
        // Remove permissão
        const { [programaId]: _, ...rest } = prev;
        return rest;
      } else {
        // Adiciona/atualiza permissão
        return { ...prev, [programaId]: nivel };
      }
    });
  };

  const handleSalvar = async (e) => {
    e.preventDefault();
    setErro('');

    // Validações
    if (!formNome || !formEmail) {
      setErro('Nome e email são obrigatórios');
      return;
    }

    if (!usuarioEditando && !formSenha) {
      setErro('Senha é obrigatória para novos usuários');
      return;
    }

    setLoading(true);

    try {
      const dadosUsuario = {
        nome: formNome,
        email: formEmail,
        tipo: formTipo,
        almoxarifado: formAlmoxarifado
      };

      if (formSenha) {
        dadosUsuario.senha = formSenha;
      }

      let usuarioId;

      if (usuarioEditando) {
        // Editar usuário existente
        const response = await api.put(`/usuarios/${usuarioEditando.id}`, dadosUsuario);
        usuarioId = response.data.usuario.id;
      } else {
        // Criar novo usuário
        const response = await api.post('/usuarios', dadosUsuario);
        usuarioId = response.data.usuario.id;
      }

      // Atualizar permissões (apenas se for operador)
      if (formTipo === 'operador') {
        const permissoes = Object.entries(formPermissoes).map(([programaId, nivel]) => ({
          programaId,
          nivel
        }));

        await api.put('/permissoes/lote', {
          usuarioId,
          permissoes
        });
      }

      fecharModal();
      carregarUsuarios();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      if (error.response) {
        setErro(error.response.data.error || 'Erro ao salvar usuário');
      } else {
        setErro('Erro ao conectar ao servidor');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDesabilitar = async (usuario) => {
    if (!confirm(`Deseja ${usuario.ativo ? 'desabilitar' : 'habilitar'} ${usuario.nome}?`)) {
      return;
    }

    try {
      setLoading(true);
      await api.put(`/usuarios/${usuario.id}`, { ativo: !usuario.ativo });
      carregarUsuarios();
    } catch (error) {
      console.error('Erro ao alterar status:', error);
      alert('Erro ao alterar status do usuário');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Gerenciar Usuários</h2>
            <p style={styles.subtitle}>Crie e gerencie usuários e suas permissões</p>
          </div>
          <button style={{ ...styles.button, background: '#6b7280' }} onClick={onVoltar}>
            ← Voltar ao Menu
          </button>
        </div>

        <button
          style={{ ...styles.button, background: 'linear-gradient(135deg, #2563eb, #7c3aed)', marginBottom: '24px' }}
          onClick={abrirModalNovo}
        >
          + Novo Usuário
        </button>

        {loading && !modalAberto && (
          <div style={styles.loading}>Carregando...</div>
        )}

        {!loading && usuarios.length === 0 && (
          <div style={styles.empty}>Nenhum usuário cadastrado</div>
        )}

        {!loading && usuarios.length > 0 && (
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Nome</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Tipo</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map(usuario => (
                  <tr key={usuario.id} style={styles.tr}>
                    <td style={styles.td}>{usuario.nome}</td>
                    <td style={styles.td}>{usuario.email}</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.badge,
                        background: usuario.tipo === 'admin' ? '#dbeafe' : '#f3f4f6',
                        color: usuario.tipo === 'admin' ? '#1e40af' : '#374151'
                      }}>
                        {usuario.tipo === 'admin' ? 'Admin' : 'Operador'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.badge,
                        background: usuario.ativo ? '#d1fae5' : '#fee2e2',
                        color: usuario.ativo ? '#065f46' : '#991b1b'
                      }}>
                        {usuario.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          style={styles.buttonSmall}
                          onClick={() => abrirModalEditar(usuario)}
                        >
                          Editar
                        </button>
                        {usuario.id !== usuarioLogado.id && (
                          <button
                            style={{
                              ...styles.buttonSmall,
                              background: usuario.ativo ? '#dc2626' : '#10b981'
                            }}
                            onClick={() => handleDesabilitar(usuario)}
                          >
                            {usuario.ativo ? 'Desabilitar' : 'Habilitar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalAberto && (
        <div style={styles.modalOverlay} onClick={fecharModal}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>
                {usuarioEditando ? 'Editar Usuário' : 'Novo Usuário'}
              </h3>
              <button style={styles.closeButton} onClick={fecharModal}>
                ×
              </button>
            </div>

            <form onSubmit={handleSalvar} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Nome</label>
                <input
                  type="text"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  style={styles.input}
                  placeholder="Nome completo"
                  required
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  style={styles.input}
                  placeholder="email@empresa.com"
                  required
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>
                  Senha {usuarioEditando && '(deixe em branco para manter)'}
                </label>
                <input
                  type="password"
                  value={formSenha}
                  onChange={(e) => setFormSenha(e.target.value)}
                  style={styles.input}
                  placeholder="Mínimo 6 caracteres"
                  required={!usuarioEditando}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Tipo</label>
                <div style={styles.radioGroup}>
                  <label style={styles.radioLabel}>
                    <input
                      type="radio"
                      value="admin"
                      checked={formTipo === 'admin'}
                      onChange={(e) => setFormTipo(e.target.value)}
                      style={styles.radio}
                    />
                    Admin (acesso total)
                  </label>
                  <label style={styles.radioLabel}>
                    <input
                      type="radio"
                      value="operador"
                      checked={formTipo === 'operador'}
                      onChange={(e) => setFormTipo(e.target.value)}
                      style={styles.radio}
                    />
                    Operador (por permissões)
                  </label>
                </div>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={formAlmoxarifado}
                    onChange={(e) => setFormAlmoxarifado(e.target.checked)}
                    style={styles.checkbox}
                  />
                  <span style={{ marginLeft: '8px' }}>
                    <strong>Acesso ao Almoxarifado</strong> - Pode aprovar/rejeitar/entregar requisições
                  </span>
                </label>
              </div>

              {formTipo === 'operador' && (
                <div style={styles.permissoesContainer}>
                  <label style={styles.label}>Permissões de Acesso</label>
                  {PROGRAMAS_DISPONIVEIS.map(programa => (
                    <div key={programa.id} style={styles.permissaoItem}>
                      <label style={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={!!formPermissoes[programa.id]}
                          onChange={(e) => {
                            if (e.target.checked) {
                              handlePermissaoChange(programa.id, 'visualizador');
                            } else {
                              handlePermissaoChange(programa.id, null);
                            }
                          }}
                          style={styles.checkbox}
                        />
                        {programa.nome}
                      </label>
                      {formPermissoes[programa.id] && (
                        <select
                          value={formPermissoes[programa.id]}
                          onChange={(e) => handlePermissaoChange(programa.id, e.target.value)}
                          style={styles.select}
                        >
                          <option value="visualizador">Visualizador</option>
                          <option value="editor">Editor</option>
                          <option value="admin">Admin</option>
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {erro && (
                <div style={styles.erro}>
                  {erro}
                </div>
              )}

              <div style={styles.modalActions}>
                <button
                  type="button"
                  style={{ ...styles.button, background: '#6b7280' }}
                  onClick={fecharModal}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    ...styles.button,
                    background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                    opacity: loading ? 0.6 : 1
                  }}
                  disabled={loading}
                >
                  {loading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #f8fbff 0%, #f6f8fb 100%)',
    padding: '40px 24px',
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'
  },
  card: {
    background: '#ffffff',
    borderRadius: '16px',
    boxShadow: '0 6px 18px rgba(16, 24, 40, 0.08)',
    padding: '32px',
    maxWidth: '1200px',
    margin: '0 auto'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '32px',
    flexWrap: 'wrap',
    gap: '16px'
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '24px',
    fontWeight: '700',
    color: '#0f172a'
  },
  subtitle: {
    margin: '0',
    fontSize: '14px',
    color: '#6b7280'
  },
  button: {
    padding: '12px 24px',
    border: 'none',
    borderRadius: '10px',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
  },
  tableContainer: {
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  th: {
    textAlign: 'left',
    padding: '12px',
    background: '#f9fafb',
    color: '#6b7280',
    fontWeight: '600',
    fontSize: '13px',
    borderBottom: '2px solid #e5e7eb'
  },
  tr: {
    borderBottom: '1px solid #e5e7eb'
  },
  td: {
    padding: '16px 12px',
    fontSize: '14px',
    color: '#1f2937'
  },
  badge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
    display: 'inline-block'
  },
  buttonSmall: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '6px',
    background: '#2563eb',
    color: 'white',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  loading: {
    textAlign: 'center',
    padding: '48px',
    color: '#6b7280'
  },
  empty: {
    textAlign: 'center',
    padding: '48px',
    color: '#9ca3af',
    fontSize: '14px'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '24px'
  },
  modal: {
    background: '#ffffff',
    borderRadius: '16px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
    width: '100%',
    maxWidth: '600px',
    maxHeight: '90vh',
    overflow: 'auto'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px 32px',
    borderBottom: '2px solid #e5e7eb'
  },
  modalTitle: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '700',
    color: '#0f172a'
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '32px',
    color: '#9ca3af',
    cursor: 'pointer',
    lineHeight: 1
  },
  form: {
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151'
  },
  input: {
    padding: '10px 14px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none'
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#374151',
    cursor: 'pointer'
  },
  radio: {
    cursor: 'pointer'
  },
  permissoesContainer: {
    padding: '16px',
    background: '#f9fafb',
    borderRadius: '8px',
    border: '2px solid #e5e7eb'
  },
  permissaoItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: '1px solid #e5e7eb'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#374151',
    cursor: 'pointer',
    flex: 1
  },
  checkbox: {
    cursor: 'pointer'
  },
  select: {
    padding: '6px 12px',
    border: '2px solid #e5e7eb',
    borderRadius: '6px',
    fontSize: '13px',
    fontFamily: 'inherit',
    outline: 'none',
    cursor: 'pointer'
  },
  erro: {
    padding: '12px 16px',
    background: '#fef2f2',
    border: '2px solid #fee2e2',
    borderRadius: '8px',
    color: '#dc2626',
    fontSize: '14px',
    textAlign: 'center'
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    paddingTop: '8px'
  }
};

export default GerenciarUsuarios;
