const { FinancialAgent } = require('../services/financial-agent');
const { GeminiService } = require('../services/gemini-service');
const { UserService } = require('../services/user-service');
const databaseService = require('../config/database');

// Mock dos serviços para testes
jest.mock('../services/gemini-service');
jest.mock('../services/user-service');
jest.mock('../config/database');
jest.mock('../utils/logger');

describe('FinancialAgent', () => {
  let financialAgent;
  let mockGeminiService;
  let mockUserService;
  let mockDatabaseService;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Criar instância do agente
    financialAgent = new FinancialAgent();
    
    // Configurar mocks
    mockGeminiService = {
      initialize: jest.fn().mockResolvedValue(true),
      processFinancialMessage: jest.fn(),
      generatePersonalizedResponse: jest.fn(),
      isReady: jest.fn().mockReturnValue(true)
    };
    
    mockUserService = {
      getOrCreateUser: jest.fn(),
      getUserStats: jest.fn()
    };
    
    mockDatabaseService = {
      initialize: jest.fn().mockResolvedValue(true),
      createTransaction: jest.fn(),
      createProduct: jest.fn(),
      getUserTransactions: jest.fn(),
      getUserTransactionsByCategory: jest.fn(),
      getUserProducts: jest.fn(),
      getUserMonthlyExpenses: jest.fn(),
      isConnected: true
    };
    
    // Aplicar mocks
    require('../services/gemini-service').mockImplementation(() => mockGeminiService);
    require('../services/user-service').mockImplementation(() => mockUserService);
    Object.assign(databaseService, mockDatabaseService);
  });

  describe('Inicialização', () => {
    test('deve inicializar corretamente', async () => {
      await financialAgent.initialize();
      
      expect(mockDatabaseService.initialize).toHaveBeenCalled();
      expect(mockGeminiService.initialize).toHaveBeenCalled();
      expect(financialAgent.isInitialized).toBe(true);
    });
    
    test('deve falhar se banco de dados não conectar', async () => {
      mockDatabaseService.initialize.mockRejectedValue(new Error('Erro de conexão'));
      
      await expect(financialAgent.initialize()).rejects.toThrow('Erro de conexão');
      expect(financialAgent.isInitialized).toBe(false);
    });
  });

  describe('Processamento de Mensagens', () => {
    beforeEach(async () => {
      await financialAgent.initialize();
      
      // Mock do usuário
      mockUserService.getOrCreateUser.mockResolvedValue({
        id: 1,
        whatsapp_number: '5511999999999',
        name: 'Usuário Teste'
      });
      
      // Mock das estatísticas do usuário
      mockUserService.getUserStats.mockResolvedValue({
        totalSpent: 1000,
        monthlySpent: 300,
        totalTransactions: 10,
        totalProducts: 5,
        topCategories: [{ category: 'alimentacao', amount: 150 }],
        recentTransactions: []
      });
    });

    test('deve processar gasto corretamente', async () => {
      const mockMessage = {
        id: { _serialized: 'test_123' },
        body: 'Gastei 50 reais no supermercado',
        from: '5511999999999@c.us'
      };
      
      // Mock da análise do Gemini
      mockGeminiService.processFinancialMessage.mockResolvedValue({
        tipo: 'gasto',
        valor: 50.00,
        categoria: 'supermercado',
        descricao: 'Compras no supermercado',
        data: 'hoje',
        intencao: 'registrar',
        confianca: 0.95
      });
      
      // Mock da transação criada
      mockDatabaseService.createTransaction.mockResolvedValue({
        id: 1,
        user_id: 1,
        value: 50.00,
        category: 'supermercado',
        description: 'Compras no supermercado'
      });
      
      // Mock da resposta personalizada
      mockGeminiService.generatePersonalizedResponse.mockResolvedValue(
        '✅ Seu gasto de R$ 50,00 no supermercado foi registrado com sucesso!'
      );
      
      const response = await financialAgent.processMessage(mockMessage);
      
      expect(mockUserService.getOrCreateUser).toHaveBeenCalledWith('5511999999999@c.us');
      expect(mockGeminiService.processFinancialMessage).toHaveBeenCalledWith(
        'Gastei 50 reais no supermercado',
        expect.any(Object)
      );
      expect(mockDatabaseService.createTransaction).toHaveBeenCalledWith(
        1, 50.00, 'supermercado', 'Compras no supermercado', expect.any(Date)
      );
      expect(response).toContain('registrado com sucesso');
    });

    test('deve processar produto corretamente', async () => {
      const mockMessage = {
        id: { _serialized: 'test_124' },
        body: 'Comprei um celular por 800 reais',
        from: '5511999999999@c.us'
      };
      
      mockGeminiService.processFinancialMessage.mockResolvedValue({
        tipo: 'produto',
        valor: 800.00,
        categoria: 'tecnologia',
        descricao: 'Celular',
        data: 'hoje',
        intencao: 'registrar',
        confianca: 0.90,
        produto_nome: 'Celular'
      });
      
      mockDatabaseService.createProduct.mockResolvedValue({
        id: 1,
        user_id: 1,
        product_name: 'Celular',
        price: 800.00
      });
      
      mockDatabaseService.createTransaction.mockResolvedValue({
        id: 2,
        user_id: 1,
        value: 800.00,
        category: 'tecnologia'
      });
      
      mockGeminiService.generatePersonalizedResponse.mockResolvedValue(
        '🛒 Produto registrado: Celular por R$ 800,00!'
      );
      
      const response = await financialAgent.processMessage(mockMessage);
      
      expect(mockDatabaseService.createProduct).toHaveBeenCalledWith(
        1, 'Celular', 'tecnologia', 800.00, expect.any(Date)
      );
      expect(mockDatabaseService.createTransaction).toHaveBeenCalled();
      expect(response).toContain('Produto registrado');
    });

    test('deve processar consulta de gastos mensais', async () => {
      const mockMessage = {
        id: { _serialized: 'test_125' },
        body: 'Quanto gastei este mês?',
        from: '5511999999999@c.us'
      };
      
      mockGeminiService.processFinancialMessage.mockResolvedValue({
        tipo: 'consulta',
        valor: 0,
        categoria: '',
        descricao: 'Consulta gastos mensais',
        data: 'hoje',
        intencao: 'consultar_gastos_mes',
        confianca: 0.85
      });
      
      mockDatabaseService.getUserMonthlyExpenses.mockResolvedValue({
        'alimentacao': 150.00,
        'transporte': 100.00,
        'supermercado': 200.00
      });
      
      const response = await financialAgent.processMessage(mockMessage);
      
      expect(mockDatabaseService.getUserMonthlyExpenses).toHaveBeenCalled();
      expect(response).toContain('Total: R$ 450.00');
      expect(response).toContain('alimentacao');
      expect(response).toContain('transporte');
      expect(response).toContain('supermercado');
    });

    test('deve lidar com mensagens de baixa confiança', async () => {
      const mockMessage = {
        id: { _serialized: 'test_126' },
        body: 'mensagem confusa sem sentido',
        from: '5511999999999@c.us'
      };
      
      mockGeminiService.processFinancialMessage.mockResolvedValue({
        tipo: 'outros',
        valor: 0,
        categoria: 'outros',
        descricao: 'mensagem confusa sem sentido',
        data: 'hoje',
        intencao: 'outros',
        confianca: 0.2
      });
      
      const response = await financialAgent.processMessage(mockMessage);
      
      expect(response).toContain('Não consegui entender');
      expect(response).toContain('Você pode tentar algo como');
    });

    test('deve evitar processamento duplicado', async () => {
      const mockMessage = {
        id: { _serialized: 'test_127' },
        body: 'Gastei 30 reais',
        from: '5511999999999@c.us'
      };
      
      mockGeminiService.processFinancialMessage.mockResolvedValue({
        tipo: 'gasto',
        valor: 30.00,
        categoria: 'outros',
        descricao: 'Gasto',
        data: 'hoje',
        intencao: 'registrar',
        confianca: 0.80
      });
      
      // Processar a mesma mensagem duas vezes
      const promise1 = financialAgent.processMessage(mockMessage);
      const promise2 = financialAgent.processMessage(mockMessage);
      
      const [response1, response2] = await Promise.all([promise1, promise2]);
      
      // Apenas uma deve ser processada
      expect(response1).toBeTruthy();
      expect(response2).toBeNull();
    });
  });

  describe('Utilitários', () => {
    test('deve parsear datas corretamente', () => {
      const today = financialAgent.parseDate('hoje');
      const yesterday = financialAgent.parseDate('ontem');
      const dayBeforeYesterday = financialAgent.parseDate('anteontem');
      
      expect(today).toBeInstanceOf(Date);
      expect(yesterday).toBeInstanceOf(Date);
      expect(dayBeforeYesterday).toBeInstanceOf(Date);
      
      // Verificar que as datas estão corretas
      const now = new Date();
      expect(today.toDateString()).toBe(now.toDateString());
      
      const yesterdayExpected = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      expect(yesterday.toDateString()).toBe(yesterdayExpected.toDateString());
    });

    test('deve verificar se está pronto', async () => {
      expect(financialAgent.isReady()).toBe(false);
      
      await financialAgent.initialize();
      expect(financialAgent.isReady()).toBe(true);
    });

    test('deve retornar status correto', async () => {
      await financialAgent.initialize();
      
      const status = financialAgent.getStatus();
      
      expect(status).toHaveProperty('isInitialized', true);
      expect(status).toHaveProperty('database', true);
      expect(status).toHaveProperty('gemini', true);
      expect(status).toHaveProperty('processingQueue');
    });
  });

  describe('Tratamento de Erros', () => {
    beforeEach(async () => {
      await financialAgent.initialize();
      
      mockUserService.getOrCreateUser.mockResolvedValue({
        id: 1,
        whatsapp_number: '5511999999999',
        name: 'Usuário Teste'
      });
    });

    test('deve lidar com erro no Gemini', async () => {
      const mockMessage = {
        id: { _serialized: 'test_error_1' },
        body: 'Gastei 50 reais',
        from: '5511999999999@c.us'
      };
      
      mockGeminiService.processFinancialMessage.mockRejectedValue(
        new Error('Erro na API do Gemini')
      );
      
      const response = await financialAgent.processMessage(mockMessage);
      
      expect(response).toContain('erro ao processar sua mensagem');
    });

    test('deve lidar com erro no banco de dados', async () => {
      const mockMessage = {
        id: { _serialized: 'test_error_2' },
        body: 'Gastei 50 reais',
        from: '5511999999999@c.us'
      };
      
      mockGeminiService.processFinancialMessage.mockResolvedValue({
        tipo: 'gasto',
        valor: 50.00,
        categoria: 'outros',
        descricao: 'Gasto',
        data: 'hoje',
        intencao: 'registrar',
        confianca: 0.80
      });
      
      mockDatabaseService.createTransaction.mockRejectedValue(
        new Error('Erro no banco de dados')
      );
      
      const response = await financialAgent.processMessage(mockMessage);
      
      expect(response).toContain('Erro ao registrar gasto');
    });
  });
});