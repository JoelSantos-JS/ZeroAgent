const BaseHandler = require('./base-handler');
const { personalFinanceService, validatePersonalIncome, PERSONAL_INCOME_CATEGORIES } = require('../personal-finance-service');
const ResponseFormatter = require('../formatters/response-formatter');
const logger = require('../../utils/logger');

/**
 * Handler específico para processamento de receitas pessoais
 * Herda funcionalidades comuns do BaseHandler
 */
class PersonalIncomeHandler extends BaseHandler {
  constructor(databaseService, userService) {
    super(databaseService, userService);
    this.personalFinanceService = personalFinanceService;
  }

  /**
   * Processar transação de receita pessoal
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise do Gemini
   * @returns {Promise<string>} - Resposta formatada
   */
  async process(userId, analysisResult) {
    try {
      logger.info('Processando receita pessoal', { userId, analysisResult });

      // Validar dados de entrada
      const validation = this.validatePersonalIncomeInput(analysisResult);
      if (!validation.isValid) {
        return this.formatValidationError(validation.errors);
      }

      const { valor, categoria, descricao, data, fonte } = analysisResult;
      
      // Preparar dados da receita pessoal
      const incomeData = {
        date: this.parseDate(data),
        description: descricao,
        amount: parseFloat(valor),
        category: this.mapToPersonalCategory(categoria),
        source: fonte || 'other',
        is_recurring: analysisResult.recorrente || false,
        is_taxable: analysisResult.tributavel || false,
        tax_withheld: analysisResult.imposto_retido || 0,
        notes: analysisResult.observacoes || null,
        tags: analysisResult.tags || []
      };
      
      // Registrar receita pessoal no banco
      const income = await this.personalFinanceService.createPersonalIncome(userId, incomeData);
      
      logger.info('💰 Receita pessoal registrada:', { id: income.id, amount: income.amount, category: income.category });
      
      // Formatar resposta
      return this.formatSuccessResponse(income, analysisResult);
      
    } catch (error) {
      logger.error('Erro ao processar receita pessoal:', error);
      return this.handleError(error, userId, analysisResult, 'receita pessoal');
    }
  }

  /**
   * Validar dados específicos de receita pessoal
   */
  validatePersonalIncomeInput(analysisResult) {
    const errors = [];
    
    // Validações básicas herdadas
    const baseValidation = this.validateInput(analysisResult);
    if (!baseValidation.isValid) {
      errors.push(...baseValidation.errors);
    }
    
    // Validações específicas de receita pessoal
    if (analysisResult.categoria && !this.isValidPersonalIncomeCategory(analysisResult.categoria)) {
      errors.push(`Categoria '${analysisResult.categoria}' não é válida para receitas pessoais`);
    }
    
    if (analysisResult.imposto_retido && analysisResult.imposto_retido < 0) {
      errors.push('Imposto retido não pode ser negativo');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Mapear categoria do sistema geral para categoria pessoal
   */
  mapToPersonalCategory(categoria) {
    const categoryMap = {
      'salario': 'salary',
      'salário': 'salary',
      'freelance': 'freelance',
      'freela': 'freelance',
      'investimento': 'investment',
      'investimentos': 'investment',
      'aluguel': 'rental',
      'bonus': 'bonus',
      'bônus': 'bonus',
      'presente': 'gift',
      'pensao': 'pension',
      'pensão': 'pension',
      'beneficio': 'benefit',
      'benefício': 'benefit',
      'outros': 'other',
      'outro': 'other'
    };
    
    const normalizedCategory = categoria.toLowerCase();
    return categoryMap[normalizedCategory] || 'other';
  }

  /**
   * Verificar se categoria é válida para receitas pessoais
   */
  isValidPersonalIncomeCategory(categoria) {
    const mappedCategory = this.mapToPersonalCategory(categoria);
    return PERSONAL_INCOME_CATEGORIES.includes(mappedCategory);
  }

  /**
   * Formatar resposta de sucesso
   */
  formatSuccessResponse(income, analysisResult) {
    const categoryNames = {
      'salary': 'Salário',
      'freelance': 'Freelance',
      'investment': 'Investimento',
      'rental': 'Aluguel',
      'bonus': 'Bônus',
      'gift': 'Presente',
      'pension': 'Pensão',
      'benefit': 'Benefício',
      'other': 'Outros'
    };

    const categoryName = categoryNames[income.category] || income.category;
    const formattedAmount = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(income.amount);

    let response = `✅ *Receita pessoal registrada com sucesso!*\n\n`;
    response += `💰 *Valor:* ${formattedAmount}\n`;
    response += `📂 *Categoria:* ${categoryName}\n`;
    response += `📝 *Descrição:* ${income.description}\n`;
    response += `📅 *Data:* ${new Date(income.date).toLocaleDateString('pt-BR')}\n`;
    response += `🏢 *Fonte:* ${income.source}\n`;

    if (income.is_recurring) {
      response += `🔄 *Recorrente:* Sim\n`;
    }

    if (income.is_taxable) {
      response += `💸 *Tributável:* Sim\n`;
      if (income.tax_withheld > 0) {
        const taxAmount = new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(income.tax_withheld);
        response += `📊 *Imposto Retido:* ${taxAmount}\n`;
      }
    }

    if (analysisResult.analise) {
      response += `\n📊 *Análise:* ${analysisResult.analise}`;
    }

    if (analysisResult.dica) {
      response += `\n💡 *Dica:* ${analysisResult.dica}`;
    }

    return response;
  }

  /**
   * Formatar erro de validação
   */
  formatValidationError(errors) {
    let response = `❌ *Erro ao registrar receita pessoal:*\n\n`;
    errors.forEach(error => {
      response += `• ${error}\n`;
    });
    response += `\n💡 *Exemplo correto:*\n`;
    response += `"Recebi meu salário de R$ 3500 hoje"`;
    return response;
  }

  /**
   * Buscar estatísticas de receitas pessoais
   */
  async getPersonalIncomeStats(userId, period = 'month') {
    try {
      const now = new Date();
      let startDate, endDate;

      switch (period) {
        case 'week':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
          endDate = now;
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          endDate = new Date(now.getFullYear(), 11, 31);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      }

      const incomes = await this.personalFinanceService.getPersonalIncomes(userId, {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      });

      const totalAmount = incomes.reduce((sum, income) => sum + parseFloat(income.amount), 0);
      const averageAmount = incomes.length > 0 ? totalAmount / incomes.length : 0;
      
      // Agrupar por categoria
      const byCategory = incomes.reduce((acc, income) => {
        acc[income.category] = (acc[income.category] || 0) + parseFloat(income.amount);
        return acc;
      }, {});

      return {
        period,
        totalAmount,
        averageAmount,
        transactionCount: incomes.length,
        byCategory,
        incomes
      };
    } catch (error) {
      logger.error('Erro ao buscar estatísticas de receitas pessoais:', error);
      throw error;
    }
  }

  /**
   * Processar receita recorrente
   */
  async processRecurringIncome(userId, analysisResult) {
    try {
      // Verificar se já existe uma receita recorrente similar
      const existingRecurring = await this.checkExistingRecurringIncome(userId, analysisResult.categoria);
      
      if (existingRecurring) {
        return `⚠️ Você já possui uma receita recorrente de ${analysisResult.categoria}. Deseja atualizar o valor ou criar uma nova entrada?`;
      }

      // Processar como receita normal, mas marcada como recorrente
      analysisResult.recorrente = true;
      return await this.process(userId, analysisResult);
    } catch (error) {
      logger.error('Erro ao processar receita recorrente:', error);
      throw error;
    }
  }

  /**
   * Verificar receita recorrente existente
   */
  async checkExistingRecurringIncome(userId, categoria) {
    try {
      const mappedCategory = this.mapToPersonalCategory(categoria);
      const incomes = await this.personalFinanceService.getPersonalIncomes(userId, {
        category: mappedCategory
      });

      return incomes.find(income => income.is_recurring);
    } catch (error) {
      logger.error('Erro ao verificar receita recorrente:', error);
      return null;
    }
  }
}

module.exports = PersonalIncomeHandler;