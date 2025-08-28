const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

class AudioMonitor {
  constructor() {
    this.name = 'AudioMonitor';
    this.metrics = {
      totalProcessed: 0,
      totalTokensSaved: 0,
      totalCostSaved: 0,
      totalProcessingTime: 0,
      averageOptimizationRatio: 0,
      errorCount: 0,
      successRate: 0
    };
    
    this.sessions = new Map(); // userId -> session data
    this.dailyStats = new Map(); // date -> daily metrics
    this.realtimeStats = [];
    this.maxRealtimeEntries = 100;
    
    // Configurações de monitoramento
    this.config = {
      enableDetailedLogging: true,
      enablePerformanceTracking: true,
      enableCostTracking: true,
      saveInterval: 5 * 60 * 1000, // 5 minutos
      reportInterval: 24 * 60 * 60 * 1000, // 24 horas
      metricsFile: path.join(__dirname, '../logs/audio-metrics.json')
    };
    
    this.startPeriodicSave();
  }

  // Registrar processamento de áudio
  logAudioProcessing(data) {
    const timestamp = new Date();
    const userId = data.userId || 'unknown';
    
    // Atualizar métricas globais
    this.updateGlobalMetrics(data);
    
    // Atualizar sessão do usuário
    this.updateUserSession(userId, data, timestamp);
    
    // Atualizar estatísticas diárias
    this.updateDailyStats(timestamp, data);
    
    // Adicionar aos stats em tempo real
    this.addRealtimeEntry(data, timestamp);
    
    // Log detalhado se habilitado
    if (this.config.enableDetailedLogging) {
      this.logDetailedProcessing(data, timestamp);
    }
  }

  // Atualizar métricas globais
  updateGlobalMetrics(data) {
    this.metrics.totalProcessed++;
    
    if (data.success) {
      if (data.optimization) {
        this.metrics.totalTokensSaved += data.optimization.tokenSavings || 0;
        this.metrics.totalCostSaved += this.calculateCostSavings(data.optimization.tokenSavings);
        
        // Atualizar média de otimização
        const currentRatio = parseFloat(data.optimization.tokenSavingsPercent) || 0;
        this.metrics.averageOptimizationRatio = 
          (this.metrics.averageOptimizationRatio * (this.metrics.totalProcessed - 1) + currentRatio) / 
          this.metrics.totalProcessed;
      }
      
      if (data.processingTime) {
        this.metrics.totalProcessingTime += data.processingTime;
      }
    } else {
      this.metrics.errorCount++;
    }
    
    // Calcular taxa de sucesso
    this.metrics.successRate = 
      ((this.metrics.totalProcessed - this.metrics.errorCount) / this.metrics.totalProcessed) * 100;
  }

  // Atualizar sessão do usuário
  updateUserSession(userId, data, timestamp) {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, {
        userId,
        firstAccess: timestamp,
        lastAccess: timestamp,
        totalAudios: 0,
        successfulAudios: 0,
        totalTokensSaved: 0,
        totalCostSaved: 0,
        averageProcessingTime: 0,
        errors: []
      });
    }
    
    const session = this.sessions.get(userId);
    session.lastAccess = timestamp;
    session.totalAudios++;
    
    if (data.success) {
      session.successfulAudios++;
      
      if (data.optimization) {
        session.totalTokensSaved += data.optimization.tokenSavings || 0;
        session.totalCostSaved += this.calculateCostSavings(data.optimization.tokenSavings);
      }
      
      if (data.processingTime) {
        session.averageProcessingTime = 
          (session.averageProcessingTime * (session.successfulAudios - 1) + data.processingTime) / 
          session.successfulAudios;
      }
    } else {
      session.errors.push({
        timestamp,
        error: data.error,
        errorType: data.errorType
      });
      
      // Manter apenas os últimos 10 erros
      if (session.errors.length > 10) {
        session.errors = session.errors.slice(-10);
      }
    }
  }

  // Atualizar estatísticas diárias
  updateDailyStats(timestamp, data) {
    const dateKey = timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
    
    if (!this.dailyStats.has(dateKey)) {
      this.dailyStats.set(dateKey, {
        date: dateKey,
        totalProcessed: 0,
        successful: 0,
        errors: 0,
        tokensSaved: 0,
        costSaved: 0,
        averageProcessingTime: 0,
        uniqueUsers: new Set()
      });
    }
    
    const dayStats = this.dailyStats.get(dateKey);
    dayStats.totalProcessed++;
    dayStats.uniqueUsers.add(data.userId);
    
    if (data.success) {
      dayStats.successful++;
      
      if (data.optimization) {
        dayStats.tokensSaved += data.optimization.tokenSavings || 0;
        dayStats.costSaved += this.calculateCostSavings(data.optimization.tokenSavings);
      }
      
      if (data.processingTime) {
        dayStats.averageProcessingTime = 
          (dayStats.averageProcessingTime * (dayStats.successful - 1) + data.processingTime) / 
          dayStats.successful;
      }
    } else {
      dayStats.errors++;
    }
  }

  // Adicionar entrada em tempo real
  addRealtimeEntry(data, timestamp) {
    const entry = {
      timestamp: timestamp.toISOString(),
      userId: data.userId,
      success: data.success,
      processingTime: data.processingTime,
      tokensSaved: data.optimization?.tokenSavings || 0,
      errorType: data.errorType || null
    };
    
    this.realtimeStats.push(entry);
    
    // Manter apenas as últimas entradas
    if (this.realtimeStats.length > this.maxRealtimeEntries) {
      this.realtimeStats = this.realtimeStats.slice(-this.maxRealtimeEntries);
    }
  }

  // Log detalhado
  logDetailedProcessing(data, timestamp) {
    const logData = {
      timestamp: timestamp.toISOString(),
      userId: data.userId,
      success: data.success,
      processingTime: data.processingTime,
      fileSize: data.fileSize,
      optimization: data.optimization,
      error: data.error,
      errorType: data.errorType
    };
    
    logger.info('Audio processing completed', logData);
  }

  // Calcular economia de custo
  calculateCostSavings(tokensSaved) {
    const costPerToken = 0.30 / 1000000; // $0.30 per 1M tokens (Gemini Flash)
    return tokensSaved * costPerToken;
  }

  // Obter métricas globais
  getGlobalMetrics() {
    return {
      ...this.metrics,
      totalCostSavedFormatted: `$${this.metrics.totalCostSaved.toFixed(6)}`,
      averageProcessingTime: this.metrics.totalProcessed > 0 
        ? Math.round(this.metrics.totalProcessingTime / (this.metrics.totalProcessed - this.metrics.errorCount))
        : 0
    };
  }

  // Obter estatísticas do usuário
  getUserStats(userId) {
    const session = this.sessions.get(userId);
    if (!session) {
      return null;
    }
    
    return {
      ...session,
      successRate: session.totalAudios > 0 
        ? (session.successfulAudios / session.totalAudios) * 100 
        : 0,
      totalCostSavedFormatted: `$${session.totalCostSaved.toFixed(6)}`,
      uniqueUsers: undefined // Remover Set para serialização
    };
  }

  // Obter estatísticas diárias
  getDailyStats(date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const dayStats = this.dailyStats.get(targetDate);
    
    if (!dayStats) {
      return null;
    }
    
    return {
      ...dayStats,
      uniqueUsers: dayStats.uniqueUsers.size,
      successRate: dayStats.totalProcessed > 0 
        ? (dayStats.successful / dayStats.totalProcessed) * 100 
        : 0,
      costSavedFormatted: `$${dayStats.costSaved.toFixed(6)}`
    };
  }

  // Obter estatísticas em tempo real
  getRealtimeStats() {
    return {
      recent: this.realtimeStats.slice(-20), // Últimas 20 entradas
      summary: {
        totalEntries: this.realtimeStats.length,
        recentSuccessRate: this.calculateRecentSuccessRate(),
        averageProcessingTime: this.calculateRecentAverageProcessingTime()
      }
    };
  }

  // Calcular taxa de sucesso recente
  calculateRecentSuccessRate() {
    const recent = this.realtimeStats.slice(-20);
    if (recent.length === 0) return 0;
    
    const successful = recent.filter(entry => entry.success).length;
    return (successful / recent.length) * 100;
  }

  // Calcular tempo médio de processamento recente
  calculateRecentAverageProcessingTime() {
    const recent = this.realtimeStats.slice(-20).filter(entry => entry.success && entry.processingTime);
    if (recent.length === 0) return 0;
    
    const totalTime = recent.reduce((sum, entry) => sum + entry.processingTime, 0);
    return Math.round(totalTime / recent.length);
  }

  // Gerar relatório completo
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      global: this.getGlobalMetrics(),
      daily: this.getDailyStats(),
      realtime: this.getRealtimeStats(),
      topUsers: this.getTopUsers(),
      errorAnalysis: this.getErrorAnalysis(),
      recommendations: this.generateRecommendations()
    };
    
    return report;
  }

  // Obter top usuários
  getTopUsers(limit = 10) {
    const users = Array.from(this.sessions.values())
      .sort((a, b) => b.totalTokensSaved - a.totalTokensSaved)
      .slice(0, limit)
      .map(user => ({
        userId: user.userId,
        totalAudios: user.totalAudios,
        tokensSaved: user.totalTokensSaved,
        costSaved: user.totalCostSaved,
        successRate: user.totalAudios > 0 ? (user.successfulAudios / user.totalAudios) * 100 : 0
      }));
    
    return users;
  }

  // Análise de erros
  getErrorAnalysis() {
    const errorTypes = {};
    let totalErrors = 0;
    
    for (const session of this.sessions.values()) {
      for (const error of session.errors) {
        const type = error.errorType || 'UNKNOWN';
        errorTypes[type] = (errorTypes[type] || 0) + 1;
        totalErrors++;
      }
    }
    
    return {
      totalErrors,
      errorTypes,
      mostCommonError: Object.keys(errorTypes).reduce((a, b) => 
        errorTypes[a] > errorTypes[b] ? a : b, 'NONE'
      )
    };
  }

  // Gerar recomendações
  generateRecommendations() {
    const recommendations = [];
    const metrics = this.getGlobalMetrics();
    
    if (metrics.successRate < 90) {
      recommendations.push({
        type: 'quality',
        message: 'Taxa de sucesso baixa. Considere melhorar validações de entrada.',
        priority: 'high'
      });
    }
    
    if (metrics.averageProcessingTime > 10000) {
      recommendations.push({
        type: 'performance',
        message: 'Tempo de processamento alto. Considere otimizar o pipeline.',
        priority: 'medium'
      });
    }
    
    if (metrics.averageOptimizationRatio < 25) {
      recommendations.push({
        type: 'optimization',
        message: 'Baixa economia de tokens. Revisar configurações de otimização.',
        priority: 'medium'
      });
    }
    
    return recommendations;
  }

  // Salvar métricas em arquivo
  async saveMetrics() {
    try {
      const report = this.generateReport();
      
      // Criar diretório se não existir
      const logsDir = path.dirname(this.config.metricsFile);
      await fs.mkdir(logsDir, { recursive: true });
      
      // Salvar relatório
      await fs.writeFile(this.config.metricsFile, JSON.stringify(report, null, 2));
      
      logger.info('Audio metrics saved', {
        file: this.config.metricsFile,
        totalProcessed: this.metrics.totalProcessed
      });
    } catch (error) {
      logger.error('Error saving audio metrics', { error: error.message });
    }
  }

  // Carregar métricas salvas
  async loadMetrics() {
    try {
      const data = await fs.readFile(this.config.metricsFile, 'utf8');
      const savedReport = JSON.parse(data);
      
      // Restaurar métricas globais
      if (savedReport.global) {
        this.metrics = { ...this.metrics, ...savedReport.global };
      }
      
      logger.info('Audio metrics loaded', {
        file: this.config.metricsFile,
        totalProcessed: this.metrics.totalProcessed
      });
    } catch (error) {
      logger.warn('Could not load saved metrics', { error: error.message });
    }
  }

  // Iniciar salvamento periódico
  startPeriodicSave() {
    setInterval(() => {
      this.saveMetrics();
    }, this.config.saveInterval);
    
    // Salvar ao inicializar
    this.loadMetrics();
  }

  // Limpar dados antigos
  cleanup(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    // Limpar estatísticas diárias antigas
    for (const [dateKey] of this.dailyStats.entries()) {
      const date = new Date(dateKey);
      if (date < cutoffDate) {
        this.dailyStats.delete(dateKey);
      }
    }
    
    // Limpar sessões inativas
    for (const [userId, session] of this.sessions.entries()) {
      if (session.lastAccess < cutoffDate) {
        this.sessions.delete(userId);
      }
    }
    
    logger.info('Audio monitor cleanup completed', {
      cutoffDate: cutoffDate.toISOString(),
      remainingSessions: this.sessions.size,
      remainingDailyStats: this.dailyStats.size
    });
  }

  // Obter status do monitor
  getStatus() {
    return {
      isActive: true,
      totalSessions: this.sessions.size,
      totalDailyStats: this.dailyStats.size,
      realtimeEntries: this.realtimeStats.length,
      config: this.config,
      lastSave: new Date().toISOString()
    };
  }
}

module.exports = AudioMonitor;