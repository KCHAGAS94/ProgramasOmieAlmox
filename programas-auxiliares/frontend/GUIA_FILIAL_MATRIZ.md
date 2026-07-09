# 🏪🏢 Sistema Filial/Matriz - Guia de Uso

## 📋 Visão Geral

Este sistema permite buscar dados de **duas origens diferentes**:
- **Filial** (Local): Dados do sistema local
- **Matriz**: Dados do sistema da matriz (requer permissão de admin)

## 🎯 Funcionalidades

### ✅ O que foi criado:

1. **Seletor de Origem** (`SeletorOrigem.jsx`)
   - Toggle visual para alternar entre Filial e Matriz
   - Bloqueio automático para usuários não-admin
   - Alertas visuais quando usa dados da Matriz

2. **Configuração de API Keys** (`ConfiguracaoAPIKeys.jsx`)
   - Interface para configurar chaves de acesso
   - Separação entre key da Filial e key da Matriz
   - Apenas administradores podem acessar

3. **Serviço de API** (`apiService.js`)
   - Alterna automaticamente entre APIs baseado na origem
   - Funções prontas: buscarProdutos, buscarProdutoPorCodigo, etc.
   - Mesma estrutura, só muda a API Key

4. **Exemplo de Uso** (`ExemploCadastroComOrigem.jsx`)
   - Demonstração completa de como usar
   - Busca de produtos por código
   - Exibição clara da origem dos dados

## 🚀 Como Usar

### 1️⃣ Configurar API Keys (Admin)

```javascript
// Acessar: Menu > Configurar API Keys

// Usuário admin deve configurar:
- API Key da Filial (obrigatória)
- API Key da Matriz (opcional)
```

### 2️⃣ Usar em qualquer componente

```jsx
import { useState } from 'react';
import SeletorOrigem from './components/SeletorOrigem';
import { buscarProdutoPorCodigo } from './api/apiService';

function MeuComponente({ usuario }) {
  const [origem, setOrigem] = useState('filial');

  // Usar o seletor
  <SeletorOrigem
    origem={origem}
    onChangeOrigem={setOrigem}
    usuario={usuario}
  />

  // Buscar dados da origem selecionada
  const produto = await buscarProdutoPorCodigo('COD123', origem);
}
```

### 3️⃣ Criar novas funções de API

```javascript
// Em apiService.js

export const minhaNovaFuncao = async (parametros, origem = 'filial') => {
  const api = criarClienteAPI(origem);

  try {
    const response = await api.get('/meu-endpoint', { params: parametros });
    return {
      sucesso: true,
      dados: response.data,
      origem: origem
    };
  } catch (error) {
    return {
      sucesso: false,
      erro: error.response?.data?.mensagem || 'Erro',
      origem: origem
    };
  }
};
```

## 🔐 Permissões

### Usuário Normal
- ✅ Pode acessar dados da **Filial**
- ❌ **NÃO** pode acessar dados da **Matriz**
- ❌ **NÃO** pode configurar API Keys

### Administrador
- ✅ Pode acessar dados da **Filial**
- ✅ Pode acessar dados da **Matriz**
- ✅ Pode configurar API Keys

## 📦 Estrutura de Arquivos

```
programas-auxiliares/frontend/src/
├── config/
│   └── apiConfig.js           # Configurações e API Keys
├── api/
│   └── apiService.js          # Serviços de API (Filial/Matriz)
├── components/
│   ├── SeletorOrigem.jsx      # Toggle Filial/Matriz
│   ├── ConfiguracaoAPIKeys.jsx # Configurar keys (Admin)
│   └── ExemploCadastroComOrigem.jsx # Exemplo completo
└── App.jsx                     # Menu principal atualizado
```

## 🎨 Componentes Visuais

### SeletorOrigem
```jsx
<SeletorOrigem
  origem="filial"              // 'filial' ou 'matriz'
  onChangeOrigem={setOrigem}   // Callback quando muda
  usuario={usuario}            // Objeto do usuário
  disabled={false}             // Opcional: desabilitar
/>
```

**Features:**
- Toggle animado com gradientes
- Ícones visuais (🏪 Filial / 🏢 Matriz)
- Bloqueio automático para não-admin
- Alert quando usa dados da Matriz

### ConfiguracaoAPIKeys
```jsx
<ConfiguracaoAPIKeys
  usuario={usuario}
  onVoltar={() => {}}
/>
```

**Features:**
- Campos de senha com toggle mostrar/ocultar
- Validação de permissão (só admin)
- Salvamento no localStorage
- Feedback visual de sucesso/erro

## 🔄 Fluxo de Uso

```
1. Admin configura API Keys
   └─> Configurar API Keys > Salvar

2. Usuário acessa cadastro
   └─> Escolhe origem (Filial/Matriz)

3. Sistema usa a API correta
   └─> Busca dados da origem selecionada

4. Dados retornam com indicação de origem
   └─> "Produto encontrado na Matriz"
```

## 💾 Armazenamento

As API Keys são salvas no **localStorage** do navegador:

```javascript
localStorage.setItem('api_key_filial', 'sua-key-aqui');
localStorage.setItem('api_key_matriz', 'sua-key-aqui');
```

**⚠️ Importante:**
- Cada usuário/navegador precisa configurar suas próprias keys
- As keys não são sincronizadas entre dispositivos
- Se limpar o cache, precisa reconfigurar

## 🔧 Integração com Backend

### Headers enviados:

```javascript
{
  'Content-Type': 'application/json',
  'X-API-Key': 'key-da-filial-ou-matriz',  // Alterna baseado na origem
  'Authorization': 'Bearer token-do-usuario' // Token do login
}
```

### Backend deve:
1. Validar a API Key recebida
2. Verificar se é key da Filial ou Matriz
3. Retornar os dados correspondentes

## 📝 Exemplos Práticos

### Buscar produto
```javascript
const resultado = await buscarProdutoPorCodigo('PROD001', 'matriz');

if (resultado.sucesso) {
  console.log(resultado.dados);    // Dados do produto
  console.log(resultado.origem);   // 'matriz'
} else {
  console.error(resultado.erro);   // Mensagem de erro
}
```

### Listar produtos
```javascript
const resultado = await buscarProdutos('filial', {
  categoria: 'eletrônicos',
  ativo: true
});
```

### Buscar clientes
```javascript
const resultado = await buscarClientes('matriz', {
  nome: 'João'
});
```

## 🎯 Próximos Passos

Para usar em outros programas:

1. **Copiar os arquivos**:
   - `config/apiConfig.js`
   - `api/apiService.js`
   - `components/SeletorOrigem.jsx`

2. **Importar no seu componente**:
   ```jsx
   import SeletorOrigem from './components/SeletorOrigem';
   import { buscarProdutos } from './api/apiService';
   ```

3. **Usar normalmente** 🚀

## 🐛 Solução de Problemas

### "Erro ao buscar dados"
- ✅ Verifique se as API Keys estão configuradas
- ✅ Confirme se o usuário tem permissão (admin para Matriz)
- ✅ Verifique se o backend está rodando

### "Acesso Negado"
- ✅ Apenas admin pode acessar dados da Matriz
- ✅ Peça ao administrador para configurar as keys

### "Token inválido"
- ✅ Faça login novamente
- ✅ O sistema redireciona automaticamente

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique este guia
2. Veja o `ExemploCadastroComOrigem.jsx`
3. Contate o administrador do sistema

---

**Desenvolvido com ❤️ para facilitar a integração Filial/Matriz**
