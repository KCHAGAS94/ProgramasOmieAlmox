import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:4008/api';

function CalculadoraPecas({ onVoltar, usuario }) {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  const [abaAtiva, setAbaAtiva] = useState('calculadora'); // 'calculadora' | 'caixas'

  const [pesoPeca, setPesoPeca] = useState('');
  const [unidadePeca, setUnidadePeca] = useState('g');
  const [pesoCaixa, setPesoCaixa] = useState('');
  const [unidadeCaixa, setUnidadeCaixa] = useState('kg');
  const [pesoTotal, setPesoTotal] = useState('');
  const [unidadeTotal, setUnidadeTotal] = useState('kg');
  const [resultado, setResultado] = useState(null);

  // Gerenciamento de caixas
  const [caixas, setCaixas] = useState([]);
  const [caixaSelecionada, setCaixaSelecionada] = useState('');
  const [modalCaixaAberto, setModalCaixaAberto] = useState(false);
  const [caixaEditando, setCaixaEditando] = useState(null);
  const [formNomeCaixa, setFormNomeCaixa] = useState('');
  const [formPesoCaixa, setFormPesoCaixa] = useState('');
  const [formUnidadeCaixa, setFormUnidadeCaixa] = useState('kg');

  // Histórico de cálculos
  const [historico, setHistorico] = useState([]);

  useEffect(() => {
    carregarCaixas();
    carregarHistorico();
  }, []);

  const carregarHistorico = () => {
    try {
      const historicoSalvo = localStorage.getItem('calculadora_historico');
      if (historicoSalvo) {
        setHistorico(JSON.parse(historicoSalvo));
      }
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    }
  };

  const salvarNoHistorico = (calculo) => {
    try {
      const novoHistorico = [calculo, ...historico].slice(0, 10); // Mantém apenas os 10 últimos
      setHistorico(novoHistorico);
      localStorage.setItem('calculadora_historico', JSON.stringify(novoHistorico));
    } catch (error) {
      console.error('Erro ao salvar histórico:', error);
    }
  };

  const limparHistorico = () => {
    if (confirm('Deseja realmente limpar todo o histórico?')) {
      setHistorico([]);
      localStorage.removeItem('calculadora_historico');
    }
  };

  const carregarDoHistorico = (item) => {
    setPesoPeca(item.pesoPeca.toString());
    setUnidadePeca(item.unidadePeca);
    setPesoCaixa(item.pesoCaixa.toString());
    setUnidadeCaixa(item.unidadeCaixa);
    setPesoTotal(item.pesoTotal.toString());
    setUnidadeTotal(item.unidadeTotal);
    setResultado(item.resultado);
  };

  const carregarCaixas = async () => {
    try {
      const response = await axios.get(`${API_URL}/caixas`);
      setCaixas(response.data.caixas);
    } catch (error) {
      console.error('Erro ao carregar caixas:', error);
    }
  };

  const abrirModalNovaCaixa = () => {
    setCaixaEditando(null);
    setFormNomeCaixa('');
    setFormPesoCaixa('');
    setFormUnidadeCaixa('kg');
    setModalCaixaAberto(true);
  };

  const abrirModalEditarCaixa = (caixa) => {
    setCaixaEditando(caixa);
    setFormNomeCaixa(caixa.nome);
    setFormPesoCaixa(caixa.peso.toString());
    setFormUnidadeCaixa(caixa.unidade);
    setModalCaixaAberto(true);
  };

  const fecharModalCaixa = () => {
    setModalCaixaAberto(false);
    setCaixaEditando(null);
  };

  const salvarCaixa = async (e) => {
    e.preventDefault();

    if (!formNomeCaixa || !formPesoCaixa) {
      alert('Preencha todos os campos');
      return;
    }

    try {
      const dados = {
        nome: formNomeCaixa,
        peso: parseFloat(formPesoCaixa),
        unidade: formUnidadeCaixa
      };

      if (caixaEditando) {
        await axios.put(`${API_URL}/caixas/${caixaEditando.id}`, dados);
      } else {
        await axios.post(`${API_URL}/caixas`, dados);
      }

      carregarCaixas();
      fecharModalCaixa();
    } catch (error) {
      console.error('Erro ao salvar caixa:', error);
      alert('Erro ao salvar caixa');
    }
  };

  const excluirCaixa = async (id) => {
    if (!confirm('Deseja realmente excluir esta caixa?')) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/caixas/${id}`);
      if (caixaSelecionada === id) {
        setCaixaSelecionada('');
        setPesoCaixa('');
      }
      carregarCaixas();
    } catch (error) {
      console.error('Erro ao excluir caixa:', error);
      alert('Erro ao excluir caixa');
    }
  };

  const selecionarCaixaDropdown = (caixaId) => {
    setCaixaSelecionada(caixaId);
    const caixa = caixas.find(c => c.id === caixaId);
    if (caixa) {
      setPesoCaixa(caixa.peso.toString());
      setUnidadeCaixa(caixa.unidade);
    } else {
      setPesoCaixa('');
      setUnidadeCaixa('kg');
    }
  };

  const calcular = () => {
    const pecaEmGramas = unidadePeca === 'kg'
      ? parseFloat(pesoPeca) * 1000
      : parseFloat(pesoPeca);

    const caixaEmGramas = unidadeCaixa === 'kg'
      ? parseFloat(pesoCaixa) * 1000
      : parseFloat(pesoCaixa);

    const totalEmGramas = unidadeTotal === 'kg'
      ? parseFloat(pesoTotal) * 1000
      : parseFloat(pesoTotal);

    if (!pecaEmGramas || pecaEmGramas <= 0) {
      alert('Peso da peça deve ser maior que zero');
      return;
    }

    if (!caixaEmGramas || caixaEmGramas < 0) {
      alert('Peso da caixa não pode ser negativo');
      return;
    }

    if (!totalEmGramas || totalEmGramas <= 0) {
      alert('Peso total deve ser maior que zero');
      return;
    }

    if (totalEmGramas <= caixaEmGramas) {
      alert('Peso total deve ser maior que o peso da caixa');
      return;
    }

    const pesoPecasTotal = totalEmGramas - caixaEmGramas;
    const quantidadePecas = Math.floor(pesoPecasTotal / pecaEmGramas);
    const pesoPecasCalculado = quantidadePecas * pecaEmGramas;
    const diferenca = pesoPecasTotal - pesoPecasCalculado;

    const resultadoCalculo = {
      quantidade: quantidadePecas,
      pesoPecasTotal: pesoPecasTotal / 1000,
      pesoPecasCalculado: pesoPecasCalculado / 1000,
      diferenca: diferenca,
      percentualDiferenca: ((diferenca / pesoPecasTotal) * 100).toFixed(2)
    };

    setResultado(resultadoCalculo);

    // Salvar no histórico
    const itemHistorico = {
      id: Date.now(),
      data: new Date().toISOString(),
      pesoPeca: parseFloat(pesoPeca),
      unidadePeca,
      pesoCaixa: parseFloat(pesoCaixa),
      unidadeCaixa,
      pesoTotal: parseFloat(pesoTotal),
      unidadeTotal,
      resultado: resultadoCalculo
    };

    salvarNoHistorico(itemHistorico);
  };

  const limpar = () => {
    setPesoPeca('');
    setPesoCaixa('');
    setPesoTotal('');
    setCaixaSelecionada('');
    setResultado(null);
  };

  const styles = getStyles(darkMode);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={{ ...styles.headerContent, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              onClick={onVoltar}
              style={{ ...styles.logoLink, cursor: 'pointer' }}
              title="Voltar"
            >
              <div style={styles.logo}>⚖️</div>
            </div>
            <div>
              <h1 style={styles.title}>Calculadora de Peças por Peso</h1>
              <p style={styles.subtitle}>
                {usuario?.nome || 'Usuário'} | Calcule quantas peças tem na caixa
              </p>
            </div>
          </div>
          <button
            onClick={() => setDarkMode(!darkMode)}
            style={{
              width: '40px', height: '40px', borderRadius: '8px',
              background: darkMode ? '#374151' : '#f3f4f6',
              border: darkMode ? '1px solid #4b5563' : '1px solid #e5e7eb',
              cursor: 'pointer', fontSize: '18px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.2s'
            }}
            title={darkMode ? 'Modo claro' : 'Modo escuro'}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* Abas */}
      <div style={styles.tabsContainer}>
        <button
          style={{
            ...styles.tab,
            ...(abaAtiva === 'calculadora' ? styles.tabActive : {})
          }}
          onClick={() => setAbaAtiva('calculadora')}
          onMouseEnter={(e) => {
            if (abaAtiva !== 'calculadora') {
              e.target.style.color = '#0ea5e9';
              e.target.style.background = '#f0f9ff';
            }
          }}
          onMouseLeave={(e) => {
            if (abaAtiva !== 'calculadora') {
              e.target.style.color = '#6b7280';
              e.target.style.background = 'transparent';
            }
          }}
        >
          🧮 Calculadora
        </button>
        <button
          style={{
            ...styles.tab,
            ...(abaAtiva === 'caixas' ? styles.tabActive : {})
          }}
          onClick={() => setAbaAtiva('caixas')}
          onMouseEnter={(e) => {
            if (abaAtiva !== 'caixas') {
              e.target.style.color = '#0ea5e9';
              e.target.style.background = '#f0f9ff';
            }
          }}
          onMouseLeave={(e) => {
            if (abaAtiva !== 'caixas') {
              e.target.style.color = '#6b7280';
              e.target.style.background = 'transparent';
            }
          }}
        >
          📦 Gerenciar Caixas ({caixas.length})
        </button>
      </div>

      <main style={styles.main}>
        {/* ABA: CALCULADORA */}
        {abaAtiva === 'calculadora' && (
          <div style={styles.layoutDuasColunas}>
            {/* COLUNA ESQUERDA - FORMULÁRIO */}
            <div style={styles.colunaEsquerda}>
              <div style={styles.cardFormulario}>
                <h3 style={styles.tituloSecao}>
                  <span style={{ fontSize: '24px' }}>🧮</span>
                  Calcular Peças
                </h3>

                <div style={styles.exemploBox}>
                  <div style={styles.exemploIcon}>💡</div>
                  <div style={styles.exemploTexto}>
                    <strong>Exemplo:</strong> Uma peça pesa 3g, a caixa vazia pesa 20kg,
                    e o peso total (caixa + peças) é 23kg. Quantas peças tem?
                  </div>
                </div>

                <div style={styles.form}>
              {/* Peso da peça */}
              <div style={styles.inputGroup}>
                <label style={styles.label}>
                  <span style={styles.labelIcon}>📦</span>
                  Peso de 1 peça
                </label>
                <div style={styles.inputRow}>
                  <input
                    type="number"
                    step="0.001"
                    value={pesoPeca}
                    onChange={(e) => setPesoPeca(e.target.value)}
                    placeholder="Ex: 3"
                    style={styles.input}
                  />
                  <select
                    value={unidadePeca}
                    onChange={(e) => setUnidadePeca(e.target.value)}
                    style={styles.select}
                  >
                    <option value="g">gramas</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>

              {/* Selecionar caixa cadastrada */}
              {caixas.length > 0 && (
                <div style={styles.inputGroup}>
                  <label style={styles.label}>
                    <span style={styles.labelIcon}>📦</span>
                    Selecionar caixa cadastrada (opcional)
                  </label>
                  <select
                    value={caixaSelecionada}
                    onChange={(e) => selecionarCaixaDropdown(e.target.value)}
                    style={styles.select}
                  >
                    <option value="">Nenhuma selecionada</option>
                    {caixas.map((caixa) => (
                      <option key={caixa.id} value={caixa.id}>
                        {caixa.nome} - {caixa.peso} {caixa.unidade}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Peso da caixa vazia */}
              <div style={styles.inputGroup}>
                <label style={styles.label}>
                  <span style={styles.labelIcon}>📦</span>
                  Peso da caixa vazia
                </label>
                <div style={styles.inputRow}>
                  <input
                    type="number"
                    step="0.001"
                    value={pesoCaixa}
                    onChange={(e) => {
                      setPesoCaixa(e.target.value);
                      setCaixaSelecionada(''); // Limpa seleção ao editar manualmente
                    }}
                    placeholder="Ex: 20"
                    style={styles.input}
                  />
                  <select
                    value={unidadeCaixa}
                    onChange={(e) => setUnidadeCaixa(e.target.value)}
                    style={styles.select}
                  >
                    <option value="g">gramas</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>

              {/* Peso total */}
              <div style={styles.inputGroup}>
                <label style={styles.label}>
                  <span style={styles.labelIcon}>⚖️</span>
                  Peso total (caixa + peças)
                </label>
                <div style={styles.inputRow}>
                  <input
                    type="number"
                    step="0.001"
                    value={pesoTotal}
                    onChange={(e) => setPesoTotal(e.target.value)}
                    placeholder="Ex: 23"
                    style={styles.input}
                  />
                  <select
                    value={unidadeTotal}
                    onChange={(e) => setUnidadeTotal(e.target.value)}
                    style={styles.select}
                  >
                    <option value="g">gramas</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>

                  {/* Botões */}
                  <div style={styles.buttonGroup}>
                    <button style={styles.btnCalcular} onClick={calcular}>
                      🧮 Calcular
                    </button>
                    <button style={styles.btnLimpar} onClick={limpar}>
                      🗑️ Limpar
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* COLUNA DIREITA - RESULTADO + HISTÓRICO */}
            <div style={styles.colunaDireita}>
              {/* Resultado Atual */}
              {resultado ? (
                <div style={styles.cardResultado}>
                  <h3 style={styles.tituloSecao}>
                    <span style={{ fontSize: '24px' }}>✅</span>
                    Resultado
                  </h3>

                  <div style={styles.resultadoPrincipal}>
                    <div style={styles.resultadoLabel}>Quantidade de Peças</div>
                    <div style={styles.resultadoValorGrande}>{resultado.quantidade.toLocaleString('pt-BR')}</div>
                  </div>

                  <div style={styles.detalhesGrid}>
                    <div style={styles.detalheCard}>
                      <div style={styles.detalheLabel}>Peso das peças</div>
                      <div style={styles.detalheValor}>{resultado.pesoPecasTotal.toFixed(3)} kg</div>
                    </div>
                    <div style={styles.detalheCard}>
                      <div style={styles.detalheLabel}>Peso calculado</div>
                      <div style={styles.detalheValor}>{resultado.pesoPecasCalculado.toFixed(3)} kg</div>
                    </div>
                    <div style={styles.detalheCard}>
                      <div style={styles.detalheLabel}>Diferença</div>
                      <div style={styles.detalheValor}>
                        {resultado.diferenca.toFixed(1)} g ({resultado.percentualDiferenca}%)
                      </div>
                    </div>
                  </div>

                  {parseFloat(resultado.percentualDiferenca) > 5 && (
                    <div style={styles.alertaBox}>
                      <span style={styles.alertaIcon}>⚠️</span>
                      <span style={styles.alertaTexto}>
                        A diferença é maior que 5%. Verifique os dados inseridos.
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={styles.cardResultadoVazio}>
                  <div style={{ fontSize: '64px', marginBottom: '16px', opacity: 0.3 }}>📊</div>
                  <p style={{ color: '#9ca3af', fontSize: '15px', margin: 0 }}>
                    Preencha os dados e clique em Calcular
                  </p>
                </div>
              )}

              {/* Histórico */}
              <div style={styles.cardHistorico}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={styles.tituloSecao}>
                    <span style={{ fontSize: '20px' }}>📜</span>
                    Histórico
                  </h3>
                  {historico.length > 0 && (
                    <button
                      style={styles.btnLimparHistorico}
                      onClick={limparHistorico}
                      title="Limpar histórico"
                      onMouseEnter={(e) => e.target.style.background = '#fef2f2'}
                      onMouseLeave={(e) => e.target.style.background = 'white'}
                    >
                      🗑️ Limpar
                    </button>
                  )}
                </div>

                {historico.length === 0 ? (
                  <div style={styles.historicoVazio}>
                    <div style={{ fontSize: '48px', marginBottom: '12px', opacity: 0.3 }}>📜</div>
                    <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>
                      Nenhum cálculo realizado ainda
                    </p>
                  </div>
                ) : (
                  <div style={styles.historicoLista}>
                    {historico.map((item, index) => (
                      <div
                        key={item.id}
                        style={styles.historicoItem}
                        onClick={() => carregarDoHistorico(item)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = darkMode ? '#1e3a5f' : '#e0f2fe';
                          e.currentTarget.style.borderColor = '#0ea5e9';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = darkMode ? '0 4px 12px rgba(14, 165, 233, 0.25)' : '0 4px 12px rgba(14, 165, 233, 0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = darkMode ? '#374151' : '#f9fafb';
                          e.currentTarget.style.borderColor = darkMode ? '#4b5563' : '#e5e7eb';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <div style={styles.historicoHeader}>
                          <span style={styles.historicoNumero}>#{historico.length - index}</span>
                          <span style={styles.historicoData}>
                            {new Date(item.data).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <div style={styles.historicoResultado}>
                          <span style={styles.historicoQuantidade}>
                            {item.resultado.quantidade.toLocaleString('pt-BR')} peças
                          </span>
                          <span style={styles.historicoPeso}>
                            {item.pesoPeca} {item.unidadePeca} / peça
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ABA: GERENCIAR CAIXAS */}
        {abaAtiva === 'caixas' && (
          <div style={styles.cardPrincipal}>
            <div style={styles.caixasHeader}>
              <h3 style={styles.caixasTitle}>📦 Caixas Cadastradas</h3>
              <button style={styles.btnNovaCaixa} onClick={abrirModalNovaCaixa}>
                + Nova Caixa
              </button>
            </div>

            {caixas.length === 0 ? (
              <div style={styles.emptyCaixas}>
                <div style={styles.emptyIcon}>📦</div>
                <p style={styles.emptyText}>Nenhuma caixa cadastrada ainda</p>
                <button style={styles.btnNovaCaixaEmpty} onClick={abrirModalNovaCaixa}>
                  + Cadastrar Primeira Caixa
                </button>
              </div>
            ) : (
              <div style={styles.caixasGrid}>
                {caixas.map((caixa) => (
                  <div key={caixa.id} style={styles.caixaCard}>
                    <div style={styles.caixaIcone}>📦</div>
                    <div style={styles.caixaInfo}>
                      <div style={styles.caixaNome}>{caixa.nome}</div>
                      <div style={styles.caixaPeso}>
                        {caixa.peso} {caixa.unidade}
                      </div>
                    </div>
                    <div style={styles.caixaActions}>
                      <button style={styles.btnEditar} onClick={() => abrirModalEditarCaixa(caixa)}>
                        ✏️ Editar
                      </button>
                      <button style={styles.btnExcluir} onClick={() => excluirCaixa(caixa.id)}>
                        🗑️ Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal de Caixa */}
      {modalCaixaAberto && (
        <div style={styles.modalOverlay} onClick={fecharModalCaixa}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>
                {caixaEditando ? 'Editar Caixa' : 'Nova Caixa'}
              </h3>
              <button style={styles.closeButton} onClick={fecharModalCaixa}>×</button>
            </div>
            <form onSubmit={salvarCaixa} style={styles.modalForm}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Nome da Caixa</label>
                <input
                  type="text"
                  value={formNomeCaixa}
                  onChange={(e) => setFormNomeCaixa(e.target.value)}
                  placeholder="Ex: Caixa Padrão 20kg"
                  style={styles.input}
                  required
                />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Peso</label>
                <div style={styles.inputRow}>
                  <input
                    type="number"
                    step="0.001"
                    value={formPesoCaixa}
                    onChange={(e) => setFormPesoCaixa(e.target.value)}
                    placeholder="Ex: 20"
                    style={styles.input}
                    required
                  />
                  <select
                    value={formUnidadeCaixa}
                    onChange={(e) => setFormUnidadeCaixa(e.target.value)}
                    style={styles.select}
                  >
                    <option value="g">gramas</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>
              <div style={styles.modalActions}>
                <button type="button" style={styles.btnCancelar} onClick={fecharModalCaixa}>
                  Cancelar
                </button>
                <button type="submit" style={styles.btnSalvar}>
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const getStyles = (dark) => ({
  container: {
    minHeight: '100vh',
    background: dark ? '#111827' : 'linear-gradient(180deg, #f8fbff 0%, #f6f8fb 100%)',
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    padding: '20px',
    color: dark ? '#f3f4f6' : 'inherit',
    transition: 'background 0.3s, color 0.3s'
  },
  header: {
    maxWidth: '1400px',
    margin: '0 auto 24px'
  },
  headerContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  },
  logoLink: {
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'transform 0.2s'
  },
  logo: {
    width: '64px',
    height: '64px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '32px',
    boxShadow: '0 6px 20px rgba(56, 189, 248, 0.3)',
    transition: 'transform 0.2s'
  },
  title: {
    fontSize: '28px',
    margin: 0,
    color: dark ? '#f3f4f6' : '#0f172a',
    fontWeight: '700'
  },
  subtitle: {
    margin: '4px 0 0 0',
    color: dark ? '#9ca3af' : '#6b7280',
    fontSize: '14px'
  },
  tabsContainer: {
    maxWidth: '1400px',
    margin: '0 auto 24px',
    display: 'flex',
    gap: '8px',
    borderBottom: dark ? '2px solid #374151' : '2px solid #e5e7eb'
  },
  tab: {
    padding: '12px 24px',
    border: 'none',
    background: 'transparent',
    color: dark ? '#9ca3af' : '#6b7280',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    borderBottom: '3px solid transparent',
    transition: 'all 0.2s',
    marginBottom: '-2px'
  },
  tabActive: {
    color: '#0ea5e9',
    borderBottomColor: '#0ea5e9'
  },
  main: {
    maxWidth: '1400px',
    margin: '0 auto'
  },
  layoutDuasColunas: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
    alignItems: 'start'
  },
  colunaEsquerda: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  colunaDireita: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    position: 'sticky',
    top: '20px'
  },
  cardFormulario: {
    background: dark ? '#1f2937' : '#ffffff',
    borderRadius: '16px',
    boxShadow: dark ? '0 6px 18px rgba(0,0,0,0.3)' : '0 6px 18px rgba(16, 24, 40, 0.08)',
    padding: '28px',
    border: dark ? '2px solid #374151' : '2px solid #e0f2fe'
  },
  cardResultado: {
    background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
    borderRadius: '16px',
    boxShadow: '0 6px 18px rgba(16, 185, 129, 0.15)',
    padding: '28px',
    border: '2px solid #22c55e',
    animation: 'fadeInScale 0.4s ease-out'
  },
  cardResultadoVazio: {
    background: dark ? '#1f2937' : '#ffffff',
    borderRadius: '16px',
    boxShadow: dark ? '0 6px 18px rgba(0,0,0,0.3)' : '0 6px 18px rgba(16, 24, 40, 0.08)',
    padding: '60px 28px',
    textAlign: 'center',
    border: dark ? '2px dashed #4b5563' : '2px dashed #e5e7eb'
  },
  cardHistorico: {
    background: dark ? '#1f2937' : '#ffffff',
    borderRadius: '16px',
    boxShadow: dark ? '0 6px 18px rgba(0,0,0,0.3)' : '0 6px 18px rgba(16, 24, 40, 0.08)',
    padding: '24px',
    border: dark ? '2px solid #374151' : '2px solid #e0f2fe'
  },
  tituloSecao: {
    fontSize: '18px',
    fontWeight: '700',
    color: dark ? '#f3f4f6' : '#0f172a',
    margin: '0 0 20px 0',
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  cardPrincipal: {
    background: dark ? '#1f2937' : '#ffffff',
    borderRadius: '16px',
    boxShadow: dark ? '0 6px 18px rgba(0,0,0,0.3)' : '0 6px 18px rgba(16, 24, 40, 0.08)',
    padding: '32px'
  },
  exemploBox: {
    background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
    borderRadius: '12px',
    padding: '16px 20px',
    marginBottom: '32px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    border: '2px solid #fbbf24'
  },
  exemploIcon: {
    fontSize: '24px',
    flexShrink: 0
  },
  exemploTexto: {
    fontSize: '14px',
    color: '#78350f',
    lineHeight: '1.5'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  label: {
    fontSize: '15px',
    fontWeight: '600',
    color: dark ? '#d1d5db' : '#374151',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  labelIcon: {
    fontSize: '18px'
  },
  inputRow: {
    display: 'flex',
    gap: '12px'
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    fontSize: '16px',
    border: dark ? '2px solid #4b5563' : '2px solid #e5e7eb',
    borderRadius: '8px',
    outline: 'none',
    transition: 'border-color 0.2s',
    fontFamily: 'inherit',
    background: dark ? '#374151' : '#ffffff',
    color: dark ? '#f3f4f6' : '#111827'
  },
  select: {
    padding: '12px 16px',
    fontSize: '16px',
    border: dark ? '2px solid #4b5563' : '2px solid #e5e7eb',
    borderRadius: '8px',
    outline: 'none',
    cursor: 'pointer',
    background: dark ? '#374151' : 'white',
    color: dark ? '#f3f4f6' : '#111827',
    fontFamily: 'inherit',
    minWidth: '110px'
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px'
  },
  btnCalcular: {
    flex: 1,
    padding: '14px 24px',
    border: 'none',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)',
    color: 'white',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 12px rgba(56, 189, 248, 0.3)'
  },
  btnLimpar: {
    padding: '14px 24px',
    border: '2px solid #d1d5db',
    borderRadius: '10px',
    background: 'white',
    color: '#6b7280',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  resultadoBox: {
    marginTop: '32px',
    padding: '24px',
    background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
    borderRadius: '12px',
    border: '2px solid #22c55e'
  },
  resultadoPrincipal: {
    textAlign: 'center',
    padding: '20px',
    background: 'white',
    borderRadius: '12px',
    marginBottom: '20px',
    border: '1px solid #bbf7d0'
  },
  resultadoIcone: {
    fontSize: '48px'
  },
  resultadoLabel: {
    fontSize: '13px',
    color: '#166534',
    fontWeight: '600',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  resultadoValor: {
    fontSize: '42px',
    fontWeight: '700',
    color: '#166534'
  },
  resultadoValorGrande: {
    fontSize: '52px',
    fontWeight: '800',
    color: '#15803d',
    lineHeight: '1',
    background: 'linear-gradient(135deg, #15803d, #166534)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  detalhesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '12px',
    marginBottom: '16px'
  },
  detalheCard: {
    background: 'white',
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid #bbf7d0'
  },
  detalheLabel: {
    fontSize: '12px',
    color: '#166534',
    marginBottom: '4px'
  },
  detalheValor: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#15803d'
  },
  alertaBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    background: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: '8px'
  },
  alertaIcon: {
    fontSize: '18px'
  },
  alertaTexto: {
    fontSize: '13px',
    color: '#991b1b',
    fontWeight: '500'
  },
  caixasHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '12px'
  },
  caixasTitle: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#0f172a',
    margin: 0
  },
  btnNovaCaixa: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 2px 8px rgba(56, 189, 248, 0.3)'
  },
  emptyCaixas: {
    textAlign: 'center',
    padding: '60px 24px'
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '16px'
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: '16px',
    marginBottom: '24px'
  },
  btnNovaCaixaEmpty: {
    padding: '12px 24px',
    border: 'none',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)',
    color: 'white',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(56, 189, 248, 0.3)'
  },
  caixasGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px'
  },
  caixaCard: {
    padding: '20px',
    border: '2px solid #e5e7eb',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    transition: 'all 0.2s',
    background: '#fafafa'
  },
  caixaIcone: {
    fontSize: '32px'
  },
  caixaInfo: {
    flex: 1
  },
  caixaNome: {
    fontSize: '17px',
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: '6px'
  },
  caixaPeso: {
    fontSize: '15px',
    color: '#6b7280',
    fontWeight: '600'
  },
  caixaActions: {
    display: 'flex',
    gap: '8px'
  },
  btnEditar: {
    flex: 1,
    padding: '8px 16px',
    border: 'none',
    borderRadius: '8px',
    background: '#3b82f6',
    color: 'white',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  btnExcluir: {
    flex: 1,
    padding: '8px 16px',
    border: 'none',
    borderRadius: '8px',
    background: '#ef4444',
    color: 'white',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
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
    zIndex: 1000
  },
  modal: {
    background: '#ffffff',
    borderRadius: '16px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
    width: '90%',
    maxWidth: '500px'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
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
  modalForm: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    paddingTop: '8px'
  },
  btnCancelar: {
    padding: '10px 20px',
    border: '2px solid #d1d5db',
    borderRadius: '8px',
    background: 'white',
    color: '#6b7280',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  btnSalvar: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(56, 189, 248, 0.3)'
  },
  btnLimparHistorico: {
    padding: '6px 14px',
    border: '2px solid #ef4444',
    borderRadius: '6px',
    background: 'white',
    color: '#ef4444',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  historicoVazio: {
    textAlign: 'center',
    padding: '40px 20px',
    borderRadius: '8px',
    background: dark ? '#374151' : '#f9fafb'
  },
  historicoLista: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxHeight: '400px',
    overflowY: 'auto'
  },
  historicoItem: {
    padding: '14px',
    background: dark ? '#374151' : '#f9fafb',
    borderRadius: '10px',
    border: dark ? '2px solid #4b5563' : '2px solid #e5e7eb',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  historicoHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px'
  },
  historicoNumero: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#0ea5e9',
    background: dark ? '#0c4a6e' : '#e0f2fe',
    padding: '3px 10px',
    borderRadius: '12px'
  },
  historicoData: {
    fontSize: '11px',
    color: dark ? '#9ca3af' : '#6b7280',
    fontWeight: '600'
  },
  historicoResultado: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  historicoQuantidade: {
    fontSize: '15px',
    fontWeight: '700',
    color: dark ? '#f3f4f6' : '#0f172a'
  },
  historicoPeso: {
    fontSize: '12px',
    color: dark ? '#9ca3af' : '#6b7280',
    fontWeight: '500'
  }
});

// Adiciona animação
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    @keyframes fadeInScale {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
  `;
  if (!document.head.querySelector('style[data-calculadora-styles]')) {
    styleSheet.setAttribute('data-calculadora-styles', 'true');
    document.head.appendChild(styleSheet);
  }
}

export default CalculadoraPecas;
