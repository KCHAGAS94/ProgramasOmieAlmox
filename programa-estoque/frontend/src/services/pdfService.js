import jsPDF from 'jspdf';
import 'jspdf-autotable';

export function exportarProdutosCriticos(produtos) {
  // Filtra apenas produtos com menos de 2 meses de estoque (vermelho)
  const produtosCriticos = produtos.filter((p) => {
    const estoque = p.estoque || 0;
    const minimo = p.estoque_minimo || 0;
    if (minimo === 0) return false;

    // Calcula meses disponíveis
    const meses = (estoque / minimo) * 2;

    return meses < 2;
  });

  if (produtosCriticos.length === 0) {
    alert('Não há produtos com menos de 2 meses de estoque para exportar!');
    return;
  }

  const doc = new jsPDF('landscape'); // Orientação horizontal
  const hoje = new Date();
  const dataFormatada = hoje.toLocaleDateString('pt-BR');

  // Título
  doc.setFontSize(16);
  doc.text('Gestão de Estoque - Produtos Críticos', 14, 15);

  doc.setFontSize(10);
  doc.text(`Produtos com menos de 2 meses de estoque`, 14, 22);
  doc.text(`Data: ${dataFormatada}`, 14, 27);

  // Prepara dados para a tabela
  const tableData = produtosCriticos.map((produto) => {
    const estoque = produto.estoque || 0;
    const minimo = produto.estoque_minimo || 0;
    const meses = minimo > 0 ? (estoque / minimo) * 2 : 0;

    return [
      produto.codigo,
      produto.nome.length > 40 ? produto.nome.substring(0, 40) + '...' : produto.nome,
      estoque,
      minimo,
      `${meses.toFixed(1)} meses`,
      produto.previsao_reposicao || '-',
      produto.observacao || '-',
    ];
  });

  // Adiciona tabela
  doc.autoTable({
    startY: 32,
    head: [['Código', 'Produto', 'Estoque', 'Mínimo (2m)', 'Meses Disp.', 'Previsão', 'Obs']],
    body: tableData,
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [220, 38, 38], // Vermelho
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 35 }, // Código
      1: { cellWidth: 80 }, // Produto
      2: { cellWidth: 25, halign: 'center' }, // Estoque
      3: { cellWidth: 30, halign: 'center' }, // Mínimo
      4: { cellWidth: 30, halign: 'center' }, // Saldo
      5: { cellWidth: 35 }, // Previsão
      6: { cellWidth: 'auto' }, // Obs
    },
    margin: { top: 32 },
  });

  // Adiciona resumo no final
  const finalY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(10);
  doc.text(`Total de produtos críticos: ${produtosCriticos.length}`, 14, finalY);

  // Salva o PDF
  const nomeArquivo = `estoque-critico-${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}.pdf`;
  doc.save(nomeArquivo);
}
