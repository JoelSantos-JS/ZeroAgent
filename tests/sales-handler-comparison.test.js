const assert = require('assert');
const SalesHandlerOriginal = require('../services/handlers/sales-handler');
const SalesHandlerRefactored = require('../services/handlers/sales-handler-refactored');

/**
 * Teste abrangente de comparação entre sales-handler original e refatorado
 * Valida 100% de compatibilidade antes da migração
 */
class SalesHandlerComparisonTest {
  constructor() {
    this.mockDatabaseService = this.createMockDatabaseService();
    this.mockUserService = this.createMockUserService();
    
    this.originalHandler = new SalesHandlerOriginal(this.mockDatabaseService, this.mockUserService);
    this.refactoredHandler = new SalesHandlerRefactored(this.mockDatabaseService, this.mockUserService);
    
    this.testResults = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      errors: [],
      compatibility: 0
    };
  }

  /**
   * Criar mock do database service
   */
  createMockDatabaseService() {
    return {
      connectionType: 'supabase',
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({ data: [], error: null })
          }),
          insert: () => ({
            select: () => ({
              single: () => ({ data: { id: 'test-id' }, error: null })
            })
          })
        })
      },
      getUserProducts: async () => [
        {
          id: 'prod-1',
          name: 'Fone Bluetooth',
          product_name: 'Fone Bluetooth',
          selling_price: 50.00,
          cost_price: 30.00,
          category: 'eletrônicos'
        },
        {
          id: 'prod-2', 
          name: 'Mouse Gamer',
          product_name: 'Mouse Gamer',
          selling_price: 80.00,
          cost_price: 50.00,
          category: 'informática'
        }
      ],
      getUserTransactionsByCategory: async () => [
        {
          id: 'trans-1',
          amount: 50.00,
          description: 'Venda: Fone Bluetooth',
          transaction_date: new Date(),
          metadata: { buyer_name: 'João' }
        }
      ],
      createTransaction: async () => ({ id: 'new-trans-id' }),
      createRevenue: async () => ({ id: 'new-revenue-id' }),
      createProduct: async (userId, productData) => ({ id: 'new-product-id', ...productData })
    };
  }

  /**
   * Criar mock do user service
   */
  createMockUserService() {
    return {
      getUserById: async () => ({ id: 'user-1', name: 'Test User' })
    };
  }

  /**
   * Executar todos os testes
   */
  async runAllTests() {
    console.log('🧪 Iniciando testes de comparação Sales Handler...');
    console.log('=' .repeat(60));
    
    try {
      // Testes de inicialização
      await this.testInitialization();
      
      // Testes de métodos públicos
      await this.testPublicMethods();
      
      // Testes de processamento de vendas
      await this.testSalesProcessing();
      
      // Testes de vendas por imagem
      await this.testImageSales();
      
      // Testes de consultas
      await this.testQueries();
      
      // Testes de sincronização
      await this.testSynchronization();
      
      // Testes de métricas
      await this.testMetrics();
      
      // Calcular compatibilidade
      this.calculateCompatibility();
      
      // Exibir resultados
      this.displayResults();
      
      return this.testResults;
      
    } catch (error) {
      console.error('❌ Erro durante os testes:', error);
      this.testResults.errors.push(`Erro geral: ${error.message}`);
      return this.testResults;
    }
  }

  /**
   * Testar inicialização
   */
  async testInitialization() {
    console.log('\n📋 Testando Inicialização...');
    
    // Teste 1: Inicialização sem erros
    await this.runTest('Inicialização sem erros', async () => {
      await this.originalHandler.initialize();
      await this.refactoredHandler.initialize();
      return true;
    });
    
    // Teste 2: Propriedades básicas
    await this.runTest('Propriedades básicas', () => {
      const originalProps = Object.keys(this.originalHandler);
      const refactoredProps = Object.keys(this.refactoredHandler);
      
      // Verificar se propriedades essenciais existem
      const essentialProps = ['databaseService', 'userService', 'metrics', 'imageProductContext'];
      
      for (const prop of essentialProps) {
        if (!originalProps.includes(prop) || !refactoredProps.includes(prop)) {
          throw new Error(`Propriedade essencial '${prop}' não encontrada`);
        }
      }
      
      return true;
    });
  }

  /**
   * Testar métodos públicos
   */
  async testPublicMethods() {
    console.log('\n🔧 Testando Métodos Públicos...');
    
    const publicMethods = [
      'process',
      'initialize', 
      'getMetrics',
      'getStatus',
      'isImageSaleConfirmation',
      'handleImageSaleConfirmation',
      'saveImageProductContext',
      'getLastImageProductContext',
      'registerImageSale'
    ];
    
    for (const method of publicMethods) {
      await this.runTest(`Método '${method}' existe`, () => {
        const originalHasMethod = typeof this.originalHandler[method] === 'function';
        const refactoredHasMethod = typeof this.refactoredHandler[method] === 'function';
        
        if (!originalHasMethod) {
          throw new Error(`Método '${method}' não existe no handler original`);
        }
        
        if (!refactoredHasMethod) {
          throw new Error(`Método '${method}' não existe no handler refatorado`);
        }
        
        return true;
      });
    }
  }

  /**
   * Testar processamento de vendas
   */
  async testSalesProcessing() {
    console.log('\n💰 Testando Processamento de Vendas...');
    
    const testCases = [
      {
        name: 'Venda manual simples',
        analysisResult: {
          descricao: 'Vendi fone por 50 reais',
          intencao: 'registrar_venda',
          valor: 50,
          produto_nome: 'Fone Bluetooth'
        }
      },
      {
        name: 'Consulta de estoque',
        analysisResult: {
          descricao: 'Quantos fones tem em estoque?',
          intencao: 'consultar_estoque',
          produto_nome: 'Fone Bluetooth'
        }
      },
      {
        name: 'Criar produto',
        analysisResult: {
          descricao: 'Criar produto Teclado Mecânico',
          intencao: 'criar_produto'
        }
      }
    ];
    
    for (const testCase of testCases) {
      await this.runTest(`Processamento: ${testCase.name}`, async () => {
        const userId = 'test-user-id';
        
        const originalResult = await this.originalHandler.process(userId, testCase.analysisResult);
        const refactoredResult = await this.refactoredHandler.process(userId, testCase.analysisResult);
        
        // Verificar se ambos retornaram string (resposta)
        if (typeof originalResult !== 'string' && originalResult !== null) {
          throw new Error('Handler original não retornou string ou null');
        }
        
        if (typeof refactoredResult !== 'string' && refactoredResult !== null) {
          throw new Error('Handler refatorado não retornou string ou null');
        }
        
        // Se ambos retornaram null, está ok
        if (originalResult === null && refactoredResult === null) {
          return true;
        }
        
        // Se um retornou null e outro não, há incompatibilidade
        if ((originalResult === null) !== (refactoredResult === null)) {
          throw new Error('Incompatibilidade: um retornou null e outro não');
        }
        
        // Verificar se as respostas são similares (estrutura)
        if (originalResult && refactoredResult) {
          const originalHasEmoji = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(originalResult);
          const refactoredHasEmoji = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(refactoredResult);
          
          if (originalHasEmoji !== refactoredHasEmoji) {
            console.warn(`⚠️ Diferença de formatação detectada em: ${testCase.name}`);
          }
        }
        
        return true;
      });
    }
  }

  /**
   * Testar vendas por imagem
   */
  async testImageSales() {
    console.log('\n📸 Testando Vendas por Imagem...');
    
    const userId = 'test-user-id';
    
    // Teste 1: Salvar contexto de imagem
    await this.runTest('Salvar contexto de imagem', () => {
      const productData = {
        product: { id: 'prod-1', name: 'Fone Bluetooth' },
        sellingPrice: 50.00,
        confianca: 0.95,
        produto_nome: 'Fone Bluetooth'
      };
      
      this.originalHandler.saveImageProductContext(userId, productData);
      this.refactoredHandler.saveImageProductContext(userId, productData);
      
      return true;
    });
    
    // Teste 2: Verificar contexto salvo
    await this.runTest('Verificar contexto salvo', async () => {
      const originalContext = await this.originalHandler.getLastImageProductContext(userId);
      const refactoredContext = await this.refactoredHandler.getLastImageProductContext(userId);
      
      if (!originalContext || !refactoredContext) {
        throw new Error('Contexto não foi salvo corretamente');
      }
      
      // Comparar propriedades essenciais
      if (originalContext.produto_nome !== refactoredContext.produto_nome) {
        console.log('Original context:', JSON.stringify(originalContext, null, 2));
        console.log('Refactored context:', JSON.stringify(refactoredContext, null, 2));
        throw new Error('Contextos não são idênticos');
      }
      
      // Verificar se ambos têm timestamp
      if (!originalContext.timestamp || !refactoredContext.timestamp) {
        throw new Error('Timestamp não encontrado nos contextos');
      }
      
      return true;
    });
    
    // Teste 3: Verificar confirmação de venda
    await this.runTest('Verificar confirmação de venda', () => {
      const confirmations = ['sim', 'ok', '50', '50 reais', 'não'];
      
      for (const confirmation of confirmations) {
        const originalResult = this.originalHandler.isImageSaleConfirmation(confirmation, userId);
        const refactoredResult = this.refactoredHandler.isImageSaleConfirmation(confirmation, userId);
        
        if (originalResult !== refactoredResult) {
          throw new Error(`Incompatibilidade na confirmação '${confirmation}': original=${originalResult}, refatorado=${refactoredResult}`);
        }
      }
      
      return true;
    });
  }

  /**
   * Testar consultas
   */
  async testQueries() {
    console.log('\n🔍 Testando Consultas...');
    
    const userId = 'test-user-id';
    
    // Teste de consulta de vendas
    await this.runTest('Consulta de vendas', async () => {
      const analysisResult = {
        descricao: 'Relatório de vendas',
        intencao: 'consultar_vendas'
      };
      
      const originalResult = await this.originalHandler.process(userId, analysisResult);
      const refactoredResult = await this.refactoredHandler.process(userId, analysisResult);
      
      // Ambos devem retornar string ou null
      if (typeof originalResult !== typeof refactoredResult) {
        throw new Error('Tipos de retorno diferentes para consulta de vendas');
      }
      
      return true;
    });
  }

  /**
   * Testar sincronização
   */
  async testSynchronization() {
    console.log('\n🔄 Testando Sincronização...');
    
    // Teste de comando de sincronização
    await this.runTest('Comando de sincronização', async () => {
      const userId = 'test-user-id';
      const analysisResult = {
        descricao: 'sincronizar vendas',
        intencao: 'sincronizar_vendas'
      };
      
      const originalResult = await this.originalHandler.process(userId, analysisResult);
      const refactoredResult = await this.refactoredHandler.process(userId, analysisResult);
      
      // Ambos devem retornar string
      if (typeof originalResult !== 'string' || typeof refactoredResult !== 'string') {
        throw new Error('Sincronização deve retornar string');
      }
      
      return true;
    });
  }

  /**
   * Testar métricas
   */
  async testMetrics() {
    console.log('\n📊 Testando Métricas...');
    
    // Teste de métricas
    await this.runTest('Obter métricas', () => {
      const originalMetrics = this.originalHandler.getMetrics();
      const refactoredMetrics = this.refactoredHandler.getMetrics();
      
      // Verificar propriedades essenciais
      const essentialProps = ['totalSalesProcessed', 'totalRevenue', 'errors'];
      
      for (const prop of essentialProps) {
        if (!(prop in originalMetrics)) {
          throw new Error(`Propriedade '${prop}' não encontrada nas métricas originais`);
        }
        
        if (!(prop in refactoredMetrics)) {
          throw new Error(`Propriedade '${prop}' não encontrada nas métricas refatoradas`);
        }
      }
      
      return true;
    });
    
    // Teste de status
    await this.runTest('Obter status', () => {
      const originalStatus = this.originalHandler.getStatus();
      const refactoredStatus = this.refactoredHandler.getStatus();
      
      if (typeof originalStatus !== 'object' || typeof refactoredStatus !== 'object') {
        throw new Error('Status deve retornar objeto');
      }
      
      return true;
    });
  }

  /**
   * Executar um teste individual
   */
  async runTest(testName, testFunction) {
    this.testResults.totalTests++;
    
    try {
      const result = await testFunction();
      
      if (result === true) {
        this.testResults.passed++;
        console.log(`  ✅ ${testName}`);
      } else {
        this.testResults.failed++;
        this.testResults.errors.push(`${testName}: Teste retornou ${result}`);
        console.log(`  ❌ ${testName}: Teste retornou ${result}`);
      }
    } catch (error) {
      this.testResults.failed++;
      this.testResults.errors.push(`${testName}: ${error.message}`);
      console.log(`  ❌ ${testName}: ${error.message}`);
    }
  }

  /**
   * Calcular compatibilidade
   */
  calculateCompatibility() {
    if (this.testResults.totalTests > 0) {
      this.testResults.compatibility = (this.testResults.passed / this.testResults.totalTests) * 100;
    }
  }

  /**
   * Exibir resultados
   */
  displayResults() {
    console.log('\n' + '=' .repeat(60));
    console.log('📊 RESULTADOS DOS TESTES');
    console.log('=' .repeat(60));
    console.log(`Total de Testes: ${this.testResults.totalTests}`);
    console.log(`✅ Passou: ${this.testResults.passed}`);
    console.log(`❌ Falhou: ${this.testResults.failed}`);
    console.log(`🎯 Compatibilidade: ${this.testResults.compatibility.toFixed(2)}%`);
    
    if (this.testResults.errors.length > 0) {
      console.log('\n❌ ERROS ENCONTRADOS:');
      this.testResults.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    }
    
    console.log('\n' + '=' .repeat(60));
    
    if (this.testResults.compatibility >= 100) {
      console.log('🎉 COMPATIBILIDADE 100% - MIGRAÇÃO APROVADA!');
    } else if (this.testResults.compatibility >= 95) {
      console.log('⚠️ COMPATIBILIDADE ALTA - REVISAR ERROS ANTES DA MIGRAÇÃO');
    } else {
      console.log('❌ COMPATIBILIDADE INSUFICIENTE - MIGRAÇÃO NÃO RECOMENDADA');
    }
  }

  /**
   * Verificar se migração é segura
   */
  isMigrationSafe() {
    return this.testResults.compatibility >= 100 && this.testResults.failed === 0;
  }
}

// Executar testes se chamado diretamente
if (require.main === module) {
  const tester = new SalesHandlerComparisonTest();
  tester.runAllTests().then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  }).catch(error => {
    console.error('Erro fatal nos testes:', error);
    process.exit(1);
  });
}

module.exports = SalesHandlerComparisonTest;