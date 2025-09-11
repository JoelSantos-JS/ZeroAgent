const logger = require('../utils/logger');
const databaseService = require('../config/database');

// Importar tipos do sistema existente
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuração do Supabase (compatível com o sistema existente)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Cliente Supabase (usando a mesma configuração do sistema principal)
const supabase = supabaseUrl && supabaseKey ? 
  createClient(supabaseUrl, supabaseServiceKey || supabaseKey) : null;

// =====================================
// CONSTANTES PARA ENUMS DO POSTGRES
// =====================================

// Categorias de receita pessoal
const PERSONAL_INCOME_CATEGORIES = [
  'salary', 'freelance', 'investment', 'rental', 'bonus', 
  'gift', 'pension', 'benefit', 'other'
];

// Categorias de gastos pessoais
const PERSONAL_EXPENSE_CATEGORIES = [
  'housing', 'food', 'transportation', 'healthcare', 'education', 
  'entertainment', 'clothing', 'utilities', 'insurance', 'personal_care', 
  'gifts', 'pets', 'charity', 'taxes', 'debt_payment', 'savings', 'other'
];

// Métodos de pagamento
const PERSONAL_PAYMENT_METHODS = [
  'cash', 'debit_card', 'credit_card', 'pix', 'bank_transfer', 'automatic_debit'
];

// Tipos de metas
const PERSONAL_GOAL_TYPES = [
  'emergency_fund', 'savings', 'debt_payoff', 'investment', 'purchase', 
  'vacation', 'retirement', 'education', 'home_purchase', 'wedding', 'other'
];

// Status de metas
const PERSONAL_GOAL_STATUS = ['active', 'paused', 'completed', 'cancelled'];
const PERSONAL_PRIORITY = ['low', 'medium', 'high', 'critical'];
const BUDGET_STATUS = ['active', 'completed', 'exceeded'];

// =====================================
// VALIDADORES DE DADOS
// =====================================

/**
 * Valida se uma categoria de receita é válida
 */
function isValidIncomeCategory(category) {
  return PERSONAL_INCOME_CATEGORIES.includes(category);
}

/**
 * Valida se uma categoria de gasto é válida
 */
function isValidExpenseCategory(category) {
  return PERSONAL_EXPENSE_CATEGORIES.includes(category);
}

/**
 * Valida se um método de pagamento é válido
 */
function isValidPaymentMethod(method) {
  return PERSONAL_PAYMENT_METHODS.includes(method);
}

/**
 * Valida se um tipo de meta é válido
 */
function isValidGoalType(type) {
  return PERSONAL_GOAL_TYPES.includes(type);
}

/**
 * Valida dados de receita pessoal
 */
function validatePersonalIncome(incomeData) {
  const errors = [];
  
  if (!incomeData.date) errors.push('Data é obrigatória');
  if (!incomeData.description) errors.push('Descrição é obrigatória');
  if (!incomeData.amount || incomeData.amount <= 0) errors.push('Valor deve ser maior que zero');
  if (!incomeData.category || !isValidIncomeCategory(incomeData.category)) {
    errors.push('Categoria inválida');
  }
  if (!incomeData.source) errors.push('Fonte é obrigatória');
  
  return errors;
}

/**
 * Valida dados de gasto pessoal
 */
function validatePersonalExpense(expenseData) {
  const errors = [];
  
  if (!expenseData.date) errors.push('Data é obrigatória');
  if (!expenseData.description) errors.push('Descrição é obrigatória');
  if (!expenseData.amount || expenseData.amount <= 0) errors.push('Valor deve ser maior que zero');
  if (!expenseData.category || !isValidExpenseCategory(expenseData.category)) {
    errors.push('Categoria inválida');
  }
  if (!expenseData.payment_method || !isValidPaymentMethod(expenseData.payment_method)) {
    errors.push('Método de pagamento inválido');
  }
  
  return errors;
}

/**
 * Serviço para gerenciamento de finanças pessoais
 * Integrado com o sistema de banco de dados existente
 */
class PersonalFinanceService {
  constructor() {
    this.db = databaseService;
  }

  /**
   * Inicializar o serviço
   */
  async initialize() {
    try {
      logger.info('Inicializando PersonalFinanceService...');
      
      // Verificar se o banco está conectado
      if (!this.db.isConnected) {
        await this.db.initialize();
      }
      
      logger.info('PersonalFinanceService inicializado com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar PersonalFinanceService:', error);
      throw error;
    }
  }

  // =====================================
  // RECEITAS PESSOAIS (PERSONAL_INCOMES)
  // =====================================

  /**
   * Criar uma nova receita pessoal
   */
  async createPersonalIncome(userId, incomeData) {
    try {
      // Validar dados
      const validationErrors = validatePersonalIncome(incomeData);
      if (validationErrors.length > 0) {
        throw new Error(`Dados inválidos: ${validationErrors.join(', ')}`);
      }

      logger.info('Criando receita pessoal', { userId, category: incomeData.category, amount: incomeData.amount });

      if (this.db.connectionType === 'supabase') {
        const { data, error } = await this.db.supabase
          .from('personal_incomes')
          .insert({
            ...incomeData,
            user_id: userId
          })
          .select()
          .single();

        if (error) {
          logger.error('Erro ao criar receita pessoal no Supabase:', error);
          throw error;
        }

        return data;
      } else {
        // Fallback para PostgreSQL direto
        const result = await this.db.query(
          `INSERT INTO personal_incomes 
           (user_id, date, description, amount, category, source, is_recurring, recurring_info, 
            is_taxable, tax_withheld, notes, tags) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
           RETURNING *`,
          [
            userId, incomeData.date, incomeData.description, incomeData.amount,
            incomeData.category, incomeData.source, incomeData.is_recurring || false,
            JSON.stringify(incomeData.recurring_info || {}), incomeData.is_taxable || false,
            incomeData.tax_withheld || 0, incomeData.notes, incomeData.tags || []
          ]
        );
        return result.rows[0];
      }
    } catch (error) {
      logger.error('Erro inesperado ao criar receita pessoal:', error);
      throw error;
    }
  }

  /**
   * Buscar receitas pessoais do usuário
   */
  async getPersonalIncomes(userId, filters = {}) {
    try {
      logger.info('Buscando receitas pessoais', { userId, filters });

      if (this.db.connectionType === 'supabase') {
        let query = this.db.supabase
          .from('personal_incomes')
          .select('*')
          .eq('user_id', userId)
          .order('date', { ascending: false });

        if (filters.category) {
          query = query.eq('category', filters.category);
        }

        if (filters.startDate) {
          query = query.gte('date', filters.startDate);
        }

        if (filters.endDate) {
          query = query.lte('date', filters.endDate);
        }

        const { data, error } = await query;

        if (error) {
          logger.error('Erro ao buscar receitas pessoais:', error);
          throw error;
        }

        return data || [];
      } else {
        // Fallback para PostgreSQL direto
        let sql = 'SELECT * FROM personal_incomes WHERE user_id = $1';
        const params = [userId];
        let paramIndex = 2;

        if (filters.category) {
          sql += ` AND category = $${paramIndex}`;
          params.push(filters.category);
          paramIndex++;
        }

        if (filters.startDate) {
          sql += ` AND date >= $${paramIndex}`;
          params.push(filters.startDate);
          paramIndex++;
        }

        if (filters.endDate) {
          sql += ` AND date <= $${paramIndex}`;
          params.push(filters.endDate);
          paramIndex++;
        }

        sql += ' ORDER BY date DESC';

        const result = await this.db.query(sql, params);
        return result.rows;
      }
    } catch (error) {
      logger.error('Erro inesperado ao buscar receitas pessoais:', error);
      throw error;
    }
  }

  /**
   * Atualizar receita pessoal
   */
  async updatePersonalIncome(id, updates) {
    try {
      logger.info('Atualizando receita pessoal', { id, updates });

      if (this.db.connectionType === 'supabase') {
        const { data, error } = await this.db.supabase
          .from('personal_incomes')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (error) {
          logger.error('Erro ao atualizar receita pessoal:', error);
          throw error;
        }

        return data;
      } else {
        // Fallback para PostgreSQL direto
        const fields = Object.keys(updates);
        const values = Object.values(updates);
        const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
        
        const result = await this.db.query(
          `UPDATE personal_incomes SET ${setClause} WHERE id = $1 RETURNING *`,
          [id, ...values]
        );
        return result.rows[0];
      }
    } catch (error) {
      logger.error('Erro inesperado ao atualizar receita pessoal:', error);
      throw error;
    }
  }

  /**
   * Deletar receita pessoal
   */
  async deletePersonalIncome(id) {
    try {
      logger.info('Deletando receita pessoal', { id });

      if (this.db.connectionType === 'supabase') {
        const { error } = await this.db.supabase
          .from('personal_incomes')
          .delete()
          .eq('id', id);

        if (error) {
          logger.error('Erro ao deletar receita pessoal:', error);
          throw error;
        }
      } else {
        // Fallback para PostgreSQL direto
        await this.db.query('DELETE FROM personal_incomes WHERE id = $1', [id]);
      }
    } catch (error) {
      logger.error('Erro inesperado ao deletar receita pessoal:', error);
      throw error;
    }
  }

  // =====================================
  // GASTOS PESSOAIS (PERSONAL_EXPENSES)
  // =====================================

  /**
   * Criar um novo gasto pessoal
   */
  async createPersonalExpense(userId, expenseData) {
    try {
      // Validar dados
      const validationErrors = validatePersonalExpense(expenseData);
      if (validationErrors.length > 0) {
        throw new Error(`Dados inválidos: ${validationErrors.join(', ')}`);
      }

      logger.info('Criando gasto pessoal', { userId, category: expenseData.category, amount: expenseData.amount });

      if (this.db.connectionType === 'supabase') {
        const { data, error } = await this.db.supabase
          .from('personal_expenses')
          .insert({
            ...expenseData,
            user_id: userId
          })
          .select()
          .single();

        if (error) {
          logger.error('Erro ao criar gasto pessoal no Supabase:', error);
          throw error;
        }

        return data;
      } else {
        // Fallback para PostgreSQL direto
        const result = await this.db.query(
          `INSERT INTO personal_expenses 
           (user_id, date, description, amount, category, subcategory, payment_method, 
            is_essential, is_recurring, location, merchant, is_tax_deductible, notes, tags, 
            is_installment, installment_info) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) 
           RETURNING *`,
          [
            userId, expenseData.date, expenseData.description, expenseData.amount,
            expenseData.category, expenseData.subcategory, expenseData.payment_method,
            expenseData.is_essential || false, expenseData.is_recurring || false,
            expenseData.location, expenseData.merchant, expenseData.is_tax_deductible || false,
            expenseData.notes, expenseData.tags || [], expenseData.is_installment || false,
            JSON.stringify(expenseData.installment_info || {})
          ]
        );
        return result.rows[0];
      }
    } catch (error) {
      logger.error('Erro inesperado ao criar gasto pessoal:', error);
      throw error;
    }
  }

  /**
   * Buscar gastos pessoais do usuário
   */
  async getPersonalExpenses(userId, filters = {}) {
    try {
      logger.info('Buscando gastos pessoais', { userId, filters });

      if (this.db.connectionType === 'supabase') {
        let query = this.db.supabase
          .from('personal_expenses')
          .select('*')
          .eq('user_id', userId)
          .order('date', { ascending: false });

        if (filters.category) {
          query = query.eq('category', filters.category);
        }

        if (filters.is_essential !== undefined) {
          query = query.eq('is_essential', filters.is_essential);
        }

        if (filters.startDate) {
          query = query.gte('date', filters.startDate);
        }

        if (filters.endDate) {
          query = query.lte('date', filters.endDate);
        }

        const { data, error } = await query;

        if (error) {
          logger.error('Erro ao buscar gastos pessoais:', error);
          throw error;
        }

        return data || [];
      } else {
        // Fallback para PostgreSQL direto
        let sql = 'SELECT * FROM personal_expenses WHERE user_id = $1';
        const params = [userId];
        let paramIndex = 2;

        if (filters.category) {
          sql += ` AND category = $${paramIndex}`;
          params.push(filters.category);
          paramIndex++;
        }

        if (filters.is_essential !== undefined) {
          sql += ` AND is_essential = $${paramIndex}`;
          params.push(filters.is_essential);
          paramIndex++;
        }

        if (filters.startDate) {
          sql += ` AND date >= $${paramIndex}`;
          params.push(filters.startDate);
          paramIndex++;
        }

        if (filters.endDate) {
          sql += ` AND date <= $${paramIndex}`;
          params.push(filters.endDate);
          paramIndex++;
        }

        sql += ' ORDER BY date DESC';

        const result = await this.db.query(sql, params);
        return result.rows;
      }
    } catch (error) {
      logger.error('Erro inesperado ao buscar gastos pessoais:', error);
      throw error;
    }
  }

  /**
   * Atualizar gasto pessoal
   */
  async updatePersonalExpense(id, updates) {
    try {
      logger.info('Atualizando gasto pessoal', { id, updates });

      if (this.db.connectionType === 'supabase') {
        const { data, error } = await this.db.supabase
          .from('personal_expenses')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (error) {
          logger.error('Erro ao atualizar gasto pessoal:', error);
          throw error;
        }

        return data;
      } else {
        // Fallback para PostgreSQL direto
        const fields = Object.keys(updates);
        const values = Object.values(updates);
        const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
        
        const result = await this.db.query(
          `UPDATE personal_expenses SET ${setClause} WHERE id = $1 RETURNING *`,
          [id, ...values]
        );
        return result.rows[0];
      }
    } catch (error) {
      logger.error('Erro inesperado ao atualizar gasto pessoal:', error);
      throw error;
    }
  }

  /**
   * Deletar gasto pessoal
   */
  async deletePersonalExpense(id) {
    try {
      logger.info('Deletando gasto pessoal', { id });

      if (this.db.connectionType === 'supabase') {
        const { error } = await this.db.supabase
          .from('personal_expenses')
          .delete()
          .eq('id', id);

        if (error) {
          logger.error('Erro ao deletar gasto pessoal:', error);
          throw error;
        }
      } else {
        // Fallback para PostgreSQL direto
        await this.db.query('DELETE FROM personal_expenses WHERE id = $1', [id]);
      }
    } catch (error) {
      logger.error('Erro inesperado ao deletar gasto pessoal:', error);
      throw error;
    }
  }

  // =====================================
  // RESUMOS E ANÁLISES PESSOAIS
  // =====================================

  /**
   * Obter resumo financeiro pessoal do mês
   */
  async getPersonalSummary(userId, month, year) {
    try {
      const currentDate = new Date();
      const targetMonth = month || currentDate.getMonth() + 1;
      const targetYear = year || currentDate.getFullYear();
      
      const startDate = `${targetYear}-${targetMonth.toString().padStart(2, '0')}-01`;
      const endDate = `${targetYear}-${targetMonth.toString().padStart(2, '0')}-31`;

      logger.info('Buscando resumo pessoal', { userId, targetMonth, targetYear });

      if (this.db.connectionType === 'supabase') {
        // Buscar receitas do mês
        const { data: incomes } = await this.db.supabase
          .from('personal_incomes')
          .select('amount')
          .eq('user_id', userId)
          .gte('date', startDate)
          .lte('date', endDate);

        // Buscar gastos do mês
        const { data: expenses } = await this.db.supabase
          .from('personal_expenses')
          .select('amount, is_essential')
          .eq('user_id', userId)
          .gte('date', startDate)
          .lte('date', endDate);

        // Calcular totais
        const totalIncome = incomes?.reduce((sum, income) => sum + Number(income.amount), 0) || 0;
        const totalExpenses = expenses?.reduce((sum, expense) => sum + Number(expense.amount), 0) || 0;
        const essentialExpenses = expenses?.filter(e => e.is_essential).reduce((sum, expense) => sum + Number(expense.amount), 0) || 0;
        const nonEssentialExpenses = totalExpenses - essentialExpenses;
        const balance = totalIncome - totalExpenses;
        const savingsRate = totalIncome > 0 ? (balance / totalIncome) * 100 : 0;

        return {
          month: targetMonth,
          year: targetYear,
          totalIncome,
          totalExpenses,
          essentialExpenses,
          nonEssentialExpenses,
          balance,
          savingsRate: Math.round(savingsRate * 100) / 100
        };
      } else {
        // Fallback para PostgreSQL direto
        const incomeResult = await this.db.query(
          'SELECT SUM(amount) as total FROM personal_incomes WHERE user_id = $1 AND date >= $2 AND date <= $3',
          [userId, startDate, endDate]
        );
        
        const expenseResult = await this.db.query(
          'SELECT SUM(amount) as total, SUM(CASE WHEN is_essential THEN amount ELSE 0 END) as essential FROM personal_expenses WHERE user_id = $1 AND date >= $2 AND date <= $3',
          [userId, startDate, endDate]
        );

        const totalIncome = Number(incomeResult.rows[0]?.total || 0);
        const totalExpenses = Number(expenseResult.rows[0]?.total || 0);
        const essentialExpenses = Number(expenseResult.rows[0]?.essential || 0);
        const nonEssentialExpenses = totalExpenses - essentialExpenses;
        const balance = totalIncome - totalExpenses;
        const savingsRate = totalIncome > 0 ? (balance / totalIncome) * 100 : 0;

        return {
          month: targetMonth,
          year: targetYear,
          totalIncome,
          totalExpenses,
          essentialExpenses,
          nonEssentialExpenses,
          balance,
          savingsRate: Math.round(savingsRate * 100) / 100
        };
      }
    } catch (error) {
      logger.error('Erro inesperado ao buscar resumo pessoal:', error);
      throw error;
    }
  }

  /**
   * Obter gastos por categoria
   */
  async getExpensesByCategory(userId, month, year) {
    try {
      const currentDate = new Date();
      const targetMonth = month || currentDate.getMonth() + 1;
      const targetYear = year || currentDate.getFullYear();
      
      const startDate = `${targetYear}-${targetMonth.toString().padStart(2, '0')}-01`;
      const endDate = `${targetYear}-${targetMonth.toString().padStart(2, '0')}-31`;

      logger.info('Buscando gastos por categoria', { userId, targetMonth, targetYear });

      if (this.db.connectionType === 'supabase') {
        const { data, error } = await this.db.supabase
          .from('personal_expenses')
          .select('category, amount')
          .eq('user_id', userId)
          .gte('date', startDate)
          .lte('date', endDate);

        if (error) {
          logger.error('Erro ao buscar gastos por categoria:', error);
          throw error;
        }

        if (!data || data.length === 0) {
          return [];
        }

        // Agrupar por categoria
        const categoryTotals = {};
        data.forEach(expense => {
          if (expense.category && expense.amount !== null) {
            const category = expense.category;
            categoryTotals[category] = (categoryTotals[category] || 0) + Number(expense.amount);
          }
        });

        return Object.entries(categoryTotals).map(([category, amount]) => ({
          category,
          amount,
          percentage: 0
        }));
      } else {
        // Fallback para PostgreSQL direto
        const result = await this.db.query(
          'SELECT category, SUM(amount) as amount FROM personal_expenses WHERE user_id = $1 AND date >= $2 AND date <= $3 GROUP BY category',
          [userId, startDate, endDate]
        );

        return result.rows.map(row => ({
          category: row.category,
          amount: Number(row.amount),
          percentage: 0
        }));
      }
    } catch (error) {
      logger.error('Erro inesperado ao buscar gastos por categoria:', error);
      throw error;
    }
  }
}

// =====================================
// EXPORTS E INSTÂNCIA DO SERVIÇO
// =====================================

// Criar instância única do serviço
const personalFinanceService = new PersonalFinanceService();

// Exportar constantes para uso externo
module.exports = {
  personalFinanceService,
  PERSONAL_INCOME_CATEGORIES,
  PERSONAL_EXPENSE_CATEGORIES,
  PERSONAL_PAYMENT_METHODS,
  PERSONAL_GOAL_TYPES,
  PERSONAL_GOAL_STATUS,
  PERSONAL_PRIORITY,
  BUDGET_STATUS,
  isValidIncomeCategory,
  isValidExpenseCategory,
  isValidPaymentMethod,
  isValidGoalType,
  validatePersonalIncome,
  validatePersonalExpense
};