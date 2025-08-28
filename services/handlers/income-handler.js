const BaseHandler = require('./base-handler');
const TransactionValidator = require('../validators/transaction-validator');
const DataParser = require('../parsers/data-parser');
const ResponseFormatter = require('../formatters/response-formatter');

/**
 * Handler específico para processamento de receitas
 * Herda funcionalidades comuns do BaseHandler
 */
class IncomeHandler extends BaseHandler {
  constructor(databaseService, userService) {
    super(databaseService, userService);
  }

  /**
   * Processar transação de receita
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise do Gemini
   * @returns {Promise<string>} - Resposta formatada
   */
  async process(userId, analysisResult) {
    try {
      // Validar dados de entrada
      const validation = this.validateInput(analysisResult);
      if (!validation.isValid) {
        return ResponseFormatter.formatValidationMessage(validation.errors);
      }

      const { valor, categoria, descricao, data } = analysisResult;
      
      // Processar data
      const transactionDate = DataParser.parseDate(data);
      
      // Registrar receita no banco
      const transaction = await this.databaseService.createTransaction(
        userId,
        'receita',
        valor,
        categoria,
        descricao,
        transactionDate
      );
      
      console.log('💰 Receita registrada:', transaction);
      
      // Log da transação
      this.logTransaction('Receita', userId, transaction, analysisResult);
      
      // Formatar resposta
      return ResponseFormatter.formatIncomeResponse(transaction, analysisResult);
      
    } catch (error) {
      return this.handleError(error, userId, analysisResult, 'receita');
    }
  }

  /**
   * Validar dados específicos de receita
   * @param {Object} analysisResult - Dados a serem validados
   * @returns {Object} - Resultado da validação
   */
  validateInput(analysisResult) {
    // Validação básica
    const basicValidation = super.validateInput(analysisResult);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    // Validações específicas de receita
    const errors = [];
    
    // Validar categoria específica para receitas
    const categoryValidation = TransactionValidator.validateCategory(
      analysisResult.categoria, 
      'income'
    );
    
    if (!categoryValidation.isValid) {
      errors.push(...categoryValidation.errors);
    }
    
    // Validar valor máximo para receitas (limite de segurança)
    if (analysisResult.valor > 100000) {
      errors.push('Valor muito alto para uma receita. Máximo permitido: R$ 100.000');
    }
    
    // Validar se não é valor negativo
    if (analysisResult.valor < 0) {
      errors.push('Valor de receita não pode ser negativo');
    }
    
    // Validar valores muito baixos (possível erro)
    if (analysisResult.valor < 0.01) {
      errors.push('Valor de receita muito baixo. Mínimo: R$ 0,01');
    }
    
    return {
      isValid: errors.length === 0,
      errors: [...basicValidation.errors, ...errors]
    };
  }

  /**
   * Obter estatísticas de receitas do usuário
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object>} - Estatísticas de receitas
   */
  async getIncomeStats(userId) {
    try {
      const userContext = await this.getUserContext(userId);
      
      // Filtrar apenas receitas (valores positivos)
      const recentIncomes = userContext.recentTransactions
        ?.filter(t => t.value > 0)
        ?.slice(0, 5) || [];
      
      // Calcular total de receitas
      const totalIncome = recentIncomes.reduce((sum, t) => sum + t.value, 0);
      
      return {
        totalIncome,
        recentIncomes,
        topIncomeCategories: this.getTopIncomeCategories(recentIncomes),
        averageIncome: recentIncomes.length > 0 ? totalIncome / recentIncomes.length : 0
      };
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas de receitas:', error);
      return {
        totalIncome: 0,
        recentIncomes: [],
        topIncomeCategories: [],
        averageIncome: 0
      };
    }
  }

  /**
   * Obter principais categorias de receita
   * @param {Array} incomes - Lista de receitas
   * @returns {Array} - Categorias ordenadas por valor
   */
  getTopIncomeCategories(incomes) {
    const categoryTotals = {};
    
    incomes.forEach(income => {
      const category = income.categoria || 'outros';
      categoryTotals[category] = (categoryTotals[category] || 0) + income.value;
    });
    
    return Object.entries(categoryTotals)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }

  /**
   * Processar receita recorrente (salário, freelance regular, etc.)
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Dados da análise
   * @returns {Promise<Object>} - Resultado do processamento
   */
  async processRecurringIncome(userId, analysisResult) {
    try {
      const { valor, categoria, descricao } = analysisResult;
      
      // Verificar se já existe receita similar este mês
      const existingIncome = await this.checkExistingRecurringIncome(userId, categoria);
      
      if (existingIncome) {
        return {
          isDuplicate: true,
          message: `⚠️ Você já registrou uma receita de ${categoria} este mês (${ResponseFormatter.formatCurrency(existingIncome.amount)}). Deseja registrar mesmo assim?`,
          existingIncome
        };
      }
      
      // Processar normalmente
      const result = await this.process(userId, analysisResult);
      
      return {
        isDuplicate: false,
        message: result
      };
      
    } catch (error) {
      console.error('❌ Erro ao processar receita recorrente:', error);
      return {
        isDuplicate: false,
        message: this.handleError(error, userId, analysisResult, 'receita recorrente')
      };
    }
  }

  /**
   * Verificar se já existe receita recorrente similar este mês
   * @param {string} userId - ID do usuário
   * @param {string} categoria - Categoria da receita
   * @returns {Promise<Object|null>} - Receita existente ou null
   */
  async checkExistingRecurringIncome(userId, categoria) {
    try {
      // Categorias que são tipicamente recorrentes
      const recurringCategories = ['salario', 'freelance', 'bonus'];
      
      if (!recurringCategories.includes(categoria.toLowerCase())) {
        return null;
      }
      
      // Buscar transações do mês atual
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const transactions = await this.databaseService.getUserTransactions(userId, 50);
      
      // Filtrar por categoria e data
      const existingIncome = transactions.find(t => 
        t.category === categoria &&
        new Date(t.date) >= startOfMonth &&
        t.amount > 0 // Receitas são positivas
      );
      
      return existingIncome || null;
      
    } catch (error) {
      console.error('❌ Erro ao verificar receita recorrente:', error);
      return null;
    }
  }

  /**
   * Calcular projeção de receitas
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object>} - Projeção de receitas
   */
  async calculateIncomeProjection(userId) {
    try {
      const stats = await this.getIncomeStats(userId);
      
      // Calcular média mensal baseada nas últimas receitas
      const monthlyAverage = stats.averageIncome;
      
      // Projeção para os próximos 3 meses
      const projection = {
        nextMonth: monthlyAverage,
        next3Months: monthlyAverage * 3,
        yearlyProjection: monthlyAverage * 12,
        confidence: this.calculateProjectionConfidence(stats.recentIncomes)
      };
      
      return projection;
      
    } catch (error) {
      console.error('❌ Erro ao calcular projeção de receitas:', error);
      return {
        nextMonth: 0,
        next3Months: 0,
        yearlyProjection: 0,
        confidence: 'baixa'
      };
    }
  }

  /**
   * Calcular confiança da projeção baseada no histórico
   * @param {Array} recentIncomes - Receitas recentes
   * @returns {string} - Nível de confiança
   */
  calculateProjectionConfidence(recentIncomes) {
    if (recentIncomes.length < 2) {
      return 'baixa';
    }
    
    if (recentIncomes.length < 5) {
      return 'média';
    }
    
    // Verificar consistência dos valores
    const values = recentIncomes.map(i => i.value);
    const average = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - average, 2), 0) / values.length;
    const standardDeviation = Math.sqrt(variance);
    
    // Se o desvio padrão for baixo em relação à média, a confiança é alta
    const coefficientOfVariation = standardDeviation / average;
    
    if (coefficientOfVariation < 0.2) {
      return 'alta';
    } else if (coefficientOfVariation < 0.5) {
      return 'média';
    } else {
      return 'baixa';
    }
  }
}

module.exports = IncomeHandler;