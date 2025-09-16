const BaseHandler = require('./base-handler');
const ResponseFormatter = require('../formatters/response-formatter');

/**
 * Handler específico para processamento de consultas e queries
 * Herda funcionalidades comuns do BaseHandler
 */
class QueryHandler extends BaseHandler {
  constructor(databaseService, userService) {
    super(databaseService, userService);
  }

  /**
   * Processar consulta do usuário
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise do Gemini
   * @returns {Promise<string>} - Resposta formatada
   */
  async process(userId, analysisResult) {
    try {
      const { intencao } = analysisResult;
      
      console.log('📊 Processando consulta:', intencao);
      
      switch (intencao) {
        case 'abrir_sessao':
        case 'iniciar_conversa':
        case 'saudacao':
          return await this.handleWelcomeMessage(userId);
          
        case 'consultar_gastos_mes':
        case 'gastos_mes':
          return await this.getMonthlyExpenses(userId);
          
        case 'consultar_receitas_mes':
        case 'receitas_mes':
          return await this.getMonthlyIncome(userId);
          
        case 'consultar_saldo':
        case 'saldo_atual':
          return await this.getCurrentBalance(userId);
          
        case 'consultar_investimentos':
        case 'portfolio':
          return await this.getInvestmentSummary(userId);
          
        case 'resumo_financeiro':
        case 'relatorio_geral':
          return await this.getFinancialSummary(userId);
          
        case 'gastos_categoria':
          return await this.getExpensesByCategory(userId, analysisResult);
          
        case 'ultimas_transacoes':
        case 'historico':
          return await this.getRecentTransactions(userId);
          
        case 'metas_orcamento':
        case 'orcamento':
          return await this.getBudgetStatus(userId);
          
        default:
          // Se for uma saudação simples, tratar como boas-vindas
          if (this.isSimpleGreeting(analysisResult)) {
            return await this.handleWelcomeMessage(userId);
          }
          return await this.handleGenericQuery(userId, analysisResult);
      }
      
    } catch (error) {
      console.error('❌ Erro ao processar consulta:', error);
      return '❌ Erro ao processar sua consulta. Tente novamente.';
    }
  }

  /**
   * Verificar se é uma saudação simples
   * @param {Object} analysisResult - Resultado da análise
   * @returns {boolean} - True se for saudação simples
   */
  isSimpleGreeting(analysisResult) {
    const { descricao, intencao, valor } = analysisResult;
    
    // Lista abrangente de saudações em português, inglês e variações
    const greetingWords = [
      // Saudações básicas em português
      'ola', 'olá', 'oi', 'oie', 'oii', 'oiii',
      'eae', 'eai', 'e ae', 'e ai', 'salve', 'fala',
      'fala ae', 'fala ai', 'beleza', 'blz',
      
      // Saudações por período do dia
      'bom dia', 'bomdia', 'bd', 'bdia',
      'boa tarde', 'boatarde', 'bt', 'btarde',
      'boa noite', 'boanoite', 'bn', 'bnoite',
      'boa madrugada', 'boamadrugada',
      
      // Saudações em inglês
      'hello', 'hi', 'hey', 'hii', 'hiii',
      'good morning', 'morning', 'gm',
      'good afternoon', 'afternoon',
      'good evening', 'evening',
      'good night', 'goodnight', 'gn',
      
      // Saudações informais e gírias
      'sup', 'whats up', 'wassup', 'yo',
      'howdy', 'hola', 'ciao', 'tchau',
      'xau', 'xauu', 'bye', 'adeus',
      
      // Variações com cumprimentos
      'tudo bem', 'tudo bom', 'como vai',
      'como você está', 'como esta',
      'como vc está', 'como vc esta',
      'tudo joia', 'tudo certo', 'suave',
      
      // Saudações regionais brasileiras
      'opa', 'opaa', 'opaaaa', 'ae', 'aee',
      'coé', 'coe', 'qual é', 'qual eh',
      'firmeza', 'tranquilo', 'de boa',
      
      // Expressões de início de conversa
      'alo', 'alô', 'pronto', 'tem alguém',
      'tem alguem', 'alguém aí', 'alguem ai',
      'você está aí', 'voce esta ai',
      
      // Saudações com emoji ou símbolos (texto)
      'oi :)', 'ola :)', 'hey :)', 'hi :)',
      'oi!', 'ola!', 'hey!', 'hi!',
      
      // Variações com typos comuns
      'oii', 'oiii', 'hii', 'hiii',
      'heey', 'heeey', 'olaaa', 'olaaaa'
    ];
    
    // Verificar se é saudação pela intenção
    const isGreetingIntent = [
      'saudação', 'saudacao', 'cumprimento',
      'iniciar_conversa', 'abrir_sessao',
      'greeting', 'hello', 'hi'
    ].includes(intencao);
    
    // Verificar se é saudação pela descrição (texto exato ou contém)
    const text = descricao?.toLowerCase().trim() || '';
    const isGreetingText = greetingWords.some(word => {
      // Verificar se é exatamente a palavra ou se contém a palavra
      return text === word || text.includes(word);
    });
    
    // Verificar se é uma saudação muito curta (1-3 caracteres)
    const isVeryShortGreeting = text.length <= 3 && [
      'oi', 'hi', 'yo', 'ae', 'ei', 'ey', 'hey'
    ].includes(text);
    
    // É saudação se não tem valor financeiro E é uma das condições acima
    return (valor === 0 || !valor) && (
      isGreetingIntent || 
      isGreetingText || 
      isVeryShortGreeting
    );
  }

  /**
   * Tratar mensagem de boas-vindas
   * @param {string} userId - ID do usuário
   * @returns {Promise<string>} - Mensagem de boas-vindas
   */
  async handleWelcomeMessage(userId) {
    try {
      // Buscar nome do usuário se disponível
      const user = await this.databaseService.getUserById(userId);
      const userName = user?.name || null;
      
      return ResponseFormatter.formatWelcomeMessage(userName);
    } catch (error) {
      return ResponseFormatter.formatWelcomeMessage();
    }
  }

  /**
   * Obter gastos do mês atual
   * @param {string} userId - ID do usuário
   * @returns {Promise<string>} - Resumo dos gastos mensais
   */
  async getMonthlyExpenses(userId) {
    try {
      const userContext = await this.getUserContext(userId);
      const monthlySpent = userContext.monthlySpent || 0;
      
      if (monthlySpent === 0) {
        return '📊 Você ainda não registrou gastos este mês.';
      }
      
      // Buscar gastos por categoria
      const transactions = await this.databaseService.getUserTransactions(userId, 100);
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);
      
      const monthlyExpenses = transactions.filter(t => 
        new Date(t.date) >= thisMonth && t.amount < 0
      );
      
      const expensesByCategory = this.groupTransactionsByCategory(monthlyExpenses);
      
      let response = `📊 **Gastos deste mês**: ${ResponseFormatter.formatCurrency(monthlySpent)}\n\n`;
      
      if (Object.keys(expensesByCategory).length > 0) {
        response += '📋 **Por categoria:**\n';
        Object.entries(expensesByCategory)
          .sort(([,a], [,b]) => b.total - a.total)
          .slice(0, 5)
          .forEach(([category, data]) => {
            response += `• ${ResponseFormatter.formatCategory(category)}: ${ResponseFormatter.formatCurrency(Math.abs(data.total))}\n`;
          });
      }
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao obter gastos mensais:', error);
      return '❌ Erro ao consultar gastos mensais.';
    }
  }

  /**
   * Obter receitas do mês atual
   * @param {string} userId - ID do usuário
   * @returns {Promise<string>} - Resumo das receitas mensais
   */
  async getMonthlyIncome(userId) {
    try {
      const transactions = await this.databaseService.getUserTransactions(userId, 100);
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);
      
      const monthlyIncomes = transactions.filter(t => 
        new Date(t.date) >= thisMonth && t.amount > 0
      );
      
      const totalIncome = monthlyIncomes.reduce((sum, t) => sum + t.amount, 0);
      
      if (totalIncome === 0) {
        return '📊 Você ainda não registrou receitas este mês.';
      }
      
      const incomesByCategory = this.groupTransactionsByCategory(monthlyIncomes);
      
      let response = `💰 **Receitas deste mês**: ${ResponseFormatter.formatCurrency(totalIncome)}\n\n`;
      
      if (Object.keys(incomesByCategory).length > 0) {
        response += '📋 **Por categoria:**\n';
        Object.entries(incomesByCategory)
          .sort(([,a], [,b]) => b.total - a.total)
          .forEach(([category, data]) => {
            response += `• ${ResponseFormatter.formatCategory(category)}: ${ResponseFormatter.formatCurrency(data.total)}\n`;
          });
      }
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao obter receitas mensais:', error);
      return '❌ Erro ao consultar receitas mensais.';
    }
  }

  /**
   * Obter saldo atual
   * @param {string} userId - ID do usuário
   * @returns {Promise<string>} - Saldo atual
   */
  async getCurrentBalance(userId) {
    try {
      const transactions = await this.databaseService.getUserTransactions(userId, 1000);
      const balance = transactions.reduce((sum, t) => sum + t.amount, 0);
      
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);
      
      const monthlyTransactions = transactions.filter(t => new Date(t.date) >= thisMonth);
      const monthlyBalance = monthlyTransactions.reduce((sum, t) => sum + t.amount, 0);
      
      let response = `💰 **Saldo geral**: ${ResponseFormatter.formatCurrency(balance)}\n`;
      response += `📅 **Saldo deste mês**: ${ResponseFormatter.formatCurrency(monthlyBalance)}`;
      
      if (balance < 0) {
        response += '\n⚠️ Atenção: Seu saldo está negativo!';
      } else if (balance > 0) {
        response += '\n✅ Parabéns! Você está no azul!';
      }
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao obter saldo:', error);
      return '❌ Erro ao consultar saldo.';
    }
  }

  /**
   * Obter resumo de investimentos
   * @param {string} userId - ID do usuário
   * @returns {Promise<string>} - Resumo dos investimentos
   */
  async getInvestmentSummary(userId) {
    try {
      const transactions = await this.databaseService.getUserTransactions(userId, 100);
      const investments = transactions.filter(t => t.type === 'investment');
      
      if (investments.length === 0) {
        return '📈 Você ainda não possui investimentos registrados.';
      }
      
      const totalInvested = investments.reduce((sum, inv) => sum + inv.amount, 0);
      const investmentsByCategory = this.groupTransactionsByCategory(investments);
      
      let response = `📈 **Total investido**: ${ResponseFormatter.formatCurrency(totalInvested)}\n`;
      response += `📊 **Número de investimentos**: ${investments.length}\n\n`;
      
      if (Object.keys(investmentsByCategory).length > 0) {
        response += '📋 **Por categoria:**\n';
        Object.entries(investmentsByCategory)
          .sort(([,a], [,b]) => b.total - a.total)
          .forEach(([category, data]) => {
            const percentage = ((data.total / totalInvested) * 100).toFixed(1);
            response += `• ${ResponseFormatter.formatCategory(category)}: ${ResponseFormatter.formatCurrency(data.total)} (${percentage}%)\n`;
          });
      }
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao obter resumo de investimentos:', error);
      return '❌ Erro ao consultar investimentos.';
    }
  }

  /**
   * Obter resumo financeiro completo (pessoal + empresarial)
   * @param {string} userId - ID do usuário
   * @returns {Promise<string>} - Resumo financeiro integrado
   */
  async getFinancialSummary(userId) {
    try {
      // Buscar dados financeiros pessoais
      const transactions = await this.databaseService.getUserTransactions(userId, 1000);
      
      // Buscar dados de vendas/empresariais
      let salesData = [];
      try {
        const revenues = await this.databaseService.getRevenues(userId, 100);
        salesData = revenues || [];
      } catch (error) {
        console.log('⚠️ Erro ao buscar receitas de vendas:', error.message);
      }
      
      // Calcular totais pessoais
      const personalTransactions = transactions.filter(t => !t.source || t.source !== 'vendas_ai');
      const personalSpent = Math.abs(personalTransactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0));
      const personalIncome = personalTransactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
      
      // Calcular totais empresariais (vendas)
      const businessIncome = salesData.reduce((sum, sale) => sum + (sale.amount || 0), 0);
      
      // Totais gerais
      const totalTransactions = transactions.length + salesData.length;
      const totalIncome = personalIncome + businessIncome;
      const balance = totalIncome - personalSpent;
      
      let response = `📊 **Resumo Financeiro Completo**\n\n`;
      response += `📈 **Total de transações:** ${totalTransactions}\n`;
      response += `💸 **Total gasto:** R$ ${personalSpent.toFixed(2)}\n`;
      response += `💰 **Total recebido:** R$ ${totalIncome.toFixed(2)}\n`;
      
      // Separar por tipo
      if (personalIncome > 0 || businessIncome > 0) {
        response += `\n💼 **Detalhamento:**\n`;
        if (personalIncome > 0) {
          response += `• Receitas pessoais: R$ ${personalIncome.toFixed(2)}\n`;
        }
        if (businessIncome > 0) {
          response += `• Receitas de vendas: R$ ${businessIncome.toFixed(2)}\n`;
        }
      }
      
      // Calcular gastos do mês atual
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);
      
      const monthlyExpenses = personalTransactions.filter(t => 
        new Date(t.date) >= thisMonth && t.amount < 0
      );
      const monthlySpent = Math.abs(monthlyExpenses.reduce((sum, t) => sum + t.amount, 0));
      
      response += `📅 **Gasto este mês:** R$ ${monthlySpent.toFixed(2)}\n`;
      
      // Top categorias
      if (personalTransactions.length > 0) {
        const expensesByCategory = this.groupTransactionsByCategory(
          personalTransactions.filter(t => t.amount < 0)
        );
        
        response += `\n🏆 **Top categorias:**\n`;
        Object.entries(expensesByCategory)
          .sort(([,a], [,b]) => Math.abs(b.total) - Math.abs(a.total))
          .slice(0, 3)
          .forEach(([category, data], index) => {
            response += `${index + 1}. ${ResponseFormatter.formatCategory(category)}: R$ ${Math.abs(data.total).toFixed(2)}\n`;
          });
      }
      
      // Saldo final
      const balanceIcon = balance >= 0 ? '✅' : '⚠️';
      response += `\n${balanceIcon} **Saldo:** R$ ${balance.toFixed(2)}`;
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao obter resumo financeiro:', error);
      return '❌ Erro ao gerar resumo financeiro.';
    }
  }

  /**
   * Obter gastos por categoria
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise
   * @returns {Promise<string>} - Gastos por categoria
   */
  async getExpensesByCategory(userId, analysisResult) {
    try {
      const { categoria } = analysisResult;
      const transactions = await this.databaseService.getUserTransactions(userId, 100);
      
      let filteredTransactions = transactions.filter(t => t.amount < 0);
      
      if (categoria && categoria !== 'todas') {
        filteredTransactions = filteredTransactions.filter(t => 
          t.category?.toLowerCase() === categoria.toLowerCase()
        );
      }
      
      if (filteredTransactions.length === 0) {
        const categoryText = categoria ? ` na categoria ${ResponseFormatter.formatCategory(categoria)}` : '';
        return `📊 Nenhum gasto encontrado${categoryText}.`;
      }
      
      const total = Math.abs(filteredTransactions.reduce((sum, t) => sum + t.amount, 0));
      const categoryText = categoria ? ` - ${ResponseFormatter.formatCategory(categoria)}` : '';
      
      let response = `📊 **Gastos${categoryText}**: ${ResponseFormatter.formatCurrency(total)}\n\n`;
      
      // Mostrar últimas transações
      response += '📋 **Últimas transações:**\n';
      filteredTransactions.slice(0, 5).forEach(t => {
        response += `• ${ResponseFormatter.formatCurrency(Math.abs(t.amount))} - ${t.description} (${ResponseFormatter.formatDate(new Date(t.date))})\n`;
      });
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao obter gastos por categoria:', error);
      return '❌ Erro ao consultar gastos por categoria.';
    }
  }

  /**
   * Obter transações recentes
   * @param {string} userId - ID do usuário
   * @returns {Promise<string>} - Transações recentes
   */
  async getRecentTransactions(userId) {
    try {
      const transactions = await this.databaseService.getUserTransactions(userId, 10);
      
      if (transactions.length === 0) {
        return '📊 Nenhuma transação encontrada.';
      }
      
      let response = '📋 **Últimas transações:**\n\n';
      
      transactions.forEach(t => {
        const type = t.amount > 0 ? '💰' : '💸';
        const amount = ResponseFormatter.formatCurrency(Math.abs(t.amount));
        const category = ResponseFormatter.formatCategory(t.category);
        const date = ResponseFormatter.formatDate(new Date(t.date));
        
        response += `${type} ${amount} - ${category}\n`;
        response += `   ${t.description} (${date})\n\n`;
      });
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao obter transações recentes:', error);
      return '❌ Erro ao consultar transações recentes.';
    }
  }

  /**
   * Obter status do orçamento
   * @param {string} userId - ID do usuário
   * @returns {Promise<string>} - Status do orçamento
   */
  async getBudgetStatus(userId) {
    try {
      const userContext = await this.getUserContext(userId);
      const monthlySpent = userContext.monthlySpent || 0;
      const monthlyLimit = 5000; // Limite padrão - pode ser configurável
      
      const percentage = (monthlySpent / monthlyLimit) * 100;
      const remaining = monthlyLimit - monthlySpent;
      
      let response = `💳 **Status do Orçamento**\n\n`;
      response += `📊 **Gasto atual**: ${ResponseFormatter.formatCurrency(monthlySpent)}\n`;
      response += `🎯 **Limite mensal**: ${ResponseFormatter.formatCurrency(monthlyLimit)}\n`;
      response += `📈 **Utilizado**: ${percentage.toFixed(1)}%\n`;
      response += `💰 **Disponível**: ${ResponseFormatter.formatCurrency(remaining)}\n\n`;
      
      if (percentage >= 100) {
        response += '🚨 **Atenção**: Você ultrapassou seu orçamento mensal!';
      } else if (percentage >= 80) {
        response += '⚠️ **Cuidado**: Você está próximo do limite do orçamento.';
      } else if (percentage >= 60) {
        response += '📊 **Atenção**: Você já gastou mais da metade do orçamento.';
      } else {
        response += '✅ **Parabéns**: Você está dentro do orçamento!';
      }
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao obter status do orçamento:', error);
      return '❌ Erro ao consultar status do orçamento.';
    }
  }

  /**
   * Tratar consulta genérica
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise
   * @returns {Promise<string>} - Resposta genérica
   */
  async handleGenericQuery(userId, analysisResult) {
    try {
      // Tentar identificar o que o usuário quer baseado na descrição
      const { descricao } = analysisResult;
      const text = (descricao || '').toLowerCase();
      
      if (text.includes('saldo') || text.includes('quanto tenho')) {
        return await this.getCurrentBalance(userId);
      }
      
      if (text.includes('gasto') || text.includes('gastei')) {
        return await this.getMonthlyExpenses(userId);
      }
      
      if (text.includes('receita') || text.includes('ganho')) {
        return await this.getMonthlyIncome(userId);
      }
      
      if (text.includes('investimento') || text.includes('portfolio')) {
        return await this.getInvestmentSummary(userId);
      }
      
      // Resposta padrão
      return await this.getFinancialSummary(userId);
      
    } catch (error) {
      console.error('❌ Erro ao processar consulta genérica:', error);
      return '❌ Não entendi sua consulta. Tente perguntar sobre gastos, receitas, saldo ou investimentos.';
    }
  }

  /**
   * Agrupar transações por categoria
   * @param {Array} transactions - Lista de transações
   * @returns {Object} - Transações agrupadas por categoria
   */
  groupTransactionsByCategory(transactions) {
    const grouped = {};
    
    transactions.forEach(t => {
      const category = t.category || 'outros';
      if (!grouped[category]) {
        grouped[category] = {
          total: 0,
          count: 0,
          transactions: []
        };
      }
      
      grouped[category].total += t.amount;
      grouped[category].count += 1;
      grouped[category].transactions.push(t);
    });
    
    return grouped;
  }
}

module.exports = QueryHandler;