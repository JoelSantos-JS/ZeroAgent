// Investment Processor - Processamento de investimentos
const databaseService = require('../../config/database');
const logger = require('../../utils/logger');
const moment = require('moment');

class InvestmentProcessor {
  constructor() {
    this.name = 'InvestmentProcessor';
  }

  // Processar transação de investimento
  async processInvestmentTransaction(userId, analysisResult) {
    try {
      const { valor, categoria, descricao, data, analise, dica } = analysisResult;
      
      // Processar data
      const transactionDate = this.parseDate(data);
      
      // Registrar investimento no banco
      const transaction = await databaseService.createExpense(
        userId,
        valor,
        categoria,
        descricao,
        transactionDate,
        'other'  // Investimentos como despesa no sistema
      );
      
      console.log('📈 Investimento registrado:', transaction);
      
      // Gerar resposta mais humana e natural
      const categoriaFormatada = categoria ? categoria.charAt(0).toUpperCase() + categoria.slice(1) : 'Investimento';
      
      // Mensagens mais naturais baseadas na categoria
      const mensagensCategoria = {
        'aplicacao': 'Aplicação financeira registrada! 💰',
        'acoes': 'Investimento em ações registrado! 📈',
        'fundos': 'Investimento em fundos registrado! 📊',
        'criptomoedas': 'Investimento em criptomoedas registrado! ₿',
        'tesouro': 'Investimento no Tesouro Direto registrado! 🏛️',
        'poupanca': 'Depósito na poupança registrado! 🏦',
        'outros': 'Investimento registrado com sucesso! ✅'
      };
      
      const mensagemInicial = mensagensCategoria[categoria] || mensagensCategoria['outros'];
      
      let response = `${mensagemInicial}\n\n`;
      response += `💰 **R$ ${valor.toFixed(2)}** em ${categoriaFormatada}\n`;
      
      // Dicas personalizadas para investimentos
      const dicasPersonalizadas = {
        'aplicacao': 'Ótima escolha! Diversificar é sempre importante! 💡',
        'acoes': 'Lembre-se: invista apenas o que pode perder! 📊',
        'fundos': 'Fundos são uma boa forma de diversificar! 🎯',
        'criptomoedas': 'Mercado volátil! Mantenha apenas uma pequena parte do portfólio! ⚠️',
        'tesouro': 'Investimento seguro e rentável! Excelente escolha! 🏆',
        'poupanca': 'Que tal considerar investimentos com maior rentabilidade? 💭'
      };
      
      const dicaFinal = dica || dicasPersonalizadas[categoria] || 'Continue investindo regularmente para construir seu patrimônio! 🚀';
      response += `💡 ${dicaFinal}`;
      
      logger.info('Investimento registrado', {
        userId,
        transactionId: transaction.id,
        value: valor,
        category: categoria
      });
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao processar investimento:', error);
      logger.error('Erro ao processar investimento', {
        userId,
        analysisResult,
        error: error.message
      });
      
      return `❌ Erro ao registrar investimento de R$ ${analysisResult.valor}. Tente novamente.`;
    }
  }

  // Obter portfólio de investimentos
  async getInvestmentPortfolio(userId) {
    try {
      const investments = await databaseService.getUserExpensesByCategory(userId, 'aplicacao');
      const stocks = await databaseService.getUserExpensesByCategory(userId, 'acoes');
      const funds = await databaseService.getUserExpensesByCategory(userId, 'fundos');
      
      const allInvestments = [...investments, ...stocks, ...funds];
      
      if (allInvestments.length === 0) {
        return '📈 Você ainda não tem investimentos registrados.';
      }
      
      const totalInvested = allInvestments.reduce((sum, inv) => sum + parseFloat(inv.amount), 0);
      
      let response = '📈 **Seu Portfólio de Investimentos**\n\n';
      
      // Agrupar por categoria
      const byCategory = allInvestments.reduce((acc, inv) => {
        const cat = inv.category || 'outros';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(inv);
        return acc;
      }, {});
      
      Object.entries(byCategory).forEach(([category, invs]) => {
        const categoryTotal = invs.reduce((sum, inv) => sum + parseFloat(inv.amount), 0);
        const categoryName = this.formatCategoryName(category);
        const percentage = ((categoryTotal / totalInvested) * 100).toFixed(1);
        
        response += `💰 **${categoryName}**: R$ ${categoryTotal.toFixed(2)} (${percentage}%)\n`;
        
        invs.slice(0, 3).forEach(inv => {
          const date = moment(inv.date).format('DD/MM');
          const description = inv.description || 'Investimento';
          response += `  • ${date}: R$ ${parseFloat(inv.amount).toFixed(2)} - ${description}\n`;
        });
        
        response += '\n';
      });
      
      response += `💎 **Total Investido**: R$ ${totalInvested.toFixed(2)}`;
      
      return response;
      
    } catch (error) {
      console.error('Erro ao obter portfólio:', error);
      return '❌ Erro ao buscar seu portfólio de investimentos.';
    }
  }

  // Processar data
  parseDate(dateString) {
    if (!dateString || dateString === 'hoje') {
      return new Date();
    }
    
    // Tentar parsear diferentes formatos
    const formats = [
      'DD/MM/YYYY',
      'DD-MM-YYYY',
      'YYYY-MM-DD',
      'DD/MM',
      'DD-MM'
    ];
    
    for (const format of formats) {
      const parsed = moment(dateString, format, true);
      if (parsed.isValid()) {
        return parsed.toDate();
      }
    }
    
    // Se não conseguir parsear, usar data atual
    return new Date();
  }

  // Validar dados de investimento
  validateInvestmentData(analysisResult) {
    const { valor, categoria } = analysisResult;
    
    if (!valor || valor <= 0) {
      throw new Error('Valor do investimento deve ser maior que zero');
    }
    
    if (!categoria) {
      throw new Error('Categoria do investimento é obrigatória');
    }
    
    return true;
  }

  // Categorias válidas para investimentos
  getValidInvestmentCategories() {
    return [
      'aplicacao',
      'acoes',
      'fundos',
      'criptomoedas',
      'tesouro',
      'poupanca',
      'cdb',
      'lci',
      'lca',
      'outros'
    ];
  }

  // Formatar nome da categoria
  formatCategoryName(category) {
    const categoryNames = {
      'aplicacao': 'Aplicações',
      'acoes': 'Ações',
      'fundos': 'Fundos',
      'criptomoedas': 'Criptomoedas',
      'tesouro': 'Tesouro Direto',
      'poupanca': 'Poupança',
      'cdb': 'CDB',
      'lci': 'LCI',
      'lca': 'LCA',
      'outros': 'Outros'
    };
    
    return categoryNames[category] || category.charAt(0).toUpperCase() + category.slice(1);
  }
}

module.exports = InvestmentProcessor;