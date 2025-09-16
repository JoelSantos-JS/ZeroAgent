const logger = require('../../../utils/logger');

/**
 * Gerenciador de sincronização automática de vendas
 * Extraído do sales-handler.js para modularização
 */
class SyncManager {
  constructor(databaseService) {
    this.databaseService = databaseService;
    
    // Configurações de sincronização
    this.syncInterval = 30000; // 30 segundos
    this.lastSyncTimes = new Map(); // Por usuário
    this.isRunning = false;
    this.syncIntervalId = null;
    
    // Métricas de sincronização
    this.metrics = {
      totalSyncs: 0,
      totalSalesProcessed: 0,
      totalRevenue: 0,
      lastSyncTime: null,
      errors: 0,
      averageSyncTime: 0
    };
  }

  /**
   * Verificar se é comando de sincronização
   * Extraído de: sales-handler.js linhas 648-665
   */
  isSyncCommand(descricao, intencao) {
    const syncKeywords = [
      'sincronizar', 'sync', 'atualizar vendas', 'buscar vendas',
      'verificar vendas', 'importar vendas', 'carregar vendas'
    ];
    
    const text = descricao?.toLowerCase() || '';
    return syncKeywords.some(keyword => text.includes(keyword)) ||
           intencao === 'sincronizar_vendas';
  }

  /**
   * Iniciar sincronização automática
   * Extraído de: sales-handler.js linhas 56-81
   */
  async startAutoSync() {
    if (this.isRunning) {
      console.log('⚠️ Sincronização já está rodando');
      return;
    }

    this.isRunning = true;
    console.log('🔄 Iniciando sincronização automática de vendas...');

    // Executar sincronização inicial
    await this.syncAllUsers();

    // Configurar intervalo de sincronização
    this.syncIntervalId = setInterval(async () => {
      try {
        await this.syncAllUsers();
      } catch (error) {
        console.error('❌ Erro na sincronização automática:', error);
        this.metrics.errors++;
      }
    }, this.syncInterval);

    logger.info('Sincronização automática iniciada', {
      interval: this.syncInterval
    });
  }

  /**
   * Parar sincronização automática
   * Extraído de: sales-handler.js linhas 86-93
   */
  stopAutoSync() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
    this.isRunning = false;
    console.log('⏹️ Sincronização automática parada');
    
    logger.info('Sincronização automática parada');
  }

  /**
   * Sincronizar vendas de todos os usuários
   * Extraído de: sales-handler.js linhas 98-113
   */
  async syncAllUsers() {
    try {
      const startTime = Date.now();
      
      // Buscar todos os usuários ativos
      const users = await this.getActiveUsers();
      
      let totalProcessed = 0;
      for (const user of users) {
        const processed = await this.syncUserSales(user.id);
        totalProcessed += processed;
      }
      
      const syncTime = Date.now() - startTime;
      this.updateSyncMetrics(syncTime, totalProcessed);
      
      console.log(`🔄 Sincronização completa: ${users.length} usuários, ${totalProcessed} vendas processadas em ${syncTime}ms`);
      
    } catch (error) {
      console.error('❌ Erro ao sincronizar usuários:', error);
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Sincronizar vendas de um usuário específico
   * Extraído de: sales-handler.js linhas 119-163
   */
  async syncUserSales(userId) {
    try {
      // Usar timestamp local por enquanto (até implementar as novas tabelas)
      const lastSync = this.lastSyncTimes.get(userId) || new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      // Buscar vendas novas (simulação - por enquanto não há tabela sales)
      // TODO: Implementar quando a tabela sales estiver disponível
      const newSales = await this.detectNewSales(userId, lastSync);
      
      let processedCount = 0;
      
      if (newSales.length > 0) {
        console.log(`🔍 ${newSales.length} vendas novas encontradas para usuário ${userId}`);
        
        let errorCount = 0;
        
        // Processar cada venda
        for (const sale of newSales) {
          try {
            await this.processSale(userId, sale);
            processedCount++;
          } catch (error) {
            console.error(`❌ Erro ao processar venda ${sale.sale_id}:`, error);
            errorCount++;
          }
        }
        
        // Atualizar métricas locais
        this.lastSyncTimes.set(userId, new Date());
        
        logger.info('Vendas sincronizadas', {
          userId,
          salesCount: newSales.length,
          processedCount,
          errorCount
        });
      } else {
        // Atualizar timestamp mesmo sem vendas novas
        this.lastSyncTimes.set(userId, new Date());
      }
      
      return processedCount;
      
    } catch (error) {
      console.error(`❌ Erro ao sincronizar vendas do usuário ${userId}:`, error);
      this.metrics.errors++;
      return 0;
    }
  }

  /**
   * Detectar vendas novas na tabela sales do microssaas
   * Extraído de: sales-handler.js linhas 171-178
   */
  async detectNewSales(userId, lastSyncTime) {
    try {
      // Implementar busca real quando a integração estiver pronta
      // Por enquanto, retorna array vazio
      return [];
      
      // Código futuro:
      // return await this.databaseService.getNewSales(userId, lastSyncTime);
    } catch (error) {
      console.error('❌ Erro ao detectar vendas novas:', error);
      return [];
    }
  }

  /**
   * Processar uma venda individual
   * Extraído de: sales-handler.js linhas 185-260
   */
  async processSale(userId, saleData) {
    try {
      const {
        sale_id,
        product_id,
        total_amount,
        unit_price,
        quantity,
        buyer_name,
        date,
        product_name,
        cost_price,
        product_category
      } = saleData;

      // Calcular métricas
      const costTotal = (cost_price || 0) * quantity;
      const profit = total_amount - costTotal;
      const margin = total_amount > 0 ? ((profit / total_amount) * 100) : 0;

      // Criar transação de receita no Vox Agent
      const transactionData = {
        user_id: userId,
        type: 'income',
        amount: total_amount,
        category: 'vendas',
        description: `Venda: ${product_name || 'Produto'} (${quantity}x) - ${buyer_name || 'Cliente'}`,
        transaction_date: new Date(date),
        metadata: {
          sale_id,
          product_id,
          product_name,
          product_category,
          quantity,
          unit_price,
          cost_price: cost_price || 0,
          profit,
          margin: Math.round(margin * 100) / 100,
          buyer_name,
          source: 'microssaas_integration'
        }
      };

      // Registrar transação
      const transaction = await this.databaseService.createTransaction(
        userId,
        'income',
        total_amount,
        'vendas',
        transactionData.description,
        transactionData.transaction_date
      );

      // Atualizar métricas
      this.metrics.totalSalesProcessed++;
      this.metrics.totalRevenue += total_amount;

      console.log(`💰 Venda processada: ${product_name} - R$ ${total_amount.toFixed(2)} (Lucro: R$ ${profit.toFixed(2)})`);
      
      logger.info('Venda processada automaticamente', {
        userId,
        saleId: sale_id,
        productName: product_name,
        amount: total_amount,
        profit,
        margin
      });

      return transaction;
      
    } catch (error) {
      console.error('❌ Erro ao processar venda:', error);
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Processar comando de sincronização manual
   * Extraído de: sales-handler.js linhas 734-759
   */
  async handleSyncCommand(userId) {
    try {
      const startTime = Date.now();
      
      // Executar sincronização
      const processedSales = await this.syncUserSales(userId);
      
      const duration = Date.now() - startTime;
      
      let response = `✅ **Sincronização concluída!**\n\n`;
      response += `⏱️ **Tempo:** ${duration}ms\n`;
      response += `📊 **Vendas processadas:** ${processedSales}\n`;
      response += `📊 **Status:** Vendas atualizadas\n\n`;
      
      if (this.isRunning) {
        response += `💡 *As vendas são sincronizadas automaticamente a cada ${this.syncInterval / 1000} segundos.*`;
      } else {
        response += `⚠️ *Sincronização automática está desabilitada.*`;
      }
      
      logger.info('Sincronização manual executada', {
        userId,
        duration,
        processedSales
      });
      
      return response;
             
    } catch (error) {
      console.error('❌ Erro na sincronização manual:', error);
      return '❌ Erro na sincronização. Tente novamente em alguns instantes.';
    }
  }

  /**
   * Obter usuários ativos
   */
  async getActiveUsers() {
    try {
      if (this.databaseService.connectionType === 'supabase') {
        const { data, error } = await this.databaseService.supabase
          .from('users')
          .select('id, whatsapp_number')
          .eq('is_active', true);
        
        if (error) throw error;
        return data || [];
      } else {
        const result = await this.databaseService.query(
          'SELECT id, whatsapp_number FROM users WHERE is_active = true'
        );
        return result.rows || [];
      }
    } catch (error) {
      console.error('❌ Erro ao obter usuários ativos:', error);
      return [];
    }
  }

  /**
   * Configurar intervalo de sincronização
   */
  setSyncInterval(intervalMs) {
    if (intervalMs < 10000) { // Mínimo 10 segundos
      throw new Error('Intervalo mínimo de sincronização é 10 segundos');
    }
    
    this.syncInterval = intervalMs;
    
    // Reiniciar sincronização se estiver rodando
    if (this.isRunning) {
      this.stopAutoSync();
      this.startAutoSync();
    }
    
    logger.info('Intervalo de sincronização alterado', { intervalMs });
  }

  /**
   * Obter status de sincronização de um usuário
   */
  getUserSyncStatus(userId) {
    const lastSync = this.lastSyncTimes.get(userId);
    const now = new Date();
    
    if (!lastSync) {
      return {
        status: 'never',
        lastSync: null,
        nextSync: null,
        isOverdue: false
      };
    }
    
    const timeSinceLastSync = now - lastSync;
    const isOverdue = timeSinceLastSync > (this.syncInterval * 2); // Considera atrasado se passou 2x o intervalo
    
    return {
      status: isOverdue ? 'overdue' : 'synced',
      lastSync: lastSync.toISOString(),
      timeSinceLastSync,
      isOverdue
    };
  }

  /**
   * Forçar sincronização de usuário específico
   */
  async forceSyncUser(userId) {
    try {
      console.log(`🔄 Forçando sincronização do usuário: ${userId}`);
      
      const processedSales = await this.syncUserSales(userId);
      
      logger.info('Sincronização forçada executada', {
        userId,
        processedSales
      });
      
      return {
        success: true,
        processedSales,
        timestamp: new Date()
      };
      
    } catch (error) {
      console.error(`❌ Erro na sincronização forçada do usuário ${userId}:`, error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Atualizar métricas de sincronização
   */
  updateSyncMetrics(syncTime, processedSales) {
    this.metrics.totalSyncs++;
    this.metrics.lastSyncTime = new Date();
    this.metrics.averageSyncTime = (
      (this.metrics.averageSyncTime * (this.metrics.totalSyncs - 1) + syncTime) / 
      this.metrics.totalSyncs
    );
    
    if (processedSales > 0) {
      this.metrics.totalSalesProcessed += processedSales;
    }
  }

  /**
   * Obter métricas de sincronização
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeUsers: this.lastSyncTimes.size,
      averageSyncTimeMs: Math.round(this.metrics.averageSyncTime)
    };
  }

  /**
   * Obter status do gerenciador
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      syncInterval: this.syncInterval,
      activeUsers: this.lastSyncTimes.size,
      metrics: this.getMetrics()
    };
  }

  /**
   * Limpar dados de sincronização
   */
  clearSyncData() {
    this.lastSyncTimes.clear();
    this.metrics = {
      totalSyncs: 0,
      totalSalesProcessed: 0,
      totalRevenue: 0,
      lastSyncTime: null,
      errors: 0,
      averageSyncTime: 0
    };
    
    logger.info('Dados de sincronização limpos');
  }
}

module.exports = SyncManager;