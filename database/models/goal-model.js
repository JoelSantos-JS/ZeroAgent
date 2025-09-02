// Goal Model - Gerenciamento de metas financeiras
const logger = require('../../utils/logger');
const moment = require('moment');

class GoalModel {
  constructor(databaseConnection) {
    this.db = databaseConnection;
  }

  // Criar nova meta
  async createGoal(userId, goalData) {
    const {
      title,
      description = null,
      targetAmount,
      category,
      goalType,
      targetDate = null,
      priority = 'medium',
      autoUpdate = true,
      reminderFrequency = 'weekly'
    } = goalData;

    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('goals')
        .insert({
          user_id: userId,
          title: title,
          description: description,
          target_amount: targetAmount,
          current_amount: 0.00,
          category: category,
          goal_type: goalType,
          target_date: targetDate,
          priority: priority,
          auto_update: autoUpdate,
          reminder_frequency: reminderFrequency,
          status: 'active'
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Registrar no histórico
      await this.addProgressHistory(data.id, 0, 0, 0, 'goal_created', null, 'Meta criada');
      
      return data;
    } else {
      const result = await this.db.query(
        `INSERT INTO goals (user_id, title, description, target_amount, current_amount, 
         category, goal_type, target_date, priority, auto_update, reminder_frequency, status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [userId, title, description, targetAmount, 0.00, category, goalType, 
         targetDate, priority, autoUpdate, reminderFrequency, 'active']
      );
      
      const goal = result.rows[0];
      await this.addProgressHistory(goal.id, 0, 0, 0, 'goal_created', null, 'Meta criada');
      
      return goal;
    }
  }

  // Buscar metas do usuário
  async getUserGoals(userId, status = null, limit = 50, offset = 0) {
    if (this.db.connectionType === 'supabase') {
      let query = this.db.supabase
        .from('user_goals_summary')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
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
        `SELECT *, calculate_goal_progress(id) as progress_percentage 
         FROM goals ${whereClause} 
         ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );
      return result.rows;
    }
  }

  // Buscar metas ativas do usuário
  async getActiveGoals(userId) {
    return await this.getUserGoals(userId, 'active');
  }

  // Buscar metas por categoria
  async getGoalsByCategory(userId, category, status = null) {
    if (this.db.connectionType === 'supabase') {
      let query = this.db.supabase
        .from('user_goals_summary')
        .select('*')
        .eq('user_id', userId)
        .eq('category', category)
        .order('created_at', { ascending: false });
      
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
        `SELECT *, calculate_goal_progress(id) as progress_percentage 
         FROM goals ${whereClause} ORDER BY created_at DESC`,
        params
      );
      return result.rows;
    }
  }

  // Buscar meta por ID
  async getGoalById(goalId, userId = null) {
    if (this.db.connectionType === 'supabase') {
      let query = this.db.supabase
        .from('user_goals_summary')
        .select('*')
        .eq('id', goalId);
      
      if (userId) {
        query = query.eq('user_id', userId);
      }
      
      const { data, error } = await query.single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } else {
      let whereClause = 'WHERE id = $1';
      let params = [goalId];
      
      if (userId) {
        whereClause += ' AND user_id = $2';
        params.push(userId);
      }
      
      const result = await this.db.query(
        `SELECT *, calculate_goal_progress(id) as progress_percentage 
         FROM goals ${whereClause}`,
        params
      );
      return result.rows[0];
    }
  }

  // Atualizar progresso da meta
  async updateGoalProgress(goalId, newAmount, changeReason = 'manual_update', transactionId = null, notes = null) {
    // Buscar meta atual
    const currentGoal = await this.getGoalById(goalId);
    if (!currentGoal) {
      throw new Error('Meta não encontrada');
    }

    const previousAmount = parseFloat(currentGoal.current_amount);
    const changeAmount = newAmount - previousAmount;

    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('goals')
        .update({ 
          current_amount: newAmount,
          updated_at: new Date().toISOString()
        })
        .eq('id', goalId)
        .select()
        .single();
      
      if (error) throw error;
      
      // Registrar no histórico
      await this.addProgressHistory(goalId, previousAmount, newAmount, changeAmount, changeReason, transactionId, notes);
      
      // Verificar se a meta foi atingida
      if (newAmount >= currentGoal.target_amount && currentGoal.status === 'active') {
        await this.completeGoal(goalId);
      }
      
      return data;
    } else {
      const result = await this.db.query(
        'UPDATE goals SET current_amount = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [newAmount, goalId]
      );
      
      const updatedGoal = result.rows[0];
      
      // Registrar no histórico
      await this.addProgressHistory(goalId, previousAmount, newAmount, changeAmount, changeReason, transactionId, notes);
      
      // Verificar se a meta foi atingida
      if (newAmount >= currentGoal.target_amount && currentGoal.status === 'active') {
        await this.completeGoal(goalId);
      }
      
      return updatedGoal;
    }
  }

  // Adicionar valor ao progresso da meta
  async addToGoalProgress(goalId, amount, changeReason = 'transaction', transactionId = null, notes = null) {
    const currentGoal = await this.getGoalById(goalId);
    if (!currentGoal) {
      throw new Error('Meta não encontrada');
    }

    const newAmount = parseFloat(currentGoal.current_amount) + amount;
    return await this.updateGoalProgress(goalId, newAmount, changeReason, transactionId, notes);
  }

  // Marcar meta como completa
  async completeGoal(goalId) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('goals')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', goalId)
        .select()
        .single();
      
      if (error) throw error;
      
      // Registrar no histórico
      await this.addProgressHistory(goalId, null, null, 0, 'goal_completed', null, 'Meta atingida!');
      
      return data;
    } else {
      const result = await this.db.query(
        'UPDATE goals SET status = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *',
        ['completed', goalId]
      );
      
      // Registrar no histórico
      await this.addProgressHistory(goalId, null, null, 0, 'goal_completed', null, 'Meta atingida!');
      
      return result.rows[0];
    }
  }

  // Atualizar meta
  async updateGoal(goalId, userId, updates) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('goals')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', goalId)
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
        `UPDATE goals SET ${setClause}, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
        [goalId, userId, ...values]
      );
      return result.rows[0];
    }
  }

  // Deletar meta
  async deleteGoal(goalId, userId) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('goals')
        .delete()
        .eq('id', goalId)
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.db.query(
        'DELETE FROM goals WHERE id = $1 AND user_id = $2 RETURNING *',
        [goalId, userId]
      );
      return result.rows[0];
    }
  }

  // Buscar metas próximas do vencimento
  async getGoalsDueSoon(userId = null, days = 7) {
    if (this.db.connectionType === 'supabase') {
      let query = this.db.supabase
        .from('goals_due_soon')
        .select('*')
        .lte('days_remaining', days);
      
      if (userId) {
        query = query.eq('user_id', userId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    } else {
      let whereClause = '';
      let params = [days];
      
      if (userId) {
        whereClause = 'AND user_id = $2';
        params.push(userId);
      }
      
      const result = await this.db.query(
        `SELECT *, calculate_goal_progress(id) as progress_percentage,
         EXTRACT(DAYS FROM (target_date - CURRENT_DATE)) as days_remaining
         FROM goals 
         WHERE status = 'active' AND target_date IS NOT NULL 
         AND target_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '$1 days' ${whereClause}`,
        params
      );
      return result.rows;
    }
  }

  // Buscar categorias de metas
  async getGoalCategories(goalType = null) {
    if (this.db.connectionType === 'supabase') {
      let query = this.db.supabase
        .from('goal_categories')
        .select('*')
        .order('name');
      
      if (goalType) {
        query = query.eq('goal_type', goalType);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    } else {
      let whereClause = '';
      let params = [];
      
      if (goalType) {
        whereClause = 'WHERE goal_type = $1';
        params.push(goalType);
      }
      
      const result = await this.db.query(
        `SELECT * FROM goal_categories ${whereClause} ORDER BY name`,
        params
      );
      return result.rows;
    }
  }

  // Adicionar entrada no histórico de progresso
  async addProgressHistory(goalId, previousAmount, newAmount, changeAmount, changeReason, transactionId = null, notes = null) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('goal_progress_history')
        .insert({
          goal_id: goalId,
          previous_amount: previousAmount,
          new_amount: newAmount,
          change_amount: changeAmount,
          change_reason: changeReason,
          transaction_id: transactionId,
          notes: notes
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.db.query(
        `INSERT INTO goal_progress_history (goal_id, previous_amount, new_amount, change_amount, 
         change_reason, transaction_id, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [goalId, previousAmount, newAmount, changeAmount, changeReason, transactionId, notes]
      );
      return result.rows[0];
    }
  }

  // Buscar histórico de progresso de uma meta
  async getGoalProgressHistory(goalId, limit = 20) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('goal_progress_history')
        .select('*')
        .eq('goal_id', goalId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.db.query(
        'SELECT * FROM goal_progress_history WHERE goal_id = $1 ORDER BY created_at DESC LIMIT $2',
        [goalId, limit]
      );
      return result.rows;
    }
  }

  // Estatísticas das metas do usuário
  async getUserGoalStats(userId) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('goals')
        .select('status, goal_type, target_amount, current_amount')
        .eq('user_id', userId);
      
      if (error) throw error;
      
      const stats = {
        total: data.length,
        active: data.filter(g => g.status === 'active').length,
        completed: data.filter(g => g.status === 'completed').length,
        paused: data.filter(g => g.status === 'paused').length,
        totalTargetAmount: data.reduce((sum, g) => sum + parseFloat(g.target_amount), 0),
        totalCurrentAmount: data.reduce((sum, g) => sum + parseFloat(g.current_amount), 0),
        byType: {}
      };
      
      // Agrupar por tipo
      data.forEach(goal => {
        if (!stats.byType[goal.goal_type]) {
          stats.byType[goal.goal_type] = { count: 0, targetAmount: 0, currentAmount: 0 };
        }
        stats.byType[goal.goal_type].count++;
        stats.byType[goal.goal_type].targetAmount += parseFloat(goal.target_amount);
        stats.byType[goal.goal_type].currentAmount += parseFloat(goal.current_amount);
      });
      
      return stats;
    } else {
      const result = await this.db.query(
        'SELECT status, goal_type, target_amount, current_amount FROM goals WHERE user_id = $1',
        [userId]
      );
      
      const data = result.rows;
      const stats = {
        total: data.length,
        active: data.filter(g => g.status === 'active').length,
        completed: data.filter(g => g.status === 'completed').length,
        paused: data.filter(g => g.status === 'paused').length,
        totalTargetAmount: data.reduce((sum, g) => sum + parseFloat(g.target_amount), 0),
        totalCurrentAmount: data.reduce((sum, g) => sum + parseFloat(g.current_amount), 0),
        byType: {}
      };
      
      // Agrupar por tipo
      data.forEach(goal => {
        if (!stats.byType[goal.goal_type]) {
          stats.byType[goal.goal_type] = { count: 0, targetAmount: 0, currentAmount: 0 };
        }
        stats.byType[goal.goal_type].count++;
        stats.byType[goal.goal_type].targetAmount += parseFloat(goal.target_amount);
        stats.byType[goal.goal_type].currentAmount += parseFloat(goal.current_amount);
      });
      
      return stats;
    }
  }
}

module.exports = GoalModel;