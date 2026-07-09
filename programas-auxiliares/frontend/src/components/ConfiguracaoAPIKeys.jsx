import { useState, useEffect } from 'react';
import { API_KEYS, podeAcessarMatriz } from '../config/apiConfig';

/**
 * Componente para configurar as API Keys (Filial e Matriz)
 * Apenas para administradores
 */
function ConfiguracaoAPIKeys({ usuario, onVoltar }) {
  const [keyFilial, setKeyFilial] = useState('');
  const [keyMatriz, setKeyMatriz] = useState('');
  const [mostrarKeyFilial, setMostrarKeyFilial] = useState(false);
  const [mostrarKeyMatriz, setMostrarKeyMatriz] = useState(false);
  const [mensagem, setMensagem] = useState(null);

  const podeConfigurar = podeAcessarMatriz(usuario);

  useEffect(() => {
    if (podeConfigurar) {
      setKeyFilial(API_KEYS.getFilialKey());
      setKeyMatriz(API_KEYS.getMatrizKey());
    }
  }, [podeConfigurar]);

  const handleSalvar = () => {
    if (!keyFilial.trim()) {
      setMensagem({ tipo: 'erro', texto: 'A API Key da Filial é obrigatória!' });
      return;
    }

    API_KEYS.setFilialKey(keyFilial.trim());
    API_KEYS.setMatrizKey(keyMatriz.trim());

    setMensagem({ tipo: 'sucesso', texto: '✅ API Keys salvas com sucesso!' });

    setTimeout(() => {
      setMensagem(null);
    }, 3000);
  };

  if (!podeConfigurar) {
    return (
      <div style={styles.container}>
        <div style={styles.acessoNegado}>
          <div style={styles.acessoNegadoIcon}>🔒</div>
          <h2 style={styles.acessoNegadoTitulo}>Acesso Negado</h2>
          <p style={styles.acessoNegadoTexto}>
            Apenas administradores podem configurar as API Keys.
          </p>
          <button style={styles.buttonVoltar} onClick={onVoltar}>
            ← Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button style={styles.buttonVoltar} onClick={onVoltar}>
          ← Voltar
        </button>
        <h1 style={styles.titulo}>🔑 Configuração de API Keys</h1>
        <p style={styles.subtitulo}>Configure as chaves de acesso para Filial e Matriz</p>
      </header>

      <main style={styles.main}>
        {mensagem && (
          <div style={{
            ...styles.mensagem,
            ...(mensagem.tipo === 'sucesso' ? styles.mensagemSucesso : styles.mensagemErro)
          }}>
            {mensagem.texto}
          </div>
        )}

        {/* API Key Filial */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={styles.cardIcon}>🏪</div>
            <div>
              <h3 style={styles.cardTitulo}>API Key - Filial (Local)</h3>
              <p style={styles.cardDesc}>Chave de acesso aos dados locais da filial</p>
            </div>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>
              Chave de API <span style={styles.obrigatorio}>*</span>
            </label>
            <div style={styles.inputWrapper}>
              <input
                type={mostrarKeyFilial ? 'text' : 'password'}
                value={keyFilial}
                onChange={(e) => setKeyFilial(e.target.value)}
                placeholder="Digite a API Key da Filial"
                style={styles.input}
              />
              <button
                style={styles.buttonMostrar}
                onClick={() => setMostrarKeyFilial(!mostrarKeyFilial)}
                type="button"
              >
                {mostrarKeyFilial ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
        </div>

        {/* API Key Matriz */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={{ ...styles.cardIcon, background: 'linear-gradient(135deg, #ec4899, #f97316)' }}>
              🏢
            </div>
            <div>
              <h3 style={styles.cardTitulo}>API Key - Matriz</h3>
              <p style={styles.cardDesc}>Chave de acesso aos dados da matriz</p>
            </div>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Chave de API</label>
            <div style={styles.inputWrapper}>
              <input
                type={mostrarKeyMatriz ? 'text' : 'password'}
                value={keyMatriz}
                onChange={(e) => setKeyMatriz(e.target.value)}
                placeholder="Digite a API Key da Matriz"
                style={styles.input}
              />
              <button
                style={styles.buttonMostrar}
                onClick={() => setMostrarKeyMatriz(!mostrarKeyMatriz)}
                type="button"
              >
                {mostrarKeyMatriz ? '🙈' : '👁️'}
              </button>
            </div>
            <p style={styles.hint}>
              💡 Se não configurada, apenas dados da Filial estarão disponíveis
            </p>
          </div>
        </div>

        <div style={styles.actions}>
          <button style={styles.buttonSalvar} onClick={handleSalvar}>
            💾 Salvar Configurações
          </button>
        </div>

        <div style={styles.info}>
          <div style={styles.infoIcon}>ℹ️</div>
          <div style={styles.infoTexto}>
            <strong>Importante:</strong> As API Keys são armazenadas localmente no navegador.
            Cada usuário precisa configurar suas próprias chaves.
          </div>
        </div>
      </main>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #fef3f8 0%, #f6f8fb 100%)',
    padding: '32px 20px'
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
  mensagem: {
    padding: '16px',
    borderRadius: '8px',
    marginBottom: '24px',
    fontWeight: '600',
    textAlign: 'center'
  },
  mensagemSucesso: {
    background: '#d1fae5',
    color: '#065f46',
    border: '1px solid #10b981'
  },
  mensagemErro: {
    background: '#fee2e2',
    color: '#991b1b',
    border: '1px solid #ef4444'
  },
  card: {
    background: 'white',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '20px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px'
  },
  cardIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '28px',
    flexShrink: 0
  },
  cardTitulo: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#0f172a',
    margin: '0 0 4px 0'
  },
  cardDesc: {
    fontSize: '14px',
    color: '#6b7280',
    margin: 0
  },
  inputGroup: {
    marginBottom: '0'
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '8px'
  },
  obrigatorio: {
    color: '#ef4444'
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center'
  },
  input: {
    flex: 1,
    padding: '12px 50px 12px 16px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    fontFamily: 'monospace',
    transition: 'all 0.2s'
  },
  buttonMostrar: {
    position: 'absolute',
    right: '8px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '20px',
    padding: '4px 8px'
  },
  hint: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '8px',
    marginBottom: 0
  },
  actions: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '32px'
  },
  buttonSalvar: {
    padding: '14px 32px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #ec4899, #f97316)',
    color: 'white',
    fontWeight: '700',
    fontSize: '16px',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(236, 72, 153, 0.3)',
    transition: 'all 0.2s'
  },
  info: {
    display: 'flex',
    gap: '12px',
    padding: '16px',
    background: '#dbeafe',
    border: '1px solid #3b82f6',
    borderRadius: '8px',
    marginTop: '24px'
  },
  infoIcon: {
    fontSize: '20px',
    flexShrink: 0
  },
  infoTexto: {
    fontSize: '13px',
    color: '#1e40af',
    lineHeight: '1.6'
  },
  acessoNegado: {
    maxWidth: '500px',
    margin: '100px auto',
    background: 'white',
    borderRadius: '16px',
    padding: '48px',
    textAlign: 'center',
    boxShadow: '0 8px 24px rgba(0,0,0,0.1)'
  },
  acessoNegadoIcon: {
    fontSize: '64px',
    marginBottom: '16px'
  },
  acessoNegadoTitulo: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#0f172a',
    margin: '0 0 12px 0'
  },
  acessoNegadoTexto: {
    fontSize: '16px',
    color: '#6b7280',
    marginBottom: '32px'
  }
};

export default ConfiguracaoAPIKeys;
