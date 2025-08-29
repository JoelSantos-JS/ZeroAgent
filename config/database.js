const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Configuração do PostgreSQL
const pgConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

class DatabaseService {
  constructor() {
    this.supabase = null;
    this.pgPool = null;
    this.isConnected = false;
    this.connectionType = null;
  }

  // Inicializar conexão com o banco
  async initialize() {
    try {
      console.log('🔌 Inicializando conexão com o banco de dados...');
      
      // Tentar Supabase primeiro
      if (supabaseUrl && supabaseKey) {
        console.log('📊 Conectando ao Supabase...');
        this.supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseKey);
        
        // Testar conexão
        const { data, error } = await this.supabase
          .from('users')
          .select('count')
          .limit(1);
        
        if (!error) {
          this.connectionType = 'supabase';
          this.isConnected = true;
          console.log('✅ Conectado ao Supabase com sucesso!');
          return;
        } else {
          console.log('⚠️ Erro ao conectar ao Supabase:', error.message);
        }
      }
      
      // Fallback para PostgreSQL
      if (process.env.DATABASE_URL) {
        console.log('🐘 Conectando ao PostgreSQL...');
        this.pgPool = new Pool(pgConfig);
        
        // Testar conexão
        const client = await this.pgPool.connect();
        await client.query('SELECT NOW()');
        client.release();
        
        this.connectionType = 'postgresql';
        this.isConnected = true;
        console.log('✅ Conectado ao PostgreSQL com sucesso!');
        return;
      }
      
      throw new Error('Nenhuma configuração de banco de dados encontrada');
      
    } catch (error) {
      console.error('❌ Erro ao conectar ao banco de dados:', error);
      throw error;
    }
  }

  // Executar query
  async query(sql, params = []) {
    if (!this.isConnected) {
      throw new Error('Banco de dados não conectado');
    }

    try {
      if (this.connectionType === 'supabase') {
        // Para Supabase, usar métodos específicos
        return await this.executeSupabaseQuery(sql, params);
      } else {
        // Para PostgreSQL
        const client = await this.pgPool.connect();
        try {
          const result = await client.query(sql, params);
          return result;
        } finally {
          client.release();
        }
      }
    } catch (error) {
      console.error('❌ Erro ao executar query:', error);
      throw error;
    }
  }

  // Executar query no Supabase (método auxiliar)
  async executeSupabaseQuery(sql, params) {
    // Para Supabase, converter SQL para métodos da API
    // Esta é uma implementação simplificada
    throw new Error('Query SQL direta não suportada no Supabase. Use os métodos específicos.');
  }

  // Métodos específicos para operações CRUD
  
  // Usuários
  async createUser(whatsappNumber, name = null, firebaseUid = null, email = null) {
    if (this.connectionType === 'supabase') {
      // Gerar email padrão baseado no número do WhatsApp se não fornecido
      const defaultEmail = email || `${whatsappNumber}@whatsapp.local`;
      
      const { data, error } = await this.supabase
        .from('users')
        .insert([{ 
          firebase_uid: firebaseUid,
          whatsapp_number: whatsappNumber, 
          name: name || 'Usuário WhatsApp',
          email: defaultEmail 
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.query(
        'INSERT INTO users (whatsapp_number, name) VALUES ($1, $2) RETURNING *',
        [whatsappNumber, name]
      );
      return result.rows[0];
    }
  }

  async getUserByWhatsApp(whatsappNumber) {
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('whatsapp_number', whatsappNumber)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
      return data;
    } else {
      const result = await this.query(
        'SELECT * FROM users WHERE whatsapp_number = $1',
        [whatsappNumber]
      );
      return result.rows[0];
    }
  }

  // Buscar usuário por email
  async getUserByEmail(email) {
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } else {
      const result = await this.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
      return result.rows[0];
    }
  }

  // Buscar usuário por Firebase UID
  async getUserByFirebaseUid(firebaseUid) {
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('firebase_uid', firebaseUid)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } else {
      const result = await this.query(
        'SELECT * FROM users WHERE firebase_uid = $1',
        [firebaseUid]
      );
      return result.rows[0];
    }
  }

  // Atualizar número do WhatsApp do usuário
  async updateUserWhatsApp(userId, whatsappNumber) {
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
        .from('users')
        .update({ whatsapp_number: whatsappNumber })
        .eq('id', userId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.query(
        'UPDATE users SET whatsapp_number = $1 WHERE id = $2 RETURNING *',
        [whatsappNumber, userId]
      );
      return result.rows[0];
    }
  }

  // =====================================
  // SESSÕES DE USUÁRIO (WhatsApp Auth)
  // =====================================

  // Criar sessão de usuário
  async createUserSession(phoneNumber, userId) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 horas
    
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
        .from('user_sessions')
        .upsert({
          phone_number: phoneNumber,
          user_id: userId,
          is_active: true,
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    }
  }

  // Obter sessão de usuário
  async getUserSession(phoneNumber) {
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
        .from('user_sessions')
        .select('*')
        .eq('phone_number', phoneNumber)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    }
  }

  // Invalidar sessão
  async invalidateUserSession(phoneNumber) {
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
        .from('user_sessions')
        .update({ is_active: false })
        .eq('phone_number', phoneNumber)
        .select();
      
      if (error) throw error;
      return data;
    }
  }

  // Deletar sessão de usuário
  async deleteUserSession(phoneNumber) {
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
        .from('user_sessions')
        .delete()
        .eq('phone_number', phoneNumber)
        .select();
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.query(
        'DELETE FROM user_sessions WHERE phone_number = $1 RETURNING *',
        [phoneNumber]
      );
      return result.rows;
    }
  }

  // =====================================
  // PROCESSO DE AUTENTICAÇÃO
  // =====================================

  // Criar processo de autenticação
  async createAuthProcess(phoneNumber, step, data = {}) {
    if (this.connectionType === 'supabase') {
      const { data: result, error } = await this.supabase
        .from('auth_processes')
        .upsert({
          phone_number: phoneNumber,
          step: step,
          data: data,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) throw error;
      return result;
    }
  }

  // Obter processo de autenticação
  async getAuthProcess(phoneNumber) {
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
        .from('auth_processes')
        .select('*')
        .eq('phone_number', phoneNumber)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    }
  }

  // Atualizar processo de autenticação
  async updateAuthProcess(phoneNumber, step, data = {}) {
    if (this.connectionType === 'supabase') {
      const { data: result, error } = await this.supabase
        .from('auth_processes')
        .update({
          step: step,
          data: data
        })
        .eq('phone_number', phoneNumber)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    }
  }

  // Deletar processo de autenticação
  async deleteAuthProcess(phoneNumber) {
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
        .from('auth_processes')
        .delete()
        .eq('phone_number', phoneNumber)
        .select();
      
      if (error) throw error;
      return data;
    }
  }

  // Método unificado para transações
  async createTransaction(userId, type, amount, category, description = null, transactionDate = null, subcategory = null, paymentMethod = null) {
    const date = transactionDate || new Date();
    
    // Converter tipo português para inglês
    const typeMapping = {
      'despesa': 'expense',
      'receita': 'revenue',
      'gasto': 'expense',
      'ganho': 'revenue'
    };
    
    const dbType = typeMapping[type] || type;
    
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
        .from('transactions')
        .insert({
          user_id: userId,
          type: dbType,
          amount: amount,
          category: category,
          subcategory: subcategory,
          description: description,
          date: date.toISOString(),
          transaction_date: date.toISOString(),
          payment_method: paymentMethod,
          status: 'completed',
          value: amount,
          // Campos para compras parceladas (existem na tabela)
          is_installment: false,
          installment_info: null
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Também inserir na tabela específica para compatibilidade
      if (dbType === 'expense') {
        await this.supabase
          .from('expenses')
          .insert({
            user_id: userId,
            amount: amount,
            category: category,
            description: description,
            date: date.toISOString(),
            type: subcategory || 'other'
          });
      } else if (dbType === 'revenue') {
        await this.supabase
          .from('revenues')
          .insert({
            user_id: userId,
            amount: amount,
            category: category,
            description: description,
            date: date.toISOString(),
            source: 'other'
          });
      }
      
      return data;
    } else {
      const result = await this.query(
        'INSERT INTO transactions (user_id, type, amount, category, subcategory, description, date, transaction_date, payment_method, status, value) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
        [userId, dbType, amount, category, subcategory, description, date, date, paymentMethod, 'completed', amount]
      );
      
      // Também inserir na tabela específica para compatibilidade
      if (dbType === 'expense') {
        await this.query(
          'INSERT INTO expenses (user_id, amount, category, description, date, type) VALUES ($1, $2, $3, $4, $5, $6)',
          [userId, amount, category, description, date, subcategory || 'other']
        );
      } else if (dbType === 'revenue') {
        await this.query(
          'INSERT INTO revenues (user_id, amount, category, description, date, source) VALUES ($1, $2, $3, $4, $5, $6)',
          [userId, amount, category, description, date, 'other']
        );
      }
      
      return result.rows[0];
    }
  }

  // Receitas (mantido para compatibilidade)
  async createRevenue(userId, value, category, description = null, transactionDate = null, source = 'other') {
    return this.createTransaction(userId, 'revenue', value, category, description, transactionDate);
  }

  // Despesas (mantido para compatibilidade)
  async createExpense(userId, value, category, description = null, transactionDate = null, type = 'other') {
    return this.createTransaction(userId, 'expense', value, category, description, transactionDate, type);
  }

  // Método específico para compras parceladas
  async createInstallmentTransaction(userId, installmentData) {
    const {
      totalAmount,
      totalInstallments,
      currentInstallment = 1,
      installmentAmount,
      category,
      description,
      transactionDate,
      paymentMethod
    } = installmentData;
    
    const date = transactionDate || new Date();
    const remainingAmount = totalAmount - (installmentAmount * currentInstallment);
    
    // Calcular próxima data de vencimento (30 dias)
    const nextDueDate = new Date(date);
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
    
    // Criar objeto com informações do parcelamento
    const installmentInfo = {
      totalAmount: totalAmount,
      totalInstallments: totalInstallments,
      currentInstallment: currentInstallment,
      installmentAmount: installmentAmount,
      remainingAmount: remainingAmount,
      nextDueDate: nextDueDate.toISOString()
    };
    
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
        .from('transactions')
        .insert({
          user_id: userId,
          type: 'expense',
          amount: installmentAmount, // Valor da parcela atual
          category: category,
          description: description,
          date: date.toISOString(),
          payment_method: paymentMethod,
          status: 'completed',
          value: installmentAmount,
          // Campos específicos para parcelamento
          is_installment: true,
          installment_info: installmentInfo
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Também inserir na tabela específica para compatibilidade
      await this.supabase
        .from('expenses')
        .insert({
          user_id: userId,
          amount: installmentAmount,
          category: category,
          description: description,
          date: date.toISOString(),
          type: 'installment'
        });
      
      return data;
    }
  }



  // Obter histórico de transações
  async getTransactionHistory(userId, limit = 10) {
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.query(
        'SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC LIMIT $2',
        [userId, limit]
      );
      return result.rows;
    }
  }

  // Obter saldo atual
  async getCurrentBalance(userId) {
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
        .from('transactions')
        .select('amount, type')
        .eq('user_id', userId);
      
      if (error) throw error;
      
      const balance = data.reduce((acc, t) => {
        const amount = parseFloat(t.amount) || 0;
        return t.type === 'revenue' ? acc + amount : acc - amount;
      }, 0);
      
      return balance;
    } else {
      const result = await this.query(
        'SELECT amount, type FROM transactions WHERE user_id = $1',
        [userId]
      );
      
      const balance = result.rows.reduce((acc, t) => {
        const amount = parseFloat(t.amount) || 0;
        return t.type === 'revenue' ? acc + amount : acc - amount;
      }, 0);
      
      return balance;
    }
  }

  // Obter transações por tipo
  async getTransactionsByType(userId, type, limit = 10) {
    const dbType = type === 'despesa' ? 'expense' : type === 'receita' ? 'revenue' : type;
    
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('type', dbType)
        .order('date', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.query(
        'SELECT * FROM transactions WHERE user_id = $1 AND type = $2 ORDER BY date DESC LIMIT $3',
        [userId, dbType, limit]
      );
      return result.rows;
    }
  }

  // =====================================================
  // MÉTODOS PARA INTEGRAÇÃO DE VENDAS
  // =====================================================

  // Buscar vendas novas desde última sincronização
  async getNewSales(userId, lastSyncTime) {
    try {
      if (this.connectionType === 'supabase') {
        const { data, error } = await this.supabase
          .rpc('get_new_sales', {
            p_user_id: userId,
            p_last_sync: lastSyncTime.toISOString()
          });
        
        if (error) throw error;
        return data || [];
      } else {
        const result = await this.query(`
          SELECT 
            s.id as sale_id,
            s.product_id,
            s.user_id,
            s.quantity,
            s.unit_price,
            s.total_amount,
            s.cost_price,
            s.profit,
            s.margin_percent,
            s.buyer_name,
            s.buyer_email,
            s.sale_date,
            p.name as product_name,
            p.category as product_category,
            s.created_at
          FROM sales s
          LEFT JOIN products p ON s.product_id = p.id
          WHERE s.user_id = $1
          AND s.created_at > $2
          ORDER BY s.created_at ASC
        `, [userId, lastSyncTime]);
        
        return result.rows || [];
      }
    } catch (error) {
      console.error('❌ Erro ao buscar vendas novas:', error);
      throw error;
    }
  }

  // Atualizar status de sincronização
  async updateSyncStatus(userId, syncType, recordsProcessed = 0, status = 'success', errorMessage = null) {
    try {
      const syncData = {
        user_id: userId,
        sync_type: syncType,
        last_sync_time: new Date().toISOString(),
        records_processed: recordsProcessed,
        status: status,
        error_message: errorMessage
      };

      if (this.connectionType === 'supabase') {
        const { data, error } = await this.supabase
          .from('sync_status')
          .upsert(syncData, {
            onConflict: 'user_id,sync_type'
          })
          .select()
          .single();
        
        if (error) throw error;
        return data;
      } else {
        const result = await this.query(`
          INSERT INTO sync_status (user_id, sync_type, last_sync_time, records_processed, status, error_message)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (user_id, sync_type)
          DO UPDATE SET
            last_sync_time = EXCLUDED.last_sync_time,
            records_processed = EXCLUDED.records_processed,
            status = EXCLUDED.status,
            error_message = EXCLUDED.error_message,
            updated_at = NOW()
          RETURNING *
        `, [userId, syncType, syncData.last_sync_time, recordsProcessed, status, errorMessage]);
        
        return result.rows[0];
      }
    } catch (error) {
      console.error('❌ Erro ao atualizar status de sincronização:', error);
      throw error;
    }
  }

  // Obter último status de sincronização
  async getLastSyncStatus(userId, syncType) {
    try {
      if (this.connectionType === 'supabase') {
        const { data, error } = await this.supabase
          .from('sync_status')
          .select('*')
          .eq('user_id', userId)
          .eq('sync_type', syncType)
          .single();
        
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
        return data;
      } else {
        const result = await this.query(
          'SELECT * FROM sync_status WHERE user_id = $1 AND sync_type = $2',
          [userId, syncType]
        );
        
        return result.rows[0] || null;
      }
    } catch (error) {
      console.error('❌ Erro ao obter status de sincronização:', error);
      return null;
    }
  }

  // Obter métricas de vendas
  async getSalesMetrics(userId, startDate = null, endDate = null) {
    try {
      let dateFilter = '';
      let params = [userId];
      
      if (startDate && endDate) {
        dateFilter = 'AND metric_date BETWEEN $2 AND $3';
        params.push(startDate, endDate);
      } else if (startDate) {
        dateFilter = 'AND metric_date >= $2';
        params.push(startDate);
      }

      if (this.connectionType === 'supabase') {
        let query = this.supabase
          .from('sales_metrics')
          .select(`
            *,
            products:product_id(name, category)
          `)
          .eq('user_id', userId);
        
        if (startDate) query = query.gte('metric_date', startDate);
        if (endDate) query = query.lte('metric_date', endDate);
        
        const { data, error } = await query.order('metric_date', { ascending: false });
        
        if (error) throw error;
        return data || [];
      } else {
        const result = await this.query(`
          SELECT 
            sm.*,
            p.name as product_name,
            p.category as product_category
          FROM sales_metrics sm
          LEFT JOIN products p ON sm.product_id = p.id
          WHERE sm.user_id = $1 ${dateFilter}
          ORDER BY sm.metric_date DESC
        `, params);
        
        return result.rows || [];
      }
    } catch (error) {
      console.error('❌ Erro ao obter métricas de vendas:', error);
      throw error;
    }
  }

  // Obter produtos com baixo estoque
  async getLowStockProducts(userId) {
    try {
      if (this.connectionType === 'supabase') {
        const { data, error } = await this.supabase
          .from('low_stock_products')
          .select('*')
          .eq('user_id', userId)
          .eq('needs_reorder', true);
        
        if (error) throw error;
        return data || [];
      } else {
        const result = await this.query(`
          SELECT * FROM low_stock_products 
          WHERE user_id = $1 AND needs_reorder = true
        `, [userId]);
        
        return result.rows || [];
      }
    } catch (error) {
      console.error('❌ Erro ao obter produtos com baixo estoque:', error);
      throw error;
    }
  }

  // Obter top produtos
  async getTopProducts(userId, limit = 10) {
    try {
      if (this.connectionType === 'supabase') {
        const { data, error } = await this.supabase
          .from('top_products')
          .select('*')
          .eq('user_id', userId)
          .order('total_revenue', { ascending: false })
          .limit(limit);
        
        if (error) throw error;
        return data || [];
      } else {
        const result = await this.query(`
          SELECT * FROM top_products 
          WHERE user_id = $1 
          ORDER BY total_revenue DESC 
          LIMIT $2
        `, [userId, limit]);
        
        return result.rows || [];
      }
    } catch (error) {
      console.error('❌ Erro ao obter top produtos:', error);
      throw error;
    }
  }

  // Obter dashboard de vendas
  async getSalesDashboard(userId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      if (this.connectionType === 'supabase') {
        const { data, error } = await this.supabase
          .from('sales_dashboard')
          .select('*')
          .eq('user_id', userId)
          .gte('sale_date', startDate.toISOString().split('T')[0])
          .order('sale_date', { ascending: false });
        
        if (error) throw error;
        return data || [];
      } else {
        const result = await this.query(`
          SELECT * FROM sales_dashboard 
          WHERE user_id = $1 
          AND sale_date >= $2
          ORDER BY sale_date DESC
        `, [userId, startDate.toISOString().split('T')[0]]);
        
        return result.rows || [];
      }
    } catch (error) {
      console.error('❌ Erro ao obter dashboard de vendas:', error);
      throw error;
    }
  }

  // Atualizar métricas de vendas
  async updateSalesMetrics(userId, date = null) {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];

      if (this.connectionType === 'supabase') {
        const { data, error } = await this.supabase
          .rpc('update_sales_metrics', {
            p_user_id: userId,
            p_date: targetDate
          });
        
        if (error) throw error;
        return data;
      } else {
        const result = await this.query(
          'SELECT update_sales_metrics($1, $2)',
          [userId, targetDate]
        );
        
        return result.rows[0];
      }
    } catch (error) {
      console.error('❌ Erro ao atualizar métricas de vendas:', error);
      throw error;
    }
  }

  // =====================================================
  // FIM DOS MÉTODOS DE INTEGRAÇÃO DE VENDAS
  // =====================================================



  async getUserTransactions(userId, limit = 50, offset = 0) {
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
        .from('expenses')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(limit)
        .range(offset, offset + limit - 1);
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.query(
        'SELECT * FROM expenses WHERE user_id = $1 ORDER BY date DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
      );
      return result.rows;
    }
  }

  // Alias para compatibilidade
  async getUserExpenses(userId, limit = 50, offset = 0) {
    return this.getUserTransactions(userId, limit, offset);
  }

  // Buscar receitas do usuário
  async getUserRevenues(userId, limit = 50, offset = 0) {
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
        .from('revenues')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(limit)
        .range(offset, offset + limit - 1);
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.query(
        'SELECT * FROM revenues WHERE user_id = $1 ORDER BY date DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
      );
      return result.rows;
    }
  }

  // Atualizar transação existente
  async updateTransaction(transactionId, updates) {
    try {
      if (this.connectionType === 'supabase') {
        const { data, error } = await this.supabase
          .from('transactions')
          .update(updates)
          .eq('id', transactionId)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      } else {
        // Construir query de update dinamicamente
        const setClause = Object.keys(updates)
          .map((key, index) => `${key} = $${index + 2}`)
          .join(', ');
        
        const values = [transactionId, ...Object.values(updates)];
        
        const result = await this.query(
          `UPDATE transactions SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
          values
        );
        
        return result.rows[0];
      }
    } catch (error) {
      console.error('❌ Erro ao atualizar transação:', error);
      throw error;
    }
  }

  async getUserTransactionsByCategory(userId, category, startDate = null, endDate = null) {
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
    
    if (this.connectionType === 'supabase') {
      let supabaseQuery = this.supabase
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
      const result = await this.query(query, params);
      return result.rows;
    }
  }

  // Alias para compatibilidade
  async getUserExpensesByCategory(userId, category, startDate = null, endDate = null) {
    return this.getUserTransactionsByCategory(userId, category, startDate, endDate);
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
    
    if (this.connectionType === 'supabase') {
      let supabaseQuery = this.supabase
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
      const result = await this.query(query, params);
      return result.rows;
    }
  }

  // Produtos
  async createProduct(userId, productName, productCategory, price, purchaseDate = null) {
    const date = purchaseDate || new Date();
    
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
        .from('products')
        .insert([{
          user_id: userId,
          product_name: productName,
          product_category: productCategory,
          price,
          purchase_date: date
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.query(
        'INSERT INTO products (user_id, product_name, product_category, price, purchase_date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [userId, productName, productCategory, price, date]
      );
      return result.rows[0];
    }
  }

  async getUserProducts(userId, limit = 50, offset = 0) {
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
        .from('products')
        .select('*')
        .eq('user_id', userId)
        .order('purchase_date', { ascending: false })
        .range(offset, offset + limit - 1);
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.query(
        'SELECT * FROM products WHERE user_id = $1 ORDER BY purchase_date DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
      );
      return result.rows;
    }
  }

  // Relatórios
  async getUserMonthlyRevenues(userId, year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
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
      const result = await this.query(
        'SELECT category, SUM(amount) as total FROM revenues WHERE user_id = $1 AND date >= $2 AND date <= $3 GROUP BY category',
        [userId, startDate, endDate]
      );
      
      return result.rows.map(row => ({
        category: row.category,
        total: parseFloat(row.total)
      }));
    }
  }

  async getUserMonthlyExpenses(userId, year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    if (this.connectionType === 'supabase') {
      const { data, error } = await this.supabase
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
      const result = await this.query(
        'SELECT category, SUM(amount) as total FROM expenses WHERE user_id = $1 AND date >= $2 AND date <= $3 GROUP BY category',
        [userId, startDate, endDate]
      );
      
      return result.rows.map(row => ({
        category: row.category,
        total: parseFloat(row.total)
      }));
    }
  }

  // Fechar conexão
  async close() {
    if (this.pgPool) {
      await this.pgPool.end();
    }
    this.isConnected = false;
    console.log('🔌 Conexão com o banco de dados fechada.');
  }
}

// Instância singleton
const databaseService = new DatabaseService();

module.exports = databaseService;