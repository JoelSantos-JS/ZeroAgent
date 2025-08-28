const logger = require('../../utils/logger');

/**
 * Classe base abstrata para todos os handlers de transações
 * Fornece funcionalidades comuns e define a interface padrão
 */
class BaseHandler {
  constructor(databaseService, userService) {
    if (new.target === BaseHandler) {
      throw new Error('BaseHandler é uma classe abstrata e não pode ser instanciada diretamente');
    }
    
    this.databaseService = databaseService;
    this.userService = userService;
  }

  /**
   * Método abstrato que deve ser implementado por cada handler
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise do Gemini
   * @returns {Promise<string>} - Resposta formatada para o usuário
   */
  async process(userId, analysisResult) {
    throw new Error('Método process() deve ser implementado pela classe filha');
  }

  /**
   * Validar dados de entrada comuns
   * @param {Object} analysisResult - Dados a serem validados
   * @returns {Object} - Resultado da validação
   */
  validateInput(analysisResult) {
    const errors = [];
    
    if (!analysisResult.valor || analysisResult.valor <= 0) {
      errors.push('Valor deve ser maior que zero');
    }
    
    if (!analysisResult.categoria) {
      errors.push('Categoria é obrigatória');
    }
    
    if (!analysisResult.descricao) {
      errors.push('Descrição é obrigatória');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Processar data de transação
   * @param {string} dateString - String da data
   * @returns {Date} - Data processada
   */
  parseDate(dateString) {
    const DataParser = require('../parsers/data-parser');
    return DataParser.parseDate(dateString);
  }

  /**
   * Formatar categoria para exibição
   * @param {string} categoria - Categoria original
   * @returns {string} - Categoria formatada
   */
  formatCategory(categoria) {
    return categoria ? categoria.charAt(0).toUpperCase() + categoria.slice(1) : 'Outros';
  }

  /**
   * Obter contexto do usuário
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object>} - Contexto do usuário
   */
  async getUserContext(userId) {
    try {
      const stats = await this.userService.getUserStats(userId);
      const recentTransactions = await this.databaseService.getUserTransactions(userId, 5);
      
      return {
        totalSpent: stats.totalSpent,
        monthlySpent: stats.monthlySpent,
        recentTransactions: recentTransactions.map(t => ({
          value: t.amount,
          categoria: t.category,
          description: t.description,
          date: t.date
        })),
        topCategories: stats.topCategories
      };
    } catch (error) {
      console.error('❌ Erro ao obter contexto do usuário:', error);
      return {};
    }
  }

  /**
   * Log de transação processada
   * @param {string} type - Tipo da transação
   * @param {string} userId - ID do usuário
   * @param {Object} transaction - Dados da transação
   * @param {Object} analysisResult - Resultado da análise
   */
  logTransaction(type, userId, transaction, analysisResult) {
    logger.info(`${type} registrada`, {
      userId,
      transactionId: transaction.id,
      value: analysisResult.valor,
      category: analysisResult.categoria
    });
  }

  /**
   * Tratar erros de processamento
   * @param {Error} error - Erro ocorrido
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Dados da análise
   * @param {string} transactionType - Tipo da transação
   * @returns {string} - Mensagem de erro para o usuário
   */
  handleError(error, userId, analysisResult, transactionType) {
    console.error(`❌ Erro ao processar ${transactionType}:`, error);
    
    logger.error(`Erro ao processar ${transactionType}`, {
      userId,
      analysisResult,
      error: error.message
    });
    
    return `❌ Erro ao registrar ${transactionType} de R$ ${analysisResult.valor}. Tente novamente.`;
  }
}

module.exports = BaseHandler;