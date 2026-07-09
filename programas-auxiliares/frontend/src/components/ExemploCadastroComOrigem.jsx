import { useState } from 'react';
import SeletorOrigem from './SeletorOrigem';
import { buscarProdutoPorCodigo } from '../api/apiService';

/**
 * Exemplo de uso do Seletor de Origem em um cadastro
 */
function ExemploCadastroComOrigem({ usuario, onVoltar }) {
  const [origem, setOrigem] = useState('filial');
  const [codigo, setCodigo] = useState('');
  const [produto, setProduto] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  const handleBuscarProduto = async () => {
    if (!codigo.trim()) {
      setErro('Digite um código de produto');
      return;
    }

    setCarregando(true);
    setErro(null);
    setProduto(null);

    const resultado = await buscarProdutoPorCodigo(codigo.trim(), origem);

    if (resultado.sucesso) {
      setProduto(resultado.dados);
    } else {
      setErro(resultado.erro);
    }

    setCarregando(false);
  };

  const handleChangeOrigem = (novaOrigem) => {
    setOrigem(novaOrigem);
    // Limpa os dados quando muda a origem
    setProduto(null);
    setErro(null);
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button style={styles.buttonVoltar} onClick={onVoltar}>
          ← Voltar
        </button>
        <h1 style={styles.titulo}>📦 Exemplo de Cadastro</h1>
        <p style={styles.subtitulo}>
          Demonstração do seletor de origem (Filial/Matriz)
        </p>
      </header>

      <main style={styles.main}>
        <div style={styles.card}>
          {/* Seletor de Origem */}
          <SeletorOrigem
            origem={origem}
            onChangeOrigem={handleChangeOrigem}
            usuario={usuario}
          />

          {/* Campo de busca */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Código do Produto</label>
            <div style={styles.inputGroup}>
              <input
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Digite o código..."
                style={styles.input}
                onKeyPress={(e) => e.key === 'Enter' && handleBuscarProduto()}
              />
              <button
                style={styles.buttonBuscar}
                onClick={handleBuscarProduto}
                disabled={carregando}
              >
                {carregando ? '⏳' : '🔍'} Buscar
              </button>
            </div>
          </div>

          {/* Mensagem de erro */}
          {erro && (
            <div style={styles.erro}>
              <span style={styles.erroIcon}>❌</span>
              <span>{erro}</span>
            </div>
          )}

          {/* Resultado */}
          {produto && (
            <div style={styles.resultado}>
              <div style={styles.resultadoHeader}>
                <span style={styles.resultadoIcon}>✅</span>
                <span style={styles.resultadoTitulo}>
                  Produto encontrado na <strong>{origem === 'matriz' ? 'Matriz' : 'Filial'}</strong>
                </span>
              </div>

              <div style={styles.resultadoInfo}>
                <div style={styles.infoItem}>
                  <span style={styles.infoLabel}>Código:</span>
                  <span style={styles.infoValor}>{produto.codigo}</span>
                </div>
                <div style={styles.infoItem}>
                  <span style={styles.infoLabel}>Descrição:</span>
                  <span style={styles.infoValor}>{produto.descricao}</span>
                </div>
                <div style={styles.infoItem}>
                  <span style={styles.infoLabel}>Unidade:</span>
                  <span style={styles.infoValor}>{produto.unidade}</span>
                </div>
                <div style={styles.infoItem}>
                  <span style={styles.infoLabel}>Estoque:</span>
                  <span style={styles.infoValor}>{produto.estoque || 0}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Informações sobre o sistema */}
        <div style={styles.info}>
          <h3 style={styles.infoTitulo}>💡 Como funciona?</h3>
          <ul style={styles.infoLista}>
            <li>Selecione a origem dos dados (Filial ou Matriz)</li>
            <li>Digite o código do produto e clique em Buscar</li>
            <li>Os dados serão buscados da origem selecionada</li>
            <li>Apenas administradores podem acessar dados da Matriz</li>
            <li>As API Keys devem estar configuradas nas Configurações</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #fef3f8 0%, #f6f8fb 100%)',
    padding: '32px 20px',
    fontFamily: 'Inter, system-ui, sans-serif'
  },
  header: {
    maxWidth: '800px',
    margin: '0 auto 32px',
    textAlign: 'center'
  },
  buttonVoltar: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    background: '#6b7280',
    color: 'white',
    fontWeight: '600',
    fontSize: '14px',
    cursor: 'pointer',
    marginBottom: '20px',
    transition: 'all 0.2s'
  },
  titulo: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#0f172a',
    margin: '0 0 8px 0'
  },
  subtitulo: {
    fontSize: '16px',
    color: '#6b7280',
    margin: 0
  },
  main: {
    maxWidth: '800px',
    margin: '0 auto'
  },
  card: {
    background: 'white',
    borderRadius: '16px',
    padding: '32px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    marginBottom: '24px'
  },
  formGroup: {
    marginTop: '24px'
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '8px'
  },
  inputGroup: {
    display: 'flex',
    gap: '12px'
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    transition: 'all 0.2s'
  },
  buttonBuscar: {
    padding: '12px 24px',
    borderRadius: '8px',
    border: 'none',
    background: '#3b82f6',
    color: 'white',
    fontWeight: '600',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap'
  },
  erro: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '16px',
    padding: '12px 16px',
    background: '#fee2e2',
    border: '1px solid #ef4444',
    borderRadius: '8px',
    color: '#991b1b',
    fontSize: '14px'
  },
  erroIcon: {
    fontSize: '18px'
  },
  resultado: {
    marginTop: '24px',
    padding: '20px',
    background: '#f0fdf4',
    border: '2px solid #10b981',
    borderRadius: '12px'
  },
  resultadoHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid #d1fae5'
  },
  resultadoIcon: {
    fontSize: '20px'
  },
  resultadoTitulo: {
    fontSize: '16px',
    color: '#065f46',
    fontWeight: '600'
  },
  resultadoInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  infoItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0'
  },
  infoLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#065f46'
  },
  infoValor: {
    fontSize: '14px',
    color: '#047857'
  },
  info: {
    background: 'white',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
  },
  infoTitulo: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#0f172a',
    margin: '0 0 16px 0'
  },
  infoLista: {
    margin: 0,
    paddingLeft: '24px',
    color: '#6b7280',
    fontSize: '14px',
    lineHeight: '1.8'
  }
};

export default ExemploCadastroComOrigem;
