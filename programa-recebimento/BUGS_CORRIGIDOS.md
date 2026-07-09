# 🐛 Bugs Corrigidos - Sistema de Recebimento

Documentação de todos os bugs identificados e corrigidos no sistema.

---

## 📦 Bug #1: Quantidade Esperada Soma Múltiplas NFes na Contagem Física

**Data:** 2026-02-13
**Módulo:** Conferência Física
**Severidade:** 🔴 Alta
**Status:** ✅ Corrigido

### Descrição do Problema

Quando um produto aparece em múltiplas Notas Fiscais e o usuário clica para fazer a contagem física de um item específico de UMA NFe, o modal de contagem exibia a quantidade esperada como a **soma de todas as NFes**, ao invés de mostrar apenas a quantidade da NFe específica sendo conferida.

### Exemplo do Bug

**Cenário:**
- Produto: `4830075 - CABO USB-USB-C 1,2M PVC PRETO EUAC 12PP`
- NFe 317132: 480 peças
- NFe XXXXX: 10 peças
- **Total:** 490 peças

**Comportamento Incorreto:**
- Na tabela de conferência, mostrava: `480 PEÇ` ✅ (correto)
- Ao clicar no item da NFe 317132, o modal mostrava: `Esperado: 490 UND` ❌ (errado - soma das duas NFes)

**Comportamento Esperado:**
- Ao clicar no item da NFe 317132, deveria mostrar: `Esperado: 480 UND` ✅

### Causa Raiz

No arquivo [App.jsx:2570](frontend/src/App.jsx#L2570), quando havia conversão de unidade configurada, o código estava usando:

```javascript
qtdEsperada = itemComparacao.qtdNFe; // ❌ Quantidade agregada de TODAS as NFes
```

O `itemComparacao.qtdNFe` continha a soma agregada de todas as NFes com aquele código de produto, e não a quantidade específica da NFe sendo conferida.

### Solução Implementada

**Arquivo:** `frontend/src/App.jsx`
**Linhas:** 2566-2580

Modificado o código para buscar a quantidade específica dentro do array `detalhesNFes`:

```javascript
if (itemComparacao) {
  fatorConversao = itemComparacao.fatorConversao;
  unidadePedido = itemComparacao.unidade;

  // ✅ Busca a quantidade específica desta NFe (não o total agregado)
  const detalheNFe = itemComparacao.detalhesNFes?.find(
    d => d.numero_nfe === nfe.numero_nfe && d.codigo_nfe === item.codigo
  );

  if (detalheNFe && fatorConversao) {
    // Se há conversão, aplica o fator na quantidade da NFe específica
    qtdEsperada = detalheNFe.qtd * fatorConversao;
  } else if (detalheNFe) {
    // Sem conversão, usa a quantidade da NFe específica
    qtdEsperada = detalheNFe.qtd;
  }

  qtdFisicaConvertida = qtdFisica;
}
```

### Resultado

✅ Agora o modal de contagem física mostra apenas a quantidade da NFe específica que está sendo conferida
✅ NFe 317132 → Esperado: 480 UND
✅ Outras NFes do mesmo produto → Esperado: quantidade específica daquela NFe

### Impacto

- **Antes:** Conferentes podiam contar a quantidade errada, causando divergências
- **Depois:** Cada NFe mostra sua quantidade correta, facilitando a conferência precisa

---

## 📋 Bug #2: Coluna de Observação Não Aparece na Tabela de Requisições

**Data:** 2026-02-13
**Módulo:** Requisição de Material
**Severidade:** 🟡 Média
**Status:** ✅ Corrigido

### Descrição do Problema

Na tabela de requisições de material, a coluna **Observação** não estava sendo exibida, mesmo que as requisições tivessem observações cadastradas. Essa informação é importante para os usuários entenderem o contexto de cada requisição.

### Exemplo do Bug

**Tabela antes da correção:**
```
ID | Data | Produtos | Local | OP | Status | Solicitante | Ações
```

**Comportamento:** A observação da requisição não era visível na tabela principal, forçando o usuário a abrir os detalhes para ver essa informação importante.

### Causa Raiz

**Problema 1:** Coluna não existia na tabela
- No arquivo `programa-requisicao-material/frontend/src/App.jsx`, faltava a coluna de observação
- **Linhas 588-597 (thead):** Faltava `<th>Observação</th>`
- **Linha 718 (tbody):** Faltava `<td>` correspondente

**Problema 2:** Inconsistência de nomenclatura entre frontend e backend
- **Frontend (linha 273):** Enviava como `motivo`
- **Backend (linha 173):** Salvava como `motivo`
- **Frontend (linha 721):** Tentava ler como `observacao` ❌

Esta inconsistência fazia com que mesmo após adicionar a coluna, os dados não aparecessem.

### Solução Implementada

**Arquivo:** `programa-requisicao-material/frontend/src/App.jsx`

#### 1. Adicionado cabeçalho da coluna (thead):
```javascript
<tr>
  <th style={styles.th}>ID</th>
  <th style={styles.th}>Data</th>
  <th style={styles.th}>Produtos</th>
  <th style={styles.th}>Local</th>
  <th style={styles.th}>OP</th>
  <th style={styles.th}>Status</th>
  <th style={styles.th}>Solicitante</th>
  <th style={styles.th}>Observação</th>  {/* ✅ NOVA COLUNA */}
  <th style={styles.th}>Ações</th>
</tr>
```

#### 2. Adicionado célula no corpo da tabela (tbody):
```javascript
<td style={styles.td}>{req.solicitante_nome}</td>
<td style={styles.td}>
  <div style={{
    fontSize: '12px',
    color: '#6b7280',
    fontStyle: req.motivo ? 'normal' : 'italic'  // ✅ Corrigido: req.motivo (não req.observacao)
  }}>
    {req.motivo || '-'}  // ✅ Lê do campo correto: motivo
  </div>
</td>
<td style={styles.td}>
  {/* Ações... */}
</td>
```

#### 3. Corrigido inconsistência de nomenclatura:
**Antes:**
```javascript
{req.observacao || '-'}  // ❌ Campo não existe no objeto
```

**Depois:**
```javascript
{req.motivo || '-'}  // ✅ Campo correto que vem do backend
```

### Resultado

✅ Coluna "Observação" agora é exibida na tabela
✅ Mostra o texto da observação quando existe
✅ Mostra "-" em itálico quando não há observação
✅ Coluna posicionada entre "Solicitante" e "Ações"

**Nova estrutura da tabela:**
```
ID | Data | Produtos | Local | OP | Status | Solicitante | Observação | Ações
```

### Impacto

- **Antes:** Usuários precisavam abrir detalhes da requisição para ver observações importantes
- **Depois:** Observações visíveis diretamente na listagem, melhorando a visibilidade e agilidade

---

## 📝 Próximos Bugs

_Bugs adicionais serão documentados abaixo conforme forem sendo corrigidos..._

---

**Legenda de Severidade:**
- 🔴 Alta: Impacta diretamente a operação, causa erros críticos
- 🟡 Média: Impacta a usabilidade, mas tem workaround
- 🟢 Baixa: Problema cosmético ou de menor impacto
