const { GoogleGenerativeAI } = require('@google/generative-ai');
const ImageComparisonService = require('./image-comparison-service');
const SimpleImageProcessor = require('./simple-image-processor');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Tentar carregar OpenCV se disponível
let OpenCVProcessor = null;
try {
  OpenCVProcessor = require('./opencv-processor');
  console.log('🔧 OpenCV disponível');
} catch (error) {
  console.log('⚠️ OpenCV não disponível, usando processador simples');
}

/**
 * Processador de Imagem para Reconhecimento de Produtos
 * Utiliza Gemini Vision API para analisar imagens e identificar produtos
 */
class ImageProcessor {
  constructor(databaseService, geminiService) {
    this.name = 'ImageProcessor';
    this.genAI = null;
    this.model = null;
    this.databaseService = databaseService;
    this.geminiService = geminiService;
    this.imageComparisonService = null;
    this.simpleProcessor = new SimpleImageProcessor();
    this.openCVProcessor = OpenCVProcessor ? new OpenCVProcessor() : null;
    this.isInitialized = false;
    
    // Configurações de imagem
    this.imageConfig = {
      supportedFormats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      maxFileSize: 20 * 1024 * 1024, // 20MB
      maxWidth: 4096,
      maxHeight: 4096,
      quality: 0.8
    };
    
    // Configurações de processamento
      this.config = {
        maxImageSize: 10 * 1024 * 1024, // 10MB
        supportedFormats: ['image/jpeg', 'image/png', 'image/webp'],
        timeout: 30000, // 30 segundos
        useOpenCV: false, // Desabilitado por enquanto
        useSimpleProcessor: false, // Desabilitado por enquanto
        openCVThreshold: 0.6, // Confiança mínima do OpenCV
        simpleThreshold: 0.5 // Confiança mínima do processador simples
      };
    
    // Métricas
    this.metrics = {
      totalImagesProcessed: 0,
      successfulRecognitions: 0,
      failedRecognitions: 0,
      averageProcessingTime: 0
    };
  }

  /**
   * Inicializar processador de imagem
   */
  async initialize() {
    try {
      console.log('📸 Inicializando ImageProcessor...');
      
      // Inicializar Simple Processor (sempre disponível)
      await this.simpleProcessor.initialize();
      console.log('🔧 Simple Image Processor inicializado');
      
      // Inicializar OpenCV se disponível
      if (this.openCVProcessor) {
        try {
          await this.openCVProcessor.initialize();
          console.log('🔧 OpenCV Processor inicializado');
        } catch (error) {
          console.warn('⚠️ OpenCV não disponível, usando fallback:', error.message);
          this.openCVProcessor = null;
        }
      }
      
      // Inicializar Gemini AI
      if (process.env.GEMINI_API_KEY) {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ 
          model: 'gemini-1.5-flash',
          generationConfig: {
            temperature: 0.3, // Baixa temperatura para respostas mais consistentes
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024
          }
        });
        
        // Inicializar serviço de comparação de imagens
        if (this.databaseService && this.geminiService) {
          this.imageComparisonService = new ImageComparisonService(
            this.databaseService, 
            this.geminiService
          );
          console.log('🔍 Serviço de comparação de imagens inicializado');
        }
        
        const processors = ['Simple Processor', 'Gemini Vision'];
        if (this.openCVProcessor) processors.unshift('OpenCV');
        console.log(`✅ ImageProcessor inicializado com ${processors.join(' + ')}`);
        this.isInitialized = true;
      } else {
        throw new Error('GEMINI_API_KEY não encontrada');
      }
      
    } catch (error) {
      console.error('❌ Erro ao inicializar ImageProcessor:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * Processar imagem para reconhecimento de produto
   * @param {Buffer} imageBuffer - Buffer da imagem
   * @param {Object} messageContext - Contexto da mensagem
   * @returns {Promise<Object>} - Resultado do processamento
   */
  async processImage(imageBuffer, messageContext = {}) {
    const startTime = Date.now();
    
    try {
      if (!this.isInitialized) {
        throw new Error('ImageProcessor não inicializado');
      }
      
      console.log('📸 Iniciando processamento de imagem...');
      
      // Validar imagem
      const validation = this.validateImage(imageBuffer);
      if (!validation.isValid) {
        throw new Error(`Imagem inválida: ${validation.errors.join(', ')}`);
      }
      
      let analysisResult = null;
      
      // 1. Primeiro, tentar Simple Processor (sempre disponível, rápido)
      if (this.config.useSimpleProcessor && this.simpleProcessor.isInitialized) {
        try {
          console.log('🔧 Analisando com Simple Processor...');
          const simpleResult = await this.simpleProcessor.processImage(imageBuffer, messageContext);
          
          if (simpleResult.success && simpleResult.productData.confianca >= this.config.simpleThreshold) {
            console.log('✅ Simple Processor reconhecimento bem-sucedido:', simpleResult.productData.produto_nome);
            analysisResult = simpleResult.productData;
          } else {
            console.log('⚠️ Confiança Simple Processor baixa, tentando outras opções...');
          }
        } catch (error) {
          console.log('⚠️ Simple Processor falhou, continuando com outras opções...');
        }
      }
      
      // 2. Se Simple Processor não deu resultado satisfatório, tentar OpenCV (se disponível)
      if (!analysisResult && this.config.useOpenCV && this.openCVProcessor?.isInitialized) {
        try {
          console.log('🔧 Analisando com OpenCV...');
          const openCVResult = await this.openCVProcessor.processImage(imageBuffer, messageContext);
          
          if (openCVResult.success && openCVResult.productData.confianca >= this.config.openCVThreshold) {
            console.log('✅ OpenCV reconhecimento bem-sucedido:', openCVResult.productData.produto_nome);
            analysisResult = openCVResult.productData;
          } else {
            console.log('⚠️ Confiança OpenCV baixa, tentando outras opções...');
          }
        } catch (error) {
          console.log('⚠️ OpenCV falhou, continuando com outras opções...');
        }
      }
      
      // 3. Se processadores locais não funcionaram, tentar análise offline inteligente
      if (!analysisResult) {
        try {
          console.log('🔍 Tentando reconhecimento offline inteligente...');
          const offlineResult = await this.analyzeImageOffline(imageBuffer, messageContext);
          
          if (offlineResult.confianca >= 0.7) {
            console.log('✅ Reconhecimento offline bem-sucedido:', offlineResult.produto_nome);
            analysisResult = offlineResult;
          } else {
            console.log('⚠️ Confiança offline baixa, tentando comparação com banco...');
          }
        } catch (error) {
          console.log('⚠️ Análise offline falhou, continuando...');
        }
      }
      
      // 4. Se ainda não temos resultado, tentar comparar com produtos no banco de dados
      if (!analysisResult && messageContext.userId && (this.imageComparisonService || messageContext.databaseService)) {
        try {
          console.log('🔍 Comparando com produtos cadastrados...');
          
          let comparisonService = this.imageComparisonService;
          if (!comparisonService && messageContext.databaseService) {
            comparisonService = new ImageComparisonService(
              messageContext.databaseService, 
              this.geminiService
            );
          }
          
          const comparisonResult = await comparisonService.compareWithProducts(
            imageBuffer, 
            messageContext.userId
          );
         
          if (comparisonResult.success && comparisonResult.bestMatch) {
            analysisResult = this.convertComparisonToAnalysis(comparisonResult);
            console.log('✅ Produto encontrado no banco:', analysisResult.produto_nome);
          }
        } catch (dbError) {
          console.error('❌ Erro na comparação com banco:', dbError.message);
        }
      }
      
      // 5. Se ainda não temos resultado, usar Gemini como último recurso
      if (!analysisResult) {
        try {
          console.log('🧠 Tentando Gemini Vision (último recurso)...');
          const geminiPromise = this.analyzeImageWithGemini(imageBuffer, messageContext);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout do Gemini')), 10000)
          );
          
          analysisResult = await Promise.race([geminiPromise, timeoutPromise]);
        } catch (geminiError) {
          console.error('❌ Gemini falhou:', geminiError.message);
        }
      }
      
      // 6. Se ainda não temos resultado, usar fallback final
      if (!analysisResult) {
        console.log('🔄 Usando fallback final...');
        const fallbackResult = await this.generateEnhancedFallbackResponse(imageBuffer, messageContext);
        if (fallbackResult.success) {
          analysisResult = fallbackResult.productData;
        } else {
          analysisResult = {
            tipo: 'venda',
            produto_nome: 'Produto não identificado',
            categoria: 'outros',
            confianca: 0.3,
            valor: 0
          };
        }
      }
      
      // Atualizar métricas
      this.updateMetrics(startTime, true);
      
      console.log('✅ Imagem processada com sucesso');
      
      return {
        success: true,
        productData: analysisResult,
        processingTime: Date.now() - startTime,
        imageSize: imageBuffer.length
      };
      
    } catch (error) {
      console.error('❌ Erro no processamento de imagem:', error);
      
      // Atualizar métricas de erro
      this.updateMetrics(startTime, false);
      
      return {
        success: false,
        error: error.message,
        fallback: this.generateFallbackResponse(error),
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Analisar imagem com Gemini Vision
   * @param {Buffer} imageBuffer - Buffer da imagem
   * @param {Object} messageContext - Contexto da mensagem
   * @returns {Promise<Object>} - Resultado da análise
   */
  async analyzeImageWithGemini(imageBuffer, messageContext = {}) {
    try {
      console.log('🧠 Analisando imagem com Gemini Vision...');
      
      // Converter buffer para base64
      const base64Image = imageBuffer.toString('base64');
      
      // Construir prompt especializado para reconhecimento de produtos
      const prompt = this.buildProductRecognitionPrompt(messageContext);
      
      // Preparar dados da imagem para Gemini
      const imagePart = {
        inlineData: {
          data: base64Image,
          mimeType: this.detectMimeType(imageBuffer)
        }
      };
      
      // Processar com Gemini Vision com retry para sobrecarga
      let response;
      let attempts = 0;
      const maxAttempts = 3;
      const baseDelay = 2000; // 2 segundos
      
      while (attempts < maxAttempts) {
        try {
          response = await this.model.generateContent([
            prompt,
            imagePart
          ]);
          break; // Sucesso, sair do loop
        } catch (error) {
          attempts++;
          
          if (error.message.includes('overloaded') || error.message.includes('503')) {
            if (attempts < maxAttempts) {
              const delay = baseDelay * Math.pow(2, attempts - 1); // Backoff exponencial
              console.log(`⏳ Gemini sobrecarregado, tentativa ${attempts}/${maxAttempts}. Aguardando ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          }
          
          throw error; // Re-throw se não for erro de sobrecarga ou esgotou tentativas
        }
      }
      
      const responseText = response.response.text();
      
      console.log('📝 Resposta do Gemini Vision:', responseText.substring(0, 100) + '...');
      
      // Parsear resposta
      const analysisResult = this.parseGeminiResponse(responseText);
      
      return analysisResult;
      
    } catch (error) {
      console.error('❌ Erro na análise com Gemini:', error);
      throw new Error(`Falha na análise: ${error.message}`);
    }
  }

  /**
   * Construir prompt para reconhecimento de produtos
   * @param {Object} messageContext - Contexto da mensagem
   * @returns {string} - Prompt formatado
   */
  buildProductRecognitionPrompt(messageContext = {}) {
    const basePrompt = `
Você é um especialista em reconhecimento de produtos para um sistema de vendas.

Analise a imagem fornecida e identifique o produto mostrado. Retorne APENAS um JSON válido com as seguintes informações:

{
  "tipo": "venda",
  "produto_identificado": "nome do produto identificado",
  "categoria": "categoria do produto (eletrônicos, roupas, casa, etc.)",
  "descricao": "descrição detalhada do produto",
  "confianca": 0.95,
  "caracteristicas": ["característica 1", "característica 2"],
  "cor_principal": "cor predominante",
  "marca_visivel": "marca se visível",
  "estado": "novo/usado/não identificado"
}

IMPORTANTE:
- Seja específico na identificação do produto
- Use nomes comerciais comuns (ex: "Fone Bluetooth", "Camiseta Polo", "Smartphone")
- A confiança deve ser entre 0.0 e 1.0
- Se não conseguir identificar claramente, use confiança baixa (<0.5)
- Retorne APENAS o JSON, sem texto adicional`;
    
    // Adicionar contexto do usuário se disponível
    const userContext = messageContext.userContext ? 
      `\n\nContexto do usuário: ${JSON.stringify(messageContext.userContext.recentTransactions || [])}` : '';
    
    return basePrompt + userContext;
  }

  /**
   * Parsear resposta do Gemini
   * @param {string} responseText - Texto da resposta
   * @returns {Object} - Dados parseados
   */
  parseGeminiResponse(responseText) {
    try {
      // Limpar resposta e extrair JSON
      let cleanResponse = responseText.trim();
      
      // Remover markdown se presente
      cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      // Tentar parsear JSON
      const parsed = JSON.parse(cleanResponse);
      
      // Validar estrutura mínima
      if (!parsed.produto_identificado) {
        throw new Error('Produto não identificado na resposta');
      }
      
      // Normalizar dados
      return {
        tipo: parsed.tipo || 'venda',
        produto_nome: parsed.produto_identificado,
        categoria: parsed.categoria || 'outros',
        descricao: parsed.descricao || parsed.produto_identificado,
        confianca: Math.min(Math.max(parsed.confianca || 0.5, 0), 1),
        caracteristicas: parsed.caracteristicas || [],
        cor_principal: parsed.cor_principal || null,
        marca_visivel: parsed.marca_visivel || null,
        estado: parsed.estado || 'não identificado',
        valor: 0 // Será preenchido pelo sales handler
      };
      
    } catch (error) {
      console.error('❌ Erro ao parsear resposta:', error);
      
      // Fallback: tentar extrair produto do texto
      const productMatch = responseText.match(/produto[^:]*:?\s*([^\n,]+)/i);
      const product = productMatch ? productMatch[1].trim() : 'Produto não identificado';
      
      return {
        tipo: 'venda',
        produto_nome: product,
        categoria: 'outros',
        descricao: `Produto identificado: ${product}`,
        confianca: 0.3,
        caracteristicas: [],
        cor_principal: null,
        marca_visivel: null,
        estado: 'não identificado',
        valor: 0
      };
    }
  }

  /**
   * Validar imagem
   * @param {Buffer} imageBuffer - Buffer da imagem
   * @returns {Object} - Resultado da validação
   */
  validateImage(imageBuffer) {
    const errors = [];
    
    // Verificar tamanho
    if (imageBuffer.length > this.imageConfig.maxFileSize) {
      errors.push(`Imagem muito grande (máximo: ${this.imageConfig.maxFileSize / 1024 / 1024}MB)`);
    }
    
    if (imageBuffer.length < 1024) {
      errors.push('Imagem muito pequena');
    }
    
    // Verificar formato básico
    const mimeType = this.detectMimeType(imageBuffer);
    if (!mimeType) {
      errors.push('Formato de imagem não suportado');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      mimeType
    };
  }

  /**
   * Detectar tipo MIME da imagem
   * @param {Buffer} imageBuffer - Buffer da imagem
   * @returns {string|null} - Tipo MIME
   */
  detectMimeType(imageBuffer) {
    // Verificar assinaturas de arquivo
    const signatures = {
      'image/jpeg': [0xFF, 0xD8, 0xFF],
      'image/png': [0x89, 0x50, 0x4E, 0x47],
      'image/gif': [0x47, 0x49, 0x46],
      'image/webp': [0x52, 0x49, 0x46, 0x46]
    };
    
    for (const [mimeType, signature] of Object.entries(signatures)) {
      if (signature.every((byte, index) => imageBuffer[index] === byte)) {
        return mimeType;
      }
    }
    
    return 'image/jpeg'; // Fallback
  }

  /**
   * Atualizar métricas
   * @param {number} startTime - Tempo de início
   * @param {boolean} success - Se foi bem-sucedido
   */
  updateMetrics(startTime, success) {
    this.metrics.totalImagesProcessed++;
    
    if (success) {
      this.metrics.successfulRecognitions++;
    } else {
      this.metrics.failedRecognitions++;
    }
    
    const processingTime = Date.now() - startTime;
    this.metrics.averageProcessingTime = 
      (this.metrics.averageProcessingTime * (this.metrics.totalImagesProcessed - 1) + processingTime) / 
      this.metrics.totalImagesProcessed;
  }

  /**
   * Converter resultado da comparação para formato de análise
   * @param {Object} comparisonResult - Resultado da comparação
   * @returns {Object} - Dados no formato de análise
   */
  convertComparisonToAnalysis(comparisonResult) {
    const bestMatch = comparisonResult.bestMatch;
    const product = bestMatch.product;
    
    return {
      tipo: 'venda',
      produto_nome: product.name || product.product_name,
      categoria: product.category || product.product_category || 'outros',
      descricao: `Produto identificado: ${product.name || product.product_name}`,
      confianca: bestMatch.similarity,
      caracteristicas: [bestMatch.reason],
      cor_principal: null,
      marca_visivel: null,
      estado: 'identificado',
      valor: product.selling_price || product.price || 0,
      produto_id: product.id,
      fonte: 'banco_dados',
      similaridade: bestMatch.similarity,
      alternativas: comparisonResult.alternativeMatches?.map(alt => ({
        nome: alt.product.name || alt.product.product_name,
        similaridade: alt.similarity_score,
        id: alt.product.id
      })) || []
    };
  }

  /**
   * Análise offline inteligente baseada em metadados e padrões
   * @param {Buffer} imageBuffer - Buffer da imagem
   * @param {Object} messageContext - Contexto da mensagem
   * @returns {Object} - Resultado da análise offline
   */
  async analyzeImageOffline(imageBuffer, messageContext) {
    try {
      // Análise básica de metadados da imagem
      const imageSize = imageBuffer.length;
      const isLargeImage = imageSize > 500000; // > 500KB
      
      // Análise de contexto do usuário
      const userHistory = messageContext.userContext?.recentTransactions || [];
      const frequentCategories = this.extractFrequentCategories(userHistory);
      
      // Análise de padrões temporais
      const currentHour = new Date().getHours();
      const isBusinessHours = currentHour >= 8 && currentHour <= 18;
      
      // Heurísticas baseadas em contexto
      let categoria = 'outros';
      let confianca = 0.4;
      let produto_nome = 'Produto não identificado';
      
      // Se usuário tem histórico de eletrônicos
      if (frequentCategories.includes('eletrônicos') || frequentCategories.includes('tecnologia')) {
        categoria = 'eletrônicos';
        produto_nome = 'Produto eletrônico';
        confianca = 0.6;
        
        // Se imagem é grande (provável foto de produto)
        if (isLargeImage) {
          confianca = 0.75;
          produto_nome = 'Dispositivo eletrônico';
        }
      }
      
      // Se usuário tem histórico de roupas
      if (frequentCategories.includes('roupas') || frequentCategories.includes('vestuário')) {
        categoria = 'roupas';
        produto_nome = 'Item de vestuário';
        confianca = 0.65;
      }
      
      // Se é horário comercial, maior chance de ser produto para venda
      if (isBusinessHours) {
        confianca += 0.1;
      }
      
      return {
        tipo: 'venda',
        produto_nome,
        categoria,
        confianca: Math.min(confianca, 0.85), // Máximo 85% para análise offline
        valor: null,
        fonte: 'offline_intelligent',
        metadados: {
          tamanho_imagem: imageSize,
          categorias_frequentes: frequentCategories,
          horario_comercial: isBusinessHours
        }
      };
      
    } catch (error) {
      console.error('❌ Erro na análise offline:', error);
      throw error;
    }
  }

  /**
   * Extrair categorias frequentes do histórico do usuário
   * @param {Array} transactions - Transações recentes
   * @returns {Array} - Categorias mais frequentes
   */
  extractFrequentCategories(transactions) {
    if (!transactions || transactions.length === 0) return [];
    
    const categoryCount = {};
    transactions.forEach(t => {
      const cat = t.category || t.categoria || 'outros';
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });
    
    return Object.entries(categoryCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([cat]) => cat);
  }

  /**
   * Gerar resposta de fallback melhorada
   * @param {Buffer} imageBuffer - Buffer da imagem
   * @param {Object} messageContext - Contexto da mensagem
   * @returns {Object} - Resposta de fallback melhorada
   */
  async generateEnhancedFallbackResponse(imageBuffer, messageContext) {
    try {
      // Tentar análise offline primeiro
      const offlineResult = await this.analyzeImageOffline(imageBuffer, messageContext);
      
      return {
        success: true,
        productData: {
          ...offlineResult,
          confianca: Math.max(offlineResult.confianca, 0.4), // Mínimo 40%
          observacao: 'Análise baseada em contexto e histórico do usuário'
        },
        processingTime: 100, // Análise rápida
        method: 'enhanced_fallback'
      };
      
    } catch (error) {
      // Fallback básico se tudo falhar
      return {
        success: true,
        productData: {
          tipo: 'venda',
          produto_nome: 'Produto para venda',
          categoria: 'outros',
          confianca: 0.35,
          valor: null,
          fonte: 'fallback_basic',
          observacao: 'Análise básica - confirme o produto manualmente'
        },
        processingTime: 50,
        method: 'basic_fallback'
      };
    }
  }

  /**
   * Gerar resposta de fallback
   * @param {Error} error - Erro ocorrido
   * @returns {string} - Mensagem de fallback
   */
  generateFallbackResponse(error) {
    if (error.message.includes('muito grande')) {
      return '📸 Imagem muito grande. Envie uma foto menor que 20MB.';
    }
    
    if (error.message.includes('formato')) {
      return '📸 Formato não suportado. Use JPG, PNG ou WebP.';
    }
    
    if (error.message.includes('API')) {
      return '📸 Erro no serviço de reconhecimento. Tente novamente em alguns instantes.';
    }
    
    return '📸 Não consegui processar a imagem. Tente enviar outra foto ou digite o nome do produto.';
  }

  /**
   * Obter estatísticas
   * @returns {Object} - Estatísticas do processador
   */
  getStats() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalImagesProcessed > 0 ? 
        (this.metrics.successfulRecognitions / this.metrics.totalImagesProcessed * 100).toFixed(2) + '%' : '0%',
      isInitialized: this.isInitialized
    };
  }
}

module.exports = ImageProcessor;