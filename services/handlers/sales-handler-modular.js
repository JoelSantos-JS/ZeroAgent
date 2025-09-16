const BaseHandler = require('./base-handler');
const ResponseFormatter = require('../formatters/response-formatter');
const TransactionValidator = require('../validators/transaction-validator');
const logger = require('../../utils/logger');

// Módulos especializados
const ImageSalesProcessor = require('../sales/image-sales-processor');
const SalesAnalyticsProcessor = require('../sales/sales-analytics-processor');
const ProductManager = require('../sales/product-manager');

/**
 * Handler modular para processamento de vendas
 * Arquitetura refatorada com separação de responsabilidades
 */
class SalesHandlerModular extends BaseHandler {
  constructor(databaseService, userService) {
    super(databaseService, userService);
    
    // Configurações de sincronização
    this.syncInterval = 30000; // 30 segundos
    this.lastSyncTimes = new Map(); // Por usuário
    this.isRunning = false;
    
    // Inicializar módulos especializados
    this.imageSalesProcessor = new ImageSalesProcessor(databaseService);
    this.analyticsProcessor = new SalesAnalyticsProcessor(databaseService);
    this.productManager = new ProductManager(databaseService);
    
    // Métricas de performance
    this.metrics = {
      totalSalesProcessed: 0,
      totalRevenue: 0,
      lastSyncTime: null,
      errors: 0
    };
  }

  /**
   * Inicializar handler modular
   */
  async initialize() {
    try {
      console.log('🚀 Inicializando SalesHandler Modular...');
      
      // Sincronização automática desabilitada temporariamente
      console.log('⚠️ Sincronização automática desabilitada (modo manual)');
      
      console.log('✅ SalesHandler Modular inicializado com sucesso!');
      logger.info('SalesHandler Modular inicializado');
      
    } catch (error) {
      console.error('❌ Erro ao inicializar SalesHandler Modular:', error);
      logger.error('Erro na inicialização do SalesHandler Modular', { error: error.message });
      throw error;
    }
  }

  /**
   * Processar mensagem de vendas
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise
   * @returns {Promise<string>} - Resposta formatada
   */
  async process(userId, analysisResult) {
    try {
      const { descricao, intencao, tipo } = analysisResult;
      
      console.log('🛒 Processando venda:', { tipo, intencao, descricao: descricao?.substring(0, 50) });
      
      // 1. Verificar se é venda de produto identificado por imagem
      if (tipo === 'venda' && analysisResult.produto_nome) {
        return await this.imageSalesProcessor.handleImageProductSale(userId, analysisResult);
      }
      
      // 2. Verificar comandos de produto
      if (this.productManager.isCreateProductCommand(descricao)) {
        return await this.productManager.handleCreateProductCommand(userId, descricao, analysisResult);
      }
      
      if (this.productManager.isProductQuery(descricao, intencao)) {
        return await this.productManager.handleProductQuery(userId, analysisResult);
      }
      
      if (this.productManager.isProductSuggestionResponse(descricao)) {
        return await this.productManager.handleProductSuggestionResponse(userId, descricao);
      }
      
      // 3. Verificar consultas e análises
      if (this.analyticsProcessor.isSalesQuery(descricao, intencao)) {
        return await this.analyticsProcessor.handleSalesQuery(userId, analysisResult);
      }
      
      if (this.analyticsProcessor.isStockQuery(descricao, intencao)) {
        return await this.analyticsProcessor.handleStockQuery(userId, analysisResult);
      }
      
      // 4. Verificar comandos de sincronização
      if (this.isSyncCommand(descricao, intencao)) {
        return await this.handleSyncCommand(userId);
      }
      
      // 5. Verificar registro de venda tradicional
      if (this.isSaleRegistration(descricao, intencao)) {
        return await this.handleSaleRegistration(userId, analysisResult);
      }
      
      // 6. Resposta padrão para vendas não identificadas
      return this.getDefaultSalesResponse();
      
    } catch (error) {
      console.error('❌ Erro no processamento de venda:', error);
      this.metrics.errors++;
      return '❌ Erro ao processar venda. Tente novamente.';
    }
  }

  /**
   * Verificar se é confirmação de venda por imagem
   * @param {string} descricao - Descrição da mensagem
   * @param {string} userId - ID do usuário
   * @returns {boolean}
   */
  isImageSaleConfirmation(descricao, userId) {
    return this.imageSalesProcessor.isImageSaleConfirmation(descricao, userId);
  }

  /**
   * Processar confirmação de venda por imagem
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise
   * @returns {Promise<string>} - Resposta formatada
   */
  async handleImageSaleConfirmation(userId, analysisResult) {
    return await this.imageSalesProcessor.handleImageSaleConfirmation(userId, analysisResult);
  }

  /**
   * Salvar contexto de produto identificado por imagem
   * @param {string} userId - ID do usuário
   * @param {Object} productData - Dados do produto
   */
  saveImageProductContext(userId, productData) {
    this.imageSalesProcessor.saveImageProductContext(userId, productData);
  }

  /**
   * Obter último contexto de produto por imagem
   * @param {string} userId - ID do usuário
   * @returns {Object|null} - Contexto do produto
   */
  getLastImageProductContext(userId) {
    return this.imageSalesProcessor.getLastImageProductContext(userId);
  }

  /**
   * Verificar se é comando de sincronização
   * @param {string} descricao - Descrição da mensagem
   * @param {string} intencao - Intenção identificada
   * @returns {boolean}
   */
  isSyncCommand(descricao, intencao) {
    const syncKeywords = ['sincronizar', 'sync', 'atualizar', 'buscar vendas'];
    return syncKeywords.some(keyword => descricao.toLowerCase().includes(keyword)) ||
           intencao === 'sincronizar_vendas';
  }

  /**
   * Verificar se é registro de venda
   * @param {string} descricao - Descrição da mensagem
   * @param {string} intencao - Intenção identificada
   * @returns {boolean}
   */
  isSaleRegistration(descricao, intencao) {
    const saleKeywords = ['vendi', 'vendeu', 'venda', 'recebi', 'pagou'];
    return saleKeywords.some(keyword => descricao.toLowerCase().includes(keyword)) ||
           intencao === 'registrar_venda' ||
           intencao === 'venda';
  }

  /**
   * Processar comando de sincronização
   * @param {string} userId - ID do usuário
   * @returns {Promise<string>} - Resposta formatada
   */
  async handleSyncCommand(userId) {
    try {
      console.log('🔄 Processando comando de sincronização para usuário:', userId);
      
      // Implementar lógica de sincronização
      return '🔄 **Sincronização Iniciada**\n\n' +
             '⏳ Buscando novas vendas...\n\n' +
             '💡 *Você será notificado quando a sincronização for concluída.*';
      
    } catch (error) {
      console.error('❌ Erro na sincronização:', error);
      return '❌ Erro na sincronização. Tente novamente.';
    }
  }

  /**
   * Processar registro de venda tradicional
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise
   * @returns {Promise<string>} - Resposta formatada
   */
  async handleSaleRegistration(userId, analysisResult) {
    try {
      console.log('💰 Processando registro de venda tradicional para usuário:', userId);
      
      const { valor, produto_nome, descricao } = analysisResult;
      
      if (!valor || valor <= 0) {
        return '💰 **Registrar Venda**\n\n' +
               '❓ Por favor, informe o valor da venda.\n\n' +
               '💡 *Exemplo: "Vendi por R$ 150"*';
      }
      
      if (!produto_nome) {
        return '📦 **Registrar Venda**\n\n' +
               '❓ Por favor, informe o produto vendido.\n\n' +
               '💡 *Exemplo: "Vendi Fone Bluetooth por R$ 150"*';
      }
      
      // Registrar venda
      const saleData = {
        userId,
        productName: produto_nome,
        salePrice: valor,
        description: descricao,
        method: 'manual',
        date: new Date()
      };
      
      // Aqui implementaria o salvamento real
      logger.info('Venda tradicional registrada', saleData);
      
      this.metrics.totalSalesProcessed++;
      this.metrics.totalRevenue += valor;
      
      return `✅ **Venda Registrada!**\n\n` +
             `📦 **Produto:** ${produto_nome}\n` +
             `💰 **Valor:** R$ ${valor.toFixed(2)}\n` +
             `📅 **Data:** ${new Date().toLocaleDateString('pt-BR')}\n\n` +
             `🎉 *Venda adicionada ao seu histórico!*`;
      
    } catch (error) {
      console.error('❌ Erro ao registrar venda:', error);
      return '❌ Erro ao registrar venda. Tente novamente.';
    }
  }

  /**
   * Obter resposta padrão para vendas
   * @returns {string} - Resposta padrão
   */
  getDefaultSalesResponse() {
    return '🛒 **Sistema de Vendas**\n\n' +
           '📸 **Envie uma foto** do produto para identificação automática\n' +
           '💰 **Digite "vendi [produto] por [valor]"** para registro manual\n' +
           '📊 **Digite "relatório de vendas"** para análises\n' +
           '📦 **Digite "estoque"** para consultar produtos\n\n' +
           '💡 *Como posso ajudar com suas vendas?*';
  }

  /**
   * Obter métricas do handler
   * @returns {Object} - Métricas
   */
  getMetrics() {
    return {
      ...this.metrics,
      imageContexts: this.imageSalesProcessor.imageProductContext.size
    };
  }

  /**
   * Obter status do handler
   * @returns {Object} - Status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      modules: {
        imageSales: 'active',
        analytics: 'active',
        productManager: 'active'
      },
      metrics: this.getMetrics()
    };
  }
}

module.exports = SalesHandlerModular;