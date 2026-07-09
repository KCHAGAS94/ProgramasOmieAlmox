# 📦 Requisição de Material - Sistema de Almoxarifado

Sistema para gerenciar requisições de materiais do almoxarifado com fluxo de aprovação.

## 🚀 Como Iniciar

### Backend (Porta 4005)

```bash
cd backend
npm install
npm start
```

### Frontend (Porta 3005)

```bash
cd frontend
npm install
npm run dev
```

## 📋 Funcionalidades

### Para Operadores:
- ✅ Criar requisições de material
- ✅ Buscar produtos do inventário
- ✅ Ver histórico de requisições próprias
- ✅ Acompanhar status (Pendente, Aprovada, Rejeitada, Entregue)

### Para Administradores:
- ✅ Ver todas as requisições
- ✅ Aprovar ou rejeitar requisições
- ✅ Marcar requisições como entregues
- ✅ Todas as funcionalidades de operador

## 🔄 Fluxo de Requisição

1. **Operador** cria requisição selecionando produto e quantidade
2. **Admin** recebe notificação e pode aprovar ou rejeitar
3. Se aprovado, **Admin** separa o material e marca como entregue
4. **Operador** recebe confirmação de entrega

## 📊 Status das Requisições

- 🟡 **Pendente**: Aguardando aprovação do admin
- 🟢 **Aprovada**: Aprovada, aguardando separação
- 🔴 **Rejeitada**: Não autorizada (com motivo)
- 🔵 **Entregue**: Material já foi entregue

## 🔗 Integração

- Integrado com o **Menu Principal** (autenticação JWT)
- Busca produtos do **Programa Inventário**
- Controle de permissões por tipo de usuário

## 📁 Estrutura de Dados

Arquivo: `backend/requisicoes.json`

```json
{
  "requisicoes": [
    {
      "id": "1234567890",
      "produto_codigo": "PROD-001",
      "produto_descricao": "Parafuso M8",
      "quantidade": 100,
      "motivo": "Manutenção máquina X",
      "status": "pendente",
      "solicitante_nome": "João Silva",
      "solicitante_email": "joao@empresa.com",
      "data_solicitacao": "2026-02-11T10:30:00.000Z",
      "aprovado_por": null,
      "data_aprovacao": null
    }
  ]
}
```

## 🌐 Acesso Remoto

- Frontend: `http://192.168.1.70:3005`
- Backend: `http://192.168.1.70:4005`

## 🎨 Interface

- Design moderno e responsivo
- Cores: Verde (#10b981) para aprovações
- Busca com autocomplete de produtos
- Tabela com filtros por status
