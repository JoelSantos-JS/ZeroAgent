const databaseService = require('../config/database');
const logger = require('../utils/logger');
const crypto = require('crypto');

class UserService {
  constructor() {
    this.userCache = new Map(); // Cache em memória para usuários ativos
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutos
  }

  // Obter ou criar usuário baseado no número do WhatsApp
  async getOrCreateUser(whatsappNumber, name = null) {
    try {
      // Normalizar número do WhatsApp
      const normalizedNumber = this.normalizeWhatsAppNumber(whatsappNumber);
      
      // Verificar cache primeiro
      const cachedUser = this.getUserFromCache(normalizedNumber);
      if (cachedUser) {
        return cachedUser;
      }
      
      // Buscar no banco de dados
      let user = await databaseService.getUserByWhatsApp(normalizedNumber);
      
      if (!user) {
        // Criar novo usuário automaticamente via WhatsApp
        console.log(`👤 Criando novo usuário via WhatsApp: ${normalizedNumber}`);
        
        // Gerar um nome padrão se não fornecido
        const defaultName = name || `Usuário ${normalizedNumber.slice(-4)}`;
        
        user = await databaseService.createUser(
          normalizedNumber,
          defaultName,
          null, // firebase_uid será null para usuários WhatsApp
          null  // email será gerado automaticamente
        );
        
        logger.info('Novo usuário criado via WhatsApp', {
          userId: user.id,
          whatsappNumber: normalizedNumber,
          name: defaultName,
          authMethod: 'whatsapp'
        });
        
        console.log(`✅ Usuário criado com sucesso: ${user.name} (${normalizedNumber})`);
      } else {
        // Atualizar nome se fornecido e diferente
        if (name && name !== user.name) {
          await this.updateUserName(user.id, name);
          user.name = name;
        }
        
        logger.info('Usuário existente autenticado via WhatsApp', {
          userId: user.id,
          whatsappNumber: normalizedNumber,
          authMethod: 'whatsapp'
        });
      }
      
      // Adicionar ao cache
      this.addUserToCache(normalizedNumber, user);
      
      return user;
      
    } catch (error) {
      console.error('❌ Erro ao obter/criar usuário via WhatsApp:', error);
      logger.error('Erro no UserService.getOrCreateUser', {
        whatsappNumber,
        error: error.message,
        authMethod: 'whatsapp'
      });
      throw error;
    }
  }

  // Autenticar usuário com email e senha
  async authenticateUser(email, password) {
    try {
      const authService = require('./auth-service');
      
      // Tentar autenticar com Firebase usando email/senha
      // Nota: Esta é uma simulação - em produção você usaria Firebase Auth
      
      // Buscar usuário por email no banco local
      let user = await databaseService.getUserByEmail(email);
      
      if (!user) {
        // Criar usuário se não existir (registro automático)
        console.log(`👤 Criando novo usuário: ${email}`);
        
        user = await databaseService.createUser(
          null, // whatsapp_number será null inicialmente
          email.split('@')[0], // nome baseado no email
          null, // firebase_uid será definido após autenticação Firebase
          email
        );
        
        logger.info('Novo usuário criado via email', {
          userId: user.id,
          email: email,
          authMethod: 'email'
        });
      }
      
      // Simular validação de senha (em produção, usar Firebase Auth)
      if (password.length >= 6) {
        return {
          success: true,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            firebaseUid: user.firebase_uid
          }
        };
      } else {
        return {
          success: false,
          error: 'Senha deve ter pelo menos 6 caracteres'
        };
      }
      
    } catch (error) {
      console.error('❌ Erro na autenticação:', error);
      return {
        success: false,
        error: 'Erro interno na autenticação'
      };
    }
  }



  // Normalizar número do WhatsApp
  normalizeWhatsAppNumber(number) {
    // Remover caracteres especiais e espaços
    let normalized = number.replace(/[^0-9]/g, '');
    
    // Remover @c.us se presente
    normalized = normalized.replace('@c.us', '');
    
    // Adicionar código do país se não presente (assumindo Brasil +55)
    if (normalized.length === 11 && normalized.startsWith('11')) {
      normalized = '55' + normalized;
    } else if (normalized.length === 10) {
      normalized = '5511' + normalized;
    } else if (normalized.length === 13 && !normalized.startsWith('55')) {
      // Pode ser outro país, manter como está
    }
    
    return normalized;
  }

  // Adicionar usuário ao cache
  addUserToCache(whatsappNumber, user) {
    const cacheEntry = {
      user,
      timestamp: Date.now()
    };
    
    this.userCache.set(whatsappNumber, cacheEntry);
    
    // Limpar cache antigo periodicamente
    this.cleanExpiredCache();
  }

  // Obter usuário do cache
  getUserFromCache(whatsappNumber) {
    const cacheEntry = this.userCache.get(whatsappNumber);
    
    if (!cacheEntry) {
      return null;
    }
    
    // Verificar se não expirou
    if (Date.now() - cacheEntry.timestamp > this.cacheTimeout) {
      this.userCache.delete(whatsappNumber);
      return null;
    }
    
    return cacheEntry.user;
  }

  // Limpar cache expirado
  cleanExpiredCache() {
    const now = Date.now();
    
    for (const [key, entry] of this.userCache.entries()) {
      if (now - entry.timestamp > this.cacheTimeout) {
        this.userCache.delete(key);
      }
    }
  }

  // Atualizar nome do usuário
  async updateUserName(userId, name) {
    try {
      if (databaseService.connectionType === 'supabase') {
        const { error } = await databaseService.supabase
          .from('users')
          .update({ name, updated_at: new Date() })
          .eq('id', userId);
        
        if (error) throw error;
      } else {
        await databaseService.query(
          'UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2',
          [name, userId]
        );
      }
      
      logger.info('Nome do usuário atualizado', { userId, name });
      
    } catch (error) {
      console.error('❌ Erro ao atualizar nome do usuário:', error);
      logger.error('Erro ao atualizar nome do usuário', {
        userId,
        name,
        error: error.message
      });
      throw error;
    }
  }

  // Obter estatísticas do usuário
  async getUserStats(userId) {
    try {
      const stats = {
        totalTransactions: 0,
        totalSpent: 0,
        totalProducts: 0,
        monthlySpent: 0,
        topCategories: [],
        recentTransactions: []
      };
      
      // Total de transações e gastos
      if (databaseService.connectionType === 'supabase') {
        // Transações totais (usando tabela expenses)
        const { data: expenses, error: expensesError } = await databaseService.supabase
          .from('expenses')
          .select('amount, category')
          .eq('user_id', userId);
        
        if (expensesError) throw expensesError;
        
        stats.totalTransactions = expenses.length;
        stats.totalSpent = expenses.reduce((sum, t) => sum + parseFloat(t.amount), 0);
        
        // Produtos totais
        const { data: products, error: prodError } = await databaseService.supabase
          .from('products')
          .select('id')
          .eq('user_id', userId);
        
        if (prodError) throw prodError;
        
        stats.totalProducts = products.length;
        
      } else {
        // PostgreSQL (usando tabela expenses)
        const expensesResult = await databaseService.query(
          'SELECT COUNT(*) as count, SUM(amount) as total FROM expenses WHERE user_id = $1',
          [userId]
        );
        
        stats.totalTransactions = parseInt(expensesResult.rows[0].count);
        stats.totalSpent = parseFloat(expensesResult.rows[0].total) || 0;
        
        const prodResult = await databaseService.query(
          'SELECT COUNT(*) as count FROM products WHERE user_id = $1',
          [userId]
        );
        
        stats.totalProducts = parseInt(prodResult.rows[0].count);
      }
      
      // Gastos do mês atual
      const currentMonth = new Date();
      const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59);
      
      const monthlyExpenses = await databaseService.getUserMonthlyExpenses(
        userId,
        currentMonth.getFullYear(),
        currentMonth.getMonth() + 1
      );
      
      stats.monthlySpent = Object.values(monthlyExpenses).reduce((sum, value) => sum + value, 0);
      stats.topCategories = Object.entries(monthlyExpenses)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([category, amount]) => ({ category, amount }));
      
      // Transações recentes (usando expenses)
      stats.recentTransactions = await databaseService.getUserExpenses(userId, 5);
      
      return stats;
      
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas do usuário:', error);
      logger.error('Erro ao obter estatísticas do usuário', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  // Verificar se usuário existe
  async userExists(whatsappNumber) {
    try {
      const normalizedNumber = this.normalizeWhatsAppNumber(whatsappNumber);
      const user = await databaseService.getUserByWhatsApp(normalizedNumber);
      return !!user;
    } catch (error) {
      console.error('❌ Erro ao verificar existência do usuário:', error);
      return false;
    }
  }

  // Obter usuário por ID
  async getUserById(userId) {
    try {
      if (databaseService.connectionType === 'supabase') {
        const { data, error } = await databaseService.supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();
        
        if (error && error.code !== 'PGRST116') throw error;
        return data;
      } else {
        const result = await databaseService.query(
          'SELECT * FROM users WHERE id = $1',
          [userId]
        );
        return result.rows[0];
      }
    } catch (error) {
      console.error('❌ Erro ao obter usuário por ID:', error);
      logger.error('Erro ao obter usuário por ID', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  // Desativar usuário
  async deactivateUser(userId) {
    try {
      if (databaseService.connectionType === 'supabase') {
        const { error } = await databaseService.supabase
          .from('users')
          .update({ is_active: false, updated_at: new Date() })
          .eq('id', userId);
        
        if (error) throw error;
      } else {
        await databaseService.query(
          'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1',
          [userId]
        );
      }
      
      // Remover do cache
      for (const [key, entry] of this.userCache.entries()) {
        if (entry.user.id === userId) {
          this.userCache.delete(key);
          break;
        }
      }
      
      logger.info('Usuário desativado', { userId });
      
    } catch (error) {
      console.error('❌ Erro ao desativar usuário:', error);
      logger.error('Erro ao desativar usuário', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  // Reativar usuário
  async reactivateUser(userId) {
    try {
      if (databaseService.connectionType === 'supabase') {
        const { error } = await databaseService.supabase
          .from('users')
          .update({ is_active: true, updated_at: new Date() })
          .eq('id', userId);
        
        if (error) throw error;
      } else {
        await databaseService.query(
          'UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1',
          [userId]
        );
      }
      
      logger.info('Usuário reativado', { userId });
      
    } catch (error) {
      console.error('❌ Erro ao reativar usuário:', error);
      logger.error('Erro ao reativar usuário', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  // Gerar ID único para sessão
  generateSessionId(userId) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    return `${userId}_${timestamp}_${random}`;
  }

  // Limpar cache completamente
  clearCache() {
    this.userCache.clear();
    logger.info('Cache de usuários limpo');
  }

  // Obter estatísticas do cache
  getCacheStats() {
    return {
      size: this.userCache.size,
      timeout: this.cacheTimeout,
      entries: Array.from(this.userCache.keys())
    };
  }
}

// Instância singleton
const userService = new UserService();

module.exports = userService;
module.exports.UserService = UserService;