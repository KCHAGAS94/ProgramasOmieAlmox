function SeletorCategoria({ produtoId, categoriaAtual, categorias, onMudarCategoria }) {
  const handleChange = async (e) => {
    const novaCategoriaId = e.target.value === '' ? null : parseInt(e.target.value);
    await onMudarCategoria(produtoId, novaCategoriaId);
  };

  return (
    <select
      value={categoriaAtual || ''}
      onChange={handleChange}
      style={{
        fontSize: '11px',
        padding: '4px 6px',
        borderRadius: '6px',
        border: '1px solid var(--border)',
        background: 'var(--input-bg)',
        color: 'var(--text)',
        cursor: 'pointer',
        maxWidth: '100px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      <option value="">Sem Categoria</option>
      {categorias
        .filter((c) => c.nome !== 'Sem Categoria')
        .map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.nome}
          </option>
        ))}
    </select>
  );
}

export default SeletorCategoria;
