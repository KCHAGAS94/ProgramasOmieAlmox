import { useState, useRef, useEffect } from 'react';
import { produtoService } from '../services/api';
import SeletorCategoria from './SeletorCategoria';

const AUTO_SAVE_MS = 800;

function TabelaProdutos({ produtos, onAtualizar, categorias, editando, setEditando, ordenar, onOrdenar }) {
  const [filtros, setFiltros] = useState({ codigo: '', aba: '', observacao: '' });
  const [statusAuto, setStatusAuto] = useState({}); // { [id]: 'salvando' | 'salvo' | 'erro' }
  const timersRef = useRef({});
  const editandoRef = useRef(editando);

  // Mantém ref sincronizada para que o timer de debounce leia o valor mais recente
  useEffect(() => { editandoRef.current = editando; }, [editando]);

  // Limpa timers pendentes ao desmontar
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(t => clearTimeout(t));
    };
  }, []);

  const cancelarTimer = (id) => {
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  };

  const salvarAuto = async (id) => {
    const dados = editandoRef.current[id];
    if (!dados || Object.keys(dados).length === 0) return;
    setStatusAuto((prev) => ({ ...prev, [id]: 'salvando' }));
    try {
      await produtoService.atualizar(id, dados);
      setStatusAuto((prev) => ({ ...prev, [id]: 'salvo' }));
      onAtualizar(true); // recarrega em silêncio (sem mostrar "Carregando produtos...")
      // Some o "salvo" depois de 1.5s
      setTimeout(() => {
        setStatusAuto((prev) => {
          if (prev[id] !== 'salvo') return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 1500);
    } catch (error) {
      console.error('[AUTO-SAVE] erro:', error.response?.data || error.message);
      setStatusAuto((prev) => ({ ...prev, [id]: 'erro' }));
    }
  };

  const handleSalvar = async (id) => {
    cancelarTimer(id);
    try {
      const dados = editando[id];
      if (!dados) return;
      const tamanhoBytes = JSON.stringify(dados).length;
      const tamanhoKB = (tamanhoBytes / 1024).toFixed(2);
      console.log(`[SALVAR] Produto ID ${id} - Tamanho: ${tamanhoBytes} bytes (${tamanhoKB} KB)`);
      console.log('[SALVAR] Dados:', dados);

      await produtoService.atualizar(id, dados);
      alert('Produto atualizado com sucesso!');

      // Limpa o state editando após salvar
      setEditando((prev) => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
      setStatusAuto((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      onAtualizar();
    } catch (error) {
      console.error('[ERRO SALVAR] Status:', error.response?.status);
      console.error('[ERRO SALVAR] Mensagem:', error.message);
      console.error('[ERRO SALVAR] Response:', error.response?.data);
      console.error('[ERRO SALVAR] Headers:', error.response?.headers);
      alert('Erro ao atualizar produto: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleExcluir = async (id) => {
    if (!window.confirm('Excluir produto?')) return;
    try {
      await produtoService.excluir(id);
      alert('Produto excluído com sucesso!');
      onAtualizar();
    } catch (error) {
      alert('Erro ao excluir produto: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleMoverCima = async (id) => {
    try {
      await produtoService.moverCima(id);
      onAtualizar();
    } catch (error) {
      alert('Erro ao mover produto: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleMoverBaixo = async (id) => {
    try {
      await produtoService.moverBaixo(id);
      onAtualizar();
    } catch (error) {
      alert('Erro ao mover produto: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleMudarCategoria = async (id, novaCategoriaId) => {
    try {
      await produtoService.atualizar(id, { categoria_id: novaCategoriaId });
      onAtualizar();
    } catch (error) {
      alert('Erro ao mudar categoria: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleChange = (id, campo, valor) => {
    setEditando((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [campo]: valor,
      },
    }));

    // Agenda salvamento automático (debounce — só dispara após 800ms sem novas mudanças)
    cancelarTimer(id);
    timersRef.current[id] = setTimeout(() => {
      delete timersRef.current[id];
      salvarAuto(id);
    }, AUTO_SAVE_MS);
  };

  const getValor = (produto, campo) => {
    // Retorna o valor do state editando se existir, senão retorna o valor do produto
    if (editando[produto.id] && editando[produto.id][campo] !== undefined) {
      return editando[produto.id][campo];
    }
    // Retorna o valor do produto, ou '' se for null/undefined
    // Importante: não usar || pois 0 é um valor válido
    const valorProduto = produto[campo];
    return valorProduto !== null && valorProduto !== undefined ? valorProduto : '';
  };

  const calcularSituacao = (produto) => {
    const estoque = produto.estoque || 0;
    const previsaoSaida = produto.previsao_saida || 0;
    const estoqueLiquido = estoque - previsaoSaida;
    // Usa o valor editando se existir, senão usa o do banco
    let minimo = produto.estoque_minimo || 0;
    if (editando[produto.id] && editando[produto.id].estoque_minimo !== undefined) {
      minimo = parseInt(editando[produto.id].estoque_minimo) || 0;
    }

    // Se não tem mínimo definido, retorna N/A
    if (minimo === 0) {
      return '-';
    }

    // Calcula total de meses disponíveis
    // estoque_minimo = 2 meses de consumo
    // meses disponíveis = ((estoque - previsao_saida) / estoque_minimo) * 2
    const meses = (estoqueLiquido / minimo) * 2;

    // Formata com 1 casa decimal
    return `${meses.toFixed(1)} meses`;
  };

  const getSituacaoClass = (produto) => {
    const estoque = produto.estoque || 0;
    const previsaoSaida = produto.previsao_saida || 0;
    const estoqueLiquido = estoque - previsaoSaida;
    // Usa o valor editando se existir, senão usa o do banco
    let minimo = produto.estoque_minimo || 0;
    if (editando[produto.id] && editando[produto.id].estoque_minimo !== undefined) {
      minimo = parseInt(editando[produto.id].estoque_minimo) || 0;
    }

    // Se não tem mínimo definido, retorna amarelo
    if (minimo === 0) {
      return 'sit-yellow';
    }

    // Calcula os meses disponíveis com base no estoque líquido
    const meses = (estoqueLiquido / minimo) * 2;

    // Vermelho: < 2 meses disponíveis (abaixo do mínimo)
    // Verde: >= 2 meses disponíveis (no mínimo ou acima)
    if (meses < 2) return 'sit-red';
    return 'sit-green';
  };

  if (produtos.length === 0) {
    return (
      <div className="muted" style={{ textAlign: 'center', padding: '20px' }}>
        Nenhum produto cadastrado ainda.
      </div>
    );
  }

  return (
    <table style={{ tableLayout: 'fixed', width: '100%' }}>
      <colgroup>
        <col style={{ width: '200px' }} />
        <col style={{ width: '110px' }} />
        <col style={{ width: '90px' }} />
        <col style={{ width: '95px' }} />
        <col style={{ width: '110px' }} />
        <col style={{ width: '120px' }} />
        <col style={{ width: '130px' }} />
        <col style={{ width: '200px' }} />
        <col style={{ width: '110px' }} />
      </colgroup>
      <thead>
        <tr>
          <th className="text-center">Produto Acabado</th>
          <th>Aba</th>
          <th>Estoque Acabado</th>
          <th>Previsão Saída</th>
          <th>Estoque Mínimo (2 meses)</th>
          <th>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer',
                userSelect: 'none'
              }}
              onClick={onOrdenar}
              title={ordenar === 'situacao' ? 'Voltar à ordem original' : 'Ordenar por situação (pior → melhor)'}
            >
              Situação Estoque
              <span style={{ fontSize: '14px' }}>
                {ordenar === 'situacao' ? '🔽' : '⚪'}
              </span>
            </div>
          </th>
          <th>Previsão Reabastecimento</th>
          <th>Observação</th>
          <th className="text-center">Ações</th>
        </tr>
        <tr>
          <th style={{ padding: '4px 6px' }}>
            <input type="text" placeholder="Filtrar..." value={filtros.codigo} onChange={(e) => setFiltros({ ...filtros, codigo: e.target.value })} style={{ width: '100%', fontSize: '11px', padding: '4px 6px', fontWeight: 400 }} />
          </th>
          <th style={{ padding: '4px 6px' }}>
            <input type="text" placeholder="Filtrar..." value={filtros.aba} onChange={(e) => setFiltros({ ...filtros, aba: e.target.value })} style={{ width: '100%', fontSize: '11px', padding: '4px 6px', fontWeight: 400 }} />
          </th>
          <th style={{ padding: '4px 6px' }}></th>
          <th style={{ padding: '4px 6px' }}></th>
          <th style={{ padding: '4px 6px' }}></th>
          <th style={{ padding: '4px 6px' }}></th>
          <th style={{ padding: '4px 6px' }}></th>
          <th style={{ padding: '4px 6px' }}>
            <input type="text" placeholder="Filtrar..." value={filtros.observacao} onChange={(e) => setFiltros({ ...filtros, observacao: e.target.value })} style={{ width: '100%', fontSize: '11px', padding: '4px 6px', fontWeight: 400 }} />
          </th>
          <th style={{ padding: '4px 6px' }}></th>
        </tr>
      </thead>
      <tbody>
        {produtos.filter((produto) => {
          const buscaCodigo = filtros.codigo.toLowerCase();
          const buscaAba = filtros.aba.toLowerCase();
          const buscaObs = filtros.observacao.toLowerCase();

          if (buscaCodigo) {
            const matchCodigo = (produto.codigo || '').toLowerCase().includes(buscaCodigo);
            const matchNome = (produto.nome || '').toLowerCase().includes(buscaCodigo);
            if (!matchCodigo && !matchNome) return false;
          }

          if (buscaAba) {
            const nomeCat = (categorias || []).find(c => c.id === produto.categoria_id)?.nome || 'Sem Categoria';
            if (!nomeCat.toLowerCase().includes(buscaAba)) return false;
          }

          if (buscaObs) {
            const obs = (editando[produto.id]?.observacao !== undefined ? editando[produto.id].observacao : produto.observacao || '').toLowerCase();
            if (!obs.includes(buscaObs)) return false;
          }

          return true;
        }).map((produto) => (
          <tr key={produto.id}>
            <td>
              <div className="codigo-produto" style={{ maxWidth: '220px', margin: '0 auto' }}>
                {produto.codigo}
              </div>
              <div
                style={{
                  fontSize: '12.5px',
                  color: 'var(--muted)',
                  marginTop: '3px',
                  wordWrap: 'break-word',
                  textAlign: 'center',
                }}
              >
                {produto.nome}
              </div>
            </td>
            <td>
              <SeletorCategoria
                produtoId={produto.id}
                categoriaAtual={produto.categoria_id}
                categorias={categorias || []}
                onMudarCategoria={handleMudarCategoria}
              />
            </td>
            <td style={{ fontSize: '14px' }}>{produto.estoque}</td>
            <td style={{ fontSize: '14px' }}>{produto.previsao_saida ?? 0}</td>
            <td>
              <input
                type="number"
                step="1"
                value={getValor(produto, 'estoque_minimo')}
                onChange={(e) => handleChange(produto.id, 'estoque_minimo', e.target.value)}
                style={{
                  width: '90px',
                  textAlign: 'right',
                  fontSize: '12px',
                  padding: '4px 6px',
                  fontWeight: 600,
                }}
              />
            </td>
            <td>
              <span className={getSituacaoClass(produto)}>{calcularSituacao(produto)}</span>
            </td>
            <td>
              <input
                type="date"
                value={getValor(produto, 'previsao_reposicao')}
                onChange={(e) => handleChange(produto.id, 'previsao_reposicao', e.target.value)}
                style={{ width: '130px', fontSize: '12.5px', fontWeight: 600 }}
              />
            </td>
            <td>
              <input
                type="text"
                placeholder="Observação..."
                value={getValor(produto, 'observacao')}
                onChange={(e) => handleChange(produto.id, 'observacao', e.target.value)}
                style={{ width: '100%', fontSize: '12.5px', fontWeight: 600 }}
              />
            </td>
            <td className="text-center">
              <div style={{ display: 'flex', gap: '2px', alignItems: 'center', justifyContent: 'center' }}>
                {statusAuto[produto.id] === 'salvando' && (
                  <span
                    title="Salvando automaticamente..."
                    style={{ fontSize: '11px', color: '#f59e0b', marginRight: '2px' }}
                  >
                    ⏳
                  </span>
                )}
                {statusAuto[produto.id] === 'salvo' && (
                  <span
                    title="Salvo automaticamente"
                    style={{ fontSize: '11px', color: '#10b981', marginRight: '2px', fontWeight: 700 }}
                  >
                    ✓
                  </span>
                )}
                {statusAuto[produto.id] === 'erro' && (
                  <span
                    title="Erro ao salvar automaticamente — clique no botão verde para tentar de novo"
                    style={{ fontSize: '11px', color: '#ef4444', marginRight: '2px', fontWeight: 700 }}
                  >
                    ⚠
                  </span>
                )}
                <button
                  onClick={() => handleSalvar(produto.id)}
                  style={{
                    width: '24px',
                    height: '24px',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = '#059669';
                    e.target.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = '#10b981';
                    e.target.style.transform = 'scale(1)';
                  }}
                  title="Salvar alterações"
                >
                  ✓
                </button>
                <button
                  onClick={() => handleMoverCima(produto.id)}
                  style={{
                    width: '24px',
                    height: '24px',
                    background: '#6366f1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '13px',
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
                  onClick={() => handleMoverBaixo(produto.id)}
                  style={{
                    width: '24px',
                    height: '24px',
                    background: '#6366f1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '13px',
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
                <button
                  onClick={() => handleExcluir(produto.id)}
                  style={{
                    width: '24px',
                    height: '24px',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
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
                  title="Excluir produto"
                >
                  🗑️
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default TabelaProdutos;
