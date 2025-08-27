// Query Processor - Processamento de consultas financeiras
const databaseService = require('../../config/database');
const logger = require('../../utils/logger');
const moment = require('moment');

class QueryProcessor {
  constructor() {
    this.name = 'QueryProcessor';
  }

  // Processar consulta simples
  async processQuery(userId, analysisResult) {
    try {
      const { categoria, intencao } = analysisResult;
      
      let response = '';
      
      switch (intencao) {
        case 'consultar_gastos':
          response = await this.getMonthlyExpenses(userId);
          break;
        case 'consultar_receitas':
          response = await this.getMonthlyRevenues(userId);
          break;
        case 'consultar_categoria':
          response = await this.getCategoryExpenses(userId, categoria);
          break;
        case 'consultar_produtos':
          response = await this.getUserProducts(userId);
          break;
        case 'consultar_resumo':
          response = await this.getUserSummary(userId);
          break;
        default:
          response = await this.getGeneralStats(userId);
      }
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao processar consulta:', error);
      logger.error('Erro ao processar consulta', {
        userId,
        analysisResult,
        error: error.message
      });
      
      return '❌ Erro ao buscar informações. Tente novamente.';
    }
  }

  // Processar consulta detalhada
  async processDetailedQuery(userId, analysisResult) {
    try {
      const { categoria, intencao } = analysisResult;
      
      let response = '';
      
      switch (intencao) {
        case 'consultar_gastos_detalhado':
          response = await this.getDetailedExpenses(userId);
          break;
        case 'consultar_categoria_detalhado':
          response = await this.getDetailedCategoryExpenses(userId, categoria);
          break;
        default:
          response = await this.getDetailedSummary(userId);
      }
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao processar consulta detalhada:', error);
      logger.error('Erro ao processar consulta detalhada', {
        userId,
        analysisResult,
        error: error.message
      });
      
      return '❌ Erro ao buscar informações detalhadas. Tente novamente.';
    }
  }

  // Obter gastos mensais
  async getMonthlyExpenses(userId) {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    const expenses = await databaseService.getUserMonthlyExpenses(userId, currentYear, currentMonth);
    
    if (!expenses || expenses.length === 0) {
      return '📊 Você ainda não tem gastos registrados este mês.';
    }
    
    const total = expenses.reduce((sum, expense) => sum + expense.total, 0);
    
    let response = `📊 **Gastos de ${this.getMonthName(currentMonth)}/${currentYear}**\n\n`;
    
    expenses.forEach(expense => {
      const categoryName = this.formatCategoryName(expense.category);
      response += `• ${categoryName}: R$ ${expense.total.toFixed(2)}\n`;
    });
    
    response += `\n💰 **Total: R$ ${total.toFixed(2)}**`;
    
    return response;
  }

  // Obter receitas mensais
  async getMonthlyRevenues(userId) {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    const revenues = await databaseService.getUserMonthlyRevenues(userId, currentYear, currentMonth);
    
    if (!revenues || revenues.length === 0) {
      return '📈 Você ainda não tem receitas registradas este mês.';
    }
    
    const total = revenues.reduce((sum, revenue) => sum + revenue.total, 0);
    
    let response = `📈 **Receitas de ${this.getMonthName(currentMonth)}/${currentYear}**\n\n`;
    
    revenues.forEach(revenue => {
      const categoryName = this.formatCategoryName(revenue.category);
      response += `• ${categoryName}: R$ ${revenue.total.toFixed(2)}\n`;
    });
    
    response += `\n💰 **Total: R$ ${total.toFixed(2)}**`;
    
    return response;
  }

  // Obter gastos por categoria
  async getCategoryExpenses(userId, category) {
    const expenses = await databaseService.getUserExpensesByCategory(userId, category);
    
    if (!expenses || expenses.length === 0) {
      const categoryName = this.formatCategoryName(category);
      return `📊 Você ainda não tem gastos na categoria ${categoryName}.`;
    }
    
    const total = expenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
    const categoryName = this.formatCategoryName(category);
    
    let response = `📊 **Gastos em ${categoryName}**\n\n`;
    
    expenses.slice(0, 10).forEach(expense => {
      const date = moment(expense.date).format('DD/MM');
      const description = expense.description || 'Sem descrição';
      response += `• ${date}: R$ ${parseFloat(expense.amount).toFixed(2)} - ${description}\n`;
    });
    
    response += `\n💰 **Total: R$ ${total.toFixed(2)}**`;
    
    if (expenses.length > 10) {
      response += `\n\n📝 Mostrando os 10 gastos mais recentes de ${expenses.length} total.`;
    }
    
    return response;
  }

  // Obter produtos do usuário
  async getUserProducts(userId) {
    const products = await databaseService.getUserProducts(userId, 10);
    
    if (!products || products.length === 0) {
      return '📦 Você ainda não tem produtos registrados.';
    }
    
    let response = '📦 **Seus Produtos**\n\n';
    
    products.forEach(product => {
      const date = moment(product.purchase_date).format('DD/MM/YYYY');
      const name = product.name || product.product_name || 'Produto';
      const price = parseFloat(product.selling_price || product.price || 0);
      response += `• ${name}: R$ ${price.toFixed(2)} (${date})\n`;
    });
    
    return response;
  }

  // Obter resumo do usuário
  async getUserSummary(userId) {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    const [expenses, revenues, products] = await Promise.all([
      databaseService.getUserMonthlyExpenses(userId, currentYear, currentMonth),
      databaseService.getUserMonthlyRevenues(userId, currentYear, currentMonth),
      databaseService.getUserProducts(userId, 5)
    ]);
    
    const totalExpenses = expenses.reduce((sum, expense) => sum + expense.total, 0);
    const totalRevenues = revenues.reduce((sum, revenue) => sum + revenue.total, 0);
    const balance = totalRevenues - totalExpenses;
    
    let response = `📊 **Resumo Financeiro - ${this.getMonthName(currentMonth)}/${currentYear}**\n\n`;
    response += `💰 Receitas: R$ ${totalRevenues.toFixed(2)}\n`;
    response += `💸 Despesas: R$ ${totalExpenses.toFixed(2)}\n`;
    response += `${balance >= 0 ? '✅' : '❌'} Saldo: R$ ${balance.toFixed(2)}\n\n`;
    
    if (products.length > 0) {
      response += `📦 Produtos: ${products.length} registrados`;
    }
    
    return response;
  }

  // Obter estatísticas gerais
  async getGeneralStats(userId) {
    try {
      const recentExpenses = await databaseService.getUserExpenses(userId, 5);
      const recentRevenues = await databaseService.getUserRevenues(userId, 5);
      
      let response = '📊 **Suas Finanças**\n\n';
      
      if (recentExpenses.length > 0) {
        response += '💸 **Últimas Despesas:**\n';
        recentExpenses.forEach(expense => {
          const date = moment(expense.date).format('DD/MM');
          const amount = parseFloat(expense.amount).toFixed(2);
          const category = this.formatCategoryName(expense.category);
          response += `• ${date}: R$ ${amount} (${category})\n`;
        });
        response += '\n';
      }
      
      if (recentRevenues.length > 0) {
        response += '💰 **Últimas Receitas:**\n';
        recentRevenues.forEach(revenue => {
          const date = moment(revenue.date).format('DD/MM');
          const amount = parseFloat(revenue.amount).toFixed(2);
          const category = this.formatCategoryName(revenue.category);
          response += `• ${date}: R$ ${amount} (${category})\n`;
        });
      }
      
      if (recentExpenses.length === 0 && recentRevenues.length === 0) {
        response = '📊 Você ainda não tem transações registradas. Comece registrando seus gastos e receitas!';
      }
      
      return response;
    } catch (error) {
      return '📊 Erro ao buscar suas informações financeiras.';
    }
  }

  // Formatar nome da categoria
  formatCategoryName(category) {
    const categoryNames = {
      'alimentacao': 'Alimentação',
      'transporte': 'Transporte',
      'supermercado': 'Supermercado',
      'lazer': 'Lazer',
      'saude': 'Saúde',
      'educacao': 'Educação',
      'casa': 'Casa',
      'roupas': 'Roupas',
      'aluguel': 'Aluguel',
      'salario': 'Salário',
      'freelance': 'Freelance',
      'vendas': 'Vendas',
      'bonus': 'Bônus',
      'outros': 'Outros'
    };
    
    return categoryNames[category] || category.charAt(0).toUpperCase() + category.slice(1);
  }

  // Obter nome do mês
  getMonthName(month) {
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return months[month - 1];
  }
}

module.exports = QueryProcessor;