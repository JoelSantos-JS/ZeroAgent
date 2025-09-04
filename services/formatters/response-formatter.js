/**
 * Módulo de formatadores para respostas do sistema
 * Centraliza toda a lógica de formatação de mensagens para o usuário
 */

class ResponseFormatter {
  /**
   * Formatar resposta de despesa
   * @param {Object} transaction - Dados da transação
   * @param {Object} analysisResult - Resultado da análise
   * @param {boolean} isInstallment - Se é parcelamento
   * @returns {string} - Resposta formatada
   */
  static formatExpenseResponse(transaction, analysisResult, isInstallment = false) {
    const { valor, categoria, descricao, confianca } = analysisResult;
    const categoriaFormatada = this.formatCategory(categoria);
    
    // Verificar se a categoria foi inferida automaticamente (baixa confiança ou descrição genérica)
    const isGenericDescription = descricao && (
      descricao.toLowerCase().includes('compra') ||
      descricao.toLowerCase().includes('gastei') ||
      descricao.toLowerCase().includes('paguei')
    ) && !descricao.toLowerCase().includes(categoria.toLowerCase());
    
    const isLowConfidenceCategory = confianca < 0.8 || isGenericDescription;
    
    // Mensagens personalizadas por categoria (apenas quando há certeza)
    const mensagensCategoria = {
      'alimentacao': 'Anotei seu gasto com alimentação! 🍽️',
      'transporte': 'Registrei sua despesa de transporte! 🚗',
      'supermercado': 'Compra do supermercado anotada! 🛒',
      'lazer': 'Diversão também é importante! 🎉',
      'saude': 'Cuidar da saúde é investimento! 💊',
      'casa': 'Despesa doméstica registrada! 🏠',
      'roupas': 'Nova peça no guarda-roupa! 👕',
      'educacao': 'Investindo em conhecimento! 📚',
      'tecnologia': 'Upgrade tecnológico registrado! 💻',
      'servicos': 'Serviço contratado! 🔧',
      'outros': 'Despesa registrada com sucesso! ✅'
    };
    
    // Usar mensagem neutra se a categoria foi inferida automaticamente
    const mensagemInicial = isLowConfidenceCategory ? 
      'Despesa registrada com sucesso! ✅' : 
      (mensagensCategoria[categoria] || mensagensCategoria['outros']);
    
    let response;
    
    if (isInstallment && transaction.is_installment && transaction.installment_info) {
      // Resposta específica para parcelamento
      const info = transaction.installment_info;
      response = `${mensagemInicial} 💳\n` +
                `💰 **Parcela ${info.currentInstallment}/${info.totalInstallments}**: R$ ${info.installmentAmount.toFixed(2)}\n` +
                `📊 **Total**: R$ ${info.totalAmount.toFixed(2)}`;
      
      // Adicionar categoria apenas se tiver certeza
      if (!isLowConfidenceCategory) {
        response += ` em ${categoriaFormatada}`;
      }
    } else {
      // Resposta normal
      response = `${mensagemInicial}\n` +
                `💰 **R$ ${valor.toFixed(2)}`;
      
      // Adicionar categoria apenas se tiver certeza
      if (!isLowConfidenceCategory) {
        response += `** em ${categoriaFormatada}`;
      } else {
        response += `**`;
      }
    }
    
    // Se a categoria foi inferida, perguntar para confirmar
    if (isLowConfidenceCategory) {
      response += `\n\n🤔 **Classifiquei como "${categoriaFormatada}". Está correto?**\n`;
      response += `💡 *Se não, me diga o que foi comprado para ajustar a categoria.*`;
    }
    
    return response;
  }

  /**
   * Formatar resposta de receita
   * @param {Object} transaction - Dados da transação
   * @param {Object} analysisResult - Resultado da análise
   * @returns {string} - Resposta formatada
   */
  static formatIncomeResponse(transaction, analysisResult) {
    const { valor, categoria } = analysisResult;
    const categoriaFormatada = this.formatCategory(categoria);
    
    // Mensagens personalizadas por categoria
    const mensagensCategoria = {
      'salario': 'Salário recebido! 💼',
      'freelance': 'Trabalho freelance registrado! 💻',
      'vendas': 'Venda realizada com sucesso! 💰',
      'bonus': 'Bônus recebido! 🎉',
      'investimento': 'Retorno de investimento! 📈',
      'jogos': 'Ganho em jogos registrado! 🎰',
      'presente': 'Presente recebido! 🎁',
      'outros': 'Receita registrada com sucesso! ✅'
    };
    
    const mensagemInicial = mensagensCategoria[categoria] || mensagensCategoria['outros'];
    
    return `${mensagemInicial}\n` +
           `💰 **R$ ${valor.toFixed(2)}** em ${categoriaFormatada}`;
  }

  /**
   * Formatar resposta de investimento
   * @param {Object} transaction - Dados da transação
   * @param {Object} analysisResult - Resultado da análise
   * @returns {string} - Resposta formatada
   */
  static formatInvestmentResponse(transaction, analysisResult) {
    const { valor, categoria, analise, dica } = analysisResult;
    const categoriaFormatada = this.formatCategory(categoria);
    
    // Mensagens personalizadas por categoria de investimento
    const mensagensCategoria = {
      'acoes': 'Investimento em ações registrado! 📈',
      'fundos': 'Aplicação em fundos realizada! 💼',
      'renda_fixa': 'Investimento em renda fixa! 🏦',
      'criptomoedas': 'Crypto investimento registrado! ₿',
      'imoveis': 'Investimento imobiliário! 🏠',
      'tesouro': 'Tesouro Direto aplicado! 🏛️',
      'cdb': 'CDB contratado! 💰',
      'outros': 'Investimento registrado! 📊'
    };
    
    const mensagemInicial = mensagensCategoria[categoria] || mensagensCategoria['outros'];
    
    return `${mensagemInicial}\n` +
           `💰 **R$ ${valor.toFixed(2)}** em ${categoriaFormatada}\n` +
           `📊 ${analise || 'Investimento adicionado ao seu portfólio'}\n` +
           `💡 ${dica || 'Continue diversificando seus investimentos!'}`;
  }

  /**
   * Formatar categoria para exibição
   * @param {string} categoria - Categoria original
   * @returns {string} - Categoria formatada
   */
  static formatCategory(categoria) {
    if (!categoria) return 'Outros';
    
    const categoryNames = {
      'alimentacao': 'Alimentação',
      'transporte': 'Transporte',
      'supermercado': 'Supermercado',
      'lazer': 'Lazer',
      'saude': 'Saúde',
      'casa': 'Casa',
      'roupas': 'Roupas',
      'educacao': 'Educação',
      'tecnologia': 'Tecnologia',
      'servicos': 'Serviços',
      'salario': 'Salário',
      'freelance': 'Freelance',
      'vendas': 'Vendas',
      'bonus': 'Bônus',
      'investimento': 'Investimento',
      'jogos': 'Jogos',
      'presente': 'Presente',
      'acoes': 'Ações',
      'fundos': 'Fundos',
      'renda_fixa': 'Renda Fixa',
      'criptomoedas': 'Criptomoedas',
      'imoveis': 'Imóveis',
      'tesouro': 'Tesouro Direto',
      'cdb': 'CDB',
      'outros': 'Outros'
    };
    
    return categoryNames[categoria.toLowerCase()] || 
           categoria.charAt(0).toUpperCase() + categoria.slice(1);
  }

  /**
   * Formatar valor monetário
   * @param {number} value - Valor numérico
   * @returns {string} - Valor formatado
   */
  static formatCurrency(value) {
    if (typeof value !== 'number' || isNaN(value)) {
      return 'R$ 0,00';
    }
    
    return `R$ ${value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  /**
   * Formatar data para exibição
   * @param {Date} date - Data a ser formatada
   * @returns {string} - Data formatada
   */
  static formatDate(date) {
    if (!date || !(date instanceof Date)) {
      return 'Data inválida';
    }
    
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    
    // Verificar se é hoje
    if (date.toDateString() === today.toDateString()) {
      return 'hoje';
    }
    
    // Verificar se é ontem
    if (date.toDateString() === yesterday.toDateString()) {
      return 'ontem';
    }
    
    // Formato padrão
    return date.toLocaleDateString('pt-BR');
  }

  /**
   * Formatar mensagem de erro
   * @param {string} transactionType - Tipo da transação
   * @param {number} value - Valor da transação
   * @param {string} customMessage - Mensagem personalizada (opcional)
   * @returns {string} - Mensagem de erro formatada
   */
  static formatErrorMessage(transactionType, value, customMessage = null) {
    if (customMessage) {
      return `❌ ${customMessage}`;
    }
    
    const typeNames = {
      'expense': 'despesa',
      'income': 'receita',
      'investment': 'investimento'
    };
    
    const typeName = typeNames[transactionType] || transactionType;
    const formattedValue = this.formatCurrency(value);
    
    return `❌ Erro ao registrar ${typeName} de ${formattedValue}. Tente novamente.`;
  }

  /**
   * Formatar mensagem de validação
   * @param {Array} errors - Lista de erros
   * @returns {string} - Mensagem de validação formatada
   */
  static formatValidationMessage(errors) {
    if (!errors || errors.length === 0) {
      return '';
    }
    
    if (errors.length === 1) {
      return `❌ ${errors[0]}`;
    }
    
    return `❌ Problemas encontrados:\n${errors.map(error => `• ${error}`).join('\n')}`;
  }

  /**
   * Formatar mensagem de boas-vindas
   * @param {string} userName - Nome do usuário (opcional)
   * @returns {string} - Mensagem de boas-vindas
   */
  static formatWelcomeMessage(userName = null) {
    const greeting = userName ? `Olá, **${userName}**!` : 'Olá!';
    
    return `👋 ${greeting}\n\n` +
           `🤖 Eu sou o **Vox**, seu assistente financeiro e de vendas. Posso ajudar você a:\n\n` +
           `💰 **Finanças Pessoais:**\n` +
           `• Registrar gastos\n` +
           `• Registrar receitas\n` +
           `• Registrar investimentos\n` +
           `• Ver resumos financeiros\n\n` +
           `🛒 **Gestão de Vendas:**\n` +
           `• Registrar vendas\n` +
           `• Consultar estoque\n` +
           `• Relatórios de vendas\n` +
           `• Analytics de produtos\n\n` +
           `📊 **Relatórios:**\n` +
           `• Resumo financeiro\n` +
           `• Performance de vendas\n` +
           `• Top produtos\n` +
           `• Alertas de estoque\n\n` +
           `Como posso ajudar você hoje?`;
  }

  /**
   * Formatar resumo de transações
   * @param {Object} summary - Dados do resumo
   * @returns {string} - Resumo formatado
   */
  static formatTransactionSummary(summary) {
    const {
      totalTransactions = 0,
      totalSpent = 0,
      totalIncome = 0,
      monthlySpent = 0,
      topCategories = []
    } = summary;
    
    let response = `📊 **Resumo Financeiro**\n\n`;
    response += `📈 **Total de transações:** ${totalTransactions}\n`;
    response += `💸 **Total gasto:** ${this.formatCurrency(totalSpent)}\n`;
    response += `💰 **Total recebido:** ${this.formatCurrency(totalIncome)}\n`;
    response += `📅 **Gasto este mês:** ${this.formatCurrency(monthlySpent)}\n`;
    
    if (topCategories.length > 0) {
      response += `\n🏆 **Top categorias:**\n`;
      topCategories.slice(0, 3).forEach((cat, index) => {
        response += `${index + 1}. ${this.formatCategory(cat.category)}: ${this.formatCurrency(cat.total)}\n`;
      });
    }
    
    return response;
  }
}

module.exports = ResponseFormatter;