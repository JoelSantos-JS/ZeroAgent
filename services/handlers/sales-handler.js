const BaseHandler = require('./base-handler');
const ResponseFormatter = require('../formatters/response-formatter');
const TransactionValidator = require('../validators/transaction-validator');
const logger = require('../../utils/logger');

// Módulos especializados
const ImageSalesManager = require('../sales/managers/image-sales-manager');
const ProductSearchEngine = require('../sales/managers/product-search-engine');
const StockManager = require('../sales/managers/stock-manager');
const SalesAnalytics = require('../sales/managers/sales-analytics');
const ProductCatalogManager = require('../sales/managers/product-catalog-manager');
const SalesRegistrationEngine = require('../sales/managers/sales-registration-engine');
const SyncManager = require('../sales/managers/sync-manager');

/**
 * Handler refatorado para processamento de vendas
 * Arquitetura modular com separação de responsabilidades
 * Interface 100% compatível com o sales-handler.js original
 */
class SalesHandlerRefactored extends BaseHandler {
  constructor(databaseService, userService) {
    super(databaseService, userService);
    
    // Configurações de sincronização (compatibilidade)
    this.syncInterval = 30000; // 30 segundos
    this.lastSyncTimes = new Map(); // Por usuário
    this.isRunning = false;
    
    // Inicializar módulos especializados
    this.productSearchEngine = new ProductSearchEngine(databaseService);
    this.imageSalesManager = new ImageSalesManager(databaseService);
    this.stockManager = new StockManager(databaseService);
    this.salesAnalytics = new SalesAnalytics(databaseService);
    this.productCatalogManager = new ProductCatalogManager(databaseService);
    this.salesRegistrationEngine = new SalesRegistrationEngine(databaseService, this.productSearchEngine);
    this.syncManager = new SyncManager(databaseService);
    
    // Cache de contexto de produtos identificados por imagem (compatibilidade)
    this.imageProductContext = this.imageSalesManager.imageProductContext;
    this.contextTimeout = this.imageSalesManager.contextTimeout;
    
    // Métricas de performance (compatibilidade)
    this.metrics = {
      totalSalesProcessed: 0,
      totalRevenue: 0,
      lastSyncTime: null,
      errors: 0
    };
  }

  /**
   * Inicializar handler refatorado
   * Interface compatível com o original
   */
  async initialize() {
    try {
      console.log('🚀 Inicializando SalesHandler Refatorado...');
      
      // Sincronização automática desabilitada temporariamente
      // para evitar conflitos com WhatsApp Web.js
      console.log('⚠️ Sincronização automática desabilitada (modo manual)');
      
      console.log('✅ SalesHandler Refatorado inicializado com sucesso!');
      logger.info('SalesHandler Refatorado inicializado');
      
    } catch (error) {
      console.error('❌ Erro ao inicializar SalesHandler Refatorado:', error);
      logger.error('Erro na inicialização do SalesHandler Refatorado', { error: error.message });
      throw error;
    }
  }

  /**
   * Processar comandos de vendas e estoque
   * Interface idêntica ao original
   */
  async process(userId, analysisResult) {
    try {
      const { descricao, intencao, tipo, produto_nome, fonte } = analysisResult;
      
      // Verificar se é produto identificado por imagem
      if (tipo === 'venda' && produto_nome && fonte === 'banco_dados') {
        return await this.imageSalesManager.handleImageProductSale(userId, analysisResult);
      }
      
      // Verificar se é resposta a sugestão de produto (número)
      if (this.salesRegistrationEngine.isProductSuggestionResponse(descricao)) {
        return await this.salesRegistrationEngine.handleProductSuggestionResponse(userId, descricao);
      }
      
      // Verificar se é comando de criação de produto
      if (this.productCatalogManager.isCreateProductCommand(descricao)) {
        return await this.productCatalogManager.handleCreateProductCommand(userId, descricao, analysisResult);
      }
      
      // Verificar se é comando de sincronização
      if (this.syncManager.isSyncCommand(descricao, intencao)) {
        return await this.syncManager.handleSyncCommand(userId);
      }
      
      // Verificar se é confirmação de venda de produto identificado por imagem
      if (this.imageSalesManager.isImageSaleConfirmation(descricao, userId)) {
        return await this.imageSalesManager.handleImageSaleConfirmation(userId, analysisResult);
      }
      
      // Verificar se é registro de venda manual
      if (this.salesRegistrationEngine.isSaleRegistration(descricao, intencao)) {
        return await this.salesRegistrationEngine.handleSaleRegistration(userId, analysisResult);
      }
      
      // Verificar se é consulta de estoque
      if (this.isStockQuery(descricao, intencao)) {
        return await this.stockManager.handleStockQuery(userId, analysisResult);
      }
      
      // Verificar se é consulta detalhada de produto
      if (this.productCatalogManager.isProductQuery(descricao, intencao)) {
        return await this.productCatalogManager.handleProductQuery(userId, analysisResult);
      }
      
      // Verificar se é consulta de vendas
      if (this.isSalesQuery(descricao, intencao)) {
        return await this.salesAnalytics.handleSalesQuery(userId, analysisResult);
      }
      
      return null; // Não é comando relacionado a vendas
      
    } catch (error) {
      console.error('❌ Erro no SalesHandler Refatorado:', error);
      this.metrics.errors++;
      return '❌ Erro ao processar comando de vendas. Tente novamente.';
    }
  }

  // ========================================
  // MÉTODOS DE COMPATIBILIDADE COM ORIGINAL
  // ========================================

  /**
   * Verificar se é confirmação de venda por imagem
   * Compatibilidade com interface original
   */
  isImageSaleConfirmation(descricao, userId) {
    return this.imageSalesManager.isImageSaleConfirmation(descricao, userId);
  }

  /**
   * Processar confirmação de venda por imagem
   * Compatibilidade com interface original
   */
  async handleImageSaleConfirmation(userId, analysisResult) {
    const result = await this.imageSalesManager.handleImageSaleConfirmation(userId, analysisResult);
    this.updateMetrics();
    return result;
  }

  /**
   * Salvar contexto de produto identificado por imagem
   * Compatibilidade com interface original
   */
  saveImageProductContext(userId, productData) {
    this.imageSalesManager.saveImageProductContext(userId, productData);
  }

  /**
   * Obter último contexto de produto por imagem
   * Compatibilidade com interface original
   */
  async getLastImageProductContext(userId) {
    return await this.imageSalesManager.getLastImageProductContext(userId);
  }

  /**
   * Registrar venda de produto identificado por imagem
   * Compatibilidade com interface original
   */
  async registerImageSale(userId, productContext, salePrice) {
    const result = await this.imageSalesManager.registerImageSale(userId, productContext, salePrice);
    this.updateMetrics();
    return result;
  }

  /**
   * Iniciar sincronização automática
   * Compatibilidade com interface original
   */
  async startAutoSync() {
    this.isRunning = true;
    return await this.syncManager.startAutoSync();
  }

  /**
   * Parar sincronização automática
   * Compatibilidade com interface original
   */
  stopAutoSync() {
    this.isRunning = false;
    return this.syncManager.stopAutoSync();
  }

  /**
   * Sincronizar vendas de todos os usuários
   * Compatibilidade com interface original
   */
  async syncAllUsers() {
    return await this.syncManager.syncAllUsers();
  }

  /**
   * Sincronizar vendas de um usuário específico
   * Compatibilidade com interface original
   */
  async syncUserSales(userId) {
    return await this.syncManager.syncUserSales(userId);
  }

  /**
   * Detectar vendas novas
   * Compatibilidade com interface original
   */
  async detectNewSales(userId, lastSyncTime) {
    return await this.syncManager.detectNewSales(userId, lastSyncTime);
  }

  /**
   * Processar uma venda individual
   * Compatibilidade com interface original
   */
  async processSale(userId, saleData) {
    const result = await this.syncManager.processSale(userId, saleData);
    this.updateMetrics();
    return result;
  }

  /**
   * Obter usuários ativos
   * Compatibilidade com interface original
   */
  async getActiveUsers() {
    return await this.syncManager.getActiveUsers();
  }

  // ========================================
  // MÉTODOS AUXILIARES
  // ========================================

  /**
   * Verificar se é consulta de estoque
   */
  isStockQuery(descricao, intencao) {
    const stockKeywords = [
      'estoque', 'quantos', 'quanto tem', 'disponível', 'disponivel',
      'tem em estoque', 'sobrou', 'restam', 'inventory',
      'consultar estoque', 'ver estoque', 'verificar estoque',
      'listar produtos', 'produtos disponíveis', 'produtos disponiveis'
    ];
    
    const text = descricao?.toLowerCase() || '';
    return stockKeywords.some(keyword => text.includes(keyword)) ||
           ['consultar_estoque', 'verificar_estoque', 'listar_produtos'].includes(intencao);
  }

  /**
   * Verificar se é consulta de vendas
   */
  isSalesQuery(descricao, intencao) {
    const salesKeywords = [
      'vendas', 'faturamento', 'lucro', 'margem', 'produtos vendidos',
      'clientes', 'compradores', 'performance', 'relatório de vendas'
    ];
    
    const text = descricao?.toLowerCase() || '';
    return salesKeywords.some(keyword => text.includes(keyword)) ||
           ['consultar_vendas', 'relatorio_vendas', 'performance_vendas'].includes(intencao);
  }

  /**
   * Atualizar métricas consolidadas
   */
  updateMetrics() {
    // Consolidar métricas de todos os módulos
    const imageMetrics = this.imageSalesManager.getMetrics();
    const registrationMetrics = this.salesRegistrationEngine.getMetrics();
    const syncMetrics = this.syncManager.getMetrics();
    
    this.metrics.totalSalesProcessed = 
      imageMetrics.totalImageSales + 
      registrationMetrics.totalSalesRegistered + 
      syncMetrics.totalSalesProcessed;
    
    this.metrics.totalRevenue = 
      imageMetrics.totalImageRevenue + 
      registrationMetrics.totalRevenue + 
      syncMetrics.totalRevenue;
    
    this.metrics.lastSyncTime = syncMetrics.lastSyncTime;
  }

  /**
   * Obter métricas consolidadas
   * Compatibilidade com interface original
   */
  getMetrics() {
    this.updateMetrics();
    
    return {
      ...this.metrics,
      isRunning: this.isRunning,
      activeUsers: this.syncManager.lastSyncTimes?.size || 0,
      modules: {
        imageSales: this.imageSalesManager.getMetrics(),
        productSearch: this.productSearchEngine.getMetrics(),
        stock: this.stockManager.getMetrics(),
        analytics: this.salesAnalytics.getMetrics(),
        catalog: this.productCatalogManager.getMetrics(),
        registration: this.salesRegistrationEngine.getMetrics(),
        sync: this.syncManager.getMetrics()
      }
    };
  }

  /**
   * Obter status consolidado
   * Compatibilidade com interface original
   */
  getStatus() {
    return {
      isInitialized: true,
      isRunning: this.isRunning,
      syncInterval: this.syncInterval,
      modules: {
        imageSales: this.imageSalesManager.getStatus(),
        productSearch: this.productSearchEngine.getStatus(),
        stock: this.stockManager.getStatus(),
        analytics: this.salesAnalytics.getStatus(),
        catalog: this.productCatalogManager.getStatus(),
        registration: this.salesRegistrationEngine.getStatus(),
        sync: this.syncManager.getStatus()
      },
      metrics: this.getMetrics()
    };
  }

  /**
   * Obter informações de debug
   */
  getDebugInfo() {
    return {
      architecture: 'modular',
      totalModules: 7,
      modulesList: [
        'ImageSalesManager',
        'ProductSearchEngine', 
        'StockManager',
        'SalesAnalytics',
        'ProductCatalogManager',
        'SalesRegistrationEngine',
        'SyncManager'
      ],
      compatibility: '100% com sales-handler.js original',
      status: this.getStatus()
    };
  }
}

module.exports = SalesHandlerRefactored;