// Debt Model - Gerenciamento de dívidas
const logger = require('../../utils/logger');
const moment = require('moment');

class DebtModel {
  constructor(databaseConnection) {
    this.db = databaseConnection;
  }

  // Criar nova dívida
  async createDebt(userId, debtData) {
    const {
      creditorName,
      description,
      originalAmount,
      currentAmount = null,
      interestRate = null,
      dueDate,
      category,
      priority = 'medium',
      paymentMethod = null,
      installmentsTotal = null,
      installmentAmount = null,
      notes = null
    } = debtData;

    // Se currentAmount não foi fornecido, usar originalAmount
    const actualCurrentAmount = currentAmount !== null ? currentAmount : originalAmount;

    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('debts')
        .insert({
          user_id: userId,
          creditor_name: creditorName,
          description: description,
          original_amount: originalAmount,
          current_amount: actualCurrentAmount,
          interest_rate: interestRate,
          due_date: dueDate ? dueDate.toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          category: category,
          priority: priority,
          status: 'pending',
          payment_method: paymentMethod,
          installments_total: installmentsTotal,
          installments_paid: 0,
          installment_amount: installmentAmount,
          notes: notes
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      const finalDueDate = dueDate ? dueDate.toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const result = await this.db.query(
        `INSERT INTO debts (user_id, creditor_name, description, original_amount, current_amount, 
         interest_rate, due_date, category, priority, status, payment_method, installments_total, 
         installments_paid, installment_amount, notes) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
        [userId, creditorName, description, originalAmount, actualCurrentAmount, interestRate, 
         finalDueDate, category, priority, 'pending', paymentMethod, installmentsTotal, 0, 
         installmentAmount, notes]
      );
      return result.rows[0];
    }
  }

  // Buscar dívidas do usuário
  async getUserDebts(userId, status = null, limit = 50, offset = 0) {
    if (this.db.connectionType === 'supabase') {
      let query = this.db.supabase
        .from('debts')
        .select('*')
        .eq('user_id', userId)
        .order('due_date', { ascending: true })
        .limit(limit)
        .range(offset, offset + limit - 1);
      
      if (status) {
        query = query.eq('status', status);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    } else {
      let whereClause = 'WHERE user_id = $1';
      let params = [userId];
      
      if (status) {
        whereClause += ' AND status = $2';
        params.push(status);
      }
      
      const result = await this.db.query(
        `SELECT * FROM debts ${whereClause} ORDER BY due_date ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );
      return result.rows;
    }
  }

  // Buscar dívidas ativas
  async getActiveDebts(userId) {
    return await this.getUserDebts(userId, 'pending');
  }

  // Buscar dívidas por categoria
  async getDebtsByCategory(userId, category, status = null) {
    if (this.db.connectionType === 'supabase') {
      let query = this.db.supabase
        .from('debts')
        .select('*')
        .eq('user_id', userId)
        .eq('category', category)
        .order('due_date', { ascending: true });
      
      if (status) {
        query = query.eq('status', status);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    } else {
      let whereClause = 'WHERE user_id = $1 AND category = $2';
      let params = [userId, category];
      
      if (status) {
        whereClause += ' AND status = $3';
        params.push(status);
      }
      
      const result = await this.db.query(
        `SELECT * FROM debts ${whereClause} ORDER BY due_date ASC`,
        params
      );
      return result.rows;
    }
  }

  // Buscar dívida por ID
  async getDebtById(debtId, userId = null) {
    if (this.db.connectionType === 'supabase') {
      let query = this.db.supabase
        .from('debts')
        .select('*')
        .eq('id', debtId);
      
      if (userId) {
        query = query.eq('user_id', userId);
      }
      
      const { data, error } = await query.single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } else {
      let whereClause = 'WHERE id = $1';
      let params = [debtId];
      
      if (userId) {
        whereClause += ' AND user_id = $2';
        params.push(userId);
      }
      
      const result = await this.db.query(
        `SELECT * FROM debts ${whereClause}`,
        params
      );
      return result.rows[0];
    }
  }

  // Buscar dívidas em atraso
  async getOverdueDebts(userId = null) {
    const now = new Date().toISOString();
    
    if (this.db.connectionType === 'supabase') {
      let query = this.db.supabase
        .from('debts')
        .select('*')
        .eq('status', 'pending')
        .lt('due_date', now)
        .order('due_date', { ascending: true });
      
      if (userId) {
        query = query.eq('user_id', userId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    } else {
      let whereClause = 'WHERE status = $1 AND due_date < $2';
      let params = ['pending', now];
      
      if (userId) {
        whereClause += ' AND user_id = $3';
        params.push(userId);
      }
      
      const result = await this.db.query(
        `SELECT * FROM debts ${whereClause} ORDER BY due_date ASC`,
        params
      );
      return result.rows;
    }
  }

  // Buscar dívidas próximas do vencimento
  async getUpcomingDebts(userId = null, days = 7) {
    const now = new Date();
    const futureDate = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));
    
    if (this.db.connectionType === 'supabase') {
      let query = this.db.supabase
        .from('debts')
        .select('*')
        .eq('status', 'pending')
        .gte('due_date', now.toISOString())
        .lte('due_date', futureDate.toISOString())
        .order('due_date', { ascending: true });
      
      if (userId) {
        query = query.eq('user_id', userId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    } else {
      let whereClause = 'WHERE status = $1 AND due_date >= $2 AND due_date <= $3';
      let params = ['pending', now.toISOString(), futureDate.toISOString()];
      
      if (userId) {
        whereClause += ' AND user_id = $4';
        params.push(userId);
      }
      
      const result = await this.db.query(
        `SELECT * FROM debts ${whereClause} ORDER BY due_date ASC`,
        params
      );
      return result.rows;
    }
  }

  // Adicionar pagamento à dívida
  async addPayment(debtId, paymentData) {
    const { userId, amount, paymentMethod, notes = null, date = null } = paymentData;
    const paymentDate = date || new Date().toISOString();

    // Buscar dívida atual
    const debt = await this.getDebtById(debtId, userId);
    if (!debt) {
      throw new Error('Dívida não encontrada');
    }

    if (debt.status === 'paid') {
      throw new Error('Dívida já foi quitada');
    }

    // Criar registro de pagamento
    let payment;
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('debt_payments')
        .insert({
          debt_id: debtId,
          user_id: userId,
          date: paymentDate,
          amount: amount,
          payment_method: paymentMethod,
          notes: notes
        })
        .select()
        .single();
      
      if (error) throw error;
      payment = data;
    } else {
      const result = await this.db.query(
        'INSERT INTO debt_payments (debt_id, user_id, date, amount, payment_method, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [debtId, userId, paymentDate, amount, paymentMethod, notes]
      );
      payment = result.rows[0];
    }

    // Atualizar valor atual da dívida
    const newCurrentAmount = parseFloat(debt.current_amount) - parseFloat(amount);
    const newInstallmentsPaid = debt.installments_paid ? debt.installments_paid + 1 : 1;
    
    // Determinar novo status
    let newStatus = debt.status;
    if (newCurrentAmount <= 0) {
      newStatus = 'paid';
    }

    await this.updateDebt(debtId, userId, {
      current_amount: Math.max(0, newCurrentAmount),
      installments_paid: newInstallmentsPaid,
      status: newStatus
    });

    return payment;
  }

  // Atualizar dívida
  async updateDebt(debtId, userId, updates) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('debts')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', debtId)
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      const fields = Object.keys(updates);
      const values = Object.values(updates);
      const setClause = fields.map((field, index) => `${field} = $${index + 3}`).join(', ');
      
      const result = await this.db.query(
        `UPDATE debts SET ${setClause}, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
        [debtId, userId, ...values]
      );
      return result.rows[0];
    }
  }

  // Deletar dívida
  async deleteDebt(debtId, userId) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('debts')
        .delete()
        .eq('id', debtId)
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.db.query(
        'DELETE FROM debts WHERE id = $1 AND user_id = $2 RETURNING *',
        [debtId, userId]
      );
      return result.rows[0];
    }
  }

  // Calcular total de dívidas do usuário
  async getTotalDebt(userId, status = 'pending') {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('debts')
        .select('current_amount')
        .eq('user_id', userId)
        .eq('status', status);
      
      if (error) throw error;
      return data.reduce((total, debt) => total + parseFloat(debt.current_amount), 0);
    } else {
      const result = await this.db.query(
        'SELECT SUM(current_amount) as total FROM debts WHERE user_id = $1 AND status = $2',
        [userId, status]
      );
      return parseFloat(result.rows[0].total) || 0;
    }
  }

  // Buscar pagamentos de uma dívida
  async getDebtPayments(debtId, limit = 20) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('debt_payments')
        .select('*')
        .eq('debt_id', debtId)
        .order('date', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.db.query(
        'SELECT * FROM debt_payments WHERE debt_id = $1 ORDER BY date DESC LIMIT $2',
        [debtId, limit]
      );
      return result.rows;
    }
  }

  // Estatísticas das dívidas do usuário
  async getUserDebtStats(userId) {
    const debts = await this.getUserDebts(userId);
    const overdueDebts = await this.getOverdueDebts(userId);
    const upcomingDebts = await this.getUpcomingDebts(userId, 7);
    
    const stats = {
      total: debts.length,
      active: debts.filter(d => d.status === 'pending').length,
      paid: debts.filter(d => d.status === 'paid').length,
      overdue: overdueDebts.length,
      upcomingSoon: upcomingDebts.length,
      totalAmount: debts.reduce((sum, d) => sum + parseFloat(d.current_amount), 0),
      overdueAmount: overdueDebts.reduce((sum, d) => sum + parseFloat(d.current_amount), 0),
      byCategory: {},
      byPriority: {}
    };
    
    // Agrupar por categoria
    debts.forEach(debt => {
      if (!stats.byCategory[debt.category]) {
        stats.byCategory[debt.category] = { count: 0, amount: 0 };
      }
      stats.byCategory[debt.category].count++;
      stats.byCategory[debt.category].amount += parseFloat(debt.current_amount);
    });
    
    // Agrupar por prioridade
    debts.forEach(debt => {
      if (!stats.byPriority[debt.priority]) {
        stats.byPriority[debt.priority] = { count: 0, amount: 0 };
      }
      stats.byPriority[debt.priority].count++;
      stats.byPriority[debt.priority].amount += parseFloat(debt.current_amount);
    });
    
    return stats;
  }
}

module.exports = DebtModel;