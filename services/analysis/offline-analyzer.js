// Offline Analyzer - Análise offline baseada em palavras-chave
const logger = require('../../utils/logger');

class OfflineAnalyzer {
  constructor() {
    this.name = 'OfflineAnalyzer';
  }

  // Análise offline melhorada com contexto
  getEnhancedOfflineAnalysis(message, userContext = {}) {
    const analysis = this.getOfflineAnalysis(message);
    
    // Melhorar análise com contexto do usuário
    if (userContext.recentTransactions) {
      const recentCategories = userContext.recentTransactions.map(t => t.categoria);
      const mostUsedCategory = this.getMostFrequentCategory(recentCategories);
      
      if (analysis.categoria === 'outros' && mostUsedCategory) {
        analysis.categoria = mostUsedCategory;
        analysis.confianca += 0.1;
        analysis.analise += ` (Baseado no histórico recente: ${mostUsedCategory})`;
      }
    }
    
    // Adicionar dicas contextuais
    if (analysis.tipo === 'despesa_variavel' && analysis.valor > 100) {
      analysis.dica = 'Gasto alto detectado! Considere revisar seu orçamento para esta categoria.';
    } else if (analysis.tipo === 'receita') {
      analysis.dica = 'Ótimo! Lembre-se de separar uma parte para investimentos.';
    }
    
    return analysis;
  }

  // Encontrar categoria mais frequente
  getMostFrequentCategory(categories) {
    if (!categories || categories.length === 0) return null;
    
    const frequency = {};
    categories.forEach(cat => {
      frequency[cat] = (frequency[cat] || 0) + 1;
    });
    
    return Object.keys(frequency).reduce((a, b) => 
      frequency[a] > frequency[b] ? a : b
    );
  }

  // Análise offline baseada em palavras-chave
  getOfflineAnalysis(message) {
    const messageLower = message.toLowerCase();
    
    const analysis = {
      tipo: 'outros',
      valor: 0,
      categoria: 'outros',
      descricao: message,
      data: 'hoje',
      intencao: 'registrar',
      confianca: 0.7,
      analise: 'Análise baseada em palavras-chave',
      dica: 'Continue registrando suas transações para melhor controle financeiro',
      produto_nome: null
    };

    // Extrair valor
    const valorMatch = message.match(/\d+[.,]?\d*/g);
    if (valorMatch) {
      analysis.valor = parseFloat(valorMatch[0].replace(',', '.'));
    }

    // Primeiro verificar se é consulta (prioridade alta)
    if (this.isQuery(messageLower)) {
      analysis.tipo = 'consulta';
      analysis.intencao = 'consultar_gastos';
      analysis.categoria = 'consulta';
      analysis.confianca = 0.95;
      analysis.dica = 'Vou buscar seus dados financeiros para você!';
    }
    // Identificar receitas (expandido)
    else if (this.isRevenue(messageLower)) {
      analysis.tipo = 'receita';
      analysis.categoria = this.getRevenueCategory(messageLower);
      analysis.intencao = 'registrar_receita';
      analysis.confianca = 0.9;
    }
    // Identificar despesas fixas
    else if (this.isFixedExpense(messageLower)) {
      analysis.tipo = 'despesa_fixa';
      analysis.categoria = this.getFixedExpenseCategory(messageLower);
      analysis.intencao = 'registrar_despesa';
    }
    // Identificar despesas variáveis por categoria
    else if (this.isVariableExpense(messageLower)) {
      analysis.tipo = 'despesa_variavel';
      analysis.categoria = this.getVariableExpenseCategory(messageLower);
      analysis.intencao = 'registrar_despesa';
    }
    // Identificar investimentos
    else if (this.isInvestment(messageLower)) {
      analysis.tipo = 'investimento';
      analysis.categoria = this.getInvestmentCategory(messageLower);
      analysis.intencao = 'registrar_investimento';
    }
    // Identificar despesas genéricas
    else if (this.isGenericExpense(messageLower)) {
      analysis.tipo = 'despesa_variavel';
      analysis.categoria = 'outros';
      analysis.intencao = 'registrar_despesa';
      analysis.confianca = 0.8;
    }
    
    // Garantir que categoria nunca seja undefined
    if (!analysis.categoria || analysis.categoria === 'undefined') {
      analysis.categoria = 'outros';
    }

    return analysis;
  }

  // Verificar se é consulta
  isQuery(messageLower) {
    const queryKeywords = [
      'quanto', 'quais', 'relatório', 'consulta', 'gastos', 'receitas',
      'saldo', 'extrato', 'resumo', 'meus gastos', 'minhas receitas', 'balanço',
      'total', 'gastei este mês', 'gastei hoje',
      'mostre', 'detalhe', 'cada', 'lista', 'veja', 'exiba',
      'me fale', 'conte', 'explique', 'me diga', 'mostra', 'apresente',
      'discrimine', 'especifique', 'detalha'
    ];
    
    return queryKeywords.some(keyword => messageLower.includes(keyword));
  }

  // Verificar se é receita
  isRevenue(messageLower) {
    const revenueKeywords = [
      'recebi', 'ganhei', 'salário', 'renda', 'bonus', 'bônus',
      'freelance', 'vendi', 'venda', 'lucro', 'rendimento', 'entrada',
      'recebimento', 'pagamento recebido', 'dinheiro que recebi', 'dinheiro que ganhei'
    ];
    
    return revenueKeywords.some(keyword => messageLower.includes(keyword));
  }

  // Obter categoria de receita
  getRevenueCategory(messageLower) {
    if (messageLower.includes('salário') || messageLower.includes('salario')) {
      return 'salario';
    } else if (messageLower.includes('freelance') || messageLower.includes('freela')) {
      return 'freelance';
    } else if (messageLower.includes('vendi') || messageLower.includes('venda') || messageLower.includes('vendas')) {
      return 'vendas';
    } else if (messageLower.includes('bonus') || messageLower.includes('bônus')) {
      return 'bonus';
    } else {
      return 'outros';
    }
  }

  // Verificar se é despesa fixa
  isFixedExpense(messageLower) {
    const fixedExpenseKeywords = [
      'aluguel', 'financiamento', 'prestação', 'seguro'
    ];
    
    return fixedExpenseKeywords.some(keyword => messageLower.includes(keyword));
  }

  // Obter categoria de despesa fixa
  getFixedExpenseCategory(messageLower) {
    if (messageLower.includes('aluguel')) {
      return 'aluguel';
    } else if (messageLower.includes('financiamento') || messageLower.includes('prestação')) {
      return 'financiamento';
    } else if (messageLower.includes('seguro')) {
      return 'seguro';
    } else {
      return 'outros';
    }
  }

  // Verificar se é despesa variável
  isVariableExpense(messageLower) {
    const variableExpenseKeywords = [
      'comida', 'restaurante', 'supermercado', 'uber', 'gasolina', 'transporte',
      'cinema', 'lazer', 'diversão', 'farmacia', 'remedio', 'medico',
      'roupa', 'shopping', 'loja'
    ];
    
    return variableExpenseKeywords.some(keyword => messageLower.includes(keyword));
  }

  // Obter categoria de despesa variável
  getVariableExpenseCategory(messageLower) {
    if (messageLower.includes('comida') || messageLower.includes('restaurante')) {
      return 'alimentacao';
    } else if (messageLower.includes('supermercado')) {
      return 'supermercado';
    } else if (messageLower.includes('uber') || messageLower.includes('gasolina') || messageLower.includes('transporte')) {
      return 'transporte';
    } else if (messageLower.includes('cinema') || messageLower.includes('lazer') || messageLower.includes('diversão')) {
      return 'lazer';
    } else if (messageLower.includes('farmacia') || messageLower.includes('remedio') || messageLower.includes('medico')) {
      return 'saude';
    } else if (messageLower.includes('roupa') || messageLower.includes('shopping') || messageLower.includes('loja')) {
      return 'roupas';
    } else {
      return 'outros';
    }
  }

  // Verificar se é investimento
  isInvestment(messageLower) {
    const investmentKeywords = [
      'investi', 'aplicação', 'poupança', 'ações', 'fundos', 'tesouro', 'cdb'
    ];
    
    return investmentKeywords.some(keyword => messageLower.includes(keyword));
  }

  // Obter categoria de investimento
  getInvestmentCategory(messageLower) {
    if (messageLower.includes('ações') || messageLower.includes('acoes')) {
      return 'acoes';
    } else if (messageLower.includes('fundos')) {
      return 'fundos';
    } else if (messageLower.includes('tesouro')) {
      return 'tesouro';
    } else if (messageLower.includes('poupança') || messageLower.includes('poupanca')) {
      return 'poupanca';
    } else if (messageLower.includes('cdb')) {
      return 'cdb';
    } else {
      return 'aplicacao';
    }
  }

  // Verificar se é despesa genérica
  isGenericExpense(messageLower) {
    const genericExpenseKeywords = [
      'gastei', 'comprei', 'paguei', 'gasto', 'despesa', 'saiu'
    ];
    
    return genericExpenseKeywords.some(keyword => messageLower.includes(keyword));
  }

  // Extrair valor da mensagem
  extractValue(message) {
    const valorMatch = message.match(/\d+[.,]?\d*/g);
    if (valorMatch) {
      return parseFloat(valorMatch[0].replace(',', '.'));
    }
    return 0;
  }

  // Extrair data da mensagem
  extractDate(message) {
    const messageLower = message.toLowerCase();
    
    if (messageLower.includes('hoje')) {
      return 'hoje';
    } else if (messageLower.includes('ontem')) {
      return 'ontem';
    } else if (messageLower.includes('semana passada')) {
      return 'semana passada';
    }
    
    // Tentar extrair data específica
    const dateMatch = message.match(/(\d{1,2})[\/-](\d{1,2})([\/-](\d{2,4}))?/);
    if (dateMatch) {
      return dateMatch[0];
    }
    
    return 'hoje';
  }
}

module.exports = OfflineAnalyzer;