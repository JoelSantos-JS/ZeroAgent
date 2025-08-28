const BaseHandler = require('./base-handler');
const TransactionValidator = require('../validators/transaction-validator');
const DataParser = require('../parsers/data-parser');
const ResponseFormatter = require('../formatters/response-formatter');

/**
 * Handler específico para processamento de despesas
 * Herda funcionalidades comuns do BaseHandler
 */
class ExpenseHandler extends BaseHandler {
  constructor(databaseService, userService) {
    super(databaseService, userService);
  }

  /**
   * Processar transação de despesa
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

      const { valor, categoria, descricao, data, tipo } = analysisResult;
      
      // Processar data
      const transactionDate = DataParser.parseDate(data);
      
      // Verificar se é compra parcelada
      const isInstallment = DataParser.detectInstallment(analysisResult);
      
      let transaction;
      
      if (isInstallment) {
        // Processar como compra parcelada
        transaction = await this.processInstallmentExpense(userId, analysisResult, transactionDate);
      } else {
        // Registrar despesa normal
        transaction = await this.processRegularExpense(userId, analysisResult, transactionDate);
      }
      
      console.log(`💸 ${tipo?.toUpperCase() || 'DESPESA'} registrada:`, transaction);
      
      // Log da transação
      this.logTransaction('Despesa', userId, transaction, analysisResult);
      
      // Formatar resposta
      return ResponseFormatter.formatExpenseResponse(transaction, analysisResult, isInstallment);
      
    } catch (error) {
      return this.handleError(error, userId, analysisResult, 'despesa');
    }
  }

  /**
   * Processar despesa regular (não parcelada)
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Dados da análise
   * @param {Date} transactionDate - Data da transação
   * @returns {Promise<Object>} - Dados da transação criada
   */
  async processRegularExpense(userId, analysisResult, transactionDate) {
    const { valor, categoria, descricao } = analysisResult;
    
    return await this.databaseService.createTransaction(
      userId,
      'despesa',
      valor,
      categoria,
      descricao,
      transactionDate
    );
  }

  /**
   * Processar despesa parcelada
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Dados da análise
   * @param {Date} transactionDate - Data da transação
   * @returns {Promise<Object>} - Dados da transação criada
   */
  async processInstallmentExpense(userId, analysisResult, transactionDate) {
    try {
      // Extrair dados do parcelamento
      const installmentData = DataParser.parseInstallmentData(analysisResult);
      
      // Validar dados do parcelamento
      const validation = TransactionValidator.validateInstallmentData(installmentData);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }
      
      // Criar transação parcelada
      return await this.databaseService.createInstallmentTransaction(userId, installmentData);
      
    } catch (error) {
      // Se falhar no processamento do parcelamento, tratar como despesa normal
      console.warn('⚠️ Erro no parcelamento, processando como despesa normal:', error.message);
      
      // Informar ao usuário sobre o problema
      if (error.message.includes('não especificado')) {
        throw new Error(`${error.message} Registrando como despesa única por enquanto.`);
      }
      
      return await this.processRegularExpense(userId, analysisResult, transactionDate);
    }
  }

  /**
   * Validar dados específicos de despesa
   * @param {Object} analysisResult - Dados a serem validados
   * @returns {Object} - Resultado da validação
   */
  validateInput(analysisResult) {
    // Validação básica
    const basicValidation = super.validateInput(analysisResult);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    // Validações específicas de despesa
    const errors = [];
    
    // Validar categoria específica para despesas
    const categoryValidation = TransactionValidator.validateCategory(
      analysisResult.categoria, 
      'expense'
    );
    
    if (!categoryValidation.isValid) {
      errors.push(...categoryValidation.errors);
    }
    
    // Validar valor máximo para despesas (limite de segurança)
    if (analysisResult.valor > 50000) {
      errors.push('Valor muito alto para uma despesa. Máximo permitido: R$ 50.000');
    }
    
    // Validar se não é valor negativo (que seria uma receita)
    if (analysisResult.valor < 0) {
      errors.push('Valor de despesa não pode ser negativo');
    }
    
    return {
      isValid: errors.length === 0,
      errors: [...basicValidation.errors, ...errors]
    };
  }

  /**
   * Obter estatísticas de despesas do usuário
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object>} - Estatísticas de despesas
   */
  async getExpenseStats(userId) {
    try {
      const userContext = await this.getUserContext(userId);
      
      return {
        totalSpent: userContext.totalSpent || 0,
        monthlySpent: userContext.monthlySpent || 0,
        topCategories: userContext.topCategories || [],
        recentExpenses: userContext.recentTransactions
          ?.filter(t => t.value < 0) // Despesas são valores negativos
          ?.slice(0, 5) || []
      };
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas de despesas:', error);
      return {
        totalSpent: 0,
        monthlySpent: 0,
        topCategories: [],
        recentExpenses: []
      };
    }
  }

  /**
   * Verificar se despesa está dentro do orçamento
   * @param {string} userId - ID do usuário
   * @param {number} amount - Valor da despesa
   * @param {string} category - Categoria da despesa
   * @returns {Promise<Object>} - Status do orçamento
   */
  async checkBudget(userId, amount, category) {
    try {
      const stats = await this.getExpenseStats(userId);
      const monthlyLimit = 5000; // Limite padrão - pode ser configurável
      
      const projectedMonthly = stats.monthlySpent + amount;
      const isOverBudget = projectedMonthly > monthlyLimit;
      
      return {
        isOverBudget,
        currentMonthly: stats.monthlySpent,
        projectedMonthly,
        monthlyLimit,
        remainingBudget: Math.max(0, monthlyLimit - projectedMonthly)
      };
    } catch (error) {
      console.error('❌ Erro ao verificar orçamento:', error);
      return {
        isOverBudget: false,
        currentMonthly: 0,
        projectedMonthly: amount,
        monthlyLimit: 5000,
        remainingBudget: 5000 - amount
      };
    }
  }
}

module.exports = ExpenseHandler;