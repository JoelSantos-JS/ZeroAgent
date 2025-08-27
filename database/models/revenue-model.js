// Revenue Model - Gerenciamento de receitas
const logger = require('../../utils/logger');

class RevenueModel {
  constructor(databaseConnection) {
    this.db = databaseConnection;
  }

  // Criar receita
  async createRevenue(userId, value, category, description = null, transactionDate = null, source = 'other') {
    const date = transactionDate || new Date();
    
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('revenues')
        .insert({
          user_id: userId,
          amount: value,
          category: category,
          description: description,
          date: date.toISOString(),
          source: source
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.db.query(
        'INSERT INTO revenues (user_id, amount, category, description, date, source) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [userId, value, category, description, date, source]
      );
      return result.rows[0];
    }
  }

  // Buscar receitas do usuário
  async getUserRevenues(userId, limit = 50, offset = 0) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('revenues')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(limit)
        .range(offset, offset + limit - 1);
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.db.query(
        'SELECT * FROM revenues WHERE user_id = $1 ORDER BY date DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
      );
      return result.rows;
    }
  }

  // Buscar receitas por categoria
  async getUserRevenuesByCategory(userId, category, startDate = null, endDate = null) {
    let query = 'SELECT * FROM revenues WHERE user_id = $1 AND category = $2';
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
        .from('revenues')
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

  // Receitas mensais
  async getUserMonthlyRevenues(userId, year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('revenues')
        .select('category, amount')
        .eq('user_id', userId)
        .gte('date', startDate.toISOString())
        .lte('date', endDate.toISOString());
      
      if (error) throw error;
      
      // Agrupar por categoria
      const grouped = data.reduce((acc, revenue) => {
        const category = revenue.category || 'outros';
        const amount = parseFloat(revenue.amount || 0);
        acc[category] = (acc[category] || 0) + amount;
        return acc;
      }, {});
      
      return Object.entries(grouped).map(([category, total]) => ({
        category,
        total: parseFloat(total.toFixed(2))
      }));
    } else {
      const result = await this.db.query(
        'SELECT category, SUM(amount) as total FROM revenues WHERE user_id = $1 AND date >= $2 AND date <= $3 GROUP BY category',
        [userId, startDate, endDate]
      );
      
      return result.rows.map(row => ({
        category: row.category,
        total: parseFloat(row.total)
      }));
    }
  }

  // Deletar receita
  async deleteRevenue(revenueId, userId) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('revenues')
        .delete()
        .eq('id', revenueId)
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.db.query(
        'DELETE FROM revenues WHERE id = $1 AND user_id = $2 RETURNING *',
        [revenueId, userId]
      );
      return result.rows[0];
    }
  }
}

module.exports = RevenueModel;