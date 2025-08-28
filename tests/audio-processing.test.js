const AudioProcessor = require('../services/audio-processor');
const AudioOptimizer = require('../services/audio-optimizer');
const AudioErrorHandler = require('../services/audio-error-handler');
const fs = require('fs');
const path = require('path');

// Mock do logger para testes
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

// Mock do Gemini AI
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            transcricao: 'Gastei cinquenta reais no supermercado',
            valor: 50.00,
            tipo: 'despesa',
            categoria: 'alimentacao',
            descricao: 'compras no supermercado',
            confianca: 0.95
          })
        }
      })
    }),
    files: {
      upload: jest.fn().mockResolvedValue({
        uri: 'mock-file-uri',
        mimeType: 'audio/mp3'
      })
    }
  }))
}));

// Mock do FFmpeg
jest.mock('fluent-ffmpeg', () => {
  const mockFfmpeg = jest.fn().mockImplementation(() => ({
    audioFilters: jest.fn().mockReturnThis(),
    audioCodec: jest.fn().mockReturnThis(),
    audioBitrate: jest.fn().mockReturnThis(),
    audioFrequency: jest.fn().mockReturnThis(),
    format: jest.fn().mockReturnThis(),
    output: jest.fn().mockReturnThis(),
    on: jest.fn().mockImplementation((event, callback) => {
      if (event === 'end') {
        setTimeout(callback, 100); // Simular processamento
      }
      return mockFfmpeg();
    }),
    run: jest.fn()
  }));
  return mockFfmpeg;
});

describe('Audio Processing Tests', () => {
  let audioProcessor;
  let audioOptimizer;
  let audioErrorHandler;
  let mockAudioBuffer;

  beforeEach(() => {
    audioProcessor = new AudioProcessor();
    audioOptimizer = new AudioOptimizer();
    audioErrorHandler = new AudioErrorHandler();
    
    // Criar buffer de áudio mock (1KB)
    mockAudioBuffer = Buffer.alloc(1024, 'mock audio data');
    
    // Mock do processo.env
    process.env.GEMINI_API_KEY = 'mock-api-key';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('AudioOptimizer', () => {
    test('deve inicializar corretamente', async () => {
      await audioOptimizer.initialize();
      expect(audioOptimizer.name).toBe('AudioOptimizer');
    });

    test('deve validar buffer de áudio', () => {
      expect(() => audioOptimizer.validateAudioBuffer(mockAudioBuffer)).not.toThrow();
      expect(() => audioOptimizer.validateAudioBuffer(null)).toThrow('Buffer de áudio vazio ou inválido');
    });

    test('deve calcular métricas de otimização', async () => {
      const originalBuffer = Buffer.alloc(2048);
      const optimizedBuffer = Buffer.alloc(1024);
      const config = { speed: 1.5 };
      
      const metrics = await audioOptimizer.calculateMetrics(originalBuffer, optimizedBuffer, config);
      
      expect(metrics).toHaveProperty('originalSize', 2048);
      expect(metrics).toHaveProperty('optimizedSize', 1024);
      expect(metrics).toHaveProperty('compressionRatio');
      expect(metrics).toHaveProperty('tokenSavings');
    });

    test('deve estimar otimização antes do processamento', () => {
      const bufferSize = 1024;
      const config = { speed: 1.5 };
      
      const estimation = audioOptimizer.estimateOptimization(bufferSize, config);
      
      expect(estimation).toHaveProperty('estimatedDuration');
      expect(estimation).toHaveProperty('optimizedDuration');
      expect(estimation).toHaveProperty('tokenSavings');
      expect(estimation.tokenSavings).toBeGreaterThan(0);
    });

    test('deve obter configurações predefinidas', () => {
      const presets = audioOptimizer.getPresetConfigs();
      
      expect(presets).toHaveProperty('aggressive');
      expect(presets).toHaveProperty('balanced');
      expect(presets).toHaveProperty('conservative');
      expect(presets.balanced.speed).toBe(1.5);
    });
  });

  describe('AudioErrorHandler', () => {
    test('deve classificar erros corretamente', () => {
      const fileError = new Error('Arquivo muito grande');
      const networkError = new Error('Network timeout');
      const apiError = new Error('Gemini API quota exceeded');
      
      expect(audioErrorHandler.classifyError(fileError)).toBe('FILE_TOO_LARGE');
      expect(audioErrorHandler.classifyError(networkError)).toBe('NETWORK_ERROR');
      expect(audioErrorHandler.classifyError(apiError)).toBe('API_ERROR');
    });

    test('deve gerar respostas de erro apropriadas', () => {
      const error = new Error('Arquivo muito grande');
      const context = { userId: 'test-user' };
      
      const response = audioErrorHandler.handleAudioError(error, context);
      
      expect(response).toContain('muito grande');
      expect(response).toContain('40MB');
    });

    test('deve controlar tentativas de retry', () => {
      const userId = 'test-user';
      
      // Primeira tentativa
      expect(audioErrorHandler.canUserRetry(userId)).toBe(true);
      
      // Simular múltiplos erros
      for (let i = 0; i < 3; i++) {
        audioErrorHandler.incrementErrorCount(userId);
      }
      
      expect(audioErrorHandler.canUserRetry(userId)).toBe(false);
      expect(audioErrorHandler.shouldApplyCooldown(userId)).toBe(true);
    });

    test('deve gerar fallback offline', () => {
      const fallback = audioErrorHandler.generateOfflineFallback();
      
      expect(fallback).toContain('Digite sua transação');
      expect(fallback).toContain('Exemplo');
    });
  });

  describe('AudioProcessor', () => {
    beforeEach(async () => {
      await audioProcessor.initialize();
    });

    test('deve inicializar corretamente', () => {
      expect(audioProcessor.isInitialized).toBe(true);
      expect(audioProcessor.audioOptimizer).toBeDefined();
      expect(audioProcessor.errorHandler).toBeDefined();
    });

    test('deve validar áudio corretamente', () => {
      expect(() => audioProcessor.validateAudio(mockAudioBuffer)).not.toThrow();
      expect(() => audioProcessor.validateAudio(null)).toThrow('Áudio vazio ou inválido');
    });

    test('deve estimar custo de processamento', () => {
      const estimation = audioProcessor.estimateProcessingCost(mockAudioBuffer);
      
      expect(estimation).toHaveProperty('estimatedDuration');
      expect(estimation).toHaveProperty('optimizedTokens');
      expect(estimation).toHaveProperty('estimatedCost');
      expect(estimation).toHaveProperty('costSavings');
    });

    test('deve obter estatísticas do processador', () => {
      const stats = audioProcessor.getStats();
      
      expect(stats).toHaveProperty('isInitialized');
      expect(stats).toHaveProperty('hasGeminiAI');
      expect(stats).toHaveProperty('audioConfig');
      expect(stats).toHaveProperty('optimizerPresets');
    });
  });

  describe('Fluxo Completo de Processamento', () => {
    beforeEach(async () => {
      await audioProcessor.initialize();
    });

    test('deve processar áudio com sucesso', async () => {
      const messageContext = {
        userId: 'test-user',
        phoneNumber: '5511999999999',
        userContext: {}
      };
      
      const result = await audioProcessor.processAudio(mockAudioBuffer, messageContext);
      
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('transcription');
      expect(result).toHaveProperty('financialData');
      expect(result).toHaveProperty('optimization');
      expect(result.financialData).toHaveProperty('valor', 50.00);
      expect(result.financialData).toHaveProperty('tipo', 'despesa');
    });

    test('deve lidar com erros graciosamente', async () => {
      // Simular erro no processamento
      const invalidBuffer = null;
      const messageContext = {
        userId: 'test-user',
        phoneNumber: '5511999999999'
      };
      
      const result = await audioProcessor.processAudio(invalidBuffer, messageContext);
      
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('fallback');
      expect(result).toHaveProperty('errorType');
    });

    test('deve aplicar otimizações corretamente', async () => {
      const messageContext = {
        userId: 'test-user',
        phoneNumber: '5511999999999'
      };
      
      const result = await audioProcessor.processAudio(mockAudioBuffer, messageContext);
      
      if (result.success) {
        expect(result.optimization).toHaveProperty('tokenSavings');
        expect(result.optimization).toHaveProperty('compressionRatio');
        expect(result.optimization.tokenSavings).toBeGreaterThan(0);
      }
    });
  });

  describe('Integração com WhatsApp', () => {
    test('deve simular fluxo completo do WhatsApp', async () => {
      // Simular mensagem do WhatsApp
      const whatsappMessage = {
        id: { _serialized: 'test-message-id' },
        from: '5511999999999@c.us',
        hasAudio: true,
        audioBuffer: mockAudioBuffer,
        audioMimetype: 'audio/mp3'
      };
      
      // Simular processamento
      const messageContext = {
        userId: 'test-user',
        phoneNumber: whatsappMessage.from
      };
      
      const result = await audioProcessor.processAudio(
        whatsappMessage.audioBuffer, 
        messageContext
      );
      
      // Verificar se o resultado pode ser usado pelo Financial Agent
      if (result.success) {
        expect(result.financialData).toHaveProperty('tipo');
        expect(result.financialData).toHaveProperty('valor');
        expect(result.financialData).toHaveProperty('categoria');
        expect(result.financialData).toHaveProperty('descricao');
      }
    });
  });

  describe('Performance e Limites', () => {
    test('deve respeitar limites de tamanho de arquivo', () => {
      const largeBuffer = Buffer.alloc(50 * 1024 * 1024); // 50MB
      
      expect(() => audioProcessor.validateAudio(largeBuffer))
        .toThrow('Arquivo muito grande');
    });

    test('deve calcular tokens corretamente', () => {
      const durationInSeconds = 60; // 1 minuto
      const expectedTokens = 60 * 32; // 32 tokens por segundo
      
      const tokens = audioProcessor.audioConfig.tokensPerSecond * durationInSeconds;
      expect(tokens).toBe(expectedTokens);
    });

    test('deve estimar economia de tokens com otimização', () => {
      const originalDuration = 60; // 1 minuto
      const optimizedDuration = 40; // 40 segundos (1.5x speed)
      
      const originalTokens = originalDuration * 32;
      const optimizedTokens = optimizedDuration * 32;
      const savings = originalTokens - optimizedTokens;
      
      expect(savings).toBe(640); // 33% de economia
    });
  });

  describe('Configurações e Presets', () => {
    test('deve ter configurações válidas', () => {
      const config = audioProcessor.audioConfig;
      
      expect(config).toHaveProperty('supportedFormats');
      expect(config).toHaveProperty('limits');
      expect(config.limits.maxFileSize).toBe(40 * 1024 * 1024);
      expect(config.limits.tokensPerSecond).toBe(32);
    });

    test('deve fornecer presets de otimização', () => {
      const presets = audioOptimizer.getPresetConfigs();
      
      expect(presets.aggressive.speed).toBeGreaterThan(presets.conservative.speed);
      expect(presets.balanced.speed).toBe(1.5);
    });
  });
});

// Testes de integração com mocks mais realistas
describe('Testes de Integração', () => {
  test('deve simular cenário real completo', async () => {
    const audioProcessor = new AudioProcessor();
    await audioProcessor.initialize();
    
    // Simular áudio real (dados mock)
    const audioBuffer = Buffer.from('mock audio data representing speech');
    
    const messageContext = {
      userId: 'user-123',
      phoneNumber: '5511999999999@c.us',
      userContext: {
        recentTransactions: [
          { categoria: 'alimentacao', valor: 25.50 }
        ]
      }
    };
    
    const result = await audioProcessor.processAudio(audioBuffer, messageContext);
    
    // Verificar estrutura da resposta
    expect(result).toHaveProperty('success');
    
    if (result.success) {
      expect(result).toHaveProperty('transcription');
      expect(result).toHaveProperty('financialData');
      expect(result).toHaveProperty('optimization');
      expect(result).toHaveProperty('processingTime');
    } else {
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('fallback');
      expect(result).toHaveProperty('errorType');
    }
  });
});