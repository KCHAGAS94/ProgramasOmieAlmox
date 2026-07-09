import { useState } from 'react';
import { API_CONFIG, podeAcessarMatriz } from '../config/apiConfig';

/**
 * Componente para selecionar origem dos dados (Filial ou Matriz)
 */
function SeletorOrigem({ origem, onChangeOrigem, usuario, disabled = false }) {
  const podeMatriz = podeAcessarMatriz(usuario);

  const handleToggle = () => {
    if (disabled) return;

    if (!podeMatriz && origem === 'filial') {
      alert('⚠️ Você não tem permissão para acessar dados da Matriz.\nApenas administradores podem fazer isso.');
      return;
    }

    const novaOrigem = origem === 'filial' ? 'matriz' : 'filial';
    onChangeOrigem(novaOrigem);
  };

  return (
    <div style={styles.container}>
      <div style={styles.label}>
        <span style={styles.labelIcon}>📍</span>
        <span style={styles.labelText}>Origem dos Dados:</span>
      </div>

      <div
        style={{
          ...styles.toggle,
          ...(disabled ? styles.toggleDisabled : {}),
          ...(origem === 'matriz' ? styles.toggleMatriz : styles.toggleFilial)
        }}
        onClick={handleToggle}
        title={podeMatriz ? 'Clique para alternar' : 'Apenas admin pode acessar a Matriz'}
      >
        <div
          style={{
            ...styles.toggleButton,
            ...(origem === 'matriz' ? styles.toggleButtonRight : styles.toggleButtonLeft)
          }}
        />

        <div style={styles.toggleContent}>
          <div style={{
            ...styles.toggleOption,
            ...(origem === 'filial' ? styles.toggleOptionActive : {})
          }}>
            <span style={styles.toggleIcon}>{API_CONFIG.filial.icon}</span>
            <span style={styles.toggleText}>Filial</span>
          </div>

          <div style={{
            ...styles.toggleOption,
            ...(origem === 'matriz' ? styles.toggleOptionActive : {}),
            ...(disabled || !podeMatriz ? styles.toggleOptionDisabled : {})
          }}>
            <span style={styles.toggleIcon}>{API_CONFIG.matriz.icon}</span>
            <span style={styles.toggleText}>Matriz</span>
            {!podeMatriz && <span style={styles.lockIcon}>🔒</span>}
          </div>
        </div>
      </div>

      {origem === 'matriz' && (
        <div style={styles.alert}>
          <span style={styles.alertIcon}>⚠️</span>
          <span style={styles.alertText}>
            Buscando dados da <strong>Matriz</strong>
          </span>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    marginBottom: '20px'
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151'
  },
  labelIcon: {
    fontSize: '18px'
  },
  labelText: {
    fontSize: '14px'
  },
  toggle: {
    position: 'relative',
    width: '100%',
    maxWidth: '320px',
    height: '56px',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  toggleFilial: {
    background: 'linear-gradient(135deg, #3b82f6, #2563eb)'
  },
  toggleMatriz: {
    background: 'linear-gradient(135deg, #ec4899, #f97316)'
  },
  toggleDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  toggleButton: {
    position: 'absolute',
    top: '4px',
    width: 'calc(50% - 4px)',
    height: 'calc(100% - 8px)',
    background: 'white',
    borderRadius: '10px',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    zIndex: 1
  },
  toggleButtonLeft: {
    left: '4px'
  },
  toggleButtonRight: {
    left: 'calc(50%)'
  },
  toggleContent: {
    position: 'relative',
    display: 'flex',
    height: '100%',
    zIndex: 2
  },
  toggleOption: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
    fontSize: '14px',
    transition: 'all 0.3s ease',
    position: 'relative'
  },
  toggleOptionActive: {
    color: '#1f2937',
    fontWeight: '700'
  },
  toggleOptionDisabled: {
    opacity: 0.5
  },
  toggleIcon: {
    fontSize: '20px'
  },
  toggleText: {
    fontSize: '14px'
  },
  lockIcon: {
    fontSize: '12px',
    position: 'absolute',
    top: '8px',
    right: '8px'
  },
  alert: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '12px',
    padding: '10px 14px',
    background: '#fef3c7',
    border: '1px solid #fbbf24',
    borderRadius: '8px',
    fontSize: '13px',
    color: '#92400e'
  },
  alertIcon: {
    fontSize: '16px'
  },
  alertText: {
    flex: 1
  }
};

export default SeletorOrigem;
