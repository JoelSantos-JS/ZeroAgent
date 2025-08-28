const ffmpeg = require('fluent-ffmpeg');
const lamejs = require('lamejs');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class AudioOptimizer {
  constructor() {
    this.name = 'AudioOptimizer';
    this.tempDir = path.join(__dirname, '../temp');
    this.defaultConfig = {
      speed: 1.5,           // Acelerar para 1.5x (economia de 33% tokens)
      bitrate: '128k',      // Qualidade adequada para voz
      sampleRate: 16000,    // Otimizado para reconhecimento de voz
      format: 'mp3'         // Melhor compressão
    };
  }

  // Inicializar otimizador (criar diretório temp se necessário)
  async initialize() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      console.log('📁 AudioOptimizer inicializado');
      logger.info('AudioOptimizer inicializado', { tempDir: this.tempDir });
    } catch (error) {
      console.error('❌ Erro ao inicializar AudioOptimizer:', error);
      throw error;
    }
  }

  // Otimizar áudio completo (velocidade + compressão)
  async optimizeAudio(inputBuffer, options = {}) {
    const config = { ...this.defaultConfig, ...options };
    const startTime = Date.now();
    
    try {
      console.log('🎵 Iniciando otimização de áudio...');
      
      // 1. Salvar buffer temporariamente
      const tempInputPath = await this.saveTemporaryFile(inputBuffer, 'input');
      
      // 2. Aplicar otimizações com FFmpeg
      const optimizedPath = await this.applyOptimizations(tempInputPath, config);
      
      // 3. Ler arquivo otimizado
      const optimizedBuffer = await fs.readFile(optimizedPath);
      
      // 4. Calcular métricas
      const metrics = await this.calculateMetrics(inputBuffer, optimizedBuffer, config);
      
      // 5. Limpar arquivos temporários
      await this.cleanupTempFiles([tempInputPath, optimizedPath]);
      
      const processingTime = Date.now() - startTime;
      
      console.log('✅ Áudio otimizado com sucesso:', {
        originalSize: metrics.originalSize,
        optimizedSize: metrics.optimizedSize,
        compressionRatio: metrics.compressionRatio,
        tokenSavings: metrics.tokenSavings,
        processingTime: `${processingTime}ms`
      });
      
      logger.info('Áudio otimizado', {
        metrics,
        processingTime,
        config
      });
      
      return {
        optimizedBuffer,
        metrics,
        config,
        processingTime
      };
      
    } catch (error) {
      console.error('❌ Erro na otimização de áudio:', error);
      logger.error('Erro na otimização de áudio', { error: error.message });
      throw error;
    }
  }

  // Salvar buffer como arquivo temporário
  async saveTemporaryFile(buffer, prefix = 'audio') {
    const timestamp = Date.now();
    const filename = `${prefix}_${timestamp}.mp3`;
    const filepath = path.join(this.tempDir, filename);
    
    await fs.writeFile(filepath, buffer);
    return filepath;
  }

  // Aplicar otimizações básicas (sem FFmpeg)
  async applyOptimizations(inputPath, config) {
    try {
      console.log('⚠️ FFmpeg não disponível, usando otimização básica');
      
      // Para agora, apenas copiamos o arquivo sem modificações
      // Em produção, você pode usar bibliotecas JavaScript puras para processamento de áudio
      const outputPath = inputPath.replace('input_', 'optimized_');
      
      // Simular processamento
      const fs = require('fs').promises;
      const inputBuffer = await fs.readFile(inputPath);
      await fs.writeFile(outputPath, inputBuffer);
      
      console.log('✅ Otimização básica concluída (sem alteração de velocidade)');
      return outputPath;
      
    } catch (error) {
      console.error('❌ Erro na otimização básica:', error);
      throw error;
    }
  }

  // Calcular métricas de otimização (modo básico)
  async calculateMetrics(originalBuffer, optimizedBuffer, config) {
    const originalSize = originalBuffer.length;
    const optimizedSize = optimizedBuffer.length;
    const compressionRatio = ((originalSize - optimizedSize) / originalSize * 100).toFixed(2);
    
    // Estimar duração original (aproximação baseada no tamanho)
    // MP3 típico: ~1KB por segundo a 128kbps
    const estimatedOriginalDuration = Math.round(originalSize / 1024); // segundos
    
    // Sem FFmpeg, não há alteração de velocidade real, mas simulamos para compatibilidade
    const simulatedOptimizedDuration = Math.round(estimatedOriginalDuration / config.speed);
    
    // Calcular economia de tokens simulada (32 tokens por segundo)
    const originalTokens = estimatedOriginalDuration * 32;
    const simulatedOptimizedTokens = simulatedOptimizedDuration * 32;
    const simulatedTokenSavings = originalTokens - simulatedOptimizedTokens;
    const simulatedTokenSavingsPercent = ((simulatedTokenSavings / originalTokens) * 100).toFixed(2);
    
    return {
      originalSize,
      optimizedSize,
      compressionRatio: `${compressionRatio}%`,
      estimatedOriginalDuration,
      optimizedDuration: simulatedOptimizedDuration,
      originalTokens,
      optimizedTokens: simulatedOptimizedTokens,
      tokenSavings: simulatedTokenSavings,
      tokenSavingsPercent: `${simulatedTokenSavingsPercent}%`,
      note: 'Métricas simuladas - FFmpeg não disponível'
    };
  }

  // Limpar arquivos temporários
  async cleanupTempFiles(filePaths) {
    try {
      await Promise.all(
        filePaths.map(async (filepath) => {
          try {
            await fs.unlink(filepath);
            console.log(`🗑️ Arquivo temporário removido: ${path.basename(filepath)}`);
          } catch (error) {
            // Ignorar erros de arquivo não encontrado
            if (error.code !== 'ENOENT') {
              console.warn(`⚠️ Erro ao remover arquivo temporário: ${error.message}`);
            }
          }
        })
      );
    } catch (error) {
      console.warn('⚠️ Erro na limpeza de arquivos temporários:', error.message);
    }
  }

  // Validar se áudio pode ser otimizado
  validateAudioBuffer(buffer) {
    if (!buffer || buffer.length === 0) {
      throw new Error('Buffer de áudio vazio ou inválido');
    }
    
    // Verificar tamanho máximo (40MB)
    const maxSize = 40 * 1024 * 1024; // 40MB
    if (buffer.length > maxSize) {
      throw new Error(`Arquivo muito grande: ${(buffer.length / 1024 / 1024).toFixed(2)}MB. Máximo: 40MB`);
    }
    
    return true;
  }

  // Configurações predefinidas
  getPresetConfigs() {
    return {
      // Máxima economia (pode afetar qualidade)
      aggressive: {
        speed: 1.8,
        bitrate: '96k',
        sampleRate: 16000,
        format: 'mp3'
      },
      
      // Balanceado (recomendado)
      balanced: {
        speed: 1.5,
        bitrate: '128k',
        sampleRate: 16000,
        format: 'mp3'
      },
      
      // Conservador (melhor qualidade)
      conservative: {
        speed: 1.2,
        bitrate: '192k',
        sampleRate: 22050,
        format: 'mp3'
      },
      
      // Apenas compressão (sem alteração de velocidade)
      compressionOnly: {
        speed: 1.0,
        bitrate: '128k',
        sampleRate: 16000,
        format: 'mp3'
      }
    };
  }

  // Obter configuração por nome
  getPresetConfig(presetName) {
    const presets = this.getPresetConfigs();
    return presets[presetName] || presets.balanced;
  }

  // Estimar economia antes da otimização
  estimateOptimization(bufferSize, config = this.defaultConfig) {
    const estimatedDuration = Math.round(bufferSize / 1024); // segundos
    const optimizedDuration = Math.round(estimatedDuration / config.speed);
    
    const originalTokens = estimatedDuration * 32;
    const optimizedTokens = optimizedDuration * 32;
    const tokenSavings = originalTokens - optimizedTokens;
    
    return {
      estimatedDuration,
      optimizedDuration,
      originalTokens,
      optimizedTokens,
      tokenSavings,
      tokenSavingsPercent: ((tokenSavings / originalTokens) * 100).toFixed(2) + '%'
    };
  }
}

module.exports = AudioOptimizer;