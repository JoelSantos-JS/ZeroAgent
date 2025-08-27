const { GoogleGenerativeAI } = require('@google/generative-ai');
const AudioOptimizer = require('./audio-optimizer');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

class AudioProcessor {
  constructor() {
    this.name = 'AudioProcessor';
    this.genAI = null;
    this.model = null;
    this.audioOptimizer = new AudioOptimizer();
    this.isInitialized = false;
    
    // Configurações de áudio
    this.audioConfig = {
      supportedFormats: ['mp3', 'wav', 'flac', 'ogg', 'm4a'],
      maxFileSize: 40 * 1024 * 1024, // 40MB
      maxDuration: 9.5 * 60 * 60,    // 9.5 horas em segundos
      tokensPerSecond: 32
    };
  }

  // Inicializar processador de áudio
  async initialize() {
    try {
      console.log('🎵 Inicializando AudioProcessor...');
      
      // Inicializar AudioOptimizer
      await this.audioOptimizer.initialize();
      
      // Inicializar Gemini AI
      if (process.env.GEMINI_API_KEY) {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ 
          model: 'gemini-2.5-flash',
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024
          }
        });
        
        console.log('✅ AudioProcessor inicializado com Gemini AI');
      } else {
        console.warn('⚠️ GEMINI_API_KEY não encontrada, modo offline');
      }
      
      this.isInitialized = true;
      logger.info('AudioProcessor inicializado');
      
    } catch (error) {
      console.error('❌ Erro ao inicializar AudioProcessor:', error);
      throw error;
    }
  }

  // Processar áudio completo (otimização + transcrição + análise)
  async processAudio(audioBuffer, messageContext = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const startTime = Date.now();
    
    try {
      console.log('🎙️ Iniciando processamento de áudio...');
      
      // 1. Validar áudio
      this.validateAudio(audioBuffer);
      
      // 2. Otimizar áudio (velocidade + compressão)
      const optimizationResult = await this.audioOptimizer.optimizeAudio(audioBuffer, {
        speed: 1.5,
        bitrate: '128k',
        sampleRate: 16000
      });
      
      console.log('📊 Otimização concluída:', {
        tokenSavings: optimizationResult.metrics.tokenSavings,
        compressionRatio: optimizationResult.metrics.compressionRatio
      });
      
      // 3. Transcrever e analisar com Gemini
      const analysisResult = await this.transcribeAndAnalyze(
        optimizationResult.optimizedBuffer,
        messageContext
      );
      
      const totalTime = Date.now() - startTime;
      
      const result = {
        transcription: analysisResult.transcription,
        financialData: analysisResult.financialData,
        optimization: optimizationResult.metrics,
        processingTime: totalTime,
        success: true
      };
      
      console.log('✅ Áudio processado com sucesso:', {
        transcription: result.transcription?.substring(0, 50) + '...',
        tokenSavings: result.optimization.tokenSavings,
        processingTime: `${totalTime}ms`
      });
      
      logger.info('Áudio processado', {
        messageContext,
        optimization: result.optimization,
        processingTime: totalTime
      });
      
      return result;
      
    } catch (error) {
      console.error('❌ Erro no processamento de áudio:', error);
      logger.error('Erro no processamento de áudio', { 
        error: error.message,
        messageContext
      });
      
      // Retornar erro estruturado
      return {
        success: false,
        error: error.message,
        fallback: this.generateFallbackResponse(error)
      };
    }
  }

  // Transcrever e analisar áudio com Gemini
  async transcribeAndAnalyze(audioBuffer, messageContext = {}) {
    try {
      if (!this.model) {
        throw new Error('Gemini AI não disponível');
      }
      
      console.log('🧠 Transcrevendo com Gemini AI...');
      
      // Upload do áudio para Gemini Files API
      const uploadedFile = await this.uploadAudioToGemini(audioBuffer);
      
      // Prompt especializado para análise financeira
      const prompt = this.buildFinancialAudioPrompt(messageContext);
      
      // Processar com Gemini
      const response = await this.model.generateContent([
        prompt,
        {
          fileData: {
            mimeType: 'audio/mp3',
            fileUri: uploadedFile.uri
          }
        }
      ]);
      
      const responseText = response.response.text();
      console.log('📝 Resposta do Gemini:', responseText.substring(0, 100) + '...');
      
      // Parsear resposta
      const analysisResult = this.parseGeminiResponse(responseText);
      
      return analysisResult;
      
    } catch (error) {
      console.error('❌ Erro na transcrição:', error);
      throw new Error(`Falha na transcrição: ${error.message}`);
    }
  }

  // Upload de áudio para Gemini Files API
  async uploadAudioToGemini(audioBuffer) {
    try {
      // Salvar temporariamente para upload
      const tempPath = await this.audioOptimizer.saveTemporaryFile(audioBuffer, 'upload');
      
      // Upload para Gemini
      const uploadResult = await this.genAI.files.upload({
        file: tempPath,
        config: { mimeType: 'audio/mp3' }
      });
      
      // Limpar arquivo temporário
      await this.audioOptimizer.cleanupTempFiles([tempPath]);
      
      console.log('📤 Áudio enviado para Gemini:', uploadResult.uri);
      return uploadResult;
      
    } catch (error) {
      console.error('❌ Erro no upload:', error);
      throw error;
    }
  }

  // Construir prompt especializado para análise financeira de áudio
  buildFinancialAudioPrompt(messageContext = {}) {
    return `
Você é um assistente financeiro especializado em processar áudios sobre transações financeiras.

Sua tarefa é:
1. TRANSCREVER o áudio completamente
2. IDENTIFICAR informações financeiras:
   - Valor monetário mencionado
   - Tipo de transação (receita/despesa/investimento)
   - Categoria (alimentação, transporte, salário, etc.)
   - Descrição da transação
   - Data mencionada (se houver)

3. RESPONDER em formato JSON estruturado:

{
  "transcricao": "texto completo transcrito",
  "valor": 50.00,
  "tipo": "receita|despesa|investimento",
  "categoria": "categoria_identificada",
  "descricao": "descrição_extraída",
  "data": "hoje|data_mencionada",
  "confianca": 0.95
}

Categorias válidas:
- RECEITAS: salario, freelance, vendas, bonus, jogos, investimento, outros
- DESPESAS: alimentacao, transporte, supermercado, lazer, saude, casa, roupas, aluguel, outros
- INVESTIMENTOS: aplicacao, acoes, fundos, criptomoedas, outros

Contexto adicional: ${JSON.stringify(messageContext)}

PROCESSE O ÁUDIO AGORA:
`;
  }

  // Parsear resposta do Gemini
  parseGeminiResponse(responseText) {
    try {
      // Tentar extrair JSON da resposta
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        return {
          transcription: parsed.transcricao || '',
          financialData: {
            valor: parsed.valor || 0,
            tipo: parsed.tipo || 'outros',
            categoria: parsed.categoria || 'outros',
            descricao: parsed.descricao || parsed.transcricao || '',
            data: parsed.data || 'hoje',
            confianca: parsed.confianca || 0.8
          }
        };
      } else {
        // Fallback: usar resposta como transcrição
        return {
          transcription: responseText,
          financialData: {
            valor: 0,
            tipo: 'outros',
            categoria: 'outros',
            descricao: responseText,
            data: 'hoje',
            confianca: 0.5
          }
        };
      }
      
    } catch (error) {
      console.error('❌ Erro ao parsear resposta:', error);
      
      // Fallback básico
      return {
        transcription: responseText,
        financialData: {
          valor: 0,
          tipo: 'outros',
          categoria: 'outros',
          descricao: 'Erro na análise do áudio',
          data: 'hoje',
          confianca: 0.3
        }
      };
    }
  }

  // Validar áudio
  validateAudio(audioBuffer) {
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Áudio vazio ou inválido');
    }
    
    if (audioBuffer.length > this.audioConfig.maxFileSize) {
      const sizeMB = (audioBuffer.length / 1024 / 1024).toFixed(2);
      throw new Error(`Arquivo muito grande: ${sizeMB}MB. Máximo: 40MB`);
    }
    
    return true;
  }

  // Gerar resposta de fallback em caso de erro
  generateFallbackResponse(error) {
    const fallbackMessages = {
      'Áudio vazio': 'Por favor, envie um áudio válido com sua transação.',
      'Arquivo muito grande': 'Áudio muito grande. Por favor, envie um áudio menor que 40MB.',
      'Gemini AI não disponível': 'Serviço de transcrição temporariamente indisponível. Tente novamente ou digite sua transação.',
      'Falha na transcrição': 'Não consegui processar o áudio. Por favor, tente falar mais claramente ou digite sua transação.'
    };
    
    // Encontrar mensagem apropriada
    for (const [key, message] of Object.entries(fallbackMessages)) {
      if (error.message.includes(key)) {
        return message;
      }
    }
    
    return 'Erro no processamento do áudio. Por favor, tente novamente ou digite sua transação.';
  }

  // Obter estatísticas do processador
  getStats() {
    return {
      isInitialized: this.isInitialized,
      hasGeminiAI: !!this.model,
      audioConfig: this.audioConfig,
      optimizerPresets: this.audioOptimizer.getPresetConfigs()
    };
  }

  // Estimar custo de processamento
  estimateProcessingCost(audioBuffer, config = { speed: 1.5 }) {
    const estimation = this.audioOptimizer.estimateOptimization(audioBuffer.length, config);
    
    // Custo aproximado por token (Gemini Flash)
    const costPerToken = 0.0000003; // $0.30 per 1M tokens
    const estimatedCost = estimation.optimizedTokens * costPerToken;
    
    return {
      ...estimation,
      estimatedCost: estimatedCost.toFixed(6),
      costSavings: ((estimation.originalTokens - estimation.optimizedTokens) * costPerToken).toFixed(6)
    };
  }
}

module.exports = AudioProcessor;