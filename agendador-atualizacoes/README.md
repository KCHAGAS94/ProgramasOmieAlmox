# 🕐 Agendador de Atualizações Automáticas

Serviço que executa atualizações do Omie de forma sequencial e automática todos os dias às **21:00**.

## ⚙️ Configuração

O agendador já está integrado ao `npm run dev` do projeto principal e será iniciado automaticamente.

**Porta**: 4099

## 📋 Sequência de Atualizações

As atualizações são executadas **em ordem**, uma após a outra:

1. **Separador de OP** - Atualizar Cache (porta 4003)
2. **Separador de Remessa** - Atualizar Cache (porta 4004)
3. **Programa Inventário** - Atualizar Base de Produtos (porta 4007)
4. **Gestão de Estoque** - Atualizar Omie (porta 4005)

## 🚀 Uso

### Execução Automática
O agendador roda **automaticamente todos os dias às 21:00** (horário de São Paulo).

### Execução Manual
Para executar as atualizações imediatamente:

```bash
curl -X POST http://localhost:4099/api/executar-agora
```

Ou use um cliente HTTP como Postman/Insomnia.

### Verificar Status
```bash
curl http://localhost:4099/api/status
```

Retorna:
- Agendamento configurado
- Se há execução em andamento
- Dados da execução atual
- Última execução
- Total de execuções

### Ver Histórico
```bash
curl http://localhost:4099/api/historico
```

Mostra as últimas 10 execuções com:
- Data/hora de início e fim
- Duração total
- Status de cada atualização (sucesso/erro)
- Mensagens de erro (se houver)

## 📊 Logs

O agendador imprime logs detalhados no console:

```
═══════════════════════════════════════════════════════
🚀 INICIANDO SEQUÊNCIA DE ATUALIZAÇÕES
   Data/Hora: 26/02/2026, 21:00:00
═══════════════════════════════════════════════════════

[26/02/2026, 21:00:01] 🔄 Iniciando: Separador de OP
[26/02/2026, 21:03:23] ✅ Separador de OP - Concluído em 202s

[26/02/2026, 21:03:24] 🔄 Iniciando: Separador de Remessa
[26/02/2026, 21:06:45] ✅ Separador de Remessa - Concluído em 201s

...

═══════════════════════════════════════════════════════
✅ SEQUÊNCIA CONCLUÍDA
   Tempo Total: 850s
   Sucessos: 4 | Erros: 0
═══════════════════════════════════════════════════════
```

## ⏱️ Timeouts

- **Separador de OP**: 5 minutos
- **Separador de Remessa**: 5 minutos
- **Programa Inventário**: 10 minutos (pode ser mais demorado)
- **Gestão de Estoque**: 5 minutos

## 🔧 Alterar Horário do Agendamento

Edite o arquivo `server.js` na linha do `cron.schedule`:

```javascript
// Formato: minuto hora dia mês dia-da-semana
cron.schedule('0 21 * * *', () => { ... });
//          ^ ^
//          | hora (0-23)
//          minuto (0-59)
```

Exemplos:
- `'30 2 * * *'` - 02:30 da manhã
- `'0 14 * * *'` - 14:00 (2 da tarde)
- `'15 8 * * 1-5'` - 08:15 apenas em dias úteis (segunda a sexta)

## 🛡️ Proteção contra Execuções Simultâneas

O agendador **não permite** que duas execuções rodem ao mesmo tempo. Se você tentar executar manualmente enquanto uma execução automática estiver rodando, receberá um erro.

## 📝 Notas

- O timezone está configurado para **America/Sao_Paulo**
- O histórico mantém as últimas **10 execuções**
- Cada atualização aguarda a anterior terminar antes de começar
- Se uma atualização falhar, as próximas ainda serão executadas
