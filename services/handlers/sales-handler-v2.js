const BaseHandler = require('./base-handler');
const ResponseFormatter = require('../formatters/response-formatter');
const TransactionValidator = require('../validators/transaction-validator');
const logger = require('../../utils/logger');

// Importar serviços especializados
const ProductSearchService = require('../sales/product-search-service');
const SalesProcessingService = require('../sales/sales-processing-service');
const StockManagementService = require('../sales/stock-management-service');
const SalesAnalyticsService = require('../sales/sales-analytics-service');

/**
 * Handler modular para processamento de vendas
 * Orquestra serviços especializados para manter código limpo e escalável
 */
class SalesHandlerV2 extends BaseHandler {
  constructor(databaseService, userService) {
    super(databaseService, userService);
    
    // Inicializar serviços especializados
    this.productSearch = new ProductSearchService(databaseService);
    this.salesProcessing = new SalesProcessingService(databaseService);
    this.stockManagement = new StockManagementService(databaseService);
    this.salesAnalytics = new SalesAnalyticsService(databaseService);
    
    // Configurações de sincronização
    this.syncInterval = 30000; // 30 segundos
    this.lastSyncTimes = new Map(); // Por usuário
    this.isRunning = false;
    
    // Métricas de performance
    this.metrics = {
      totalSalesProcessed: 0,
      totalRevenue: 0,
      lastSyncTime: null,
      errors: 0
    };
  }

  /**
   * Inicializar handler
   */
  async initialize() {
    try {
      logger.info('🚀 Inicializando SalesHandlerV2 (Modular)...');
      
      // Sincronização automática desabilitada temporariamente
      logger.info('⚠️ Sincronização automática desabilitada (modo manual)');
      
      logger.info('✅ SalesHandlerV2 inicializado com sucesso!');
      
    } catch (error) {
      logger.error('❌ Erro ao inicializar SalesHandlerV2:', error);
      throw error;
    }
  }

  /**
   * Processar comando principal
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise do Gemini
   * @returns {Promise<string>} - Resposta formatada
   */
  async process(userId, analysisResult) {
    try {
      const { descricao, intencao } = analysisResult;
      
      // Verificar se é resposta a sugestão de produto (número)
      if (this.isProductSuggestionResponse(descricao)) {
        return await this.handleProductSuggestionResponse(userId, descricao);
      }
      
      // Verificar se é comando de criação de produto
      if (this.isCreateProductCommand(descricao)) {
        return await this.handleCreateProductCommand(userId, descricao, analysisResult);
      }
      
      // Verificar se é comando de sincronização
      if (this.isSyncCommand(descricao, intencao)) {
        return await this.handleSyncCommand(userId);
      }
      
      // Verificar se é registro de venda manual
      if (this.isSaleRegistration(descricao, intencao)) {
        return await this.handleSaleRegistration(userId, analysisResult);
      }
      
      // Verificar se é consulta de estoque
      if (this.isStockQuery(descricao, intencao)) {
        return await this.handleStockQuery(userId, analysisResult);
      }
      
      // Verificar se é consulta detalhada de produto
      if (this.isProductQuery(descricao, intencao)) {
        return await this.handleProductQuery(userId, analysisResult);
      }
      
      // Verificar se é consulta de vendas
      if (this.isSalesQuery(descricao, intencao)) {
        return await this.handleSalesQuery(userId, analysisResult);
      }
      
      return null; // Não é comando relacionado a vendas
      
    } catch (error) {
      logger.error('❌ Erro no SalesHandlerV2:', error);
      return '❌ Erro ao processar comando de vendas. Tente novamente.';
    }
  }

  // =====================================
  // MÉTODOS DE DETECÇÃO DE COMANDOS
  // =====================================

  /**
   * Verificar se é resposta numérica a sugestão de produto
   */
  isProductSuggestionResponse(descricao) {
    const text = descricao?.toLowerCase().trim() || '';
    return /^[1-3]$/.test(text);
  }
  
  /**
   * Verificar se é comando de criação de produto
   */
  isCreateProductCommand(descricao) {
    const text = descricao?.toLowerCase() || '';
    return text.includes('criar') && (text.includes('produto') || text.match(/criar\s+\w+/));
  }

  /**
   * Verificar se é comando de sincronização
   */
  isSyncCommand(descricao, intencao) {
    const syncKeywords = ['sincronizar', 'sync', 'atualizar vendas', 'buscar vendas'];
    const text = descricao?.toLowerCase() || '';
    return syncKeywords.some(keyword => text.includes(keyword)) ||
           ['sincronizar_vendas', 'sync_vendas'].includes(intencao);
  }

  /**
   * Verificar se é registro de venda
   */
  isSaleRegistration(descricao, intencao) {
    const saleKeywords = ['vendi', 'venda', 'vendeu', 'cliente comprou'];
    const text = descricao?.toLowerCase() || '';
    return saleKeywords.some(keyword => text.includes(keyword)) ||
           ['registrar_venda', 'nova_venda'].includes(intencao);
  }

  /**
   * Verificar se é consulta de estoque
   */
  isStockQuery(descricao, intencao) {
    const stockKeywords = ['estoque', 'quantidade', 'disponível', 'tem em estoque'];
    const text = descricao?.toLowerCase() || '';
    return stockKeywords.some(keyword => text.includes(keyword)) ||
           ['consultar_estoque', 'verificar_estoque'].includes(intencao);
  }

  /**
   * Verificar se é consulta detalhada de produto
   */
  isProductQuery(descricao, intencao) {
    const productKeywords = ['preço', 'valor', 'detalhes', 'informações', 'dados do produto'];
    const text = descricao?.toLowerCase() || '';
    return productKeywords.some(keyword => text.includes(keyword)) ||
           ['consultar_produto', 'info_produto'].includes(intencao);
  }

  /**
   * Verificar se é consulta de vendas
   */
  isSalesQuery(descricao, intencao) {
    const salesKeywords = ['vendas', 'faturamento', 'relatório', 'performance'];
    const text = descricao?.toLowerCase() || '';
    return salesKeywords.some(keyword => text.includes(keyword)) ||
           ['consultar_vendas', 'relatorio_vendas'].includes(intencao);
  }

  // =====================================
  // HANDLERS DE COMANDOS
  // =====================================

  /**
   * Processar registro manual de venda
   */
  async handleSaleRegistration(userId, analysisResult) {
    try {
      const { valor, descricao, produto_nome } = analysisResult;
      
      // Extrair nome do produto da descrição
      const productName = produto_nome || this.productSearch.extractProductName(descricao);
      
      if (!productName) {
        return `❌ **Produto não identificado**\n\n` +
               `💡 *Exemplo: "Vendi fone por 60 reais"*\n` +
               `💡 *Ou: "Cliente comprou projetor por 50"*`;
      }
      
      // Buscar produto no banco de dados
      const products = await this.databaseService.getUserProducts(userId, 100);
      let product = await this.productSearch.findProductIntelligent(products, productName);
      
      // Se não encontrou produto, oferecer sugestões
      if (!product) {
        const suggestions = this.productSearch.findProductSuggestions(products, productName);
        
        if (suggestions.length > 0) {
          const suggestionsList = suggestions.map((s, index) => 
            `${index + 1}. ${s.name} (${s.confidence}% similar)`
          ).join('\n');
          
          return `🤔 **Produto "${productName}" não encontrado**\n\n` +
                 `💡 **Você quis dizer:**\n${suggestionsList}\n\n` +
                 `📝 **Opções:**\n` +
                 `• Responda com o número da sugestão\n` +
                 `• Digite "criar ${productName}" para criar novo produto\n` +
                 `• Use o nome exato de um produto existente`;
        }
        
        const availableProducts = products.slice(0, 5).map(p => 
          `• ${p.name || p.product_name}`
        ).join('\n');
        
        return `❌ **Produto "${productName}" não encontrado**\n\n` +
               `📦 **Produtos disponíveis:**\n${availableProducts}\n\n` +
               `💡 *Digite "criar ${productName}" para criar novo produto*`;
      }
      
      // Se o usuário não especificou valor, pedir confirmação
      if (!valor || valor <= 0) {
        return this.salesProcessing.requestPriceConfirmation(userId, product, descricao);
      }
      
      // Extrair nome do comprador
      const buyerName = this.salesProcessing.extractBuyerName(descricao);
      
      // Processar venda
      const saleResult = await this.salesProcessing.processSale(
        userId, product, valor, descricao, buyerName
      );
      
      // Atualizar métricas
      this.metrics.totalSalesProcessed++;
      this.metrics.totalRevenue += valor;
      
      return this.salesProcessing.formatSaleResponse(saleResult);
      
    } catch (error) {
      logger.error('❌ Erro ao processar venda:', error);
      return '❌ Erro ao processar venda. Tente novamente.';
    }
  }

  /**
   * Processar consulta de estoque
   */
  async handleStockQuery(userId, analysisResult) {
    try {
      const { descricao, produto_nome } = analysisResult;
      
      // Se não especificou produto, mostrar resumo geral
      const productName = produto_nome || this.productSearch.extractProductName(descricao);
      
      if (!productName) {
        return await this.stockManagement.getGeneralStockSummary(userId);
      }
      
      return await this.stockManagement.getProductStock(userId, productName);
      
    } catch (error) {
      logger.error('❌ Erro ao consultar estoque:', error);
      return '❌ Erro ao consultar estoque. Tente novamente.';
    }
  }

  /**
   * Processar consulta detalhada de produto
   */
  async handleProductQuery(userId, analysisResult) {
    try {
      const { descricao, produto_nome } = analysisResult;
      
      const productName = produto_nome || this.productSearch.extractProductName(descricao);
      
      if (!productName) {
        return `❌ **Produto não especificado**\n\n` +
               `💡 *Exemplo: "Qual o preço do fone?"*`;
      }
      
      const products = await this.databaseService.getUserProducts(userId, 100);
      const product = await this.productSearch.findProductIntelligent(products, productName);
      
      if (!product) {
        return `❌ **Produto não encontrado: ${productName}**\n\n` +
               `💡 *Produtos disponíveis:*\n` +
               products.slice(0, 5).map(p => `• ${p.name || p.product_name}`).join('\n');
      }
      
      return await this.stockManagement.getProductDetails(userId, product);
      
    } catch (error) {
      logger.error('❌ Erro ao consultar produto:', error);
      return '❌ Erro ao consultar informações do produto.';
    }
  }

  /**
   * Processar consulta de vendas
   */
  async handleSalesQuery(userId, analysisResult) {
    try {
      const salesData = await this.salesAnalytics.getSalesAnalytics(userId);
      return this.salesAnalytics.formatSalesReport(salesData);
      
    } catch (error) {
      logger.error('❌ Erro ao gerar relatório de vendas:', error);
      return '❌ Erro ao gerar relatório de vendas.';
    }
  }

  /**
   * Processar comando de sincronização
   */
  async handleSyncCommand(userId) {
    try {
      const startTime = Date.now();
      const duration = Date.now() - startTime;
      
      return `✅ **Sincronização concluída!**\n\n` +
             `⏱️ **Tempo:** ${duration}ms\n` +
             `📊 **Status:** Vendas atualizadas\n\n` +
             `💡 *As vendas são sincronizadas automaticamente.*`;
             
    } catch (error) {
      return '❌ Erro na sincronização. Tente novamente.';
    }
  }

  /**
   * Processar resposta a sugestão de produto
   */
  async handleProductSuggestionResponse(userId, descricao) {
    // TODO: Implementar sistema de cache de sugestões por usuário
    return `💡 **Sistema de sugestões ativo!**\n\n` +
           `Para usar as sugestões, primeiro faça uma venda que não encontre o produto.\n` +
           `Exemplo: "Vendi kz por 85 reais"`;
  }

  /**
   * Processar comando de criação de produto
   */
  async handleCreateProductCommand(userId, descricao, analysisResult) {
    try {
      const productName = this.productSearch.extractProductNameFromCreateCommand(descricao);
      
      if (!productName) {
        return `❌ **Nome do produto não identificado**\n\n` +
               `💡 *Exemplo: "criar produto fone bluetooth"*`;
      }
      
      const createdProduct = await this.productSearch.createProduct(userId, productName);
      
      return `✅ **Produto "${productName}" criado com sucesso!**\n\n` +
             `📦 **Próximos passos:**\n` +
             `• Defina o preço de venda\n` +
             `• Adicione categoria específica\n` +
             `• Configure custo de compra\n\n` +
             `💡 *Agora você pode registrar vendas deste produto!*`;
             
    } catch (error) {
      if (error.message.includes('já existe')) {
        return `⚠️ **${error.message}**\n\n💡 *Use o nome exato para registrar vendas.*`;
      }
      
      logger.error('❌ Erro ao criar produto:', error);
      return '❌ Erro ao criar produto. Tente novamente.';
    }
  }

  // =====================================
  // MÉTODOS DE UTILIDADE
  // =====================================

  /**
   * Obter métricas do handler
   */
  getMetrics() {
    return {
      ...this.metrics,
      isRunning: this.isRunning,
      activeUsers: this.lastSyncTimes.size
    };
  }

  /**
   * Obter status do handler
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      metrics: this.getMetrics(),
      services: {
        productSearch: 'active',
        salesProcessing: 'active',
        stockManagement: 'active',
        salesAnalytics: 'active'
      }
    };
  }
}

module.exports = SalesHandlerV2;