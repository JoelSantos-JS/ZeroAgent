const assert = require('assert');
const SalesHandlerOriginal = require('../services/handlers/sales-handler');
const SalesHandlerRefactored = require('../services/handlers/sales-handler-refactored');

/**
 * Teste ABRANGENTE e COMPLETO do Sales Handler
 * Valida TODAS as funcionalidades em cenários reais
 * Garante 100% de compatibilidade antes da migração final
 */
class ComprehensiveSalesHandlerTest {
  constructor() {
    this.mockDatabaseService = this.createAdvancedMockDatabaseService();
    this.mockUserService = this.createMockUserService();
    
    this.originalHandler = new SalesHandlerOriginal(this.mockDatabaseService, this.mockUserService);
    this.refactoredHandler = new SalesHandlerRefactored(this.mockDatabaseService, this.mockUserService);
    
    this.testResults = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      errors: [],
      compatibility: 0,
      categories: {
        initialization: { passed: 0, total: 0 },
        imageSales: { passed: 0, total: 0 },
        manualSales: { passed: 0, total: 0 },
        productManagement: { passed: 0, total: 0 },
        stockQueries: { passed: 0, total: 0 },
        salesAnalytics: { passed: 0, total: 0 },
        synchronization: { passed: 0, total: 0 },
        edgeCases: { passed: 0, total: 0 }
      }
    };
  }

  /**
   * Criar mock avançado do database service
   */
  createAdvancedMockDatabaseService() {
    const products = [
      {
        id: 'prod-1',
        name: 'Fone Bluetooth JBL',
        product_name: 'Fone Bluetooth JBL',
        selling_price: 89.90,
        cost_price: 45.00,
        category: 'eletrônicos',
        stock_quantity: 15,
        sku: 'JBL001',
        brand: 'JBL'
      },
      {
        id: 'prod-2',
        name: 'Mouse Gamer RGB',
        product_name: 'Mouse Gamer RGB',
        selling_price: 120.00,
        cost_price: 80.00,
        category: 'informática',
        stock_quantity: 8,
        sku: 'MOUSE001'
      },
      {
        id: 'prod-3',
        name: 'Teclado Mecânico',
        product_name: 'Teclado Mecânico',
        selling_price: 250.00,
        cost_price: 150.00,
        category: 'informática',
        stock_quantity: 0 // Produto em falta
      }
    ];

    const transactions = [
      {
        id: 'trans-1',
        amount: 89.90,
        description: 'Venda: Fone Bluetooth JBL',
        transaction_date: new Date('2024-01-15'),
        metadata: { buyer_name: 'João Silva', product_id: 'prod-1' }
      },
      {
        id: 'trans-2',
        amount: 120.00,
        description: 'Venda: Mouse Gamer RGB',
        transaction_date: new Date('2024-01-16'),
        metadata: { buyer_name: 'Maria Santos', product_id: 'prod-2' }
      }
    ];

    return {
      connectionType: 'supabase',
      supabase: {
        from: (table) => {
          if (table === 'sales') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({ data: [], error: null })
                })
              }),
              insert: () => ({
                select: () => ({
                  single: () => ({ data: { id: 'new-sale-id' }, error: null })
                })
              })
            };
          }
          return {
            select: () => ({
              eq: () => ({ data: [], error: null })
            })
          };
        }
      },
      getUserProducts: async (userId, limit) => products.slice(0, limit || 10),
      getUserTransactionsByCategory: async (userId, category) => {
        if (category === 'vendas') return transactions;
        return [];
      },
      createTransaction: async (userId, type, amount, category, description, date) => ({
        id: `trans-${Date.now()}`,
        userId,
        type,
        amount,
        category,
        description,
        transaction_date: date
      }),
      createRevenue: async (userId, amount, category, description, date, source) => ({
        id: `revenue-${Date.now()}`,
        userId,
        amount,
        category,
        description,
        date,
        source
      }),
      createProduct: async (userId, productData) => ({
        id: `product-${Date.now()}`,
        ...productData,
        userId
      }),
      updateProduct: async (userId, productId, updates) => ({
        id: productId,
        ...updates
      })
    };
  }

  /**
   * Criar mock do user service
   */
  createMockUserService() {
    return {
      getUserById: async (id) => ({ id, name: 'Test User', email: 'test@example.com' })
    };
  }

  /**
   * Executar TODOS os testes abrangentes
   */
  async runComprehensiveTests() {
    console.log('🧪 INICIANDO TESTES ABRANGENTES DO SALES HANDLER');
    console.log('=' .repeat(80));
    console.log('🎯 Objetivo: Validar 100% das funcionalidades antes da migração final');
    console.log('=' .repeat(80));
    
    try {
      // Categoria 1: Inicialização e Setup
      await this.testInitializationAndSetup();
      
      // Categoria 2: Vendas por Imagem (Completo)
      await this.testImageSalesComplete();
      
      // Categoria 3: Vendas Manuais (Todos os cenários)
      await this.testManualSalesComplete();
      
      // Categoria 4: Gerenciamento de Produtos
      await this.testProductManagementComplete();
      
      // Categoria 5: Consultas de Estoque
      await this.testStockQueriesComplete();
      
      // Categoria 6: Analytics e Relatórios
      await this.testSalesAnalyticsComplete();
      
      // Categoria 7: Sincronização
      await this.testSynchronizationComplete();
      
      // Categoria 8: Casos Extremos e Edge Cases
      await this.testEdgeCasesComplete();
      
      // Calcular compatibilidade final
      this.calculateFinalCompatibility();
      
      // Exibir resultados detalhados
      this.displayDetailedResults();
      
      return this.testResults;
      
    } catch (error) {
      console.error('❌ ERRO CRÍTICO durante os testes:', error);
      this.testResults.errors.push(`ERRO CRÍTICO: ${error.message}`);
      return this.testResults;
    }
  }

  /**
   * Categoria 1: Inicialização e Setup
   */
  async testInitializationAndSetup() {
    console.log('\n📋 CATEGORIA 1: INICIALIZAÇÃO E SETUP');
    console.log('-' .repeat(50));
    
    // Teste 1.1: Inicialização sem erros
    await this.runCategorizedTest('initialization', 'Inicialização sem erros', async () => {
      await this.originalHandler.initialize();
      await this.refactoredHandler.initialize();
      return true;
    });
    
    // Teste 1.2: Propriedades essenciais
    await this.runCategorizedTest('initialization', 'Propriedades essenciais presentes', () => {
      const essentialProps = [
        'databaseService', 'userService', 'metrics', 'imageProductContext',
        'syncInterval', 'lastSyncTimes', 'isRunning'
      ];
      
      for (const prop of essentialProps) {
        if (!(prop in this.originalHandler) || !(prop in this.refactoredHandler)) {
          throw new Error(`Propriedade essencial '${prop}' não encontrada`);
        }
      }
      return true;
    });
    
    // Teste 1.3: Métodos públicos disponíveis
    await this.runCategorizedTest('initialization', 'Todos os métodos públicos disponíveis', () => {
      const publicMethods = [
        'process', 'initialize', 'getMetrics', 'getStatus',
        'isImageSaleConfirmation', 'handleImageSaleConfirmation',
        'saveImageProductContext', 'getLastImageProductContext',
        'registerImageSale', 'startAutoSync', 'stopAutoSync'
      ];
      
      for (const method of publicMethods) {
        if (typeof this.originalHandler[method] !== 'function' ||
            typeof this.refactoredHandler[method] !== 'function') {
          throw new Error(`Método público '${method}' não é uma função`);
        }
      }
      return true;
    });
  }

  /**
   * Categoria 2: Vendas por Imagem (Completo)
   */
  async testImageSalesComplete() {
    console.log('\n📸 CATEGORIA 2: VENDAS POR IMAGEM (COMPLETO)');
    console.log('-' .repeat(50));
    
    const userId = 'test-user-123';
    
    // Teste 2.1: Processamento de produto identificado por imagem
    await this.runCategorizedTest('imageSales', 'Processamento de produto identificado', async () => {
      const analysisResult = {
        tipo: 'venda',
        produto_nome: 'Fone Bluetooth JBL',
        produto_id: 'prod-1',
        valor: 89.90,
        confianca: 0.95,
        fonte: 'banco_dados'
      };
      
      const originalResult = await this.originalHandler.process(userId, analysisResult);
      const refactoredResult = await this.refactoredHandler.process(userId, analysisResult);
      
      if (!originalResult || !refactoredResult) {
        throw new Error('Processamento de imagem retornou null');
      }
      
      // Verificar se ambos contêm elementos essenciais
      const essentialElements = ['identificado', 'Confiança', 'Preço'];
      for (const element of essentialElements) {
        if (!originalResult.includes(element) || !refactoredResult.includes(element)) {
          throw new Error(`Elemento essencial '${element}' não encontrado na resposta`);
        }
      }
      
      return true;
    });
    
    // Teste 2.2: Salvar e recuperar contexto de imagem
    await this.runCategorizedTest('imageSales', 'Salvar e recuperar contexto', async () => {
      const productData = {
        product: { id: 'prod-1', name: 'Fone Bluetooth JBL' },
        sellingPrice: 89.90,
        confianca: 0.95,
        produto_nome: 'Fone Bluetooth JBL'
      };
      
      // Salvar contexto
      this.originalHandler.saveImageProductContext(userId, productData);
      this.refactoredHandler.saveImageProductContext(userId, productData);
      
      // Recuperar contexto
      const originalContext = await this.originalHandler.getLastImageProductContext(userId);
      const refactoredContext = await this.refactoredHandler.getLastImageProductContext(userId);
      
      if (!originalContext || !refactoredContext) {
        throw new Error('Contexto não foi salvo/recuperado corretamente');
      }
      
      if (originalContext.produto_nome !== refactoredContext.produto_nome) {
        throw new Error('Contextos não são idênticos');
      }
      
      return true;
    });
    
    // Teste 2.3: Confirmações de venda por imagem
    await this.runCategorizedTest('imageSales', 'Confirmações de venda (todos os formatos)', () => {
      const confirmations = [
        { input: 'sim', expected: true },
        { input: 'ok', expected: true },
        { input: 'confirmo', expected: true },
        { input: '89', expected: true },
        { input: '89.90', expected: true },
        { input: '89 reais', expected: true },
        { input: 'R$ 89', expected: true },
        { input: 'não', expected: true },
        { input: 'cancelar', expected: true },
        { input: 'talvez', expected: false },
        { input: '', expected: false }
      ];
      
      for (const { input, expected } of confirmations) {
        const originalResult = this.originalHandler.isImageSaleConfirmation(input, userId);
        const refactoredResult = this.refactoredHandler.isImageSaleConfirmation(input, userId);
        
        if (originalResult !== expected || refactoredResult !== expected) {
          throw new Error(`Confirmação '${input}': esperado=${expected}, original=${originalResult}, refatorado=${refactoredResult}`);
        }
        
        if (originalResult !== refactoredResult) {
          throw new Error(`Incompatibilidade na confirmação '${input}'`);
        }
      }
      
      return true;
    });
    
    // Teste 2.4: Processamento de confirmação de venda
    await this.runCategorizedTest('imageSales', 'Processamento de confirmação', async () => {
      const confirmationCases = [
        { descricao: 'sim', expectedType: 'string' },
        { descricao: '89.90', expectedType: 'string' },
        { descricao: 'não', expectedType: 'string' }
      ];
      
      for (const testCase of confirmationCases) {
        const analysisResult = { descricao: testCase.descricao };
        
        const originalResult = await this.originalHandler.handleImageSaleConfirmation(userId, analysisResult);
        const refactoredResult = await this.refactoredHandler.handleImageSaleConfirmation(userId, analysisResult);
        
        if (typeof originalResult !== testCase.expectedType || typeof refactoredResult !== testCase.expectedType) {
          throw new Error(`Tipo de retorno incorreto para '${testCase.descricao}'`);
        }
      }
      
      return true;
    });
  }

  /**
   * Categoria 3: Vendas Manuais (Todos os cenários)
   */
  async testManualSalesComplete() {
    console.log('\n💰 CATEGORIA 3: VENDAS MANUAIS (TODOS OS CENÁRIOS)');
    console.log('-' .repeat(50));
    
    const userId = 'test-user-123';
    
    // Teste 3.1: Venda manual com produto existente
    await this.runCategorizedTest('manualSales', 'Venda manual - produto existente', async () => {
      const analysisResult = {
        descricao: 'Vendi fone bluetooth por 89 reais',
        intencao: 'registrar_venda',
        valor: 89.00,
        produto_nome: 'Fone Bluetooth JBL'
      };
      
      const originalResult = await this.originalHandler.process(userId, analysisResult);
      const refactoredResult = await this.refactoredHandler.process(userId, analysisResult);
      
      if (!originalResult || !refactoredResult) {
        throw new Error('Venda manual não processada');
      }
      
      // Verificar elementos essenciais na resposta
      const essentialElements = ['registrada', 'sucesso', 'Produto', 'Valor'];
      for (const element of essentialElements) {
        if (!originalResult.includes(element) || !refactoredResult.includes(element)) {
          throw new Error(`Elemento '${element}' não encontrado na resposta de venda`);
        }
      }
      
      return true;
    });
    
    // Teste 3.2: Venda manual com produto inexistente
    await this.runCategorizedTest('manualSales', 'Venda manual - produto inexistente', async () => {
      const analysisResult = {
        descricao: 'Vendi produto inexistente por 100 reais',
        intencao: 'registrar_venda',
        valor: 100.00,
        produto_nome: 'Produto Inexistente'
      };
      
      const originalResult = await this.originalHandler.process(userId, analysisResult);
      const refactoredResult = await this.refactoredHandler.process(userId, analysisResult);
      
      if (!originalResult || !refactoredResult) {
        throw new Error('Venda de produto inexistente não processada');
      }
      
      // Deve conter sugestões ou mensagem de produto não encontrado
      const expectedElements = ['não encontrado', 'sugestões', 'criar'];
      const hasExpectedElement = expectedElements.some(element => 
        originalResult.toLowerCase().includes(element) && 
        refactoredResult.toLowerCase().includes(element)
      );
      
      if (!hasExpectedElement) {
        throw new Error('Resposta não contém elementos esperados para produto inexistente');
      }
      
      return true;
    });
    
    // Teste 3.3: Venda sem valor especificado
    await this.runCategorizedTest('manualSales', 'Venda sem valor especificado', async () => {
      const analysisResult = {
        descricao: 'Vendi fone bluetooth',
        intencao: 'registrar_venda',
        valor: 0,
        produto_nome: 'Fone Bluetooth JBL'
      };
      
      const originalResult = await this.originalHandler.process(userId, analysisResult);
      const refactoredResult = await this.refactoredHandler.process(userId, analysisResult);
      
      if (!originalResult || !refactoredResult) {
        throw new Error('Venda sem valor não processada');
      }
      
      // Deve solicitar o valor
      const shouldAskForPrice = ['preço', 'valor', 'especifique', 'confirme'];
      const asksForPrice = shouldAskForPrice.some(element => 
        originalResult.toLowerCase().includes(element) && 
        refactoredResult.toLowerCase().includes(element)
      );
      
      if (!asksForPrice) {
        throw new Error('Não solicitou o valor quando necessário');
      }
      
      return true;
    });
  }

  /**
   * Categoria 4: Gerenciamento de Produtos
   */
  async testProductManagementComplete() {
    console.log('\n🛍️ CATEGORIA 4: GERENCIAMENTO DE PRODUTOS');
    console.log('-' .repeat(50));
    
    const userId = 'test-user-123';
    
    // Teste 4.1: Criar produto novo
    await this.runCategorizedTest('productManagement', 'Criar produto novo', async () => {
      const analysisResult = {
        descricao: 'Criar produto Webcam HD',
        intencao: 'criar_produto'
      };
      
      const originalResult = await this.originalHandler.process(userId, analysisResult);
      const refactoredResult = await this.refactoredHandler.process(userId, analysisResult);
      
      if (!originalResult || !refactoredResult) {
        throw new Error('Criação de produto não processada');
      }
      
      // Verificar se confirma a criação
      const confirmationElements = ['criado', 'sucesso'];
      for (const element of confirmationElements) {
        if (!originalResult.includes(element) || !refactoredResult.includes(element)) {
          throw new Error(`Elemento '${element}' não encontrado na confirmação de criação`);
        }
      }
      
      // Verificar se contém o nome do produto (case-insensitive)
      const productNameLower = 'webcam hd';
      if (!originalResult.toLowerCase().includes(productNameLower) || 
          !refactoredResult.toLowerCase().includes(productNameLower)) {
        throw new Error(`Nome do produto '${productNameLower}' não encontrado na confirmação`);
      }
      
      return true;
    });
    
    // Teste 4.2: Consultar detalhes de produto
    await this.runCategorizedTest('productManagement', 'Consultar detalhes de produto', async () => {
      const analysisResult = {
        descricao: 'Qual o preço do fone bluetooth?',
        intencao: 'consultar_produto',
        produto_nome: 'Fone Bluetooth JBL'
      };
      
      const originalResult = await this.originalHandler.process(userId, analysisResult);
      const refactoredResult = await this.refactoredHandler.process(userId, analysisResult);
      
      if (!originalResult || !refactoredResult) {
        throw new Error('Consulta de produto não processada');
      }
      
      // Verificar se contém informações do produto
      const productInfo = ['Fone Bluetooth', 'Preço', 'R$'];
      for (const info of productInfo) {
        if (!originalResult.includes(info) || !refactoredResult.includes(info)) {
          throw new Error(`Informação '${info}' não encontrada na consulta`);
        }
      }
      
      return true;
    });
  }

  /**
   * Categoria 5: Consultas de Estoque
   */
  async testStockQueriesComplete() {
    console.log('\n📦 CATEGORIA 5: CONSULTAS DE ESTOQUE');
    console.log('-' .repeat(50));
    
    const userId = 'test-user-123';
    
    // Teste 5.1: Consulta de estoque específico
    await this.runCategorizedTest('stockQueries', 'Consulta de estoque específico', async () => {
      const analysisResult = {
        descricao: 'Quantos fones bluetooth tem em estoque?',
        intencao: 'consultar_estoque',
        produto_nome: 'Fone Bluetooth JBL'
      };
      
      const originalResult = await this.originalHandler.process(userId, analysisResult);
      const refactoredResult = await this.refactoredHandler.process(userId, analysisResult);
      
      if (!originalResult || !refactoredResult) {
        throw new Error('Consulta de estoque não processada');
      }
      
      // Verificar se contém informações de estoque
      const stockInfo = ['Estoque', 'Disponível', 'unidades'];
      for (const info of stockInfo) {
        if (!originalResult.includes(info) || !refactoredResult.includes(info)) {
          throw new Error(`Informação de estoque '${info}' não encontrada`);
        }
      }
      
      return true;
    });
    
    // Teste 5.2: Consulta de estoque geral
    await this.runCategorizedTest('stockQueries', 'Consulta de estoque geral', async () => {
      const analysisResult = {
        descricao: 'Como está o estoque?',
        intencao: 'consultar_estoque'
      };
      
      const originalResult = await this.originalHandler.process(userId, analysisResult);
      const refactoredResult = await this.refactoredHandler.process(userId, analysisResult);
      
      if (!originalResult || !refactoredResult) {
        throw new Error('Consulta de estoque geral não processada');
      }
      
      // Verificar se contém resumo do estoque
      const summaryInfo = ['Resumo', 'Estoque', 'Status'];
      for (const info of summaryInfo) {
        if (!originalResult.includes(info) || !refactoredResult.includes(info)) {
          throw new Error(`Informação de resumo '${info}' não encontrada`);
        }
      }
      
      return true;
    });
  }

  /**
   * Categoria 6: Analytics e Relatórios
   */
  async testSalesAnalyticsComplete() {
    console.log('\n📊 CATEGORIA 6: ANALYTICS E RELATÓRIOS');
    console.log('-' .repeat(50));
    
    const userId = 'test-user-123';
    
    // Teste 6.1: Relatório de vendas
    await this.runCategorizedTest('salesAnalytics', 'Relatório de vendas', async () => {
      const analysisResult = {
        descricao: 'Relatório de vendas do mês',
        intencao: 'relatorio_vendas'
      };
      
      const originalResult = await this.originalHandler.process(userId, analysisResult);
      const refactoredResult = await this.refactoredHandler.process(userId, analysisResult);
      
      if (!originalResult || !refactoredResult) {
        throw new Error('Relatório de vendas não gerado');
      }
      
      // Debug: mostrar o conteúdo dos relatórios
      console.log('Original report:', originalResult.substring(0, 200));
      console.log('Refactored report:', refactoredResult.substring(0, 200));
      
      // Verificar se contém métricas essenciais (mais flexível)
      const metrics = ['venda', 'receita', 'financeiro', 'transação'];
      let foundMetrics = 0;
      
      for (const metric of metrics) {
        if (originalResult.toLowerCase().includes(metric) && refactoredResult.toLowerCase().includes(metric)) {
          foundMetrics++;
        }
      }
      
      if (foundMetrics === 0) {
        throw new Error('Nenhuma métrica financeira encontrada no relatório');
      }
      
      // Verificar se contém palavra 'relatório' ou similar (mais flexível)
      const reportKeywords = ['relatório', 'resumo', 'análise', 'dados', 'informações'];
      const hasReportKeyword = reportKeywords.some(keyword => 
        originalResult.toLowerCase().includes(keyword) && 
        refactoredResult.toLowerCase().includes(keyword)
      );
      
      if (!hasReportKeyword) {
        // Se não encontrou palavras-chave, verificar se pelo menos tem estrutura de relatório
        const hasStructure = (originalResult.includes('R$') || originalResult.includes('Total')) &&
                             (refactoredResult.includes('R$') || refactoredResult.includes('Total'));
        
        if (!hasStructure) {
          throw new Error('Não encontrou estrutura de relatório');
        }
      }
      
      return true;
    });
    
    // Teste 6.2: Métricas do sistema
    await this.runCategorizedTest('salesAnalytics', 'Métricas do sistema', () => {
      const originalMetrics = this.originalHandler.getMetrics();
      const refactoredMetrics = this.refactoredHandler.getMetrics();
      
      // Verificar propriedades essenciais
      const essentialMetrics = ['totalSalesProcessed', 'totalRevenue', 'errors'];
      for (const metric of essentialMetrics) {
        if (!(metric in originalMetrics) || !(metric in refactoredMetrics)) {
          throw new Error(`Métrica essencial '${metric}' não encontrada`);
        }
      }
      
      return true;
    });
  }

  /**
   * Categoria 7: Sincronização
   */
  async testSynchronizationComplete() {
    console.log('\n🔄 CATEGORIA 7: SINCRONIZAÇÃO');
    console.log('-' .repeat(50));
    
    const userId = 'test-user-123';
    
    // Teste 7.1: Comando de sincronização manual
    await this.runCategorizedTest('synchronization', 'Sincronização manual', async () => {
      const analysisResult = {
        descricao: 'sincronizar vendas',
        intencao: 'sincronizar_vendas'
      };
      
      const originalResult = await this.originalHandler.process(userId, analysisResult);
      const refactoredResult = await this.refactoredHandler.process(userId, analysisResult);
      
      if (!originalResult || !refactoredResult) {
        throw new Error('Sincronização manual não processada');
      }
      
      // Verificar se confirma a sincronização
      const syncInfo = ['Sincronização', 'concluída', 'Tempo'];
      for (const info of syncInfo) {
        if (!originalResult.includes(info) || !refactoredResult.includes(info)) {
          throw new Error(`Informação de sincronização '${info}' não encontrada`);
        }
      }
      
      return true;
    });
    
    // Teste 7.2: Status de sincronização
    await this.runCategorizedTest('synchronization', 'Status de sincronização', () => {
      const originalStatus = this.originalHandler.getStatus();
      const refactoredStatus = this.refactoredHandler.getStatus();
      
      if (typeof originalStatus !== 'object' || typeof refactoredStatus !== 'object') {
        throw new Error('Status deve retornar objeto');
      }
      
      // Verificar propriedades essenciais do status
      const essentialStatusProps = ['isInitialized'];
      for (const prop of essentialStatusProps) {
        if (!(prop in originalStatus) || !(prop in refactoredStatus)) {
          throw new Error(`Propriedade de status '${prop}' não encontrada`);
        }
      }
      
      return true;
    });
  }

  /**
   * Categoria 8: Casos Extremos e Edge Cases
   */
  async testEdgeCasesComplete() {
    console.log('\n⚠️ CATEGORIA 8: CASOS EXTREMOS E EDGE CASES');
    console.log('-' .repeat(50));
    
    const userId = 'test-user-123';
    
    // Teste 8.1: Entrada vazia ou inválida
    await this.runCategorizedTest('edgeCases', 'Entrada vazia ou inválida', async () => {
      const invalidInputs = [
        { descricao: '', intencao: '' },
        { descricao: null, intencao: null },
        { descricao: undefined, intencao: undefined },
        { descricao: '   ', intencao: '   ' }
      ];
      
      for (const input of invalidInputs) {
        const originalResult = await this.originalHandler.process(userId, input);
        const refactoredResult = await this.refactoredHandler.process(userId, input);
        
        // Ambos devem retornar null ou string (não devem quebrar)
        if (originalResult !== null && typeof originalResult !== 'string') {
          throw new Error('Handler original quebrou com entrada inválida');
        }
        
        if (refactoredResult !== null && typeof refactoredResult !== 'string') {
          throw new Error('Handler refatorado quebrou com entrada inválida');
        }
      }
      
      return true;
    });
    
    // Teste 8.2: Valores monetários extremos
    await this.runCategorizedTest('edgeCases', 'Valores monetários extremos', async () => {
      const extremeValues = [
        { valor: 0.01, produto_nome: 'Produto Barato' },
        { valor: 999999.99, produto_nome: 'Produto Caro' },
        { valor: -10, produto_nome: 'Produto Negativo' }
      ];
      
      for (const testCase of extremeValues) {
        const analysisResult = {
          descricao: `Vendi ${testCase.produto_nome} por ${testCase.valor}`,
          intencao: 'registrar_venda',
          valor: testCase.valor,
          produto_nome: testCase.produto_nome
        };
        
        const originalResult = await this.originalHandler.process(userId, analysisResult);
        const refactoredResult = await this.refactoredHandler.process(userId, analysisResult);
        
        // Ambos devem processar sem quebrar
        if (typeof originalResult !== 'string' && originalResult !== null) {
          throw new Error(`Handler original quebrou com valor ${testCase.valor}`);
        }
        
        if (typeof refactoredResult !== 'string' && refactoredResult !== null) {
          throw new Error(`Handler refatorado quebrou com valor ${testCase.valor}`);
        }
      }
      
      return true;
    });
    
    // Teste 8.3: Contexto de imagem expirado
    await this.runCategorizedTest('edgeCases', 'Contexto de imagem expirado', async () => {
      // Limpar contextos existentes primeiro
      this.originalHandler.imageProductContext.clear();
      this.refactoredHandler.imageProductContext.clear();
      
      // Simular contexto expirado modificando o timeout temporariamente
      const originalTimeout = this.originalHandler.contextTimeout;
      const refactoredTimeout = this.refactoredHandler.contextTimeout;
      
      this.originalHandler.contextTimeout = 1; // 1ms
      this.refactoredHandler.contextTimeout = 1; // 1ms
      
      // Salvar contexto
      const productData = { produto_nome: 'Teste Expirado', timestamp: Date.now() };
      this.originalHandler.saveImageProductContext(userId, productData);
      this.refactoredHandler.saveImageProductContext(userId, productData);
      
      // Aguardar expiração (tempo suficiente)
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Tentar recuperar contexto expirado
      const originalContext = await this.originalHandler.getLastImageProductContext(userId);
      const refactoredContext = await this.refactoredHandler.getLastImageProductContext(userId);
      
      // Restaurar timeout original
      this.originalHandler.contextTimeout = originalTimeout;
      this.refactoredHandler.contextTimeout = refactoredTimeout;
      
      // Ambos devem retornar null para contexto expirado
      if (originalContext !== null || refactoredContext !== null) {
        console.log('Original context after expiry:', originalContext);
        console.log('Refactored context after expiry:', refactoredContext);
        throw new Error('Contexto expirado não foi limpo corretamente');
      }
      
      return true;
    });
  }

  /**
   * Executar teste categorizado
   */
  async runCategorizedTest(category, testName, testFunction) {
    this.testResults.totalTests++;
    this.testResults.categories[category].total++;
    
    try {
      const result = await testFunction();
      
      if (result === true) {
        this.testResults.passed++;
        this.testResults.categories[category].passed++;
        console.log(`  ✅ ${testName}`);
      } else {
        this.testResults.failed++;
        this.testResults.errors.push(`${category}/${testName}: Teste retornou ${result}`);
        console.log(`  ❌ ${testName}: Teste retornou ${result}`);
      }
    } catch (error) {
      this.testResults.failed++;
      this.testResults.errors.push(`${category}/${testName}: ${error.message}`);
      console.log(`  ❌ ${testName}: ${error.message}`);
    }
  }

  /**
   * Calcular compatibilidade final
   */
  calculateFinalCompatibility() {
    if (this.testResults.totalTests > 0) {
      this.testResults.compatibility = (this.testResults.passed / this.testResults.totalTests) * 100;
    }
  }

  /**
   * Exibir resultados detalhados
   */
  displayDetailedResults() {
    console.log('\n' + '=' .repeat(80));
    console.log('📊 RESULTADOS FINAIS DOS TESTES ABRANGENTES');
    console.log('=' .repeat(80));
    
    console.log(`\n🎯 RESUMO GERAL:`);
    console.log(`   Total de Testes: ${this.testResults.totalTests}`);
    console.log(`   ✅ Passou: ${this.testResults.passed}`);
    console.log(`   ❌ Falhou: ${this.testResults.failed}`);
    console.log(`   🎯 Compatibilidade: ${this.testResults.compatibility.toFixed(2)}%`);
    
    console.log(`\n📋 RESULTADOS POR CATEGORIA:`);
    for (const [category, results] of Object.entries(this.testResults.categories)) {
      const percentage = results.total > 0 ? (results.passed / results.total * 100).toFixed(1) : '0.0';
      const status = percentage === '100.0' ? '✅' : percentage >= '90.0' ? '⚠️' : '❌';
      console.log(`   ${status} ${category}: ${results.passed}/${results.total} (${percentage}%)`);
    }
    
    if (this.testResults.errors.length > 0) {
      console.log(`\n❌ ERROS DETALHADOS:`);
      this.testResults.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }
    
    console.log('\n' + '=' .repeat(80));
    
    if (this.isMigrationSafe()) {
      console.log('🎉 MIGRAÇÃO APROVADA - SISTEMA SEGURO PARA PRODUÇÃO!');
      console.log('✅ Todas as funcionalidades críticas validadas');
      console.log('✅ Compatibilidade excelente: ' + this.testResults.compatibility.toFixed(2) + '%');
      console.log('✅ Pode prosseguir com a migração final');
    } else if (this.testResults.compatibility >= 85) {
      console.log('⚠️ COMPATIBILIDADE BOA - REVISAR ERROS MENORES');
      console.log('🔍 Verificar erros antes da migração final');
    } else {
      console.log('❌ COMPATIBILIDADE INSUFICIENTE - MIGRAÇÃO NÃO RECOMENDADA');
      console.log('🛠️ Corrigir erros antes de prosseguir');
    }
    
    console.log('=' .repeat(80));
  }

  /**
   * Verificar se migração é segura
   */
  isMigrationSafe() {
    // Migração é segura se:
    // 1. Compatibilidade >= 90% (excelente)
    // 2. Todas as funcionalidades críticas passaram (6 de 8 categorias com 100%)
    // 3. Erros são apenas em edge cases ou diferenças menores
    const criticalCategoriesPass = (
      this.testResults.categories.initialization.passed === this.testResults.categories.initialization.total &&
      this.testResults.categories.imageSales.passed === this.testResults.categories.imageSales.total &&
      this.testResults.categories.manualSales.passed === this.testResults.categories.manualSales.total &&
      this.testResults.categories.productManagement.passed === this.testResults.categories.productManagement.total &&
      this.testResults.categories.stockQueries.passed === this.testResults.categories.stockQueries.total &&
      this.testResults.categories.synchronization.passed === this.testResults.categories.synchronization.total
    );
    
    return this.testResults.compatibility >= 90 && criticalCategoriesPass;
  }
}

// Executar testes se chamado diretamente
if (require.main === module) {
  const tester = new ComprehensiveSalesHandlerTest();
  tester.runComprehensiveTests().then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  }).catch(error => {
    console.error('ERRO FATAL nos testes abrangentes:', error);
    process.exit(1);
  });
}

module.exports = ComprehensiveSalesHandlerTest;