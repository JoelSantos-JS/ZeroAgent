// Expense Model - Gerenciamento de despesas
const logger = require('../../utils/logger');

class ExpenseModel {
  constructor(databaseConnection) {
    this.db = databaseConnection;
  }

  // Criar despesa
  async createExpense(userId, value, category, description = null, transactionDate = null, type = 'other') {
    const date = transactionDate || new Date();
    
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('expenses')
        .insert({
          user_id: userId,
          amount: value,
          category: category,
          description: description,
          date: date.toISOString(),
          type: type
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.db.query(
        'INSERT INTO expenses (user_id, amount, category, description, date, type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [userId, value, category, description, date, type]
      );
      return result.rows[0];
    }
  }

  // Buscar despesas do usuário
  async getUserExpenses(userId, limit = 50, offset = 0) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('expenses')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(limit)
        .range(offset, offset + limit - 1);
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.db.query(
        'SELECT * FROM expenses WHERE user_id = $1 ORDER BY date DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
      );
      return result.rows;
    }
  }

  // Buscar despesas por categoria
  async getUserExpensesByCategory(userId, category, startDate = null, endDate = null) {
    let query = 'SELECT * FROM expenses WHERE user_id = $1 AND category = $2';
    const params = [userId, category];
    
    if (startDate) {
      query += ' AND date >= $3';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ` AND date <= $${params.length + 1}`;
      params.push(endDate);
    }
    
    query += ' ORDER BY date DESC';
    
    if (this.db.connectionType === 'supabase') {
      let supabaseQuery = this.db.supabase
        .from('expenses')
        .select('*')
        .eq('user_id', userId)
        .eq('category', category)
        .order('date', { ascending: false });
      
      if (startDate) {
        supabaseQuery = supabaseQuery.gte('date', startDate);
      }
      
      if (endDate) {
        supabaseQuery = supabaseQuery.lte('date', endDate);
      }
      
      const { data, error } = await supabaseQuery;
      if (error) throw error;
      return data;
    } else {
      const result = await this.db.query(query, params);
      return result.rows;
    }
  }

  // Despesas mensais
  async getUserMonthlyExpenses(userId, year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('expenses')
        .select('category, amount')
        .eq('user_id', userId)
        .gte('date', startDate.toISOString())
        .lte('date', endDate.toISOString());
      
      if (error) throw error;
      
      // Agrupar por categoria
      const grouped = data.reduce((acc, expense) => {
        const category = expense.category || 'outros';
        const amount = parseFloat(expense.amount || 0);
        acc[category] = (acc[category] || 0) + amount;
        return acc;
      }, {});
      
      return Object.entries(grouped).map(([category, total]) => ({
        category,
        total: parseFloat(total.toFixed(2))
      }));
    } else {
      const result = await this.db.query(
        'SELECT category, SUM(amount) as total FROM expenses WHERE user_id = $1 AND date >= $2 AND date <= $3 GROUP BY category',
        [userId, startDate, endDate]
      );
      
      return result.rows.map(row => ({
        category: row.category,
        total: parseFloat(row.total)
      }));
    }
  }

  // Deletar despesa
  async deleteExpense(expenseId, userId) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId)
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.db.query(
        'DELETE FROM expenses WHERE id = $1 AND user_id = $2 RETURNING *',
        [expenseId, userId]
      );
      return result.rows[0];
    }
  }

  // Alias para compatibilidade
  async getUserTransactions(userId, limit = 50, offset = 0) {
    return this.getUserExpenses(userId, limit, offset);
  }

  async getUserTransactionsByCategory(userId, category, startDate = null, endDate = null) {
    return this.getUserExpensesByCategory(userId, category, startDate, endDate);
  }
}

module.exports = ExpenseModel;