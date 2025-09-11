const BaseHandler = require('./base-handler');
const { personalFinanceService, validatePersonalExpense, PERSONAL_EXPENSE_CATEGORIES, PERSONAL_PAYMENT_METHODS } = require('../personal-finance-service');
const ResponseFormatter = require('../formatters/response-formatter');
const logger = require('../../utils/logger');

/**
 * Handler específico para processamento de gastos pessoais
 * Herda funcionalidades comuns do BaseHandler
 */
class PersonalExpenseHandler extends BaseHandler {
  constructor(databaseService, userService) {
    super(databaseService, userService);
    this.personalFinanceService = personalFinanceService;
  }

  /**
   * Processar transação de gasto pessoal
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise do Gemini
   * @returns {Promise<string>} - Resposta formatada
   */
  async process(userId, analysisResult) {
    try {
      logger.info('Processando gasto pessoal', { userId, analysisResult });

      // Validar dados de entrada
      const validation = this.validatePersonalExpenseInput(analysisResult);
      if (!validation.isValid) {
        return this.formatValidationError(validation.errors);
      }

      const { valor, categoria, descricao, data, metodo_pagamento } = analysisResult;
      
      // Preparar dados do gasto pessoal
      const expenseData = {
        date: this.parseDate(data),
        description: descricao,
        amount: parseFloat(valor),
        category: this.mapToPersonalExpenseCategory(categoria),
        subcategory: analysisResult.subcategoria || null,
        payment_method: this.mapToPaymentMethod(metodo_pagamento || 'cash'),
        is_essential: this.isEssentialExpense(categoria),
        is_recurring: analysisResult.recorrente || false,
        location: analysisResult.local || null,
        merchant: analysisResult.estabelecimento || null,
        is_tax_deductible: analysisResult.dedutivel || false,
        notes: analysisResult.observacoes || null,
        tags: analysisResult.tags || [],
        is_installment: analysisResult.parcelado || false,
        installment_info: analysisResult.info_parcelas || null
      };
      
      // Registrar gasto pessoal no banco
      const expense = await this.personalFinanceService.createPersonalExpense(userId, expenseData);
      
      logger.info('💸 Gasto pessoal registrado:', { id: expense.id, amount: expense.amount, category: expense.category });
      
      // Formatar resposta
      return this.formatSuccessResponse(expense, analysisResult);
      
    } catch (error) {
      logger.error('Erro ao processar gasto pessoal:', error);
      return this.handleError(error, userId, analysisResult, 'gasto pessoal');
    }
  }

  /**
   * Validar dados específicos de gasto pessoal
   */
  validatePersonalExpenseInput(analysisResult) {
    const errors = [];
    
    // Validações básicas herdadas
    const baseValidation = this.validateInput(analysisResult);
    if (!baseValidation.isValid) {
      errors.push(...baseValidation.errors);
    }
    
    // Validações específicas de gasto pessoal
    if (analysisResult.categoria && !this.isValidPersonalExpenseCategory(analysisResult.categoria)) {
      errors.push(`Categoria '${analysisResult.categoria}' não é válida para gastos pessoais`);
    }
    
    if (analysisResult.metodo_pagamento && !this.isValidPaymentMethod(analysisResult.metodo_pagamento)) {
      errors.push(`Método de pagamento '${analysisResult.metodo_pagamento}' não é válido`);
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Mapear categoria do sistema geral para categoria de gasto pessoal
   */
  mapToPersonalExpenseCategory(categoria) {
    const categoryMap = {
      'moradia': 'housing',
      'casa': 'housing',
      'aluguel': 'housing',
      'financiamento': 'housing',
      'alimentacao': 'food',
      'alimentação': 'food',
      'comida': 'food',
      'supermercado': 'food',
      'restaurante': 'food',
      'transporte': 'transportation',
      'uber': 'transportation',
      'taxi': 'transportation',
      'gasolina': 'transportation',
      'combustivel': 'transportation',
      'combustível': 'transportation',
      'saude': 'healthcare',
      'saúde': 'healthcare',
      'medico': 'healthcare',
      'médico': 'healthcare',
      'hospital': 'healthcare',
      'farmacia': 'healthcare',
      'farmácia': 'healthcare',
      'educacao': 'education',
      'educação': 'education',
      'escola': 'education',
      'curso': 'education',
      'entretenimento': 'entertainment',
      'lazer': 'entertainment',
      'cinema': 'entertainment',
      'teatro': 'entertainment',
      'roupa': 'clothing',
      'roupas': 'clothing',
      'vestuario': 'clothing',
      'vestuário': 'clothing',
      'contas': 'utilities',
      'luz': 'utilities',
      'agua': 'utilities',
      'água': 'utilities',
      'internet': 'utilities',
      'telefone': 'utilities',
      'seguro': 'insurance',
      'seguros': 'insurance',
      'cuidados_pessoais': 'personal_care',
      'beleza': 'personal_care',
      'cabelo': 'personal_care',
      'presente': 'gifts',
      'presentes': 'gifts',
      'pet': 'pets',
      'pets': 'pets',
      'animal': 'pets',
      'caridade': 'charity',
      'doacao': 'charity',
      'doação': 'charity',
      'imposto': 'taxes',
      'impostos': 'taxes',
      'taxa': 'taxes',
      'divida': 'debt_payment',
      'dívida': 'debt_payment',
      'pagamento_divida': 'debt_payment',
      'poupanca': 'savings',
      'poupança': 'savings',
      'investimento': 'savings',
      'outros': 'other',
      'outro': 'other'
    };
    
    const normalizedCategory = categoria.toLowerCase();
    return categoryMap[normalizedCategory] || 'other';
  }

  /**
   * Mapear método de pagamento
   */
  mapToPaymentMethod(metodo) {
    const methodMap = {
      'dinheiro': 'cash',
      'especie': 'cash',
      'espécie': 'cash',
      'debito': 'debit_card',
      'débito': 'debit_card',
      'cartao_debito': 'debit_card',
      'cartão_débito': 'debit_card',
      'credito': 'credit_card',
      'crédito': 'credit_card',
      'cartao_credito': 'credit_card',
      'cartão_crédito': 'credit_card',
      'cartao': 'credit_card',
      'cartão': 'credit_card',
      'pix': 'pix',
      'transferencia': 'bank_transfer',
      'transferência': 'bank_transfer',
      'ted': 'bank_transfer',
      'doc': 'bank_transfer',
      'debito_automatico': 'automatic_debit',
      'débito_automático': 'automatic_debit'
    };
    
    const normalizedMethod = metodo.toLowerCase();
    return methodMap[normalizedMethod] || 'cash';
  }

  /**
   * Determinar se um gasto é essencial baseado na categoria
   */
  isEssentialExpense(categoria) {
    const essentialCategories = [
      'moradia', 'casa', 'aluguel', 'financiamento',
      'alimentacao', 'alimentação', 'supermercado',
      'saude', 'saúde', 'medico', 'médico',
      'contas', 'luz', 'agua', 'água', 'internet',
      'transporte', 'gasolina', 'combustivel', 'combustível',
      'seguro', 'seguros',
      'imposto', 'impostos'
    ];
    
    return essentialCategories.includes(categoria.toLowerCase());
  }

  /**
   * Verificar se categoria é válida para gastos pessoais
   */
  isValidPersonalExpenseCategory(categoria) {
    const mappedCategory = this.mapToPersonalExpenseCategory(categoria);
    return PERSONAL_EXPENSE_CATEGORIES.includes(mappedCategory);
  }

  /**
   * Verificar se método de pagamento é válido
   */
  isValidPaymentMethod(metodo) {
    const mappedMethod = this.mapToPaymentMethod(metodo);
    return PERSONAL_PAYMENT_METHODS.includes(mappedMethod);
  }

  /**
   * Formatar resposta de sucesso
   */
  formatSuccessResponse(expense, analysisResult) {
    const categoryNames = {
      'housing': 'Moradia',
      'food': 'Alimentação',
      'transportation': 'Transporte',
      'healthcare': 'Saúde',
      'education': 'Educação',
      'entertainment': 'Entretenimento',
      'clothing': 'Vestuário',
      'utilities': 'Contas Básicas',
      'insurance': 'Seguros',
      'personal_care': 'Cuidados Pessoais',
      'gifts': 'Presentes',
      'pets': 'Pets',
      'charity': 'Caridade',
      'taxes': 'Impostos',
      'debt_payment': 'Pagamento de Dívidas',
      'savings': 'Poupança',
      'other': 'Outros'
    };

    const paymentMethodNames = {
      'cash': 'Dinheiro',
      'debit_card': 'Cartão de Débito',
      'credit_card': 'Cartão de Crédito',
      'pix': 'PIX',
      'bank_transfer': 'Transferência Bancária',
      'automatic_debit': 'Débito Automático'
    };

    const categoryName = categoryNames[expense.category] || expense.category;
    const paymentMethodName = paymentMethodNames[expense.payment_method] || expense.payment_method;
    const formattedAmount = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(expense.amount);

    let response = `✅ *Gasto pessoal registrado com sucesso!*\n\n`;
    response += `💸 *Valor:* ${formattedAmount}\n`;
    response += `📂 *Categoria:* ${categoryName}\n`;
    response += `📝 *Descrição:* ${expense.description}\n`;
    response += `📅 *Data:* ${new Date(expense.date).toLocaleDateString('pt-BR')}\n`;
    response += `💳 *Pagamento:* ${paymentMethodName}\n`;
    response += `${expense.is_essential ? '🔴' : '🟡'} *Tipo:* ${expense.is_essential ? 'Essencial' : 'Não Essencial'}\n`;

    if (expense.is_recurring) {
      response += `🔄 *Recorrente:* Sim\n`;
    }

    if (expense.is_installment) {
      response += `📊 *Parcelado:* Sim\n`;
    }

    if (expense.location) {
      response += `📍 *Local:* ${expense.location}\n`;
    }

    if (expense.merchant) {
      response += `🏪 *Estabelecimento:* ${expense.merchant}\n`;
    }

    if (expense.is_tax_deductible) {
      response += `📋 *Dedutível:* Sim\n`;
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
    let response = `❌ *Erro ao registrar gasto pessoal:*\n\n`;
    errors.forEach(error => {
      response += `• ${error}\n`;
    });
    response += `\n💡 *Exemplo correto:*\n`;
    response += `"Gastei R$ 80 no supermercado com cartão de débito"`;
    return response;
  }

  /**
   * Buscar estatísticas de gastos pessoais
   */
  async getPersonalExpenseStats(userId, period = 'month') {
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

      const expenses = await this.personalFinanceService.getPersonalExpenses(userId, {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      });

      const totalAmount = expenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
      const essentialAmount = expenses
        .filter(expense => expense.is_essential)
        .reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
      const nonEssentialAmount = totalAmount - essentialAmount;
      
      // Agrupar por categoria
      const byCategory = expenses.reduce((acc, expense) => {
        acc[expense.category] = (acc[expense.category] || 0) + parseFloat(expense.amount);
        return acc;
      }, {});

      // Agrupar por método de pagamento
      const byPaymentMethod = expenses.reduce((acc, expense) => {
        acc[expense.payment_method] = (acc[expense.payment_method] || 0) + parseFloat(expense.amount);
        return acc;
      }, {});

      return {
        period,
        totalAmount,
        essentialAmount,
        nonEssentialAmount,
        averageAmount: expenses.length > 0 ? totalAmount / expenses.length : 0,
        transactionCount: expenses.length,
        byCategory,
        byPaymentMethod,
        expenses
      };
    } catch (error) {
      logger.error('Erro ao buscar estatísticas de gastos pessoais:', error);
      throw error;
    }
  }

  /**
   * Analisar padrões de gastos
   */
  async analyzeSpendingPatterns(userId) {
    try {
      const stats = await this.getPersonalExpenseStats(userId, 'month');
      const lastMonthStats = await this.getPersonalExpenseStats(userId, 'lastMonth');
      
      const analysis = {
        currentMonth: stats,
        comparison: {
          totalChange: stats.totalAmount - (lastMonthStats?.totalAmount || 0),
          essentialChange: stats.essentialAmount - (lastMonthStats?.essentialAmount || 0),
          nonEssentialChange: stats.nonEssentialAmount - (lastMonthStats?.nonEssentialAmount || 0)
        },
        insights: []
      };

      // Gerar insights
      if (analysis.comparison.totalChange > 0) {
        analysis.insights.push(`Seus gastos aumentaram ${((analysis.comparison.totalChange / (lastMonthStats?.totalAmount || 1)) * 100).toFixed(1)}% em relação ao mês passado`);
      } else if (analysis.comparison.totalChange < 0) {
        analysis.insights.push(`Parabéns! Você reduziu seus gastos em ${((Math.abs(analysis.comparison.totalChange) / (lastMonthStats?.totalAmount || 1)) * 100).toFixed(1)}% em relação ao mês passado`);
      }

      // Categoria com maior gasto
      const topCategory = Object.entries(stats.byCategory)
        .sort(([,a], [,b]) => b - a)[0];
      if (topCategory) {
        analysis.insights.push(`Sua maior categoria de gastos é ${topCategory[0]} com ${((topCategory[1] / stats.totalAmount) * 100).toFixed(1)}% do total`);
      }

      return analysis;
    } catch (error) {
      logger.error('Erro ao analisar padrões de gastos:', error);
      throw error;
    }
  }
}

module.exports = PersonalExpenseHandler;