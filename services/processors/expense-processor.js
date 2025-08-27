// Expense Processor - Processamento de despesas
const databaseService = require('../../config/database');
const logger = require('../../utils/logger');
const moment = require('moment');

class ExpenseProcessor {
  constructor() {
    this.name = 'ExpenseProcessor';
  }

  // Processar transação de despesa
  async processExpenseTransaction(userId, analysisResult) {
    try {
      const { valor, categoria, descricao, data, tipo, analise, dica } = analysisResult;
      
      // Processar data
      const transactionDate = this.parseDate(data);
      
      // Registrar despesa no banco
      const transaction = await databaseService.createExpense(
        userId,
        valor,
        categoria,
        descricao,
        transactionDate,
        'other'  // Tipo da despesa
      );
      
      console.log(`💸 ${tipo.toUpperCase()} registrada:`, transaction);
      
      // Obter contexto atualizado para resposta personalizada
      const userContext = await this.getUserContext(userId);
      
      // Gerar resposta mais humana e natural
      const tipoFormatado = tipo === 'despesa_fixa' ? 'despesa fixa' : 'despesa variável';
      const categoriaFormatada = categoria ? categoria.charAt(0).toUpperCase() + categoria.slice(1) : 'Outros';
      
      // Mensagens mais naturais baseadas na categoria
      const mensagensCategoria = {
        'alimentacao': 'Gasto com alimentação registrado! 🍽️',
        'transporte': 'Despesa de transporte anotada! 🚗',
        'supermercado': 'Compra no supermercado registrada! 🛒',
        'lazer': 'Gasto com lazer registrado! 🎉',
        'saude': 'Despesa de saúde anotada! 🏥',
        'casa': 'Gasto doméstico registrado! 🏠',
        'roupas': 'Compra de roupas registrada! 👕',
        'outros': 'Despesa registrada com sucesso! ✅'
      };
      
      const mensagemInicial = mensagensCategoria[categoria] || mensagensCategoria['outros'];
      
      let response = `${mensagemInicial}\n\n`;
      response += `💰 **R$ ${valor.toFixed(2)}** em ${categoriaFormatada}\n`;
      
      // Adicionar contexto do orçamento se disponível
      if (userContext.monthlySpent !== undefined && userContext.monthlySpent !== null) {
        const monthlySpent = parseFloat(userContext.monthlySpent) || 0;
        const novoTotal = monthlySpent + valor;
        response += `📊 Total do mês: R$ ${novoTotal.toFixed(2)}\n\n`;
      }
      
      // Dica personalizada e mais humana
      const dicasPersonalizadas = {
        'alimentacao': 'Que tal planejar as refeições da semana? Ajuda a economizar! 🥗',
        'transporte': 'Considere alternativas como transporte público ou carona! 🚌',
        'supermercado': 'Fazer lista de compras evita gastos desnecessários! 📝',
        'lazer': 'Diversão é importante, mas sempre dentro do orçamento! 🎯',
        'saude': 'Investir em prevenção pode economizar muito no futuro! 💪',
        'casa': 'Manter a casa organizada ajuda a controlar os gastos! 🧹',
        'roupas': 'Antes de comprar, veja se realmente precisa! 👀'
      };
      
      const dicaFinal = dica || dicasPersonalizadas[categoria] || 'Continue registrando seus gastos para ter controle total das finanças! 📈';
      response += `💡 ${dicaFinal}`;
      
      logger.info(`${tipo} registrada`, {
        userId,
        transactionId: transaction.id,
        value: valor,
        category: categoria
      });
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao processar despesa:', error);
      logger.error('Erro ao processar despesa', {
        userId,
        analysisResult,
        error: error.message
      });
      
      return `❌ Erro ao registrar despesa de R$ ${analysisResult.valor}. Tente novamente.`;
    }
  }

  // Obter contexto do usuário
  async getUserContext(userId) {
    try {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      
      // Buscar gastos do mês atual
      const monthlyExpenses = await databaseService.getUserMonthlyExpenses(userId, currentYear, currentMonth);
      const monthlySpent = monthlyExpenses.reduce((total, expense) => total + expense.total, 0);
      
      // Buscar transações recentes
      const recentTransactions = await databaseService.getUserExpenses(userId, 10);
      
      return {
        monthlySpent,
        recentTransactions,
        currentMonth,
        currentYear
      };
    } catch (error) {
      console.error('Erro ao obter contexto do usuário:', error);
      return {
        monthlySpent: 0,
        recentTransactions: [],
        currentMonth: new Date().getMonth() + 1,
        currentYear: new Date().getFullYear()
      };
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

  // Validar dados de despesa
  validateExpenseData(analysisResult) {
    const { valor, categoria } = analysisResult;
    
    if (!valor || valor <= 0) {
      throw new Error('Valor da despesa deve ser maior que zero');
    }
    
    if (!categoria) {
      throw new Error('Categoria da despesa é obrigatória');
    }
    
    return true;
  }

  // Categorias válidas para despesas
  getValidExpenseCategories() {
    return [
      'alimentacao',
      'transporte',
      'supermercado',
      'lazer',
      'saude',
      'educacao',
      'casa',
      'roupas',
      'aluguel',
      'financiamento',
      'seguro',
      'assinatura',
      'outros'
    ];
  }
}

module.exports = ExpenseProcessor;