const BaseHandler = require('./base-handler');
const TransactionValidator = require('../validators/transaction-validator');
const DataParser = require('../parsers/data-parser');
const ResponseFormatter = require('../formatters/response-formatter');

/**
 * Handler específico para processamento de investimentos
 * Herda funcionalidades comuns do BaseHandler
 */
class InvestmentHandler extends BaseHandler {
  constructor(databaseService, userService) {
    super(databaseService, userService);
  }

  /**
   * Processar transação de investimento
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
      
      // Registrar investimento no banco
      const transaction = await this.databaseService.createTransaction(
        userId,
        'investment',
        valor,
        categoria,
        descricao,
        transactionDate
      );
      
      console.log('📈 Investimento registrado:', transaction);
      
      // Registrar como produto se houver nome específico
      if (analysisResult.produto_nome) {
        await this.createInvestmentProduct(userId, analysisResult, transactionDate);
      }
      
      // Log da transação
      this.logTransaction('Investimento', userId, transaction, analysisResult);
      
      // Formatar resposta
      return ResponseFormatter.formatInvestmentResponse(transaction, analysisResult);
      
    } catch (error) {
      return this.handleError(error, userId, analysisResult, 'investimento');
    }
  }

  /**
   * Criar produto de investimento
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Dados da análise
   * @param {Date} transactionDate - Data da transação
   * @returns {Promise<Object>} - Produto criado
   */
  async createInvestmentProduct(userId, analysisResult, transactionDate) {
    try {
      const { produto_nome, categoria, valor } = analysisResult;
      
      return await this.databaseService.createProduct(
        userId,
        produto_nome,
        categoria,
        valor,
        transactionDate
      );
    } catch (error) {
      console.error('❌ Erro ao criar produto de investimento:', error);
      // Não falhar a transação principal por causa do produto
      return null;
    }
  }

  /**
   * Validar dados específicos de investimento
   * @param {Object} analysisResult - Dados a serem validados
   * @returns {Object} - Resultado da validação
   */
  validateInput(analysisResult) {
    // Validação básica
    const basicValidation = super.validateInput(analysisResult);
    if (!basicValidation.isValid) {
      return basicValidation;
    }

    // Validações específicas de investimento
    const errors = [];
    
    // Validar categoria específica para investimentos
    const categoryValidation = TransactionValidator.validateCategory(
      analysisResult.categoria, 
      'investment'
    );
    
    if (!categoryValidation.isValid) {
      errors.push(...categoryValidation.errors);
    }
    
    // Validar valor mínimo para investimentos
    if (analysisResult.valor < 1) {
      errors.push('Valor mínimo para investimento: R$ 1,00');
    }
    
    // Validar valor máximo para investimentos (limite de segurança)
    if (analysisResult.valor > 1000000) {
      errors.push('Valor muito alto para um investimento. Máximo permitido: R$ 1.000.000');
    }
    
    // Validar se não é valor negativo
    if (analysisResult.valor < 0) {
      errors.push('Valor de investimento não pode ser negativo');
    }
    
    return {
      isValid: errors.length === 0,
      errors: [...basicValidation.errors, ...errors]
    };
  }

  /**
   * Obter estatísticas de investimentos do usuário
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object>} - Estatísticas de investimentos
   */
  async getInvestmentStats(userId) {
    try {
      // Buscar transações de investimento
      const transactions = await this.databaseService.getUserTransactions(userId, 100);
      const investments = transactions.filter(t => t.type === 'investment');
      
      // Calcular estatísticas
      const totalInvested = investments.reduce((sum, inv) => sum + inv.amount, 0);
      const investmentsByCategory = this.groupByCategory(investments);
      const recentInvestments = investments.slice(0, 10);
      
      return {
        totalInvested,
        totalInvestments: investments.length,
        investmentsByCategory,
        recentInvestments,
        averageInvestment: investments.length > 0 ? totalInvested / investments.length : 0,
        diversificationScore: this.calculateDiversificationScore(investmentsByCategory)
      };
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas de investimentos:', error);
      return {
        totalInvested: 0,
        totalInvestments: 0,
        investmentsByCategory: {},
        recentInvestments: [],
        averageInvestment: 0,
        diversificationScore: 0
      };
    }
  }

  /**
   * Agrupar investimentos por categoria
   * @param {Array} investments - Lista de investimentos
   * @returns {Object} - Investimentos agrupados por categoria
   */
  groupByCategory(investments) {
    const grouped = {};
    
    investments.forEach(inv => {
      const category = inv.category || 'outros';
      if (!grouped[category]) {
        grouped[category] = {
          total: 0,
          count: 0,
          investments: []
        };
      }
      
      grouped[category].total += inv.amount;
      grouped[category].count += 1;
      grouped[category].investments.push(inv);
    });
    
    return grouped;
  }

  /**
   * Calcular score de diversificação
   * @param {Object} investmentsByCategory - Investimentos por categoria
   * @returns {number} - Score de 0 a 100
   */
  calculateDiversificationScore(investmentsByCategory) {
    const categories = Object.keys(investmentsByCategory);
    
    if (categories.length === 0) {
      return 0;
    }
    
    // Score baseado no número de categorias e distribuição
    const categoryCount = categories.length;
    const maxCategories = 7; // Número ideal de categorias
    
    // Score por número de categorias (0-50 pontos)
    const categoryScore = Math.min(50, (categoryCount / maxCategories) * 50);
    
    // Score por distribuição equilibrada (0-50 pontos)
    const totalInvested = Object.values(investmentsByCategory)
      .reduce((sum, cat) => sum + cat.total, 0);
    
    if (totalInvested === 0) {
      return categoryScore;
    }
    
    // Calcular desvio padrão das proporções
    const proportions = Object.values(investmentsByCategory)
      .map(cat => cat.total / totalInvested);
    
    const averageProportion = 1 / categoryCount;
    const variance = proportions.reduce((sum, prop) => 
      sum + Math.pow(prop - averageProportion, 2), 0) / categoryCount;
    
    const standardDeviation = Math.sqrt(variance);
    
    // Quanto menor o desvio, melhor a distribuição
    const distributionScore = Math.max(0, 50 - (standardDeviation * 200));
    
    return Math.round(categoryScore + distributionScore);
  }

  /**
   * Analisar portfólio de investimentos
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object>} - Análise do portfólio
   */
  async analyzePortfolio(userId) {
    try {
      const stats = await this.getInvestmentStats(userId);
      
      const analysis = {
        totalValue: stats.totalInvested,
        diversificationScore: stats.diversificationScore,
        recommendations: [],
        riskLevel: this.calculateRiskLevel(stats.investmentsByCategory),
        allocation: this.calculateAllocation(stats.investmentsByCategory)
      };
      
      // Gerar recomendações
      analysis.recommendations = this.generateRecommendations(stats);
      
      return analysis;
      
    } catch (error) {
      console.error('❌ Erro ao analisar portfólio:', error);
      return {
        totalValue: 0,
        diversificationScore: 0,
        recommendations: ['Erro ao analisar portfólio'],
        riskLevel: 'desconhecido',
        allocation: {}
      };
    }
  }

  /**
   * Calcular nível de risco do portfólio
   * @param {Object} investmentsByCategory - Investimentos por categoria
   * @returns {string} - Nível de risco
   */
  calculateRiskLevel(investmentsByCategory) {
    const riskWeights = {
      'renda_fixa': 1,
      'tesouro': 1,
      'cdb': 1,
      'fundos': 2,
      'acoes': 3,
      'criptomoedas': 4,
      'imoveis': 2,
      'outros': 2
    };
    
    const totalInvested = Object.values(investmentsByCategory)
      .reduce((sum, cat) => sum + cat.total, 0);
    
    if (totalInvested === 0) {
      return 'baixo';
    }
    
    let weightedRisk = 0;
    
    Object.entries(investmentsByCategory).forEach(([category, data]) => {
      const weight = riskWeights[category] || 2;
      const proportion = data.total / totalInvested;
      weightedRisk += weight * proportion;
    });
    
    if (weightedRisk <= 1.5) {
      return 'baixo';
    } else if (weightedRisk <= 2.5) {
      return 'médio';
    } else {
      return 'alto';
    }
  }

  /**
   * Calcular alocação do portfólio
   * @param {Object} investmentsByCategory - Investimentos por categoria
   * @returns {Object} - Alocação percentual
   */
  calculateAllocation(investmentsByCategory) {
    const totalInvested = Object.values(investmentsByCategory)
      .reduce((sum, cat) => sum + cat.total, 0);
    
    if (totalInvested === 0) {
      return {};
    }
    
    const allocation = {};
    
    Object.entries(investmentsByCategory).forEach(([category, data]) => {
      allocation[category] = {
        percentage: ((data.total / totalInvested) * 100).toFixed(1),
        value: data.total,
        count: data.count
      };
    });
    
    return allocation;
  }

  /**
   * Gerar recomendações baseadas no portfólio
   * @param {Object} stats - Estatísticas do portfólio
   * @returns {Array} - Lista de recomendações
   */
  generateRecommendations(stats) {
    const recommendations = [];
    
    // Recomendação de diversificação
    if (stats.diversificationScore < 30) {
      recommendations.push('Considere diversificar mais seu portfólio em diferentes categorias de investimento');
    }
    
    // Recomendação de valor mínimo
    if (stats.totalInvested < 1000) {
      recommendations.push('Tente aumentar gradualmente seus investimentos para potencializar os retornos');
    }
    
    // Recomendação baseada em categorias
    const categories = Object.keys(stats.investmentsByCategory);
    
    if (!categories.includes('renda_fixa') && !categories.includes('tesouro')) {
      recommendations.push('Considere adicionar investimentos de renda fixa para equilibrar o risco');
    }
    
    if (categories.length === 1) {
      recommendations.push('Diversifique em pelo menos 3 categorias diferentes de investimento');
    }
    
    // Se não há recomendações específicas
    if (recommendations.length === 0) {
      recommendations.push('Parabéns! Seu portfólio está bem estruturado. Continue investindo regularmente.');
    }
    
    return recommendations;
  }
}

module.exports = InvestmentHandler;