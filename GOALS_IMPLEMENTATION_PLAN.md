# 🎯 Plano de Implementação - Sistema de Metas Financeiras

## 📋 **Análise da Estrutura Atual**

### **Tabelas Existentes Analisadas:**
- ✅ `users` - Gerenciamento de usuários
- ✅ `transactions` - Transações financeiras (base para integração)
- ✅ `products` - Produtos comprados
- ✅ `categories` - Categorias predefinidas
- ✅ `whatsapp_sessions` - Sessões do WhatsApp

### **Modelos Existentes:**
- ✅ `UserModel` - Gerenciamento de usuários
- ✅ `ExpenseModel` - Despesas (integração necessária)
- ✅ `RevenueModel` - Receitas (integração necessária)
- ✅ `ProductModel` - Produtos

## 🏗️ **Nova Arquitetura - Sistema de Metas**

### **1. Estrutura do Banco de Dados**

#### **Tabela Principal: `goals`**
```sql
CREATE TABLE goals (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    target_amount DECIMAL(12, 2) NOT NULL CHECK (target_amount > 0),
    current_amount DECIMAL(12, 2) DEFAULT 0.00 CHECK (current_amount >= 0),
    category VARCHAR(100) NOT NULL,
    goal_type VARCHAR(50) NOT NULL CHECK (goal_type IN (
        'saving', 'expense_limit', 'income_target', 'investment', 'debt_payment'
    )),
    target_date DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN (
        'active', 'completed', 'paused', 'cancelled'
    )),
    priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    auto_update BOOLEAN DEFAULT true,
    reminder_frequency VARCHAR(20) DEFAULT 'weekly',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP NULL
);
```

#### **Tabela de Histórico: `goal_progress_history`**
```sql
CREATE TABLE goal_progress_history (
    id SERIAL PRIMARY KEY,
    goal_id INT REFERENCES goals(id) ON DELETE CASCADE,
    previous_amount DECIMAL(12, 2) NOT NULL,
    new_amount DECIMAL(12, 2) NOT NULL,
    change_amount DECIMAL(12, 2) NOT NULL,
    change_reason VARCHAR(100), -- 'transaction', 'manual_update', 'correction'
    transaction_id INT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### **Tabela de Categorias: `goal_categories`**
```sql
CREATE TABLE goal_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(50), -- Emoji
    color VARCHAR(7), -- Hex color
    goal_type VARCHAR(50) NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### **2. Tipos de Metas Suportadas**

| Tipo | Descrição | Exemplo |
|------|-----------|----------|
| `saving` | Metas de economia | "Juntar R$ 5000 para viagem" |
| `expense_limit` | Limites de gastos | "Gastar no máximo R$ 800 em alimentação" |
| `income_target` | Metas de renda | "Ganhar R$ 3000 extras este mês" |
| `investment` | Metas de investimento | "Investir R$ 1000 em ações" |
| `debt_payment` | Pagamento de dívidas | "Quitar R$ 2000 do cartão" |

### **3. Categorias Pré-definidas**

#### **Economia (saving):**
- 🚨 Reserva de Emergência
- ✈️ Viagem
- 🏠 Casa Própria
- 🚗 Carro
- 📚 Educação

#### **Limites de Gastos (expense_limit):**
- 🍽️ Alimentação
- 🚌 Transporte
- 🎮 Lazer
- 👕 Roupas
- 🛒 Supermercado

#### **Metas de Renda (income_target):**
- 💰 Renda Extra
- 💻 Freelance
- 📈 Vendas

#### **Investimentos (investment):**
- 📊 Ações
- 🏛️ Tesouro Direto
- 📈 Fundos

#### **Pagamento de Dívidas (debt_payment):**
- 💳 Cartão de Crédito
- 🏦 Financiamento
- 💸 Empréstimo

## 🔧 **Componentes Desenvolvidos**

### **✅ 1. Schema do Banco de Dados**
- **Arquivo:** `database/goals-schema.sql`
- **Status:** Completo
- **Inclui:** Tabelas, views, funções, triggers e dados iniciais

### **✅ 2. Modelo de Dados (GoalModel)**
- **Arquivo:** `database/models/goal-model.js`
- **Status:** Completo
- **Métodos principais:**
  - `createGoal()` - Criar nova meta
  - `getUserGoals()` - Listar metas do usuário
  - `updateGoalProgress()` - Atualizar progresso
  - `getGoalById()` - Buscar meta específica
  - `deleteGoal()` - Deletar meta
  - `getGoalStats()` - Estatísticas do usuário
  - `getGoalsDueSoon()` - Metas próximas do vencimento

### **✅ 3. Handler de Comandos (GoalHandler)**
- **Arquivo:** `services/handlers/goal-handler.js`
- **Status:** Completo
- **Funcionalidades:**
  - Processar comandos via WhatsApp
  - Validação de dados
  - Formatação de respostas
  - Tratamento de erros

## 🤖 **Comandos do Bot WhatsApp**

### **📝 Criar Meta:**
```
"Criar meta economizar R$ 1000 para viagem até dezembro"
"Nova meta limite gastos alimentação R$ 500 por mês"
"Quero juntar R$ 5000 para casa própria"
```

### **📋 Listar Metas:**
```
"Minhas metas"
"Metas ativas"
"Metas concluídas"
"Metas categoria viagem"
```

### **📊 Progresso:**
```
"Progresso meta viagem"
"Status meta casa própria"
"Como está minha meta de economia?"
```

### **✏️ Atualizar Progresso:**
```
"Adicionar R$ 100 meta viagem"
"Definir progresso meta casa R$ 2500"
"Coloquei mais R$ 200 na poupança"
```

### **🗑️ Deletar Meta:**
```
"Deletar meta viagem"
"Remover meta casa própria"
"Cancelar meta carro"
```

### **📂 Outros Comandos:**
```
"Categorias de metas"
"Tipos de meta"
"Resumo metas"
"Estatísticas metas"
```

## 🔄 **Integração com Sistema Existente**

### **1. Atualização Automática de Progresso**

#### **Metas de Economia (saving):**
- Quando usuário registra receita → Atualizar metas de economia relacionadas
- Exemplo: "Recebi R$ 500 freelance" → Atualizar meta "Renda Extra"

#### **Limites de Gastos (expense_limit):**
- Quando usuário registra despesa → Verificar se excede limite da meta
- Exemplo: "Gastei R$ 100 supermercado" → Atualizar meta "Limite Supermercado"

#### **Metas de Renda (income_target):**
- Receitas são automaticamente somadas às metas de renda
- Notificar quando meta de renda é atingida

### **2. Modificações Necessárias nos Modelos Existentes**

#### **ExpenseModel:**
```javascript
// Adicionar após criar despesa
async updateRelatedGoals(userId, expense) {
  const goalModel = new GoalModel(this.db);
  const expenseLimitGoals = await goalModel.getGoalsByCategory(
    userId, expense.category, 'active'
  );
  
  for (const goal of expenseLimitGoals) {
    if (goal.goal_type === 'expense_limit') {
      await goalModel.addToGoalProgress(
        goal.id, expense.amount, 'transaction', expense.id
      );
    }
  }
}
```

#### **RevenueModel:**
```javascript
// Adicionar após criar receita
async updateRelatedGoals(userId, revenue) {
  const goalModel = new GoalModel(this.db);
  const savingGoals = await goalModel.getGoalsByCategory(
    userId, revenue.category, 'active'
  );
  
  for (const goal of savingGoals) {
    if (['saving', 'income_target'].includes(goal.goal_type)) {
      await goalModel.addToGoalProgress(
        goal.id, revenue.amount, 'transaction', revenue.id
      );
    }
  }
}
```

## 🌐 **API REST Endpoints**

### **Metas:**
```javascript
// GET /api/goals - Listar metas do usuário
// POST /api/goals - Criar nova meta
// GET /api/goals/:id - Obter meta específica
// PUT /api/goals/:id - Atualizar meta
// DELETE /api/goals/:id - Deletar meta
// POST /api/goals/:id/progress - Atualizar progresso
// GET /api/goals/:id/history - Histórico de progresso
```

### **Categorias:**
```javascript
// GET /api/goals/categories - Listar categorias
// GET /api/goals/categories/:type - Categorias por tipo
```

### **Estatísticas:**
```javascript
// GET /api/goals/stats - Estatísticas das metas
// GET /api/goals/due-soon - Metas próximas do vencimento
```

## 📱 **Integração com Financial Agent**

### **1. Modificar `financial-agent.js`:**
```javascript
const { GoalModel } = require('../database/models');
const GoalHandler = require('./handlers/goal-handler');

class FinancialAgent {
  async initialize() {
    // ... código existente ...
    
    // Inicializar sistema de metas
    this.goalModel = new GoalModel(this.databaseService);
    this.goalHandler = new GoalHandler(
      this.databaseService, 
      this.userService, 
      this.goalModel
    );
  }
  
  async processMessage(message) {
    // ... análise existente ...
    
    // Detectar comandos de meta
    if (this.isGoalCommand(analysisResult)) {
      return await this.goalHandler.process(userId, analysisResult);
    }
    
    // ... resto do processamento ...
  }
  
  isGoalCommand(analysisResult) {
    const goalKeywords = [
      'meta', 'objetivo', 'juntar', 'economizar', 'limite',
      'progresso', 'atingir', 'conquistar'
    ];
    
    return goalKeywords.some(keyword => 
      analysisResult.texto_original?.toLowerCase().includes(keyword)
    );
  }
}
```

### **2. Atualizar Prompt do Gemini:**
```javascript
// Adicionar ao prompt existente
const goalInstructions = `
SISTEMA DE METAS:
- Detectar comandos relacionados a metas financeiras
- Tipos: saving, expense_limit, income_target, investment, debt_payment
- Ações: criar_meta, listar_metas, progresso_meta, atualizar_meta, deletar_meta
- Extrair: titulo, valor_meta, categoria, tipo_meta, data_limite, prioridade

Exemplos:
"Quero juntar R$ 1000 para viagem" → acao: "criar_meta", tipo_meta: "saving"
"Minhas metas ativas" → acao: "listar_metas", status: "active"
"Progresso meta viagem" → acao: "progresso_meta", titulo: "viagem"
`;
```

## 🔔 **Sistema de Notificações**

### **1. Tipos de Notificações:**
- 🎉 Meta atingida (100% completa)
- ⚠️ Meta próxima do vencimento (7 dias)
- 📊 Progresso semanal/mensal
- 🚨 Limite de gastos excedido
- 💪 Marcos de progresso (25%, 50%, 75%)

### **2. Implementação:**
```javascript
class GoalNotificationService {
  async checkAndSendNotifications() {
    // Verificar metas próximas do vencimento
    const dueSoon = await this.goalModel.getGoalsDueSoon(null, 7);
    
    // Verificar metas atingidas
    const completed = await this.checkCompletedGoals();
    
    // Enviar notificações via WhatsApp
    for (const goal of dueSoon) {
      await this.sendDueSoonNotification(goal);
    }
  }
}
```

## 📊 **Relatórios e Analytics**

### **1. Views do Banco:**
- `user_goals_summary` - Resumo das metas por usuário
- `goals_due_soon` - Metas próximas do vencimento
- `recently_completed_goals` - Metas recém-completadas

### **2. Métricas Importantes:**
- Taxa de conclusão de metas
- Tempo médio para atingir metas
- Categorias mais populares
- Progresso médio por tipo de meta

## 🚀 **Próximos Passos de Implementação**

### **🔥 Alta Prioridade:**
1. ✅ ~~Criar schema do banco de dados~~
2. ✅ ~~Implementar GoalModel~~
3. ✅ ~~Criar GoalHandler~~
4. 🔄 **Integrar com FinancialAgent**
5. 🔄 **Atualizar prompt do Gemini**
6. 🔄 **Testar comandos básicos**

### **📋 Média Prioridade:**
7. 📝 Criar endpoints da API REST
8. 📝 Integrar com ExpenseModel/RevenueModel
9. 📝 Implementar atualização automática
10. 📝 Adicionar validações avançadas

### **🔮 Baixa Prioridade:**
11. 📝 Sistema de notificações
12. 📝 Relatórios avançados
13. 📝 Interface web para metas
14. 📝 Gamificação (badges, conquistas)

## 🧪 **Testes Sugeridos**

### **1. Comandos Básicos:**
```
"Criar meta economizar R$ 1000 para viagem"
"Minhas metas"
"Progresso meta viagem"
"Adicionar R$ 100 meta viagem"
"Deletar meta viagem confirmar"
```

### **2. Cenários Complexos:**
```
"Quero juntar R$ 5000 para casa própria até dezembro de 2024"
"Limite de gastos alimentação R$ 800 por mês"
"Meta de renda extra R$ 2000 este mês"
```

### **3. Integração:**
```
"Gastei R$ 50 supermercado" → Deve atualizar meta de limite
"Recebi R$ 500 freelance" → Deve atualizar meta de renda
```

## 📝 **Considerações Técnicas**

### **1. Performance:**
- Índices otimizados nas tabelas
- Queries eficientes para listagem
- Cache de estatísticas frequentes

### **2. Segurança:**
- Validação rigorosa de entrada
- Autorização por usuário
- Sanitização de dados

### **3. Escalabilidade:**
- Suporte a múltiplos usuários
- Histórico completo de mudanças
- Arquitetura modular

### **4. UX/UI:**
- Mensagens claras e amigáveis
- Emojis para melhor visualização
- Barras de progresso visuais
- Comandos intuitivos

---

**📅 Data de criação:** 02/09/2025  
**👨‍💻 Desenvolvido por:** Sistema de Análise de Implementação  
**🔄 Última atualização:** 02/09/2025  
**📊 Status geral:** 60% Completo (Estrutura base pronta)