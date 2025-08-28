const logger = require('../utils/logger');

class AudioErrorHandler {
  constructor() {
    this.name = 'AudioErrorHandler';
    this.errorCounts = new Map(); // Contador de erros por usuário
    this.maxRetries = 3;
    this.cooldownPeriod = 5 * 60 * 1000; // 5 minutos
  }

  // Processar erro de áudio e retornar resposta apropriada
  handleAudioError(error, context = {}) {
    const errorType = this.classifyError(error);
    const userId = context.userId || 'unknown';
    
    // Registrar erro
    this.logError(error, errorType, context);
    
    // Incrementar contador de erros
    this.incrementErrorCount(userId);
    
    // Gerar resposta baseada no tipo de erro
    const response = this.generateErrorResponse(errorType, context);
    
    // Verificar se deve aplicar cooldown
    if (this.shouldApplyCooldown(userId)) {
      return this.getCooldownResponse();
    }
    
    return response;
  }

  // Classificar tipo de erro
  classifyError(error) {
    const errorMessage = error.message.toLowerCase();
    
    // Erros de arquivo
    if (errorMessage.includes('arquivo') || errorMessage.includes('file')) {
      if (errorMessage.includes('muito grande') || errorMessage.includes('too large')) {
        return 'FILE_TOO_LARGE';
      }
      if (errorMessage.includes('vazio') || errorMessage.includes('empty')) {
        return 'FILE_EMPTY';
      }
      if (errorMessage.includes('formato') || errorMessage.includes('format')) {
        return 'INVALID_FORMAT';
      }
      if (errorMessage.includes('corrompido') || errorMessage.includes('corrupt')) {
        return 'FILE_CORRUPTED';
      }
      return 'FILE_ERROR';
    }
    
    // Erros de rede
    if (errorMessage.includes('network') || errorMessage.includes('connection') || 
        errorMessage.includes('timeout') || errorMessage.includes('rede')) {
      return 'NETWORK_ERROR';
    }
    
    // Erros da API Gemini
    if (errorMessage.includes('gemini') || errorMessage.includes('api') || 
        errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
      return 'API_ERROR';
    }
    
    // Erros de transcrição
    if (errorMessage.includes('transcrição') || errorMessage.includes('transcription') ||
        errorMessage.includes('speech') || errorMessage.includes('audio quality')) {
      return 'TRANSCRIPTION_ERROR';
    }
    
    // Erros de processamento
    if (errorMessage.includes('ffmpeg') || errorMessage.includes('processing') ||
        errorMessage.includes('optimization') || errorMessage.includes('compression')) {
      return 'PROCESSING_ERROR';
    }
    
    // Erros de autenticação
    if (errorMessage.includes('auth') || errorMessage.includes('permission') ||
        errorMessage.includes('unauthorized')) {
      return 'AUTH_ERROR';
    }
    
    return 'UNKNOWN_ERROR';
  }

  // Gerar resposta de erro apropriada
  generateErrorResponse(errorType, context = {}) {
    const responses = {
      'FILE_TOO_LARGE': {
        message: '📁 Áudio muito grande! Por favor, envie um áudio menor que 40MB.',
        suggestion: 'Dica: Grave áudios mais curtos ou use um app para comprimir o arquivo.',
        canRetry: true
      },
      
      'FILE_EMPTY': {
        message: '🎙️ Áudio vazio ou inválido. Por favor, grave novamente.',
        suggestion: 'Certifique-se de que o áudio foi gravado corretamente.',
        canRetry: true
      },
      
      'INVALID_FORMAT': {
        message: '🔧 Formato de áudio não suportado.',
        suggestion: 'Use formatos: MP3, WAV, FLAC ou OGG.',
        canRetry: true
      },
      
      'FILE_CORRUPTED': {
        message: '⚠️ Arquivo de áudio corrompido. Tente gravar novamente.',
        suggestion: 'Verifique sua conexão durante a gravação.',
        canRetry: true
      },
      
      'NETWORK_ERROR': {
        message: '🌐 Problema de conexão. Tente novamente em alguns instantes.',
        suggestion: 'Verifique sua conexão com a internet.',
        canRetry: true
      },
      
      'API_ERROR': {
        message: '🤖 Serviço temporariamente indisponível.',
        suggestion: 'Tente novamente em alguns minutos ou digite sua transação.',
        canRetry: false
      },
      
      'TRANSCRIPTION_ERROR': {
        message: '🎤 Não consegui entender o áudio claramente.',
        suggestion: 'Fale mais devagar e próximo ao microfone, ou digite sua transação.',
        canRetry: true
      },
      
      'PROCESSING_ERROR': {
        message: '⚙️ Erro no processamento do áudio.',
        suggestion: 'Tente novamente ou digite sua transação.',
        canRetry: true
      },
      
      'AUTH_ERROR': {
        message: '🔐 Erro de autenticação. Faça login novamente.',
        suggestion: 'Digite seu email para fazer login.',
        canRetry: false
      },
      
      'UNKNOWN_ERROR': {
        message: '❌ Erro inesperado no processamento do áudio.',
        suggestion: 'Tente novamente ou digite sua transação.',
        canRetry: true
      }
    };
    
    const errorInfo = responses[errorType] || responses['UNKNOWN_ERROR'];
    const errorCount = this.getErrorCount(context.userId);
    
    let response = `${errorInfo.message}\n\n💡 ${errorInfo.suggestion}`;
    
    // Adicionar informações de retry se aplicável
    if (errorInfo.canRetry && errorCount < this.maxRetries) {
      const remainingRetries = this.maxRetries - errorCount;
      response += `\n\n🔄 Tentativas restantes: ${remainingRetries}`;
    } else if (errorCount >= this.maxRetries) {
      response += '\n\n⏳ Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.';
    }
    
    return response;
  }

  // Gerar fallback quando Gemini não está disponível
  generateOfflineFallback(audioContext = {}) {
    const fallbackResponses = [
      '🤖 Serviço de transcrição offline. Por favor, digite sua transação:',
      '📝 Digite sua transação no formato: "Gastei 50 reais no supermercado"',
      '💬 Transcrição indisponível. Descreva sua transação por texto:'
    ];
    
    const randomResponse = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
    
    return `${randomResponse}\n\n📋 Exemplo: "Recebi 1000 reais de salário" ou "Gastei 25 reais no almoço"`;
  }

  // Gerar sugestões baseadas no contexto
  generateContextualSuggestions(context = {}) {
    const suggestions = [];
    
    if (context.fileSize && context.fileSize > 20 * 1024 * 1024) {
      suggestions.push('📱 Grave áudios mais curtos (máx 2-3 minutos)');
    }
    
    if (context.errorType === 'TRANSCRIPTION_ERROR') {
      suggestions.push('🎤 Fale pausadamente e próximo ao microfone');
      suggestions.push('🔇 Evite ruídos de fundo durante a gravação');
    }
    
    if (context.networkIssues) {
      suggestions.push('📶 Verifique sua conexão Wi-Fi ou dados móveis');
    }
    
    return suggestions;
  }

  // Registrar erro para análise
  logError(error, errorType, context = {}) {
    logger.error('Erro no processamento de áudio', {
      errorType,
      errorMessage: error.message,
      userId: context.userId,
      fileSize: context.fileSize,
      mimeType: context.mimeType,
      timestamp: new Date().toISOString(),
      stack: error.stack
    });
  }

  // Incrementar contador de erros por usuário
  incrementErrorCount(userId) {
    if (!userId) return;
    
    const now = Date.now();
    const userErrors = this.errorCounts.get(userId) || { count: 0, lastError: 0 };
    
    // Reset contador se passou do período de cooldown
    if (now - userErrors.lastError > this.cooldownPeriod) {
      userErrors.count = 0;
    }
    
    userErrors.count++;
    userErrors.lastError = now;
    
    this.errorCounts.set(userId, userErrors);
  }

  // Obter contador de erros do usuário
  getErrorCount(userId) {
    if (!userId) return 0;
    
    const userErrors = this.errorCounts.get(userId);
    if (!userErrors) return 0;
    
    const now = Date.now();
    
    // Reset se passou do período de cooldown
    if (now - userErrors.lastError > this.cooldownPeriod) {
      this.errorCounts.delete(userId);
      return 0;
    }
    
    return userErrors.count;
  }

  // Verificar se deve aplicar cooldown
  shouldApplyCooldown(userId) {
    return this.getErrorCount(userId) >= this.maxRetries;
  }

  // Resposta de cooldown
  getCooldownResponse() {
    return `⏳ **Muitas tentativas de áudio falharam.**\n\n` +
           `🕐 Aguarde 5 minutos antes de enviar novos áudios.\n\n` +
           `💬 Enquanto isso, você pode digitar suas transações:\n` +
           `📝 Exemplo: "Gastei 30 reais no almoço"`;
  }

  // Limpar contadores antigos (executar periodicamente)
  cleanupOldErrors() {
    const now = Date.now();
    
    for (const [userId, userErrors] of this.errorCounts.entries()) {
      if (now - userErrors.lastError > this.cooldownPeriod * 2) {
        this.errorCounts.delete(userId);
      }
    }
  }

  // Obter estatísticas de erros
  getErrorStats() {
    const stats = {
      totalUsers: this.errorCounts.size,
      usersInCooldown: 0,
      errorsByType: {},
      averageErrorsPerUser: 0
    };
    
    let totalErrors = 0;
    
    for (const [userId, userErrors] of this.errorCounts.entries()) {
      totalErrors += userErrors.count;
      
      if (this.shouldApplyCooldown(userId)) {
        stats.usersInCooldown++;
      }
    }
    
    stats.averageErrorsPerUser = stats.totalUsers > 0 
      ? (totalErrors / stats.totalUsers).toFixed(2) 
      : 0;
    
    return stats;
  }

  // Reset contador de erros para um usuário específico
  resetUserErrors(userId) {
    if (this.errorCounts.has(userId)) {
      this.errorCounts.delete(userId);
      return true;
    }
    return false;
  }

  // Verificar se usuário pode tentar novamente
  canUserRetry(userId) {
    return this.getErrorCount(userId) < this.maxRetries;
  }
}

module.exports = AudioErrorHandler;