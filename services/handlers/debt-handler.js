const BaseHandler = require('./base-handler');
const DataParser = require('../parsers/data-parser');
const ResponseFormatter = require('../formatters/response-formatter');
const moment = require('moment');

/**
 * Handler específico para processamento de dívidas
 * Processa comandos relacionados a registro, consulta e pagamento de dívidas
 */
class DebtHandler extends BaseHandler {
  constructor(databaseService, userService, debtModel) {
    super(databaseService, userService);
    this.debtModel = debtModel;
  }

  /**
   * Processar comando de dívida
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise do Gemini
   * @returns {Promise<string>} - Resposta formatada
   */
  async process(userId, analysisResult) {
    try {
      const { intencao, tipo } = analysisResult;
      
      switch (intencao?.toLowerCase()) {
        case 'registrar_divida':
        case 'nova_divida':
        case 'criar_divida':
          return await this.registerDebt(userId, analysisResult);
          
        case 'listar_dividas':
        case 'minhas_dividas':
        case 'ver_dividas':
          return await this.listDebts(userId, analysisResult);
          
        case 'pagar_divida':
        case 'pagamento_divida':
          return await this.payDebt(userId, analysisResult);
          
        case 'status_dividas':
        case 'resumo_dividas':
          return await this.getDebtStatus(userId);
          
        case 'dividas_atrasadas':
        case 'dividas_vencidas':
          return await this.getOverdueDebts(userId);
          
        case 'proximos_vencimentos':
        case 'dividas_vencendo':
          return await this.getUpcomingDebts(userId);
          
        case 'deletar_divida':
        case 'remover_divida':
          return await this.deleteDebt(userId, analysisResult);
          
        default:
          return this.getHelpMessage();
      }
    } catch (error) {
      return this.handleError(error, userId, analysisResult, 'dívida');
    }
  }

  /**
   * Registrar nova dívida
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Dados da dívida
   * @returns {Promise<string>} - Resposta formatada
   */
  async registerDebt(userId, analysisResult) {
    try {
      const validation = this.validateDebtInput(analysisResult);
      if (!validation.isValid) {
        return ResponseFormatter.formatValidationMessage(validation.errors);
      }

      // Mapear campos do Gemini para o formato esperado
      const creditorName = analysisResult.credor || this.extractCreditorFromDescription(analysisResult.descricao || analysisResult.texto_original);
      const description = analysisResult.descricao || `Dívida registrada`;
      const originalAmount = analysisResult.valor;
      const category = this.mapCategoryFromGemini(analysisResult.categoria);
      const dueDate = analysisResult.data_vencimento;
      const priority = analysisResult.prioridade || 'medium';
      const interestRate = analysisResult.juros;
      const installmentsTotal = analysisResult.parcelas_total;
      const installmentAmount = analysisResult.valor_parcela;
      const notes = analysisResult.observacoes;

      // Processar data de vencimento - se não informada, usar 30 dias a partir de hoje
      let parsedDueDate = null;
      if (dueDate) {
        parsedDueDate = DataParser.parseDate(dueDate);
        if (parsedDueDate < new Date()) {
          // Se a data já passou, assumir que é para o próximo mês/ano
          const nextMonth = new Date();
          nextMonth.setMonth(nextMonth.getMonth() + 1);
          parsedDueDate = nextMonth;
        }
      } else {
        // Data padrão: 30 dias a partir de hoje
        parsedDueDate = new Date();
        parsedDueDate.setDate(parsedDueDate.getDate() + 30);
      }

      const debtData = {
        creditorName: creditorName,
        description: description || `Dívida com ${creditorName}`,
        originalAmount: parseFloat(originalAmount),
        interestRate: interestRate ? parseFloat(interestRate) : null,
        dueDate: parsedDueDate,
        category: category,
        priority: priority,
        installmentsTotal: installmentsTotal ? parseInt(installmentsTotal) : null,
        installmentAmount: installmentAmount ? parseFloat(installmentAmount) : null,
        notes: notes
      };

      const debt = await this.debtModel.createDebt(userId, debtData);

      console.log('💳 Dívida registrada:', debt);
      this.logDebtAction('Dívida registrada', userId, debt);

      return this.formatDebtRegisteredMessage(debt);
    } catch (error) {
      console.error('❌ Erro ao registrar dívida:', error);
      return '❌ Erro ao registrar dívida. Tente novamente.';
    }
  }

  /**
   * Listar dívidas do usuário
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Filtros opcionais
   * @returns {Promise<string>} - Lista formatada de dívidas
   */
  async listDebts(userId, analysisResult) {
    try {
      const { status = 'pending', categoria } = analysisResult;
      
      let debts;
      if (categoria) {
        debts = await this.debtModel.getDebtsByCategory(userId, categoria, status);
      } else {
        debts = await this.debtModel.getUserDebts(userId, status);
      }

      if (!debts || debts.length === 0) {
        return this.getNoDebtsMessage(status, categoria);
      }

      return this.formatDebtsList(debts, status);
    } catch (error) {
      console.error('❌ Erro ao listar dívidas:', error);
      return '❌ Erro ao buscar suas dívidas. Tente novamente.';
    }
  }

  /**
   * Processar pagamento de dívida
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Dados do pagamento
   * @returns {Promise<string>} - Resultado do pagamento
   */
  async payDebt(userId, analysisResult) {
    try {
      const { divida_id: debtId, credor, valor, forma_pagamento: paymentMethod, observacoes: notes } = analysisResult;
      
      let debt;
      if (debtId) {
        debt = await this.debtModel.getDebtById(debtId, userId);
      } else if (credor) {
        // Buscar por nome do credor
        const debts = await this.debtModel.getUserDebts(userId, 'pending');
        debt = debts.find(d => d.creditor_name.toLowerCase().includes(credor.toLowerCase()));
      }

      if (!debt) {
        return '❌ Dívida não encontrada. Use "minhas dívidas" para ver todas as suas dívidas.';
      }

      if (debt.status === 'paid') {
        return '✅ Esta dívida já foi quitada!';
      }

      const amount = parseFloat(valor);
      if (isNaN(amount) || amount <= 0) {
        return '❌ Valor do pagamento deve ser um número positivo.';
      }

      if (amount > parseFloat(debt.current_amount)) {
        return `⚠️ Valor do pagamento (R$ ${amount.toFixed(2)}) é maior que o saldo da dívida (R$ ${parseFloat(debt.current_amount).toFixed(2)}). Confirme o valor.`;
      }

      const paymentData = {
        userId: userId,
        amount: amount,
        paymentMethod: paymentMethod || 'other',
        notes: notes
      };

      const payment = await this.debtModel.addPayment(debt.id, paymentData);
      const updatedDebt = await this.debtModel.getDebtById(debt.id, userId);

      console.log('💰 Pagamento de dívida registrado:', payment);
      this.logDebtAction('Pagamento registrado', userId, updatedDebt);

      return this.formatPaymentMessage(updatedDebt, payment);
    } catch (error) {
      console.error('❌ Erro ao processar pagamento:', error);
      return '❌ Erro ao processar pagamento. Tente novamente.';
    }
  }

  /**
   * Obter status geral das dívidas
   * @param {string} userId - ID do usuário
   * @returns {Promise<string>} - Status formatado
   */
  async getDebtStatus(userId) {
    try {
      const stats = await this.debtModel.getUserDebtStats(userId);
      return this.formatDebtStatsMessage(stats);
    } catch (error) {
      console.error('❌ Erro ao buscar status das dívidas:', error);
      return '❌ Erro ao buscar status das dívidas. Tente novamente.';
    }
  }

  /**
   * Obter dívidas em atraso
   * @param {string} userId - ID do usuário
   * @returns {Promise<string>} - Dívidas em atraso formatadas
   */
  async getOverdueDebts(userId) {
    try {
      const overdueDebts = await this.debtModel.getOverdueDebts(userId);
      
      if (!overdueDebts || overdueDebts.length === 0) {
        return '✅ Parabéns! Você não tem dívidas em atraso.';
      }

      return this.formatOverdueDebtsMessage(overdueDebts);
    } catch (error) {
      console.error('❌ Erro ao buscar dívidas em atraso:', error);
      return '❌ Erro ao buscar dívidas em atraso. Tente novamente.';
    }
  }

  /**
   * Obter próximos vencimentos
   * @param {string} userId - ID do usuário
   * @returns {Promise<string>} - Próximos vencimentos formatados
   */
  async getUpcomingDebts(userId) {
    try {
      const upcomingDebts = await this.debtModel.getUpcomingDebts(userId, 7);
      
      if (!upcomingDebts || upcomingDebts.length === 0) {
        return '📅 Você não tem dívidas vencendo nos próximos 7 dias.';
      }

      return this.formatUpcomingDebtsMessage(upcomingDebts);
    } catch (error) {
      console.error('❌ Erro ao buscar próximos vencimentos:', error);
      return '❌ Erro ao buscar próximos vencimentos. Tente novamente.';
    }
  }

  /**
   * Deletar uma dívida
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Dados da dívida a deletar
   * @returns {Promise<string>} - Resultado da operação
   */
  async deleteDebt(userId, analysisResult) {
    try {
      const { divida_id: debtId, credor, confirmar = false } = analysisResult;
      
      let debt;
      if (debtId) {
        debt = await this.debtModel.getDebtById(debtId, userId);
      } else if (credor) {
        const debts = await this.debtModel.getUserDebts(userId);
        debt = debts.find(d => d.creditor_name.toLowerCase().includes(credor.toLowerCase()));
      }

      if (!debt) {
        return '❌ Dívida não encontrada. Use "minhas dívidas" para ver todas as suas dívidas.';
      }

      if (!confirmar) {
        return `⚠️ Tem certeza que deseja deletar a dívida "${debt.creditor_name}" de R$ ${parseFloat(debt.current_amount).toFixed(2)}?\n\nPara confirmar, envie: "deletar dívida ${debt.creditor_name} confirmar"`;
      }

      await this.debtModel.deleteDebt(debt.id, userId);

      console.log('🗑️ Dívida deletada:', debt);
      this.logDebtAction('Dívida deletada', userId, debt);

      return `✅ Dívida "${debt.creditor_name}" foi deletada com sucesso.`;
    } catch (error) {
      console.error('❌ Erro ao deletar dívida:', error);
      return '❌ Erro ao deletar dívida. Tente novamente.';
    }
  }

  /**
   * Validar dados de entrada para registro de dívida
   * @param {Object} analysisResult - Dados a serem validados
   * @returns {Object} - Resultado da validação
   */
  validateDebtInput(analysisResult) {
    const errors = [];
    const { valor } = analysisResult;
    
    // Validar apenas valor - credor será extraído automaticamente
    if (!valor || parseFloat(valor) <= 0) {
      errors.push('Valor da dívida deve ser maior que zero');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Formatar mensagem de dívida registrada
   * @param {Object} debt - Dívida criada
   * @returns {string} - Mensagem formatada
   */
  formatDebtRegisteredMessage(debt) {
    const dueDateText = debt.due_date ? 
      `\n📅 **Vencimento:** ${moment(debt.due_date).format('DD/MM/YYYY')}` : '';
    
    const installmentsText = debt.installments_total ? 
      `\n📊 **Parcelas:** ${debt.installments_paid}/${debt.installments_total}` : '';
    
    const priorityEmoji = this.getPriorityEmoji(debt.priority);
    
    return `✅ **Dívida registrada com sucesso!**\n\n` +
           `💳 **${debt.creditor_name}**\n` +
           `💰 **Valor:** R$ ${parseFloat(debt.current_amount).toFixed(2)}\n` +
           `📂 **Categoria:** ${debt.category}\n` +
           `${priorityEmoji} **Prioridade:** ${debt.priority}${dueDateText}${installmentsText}\n\n` +
           `💡 *Use "pagar dívida ${debt.creditor_name} R$ [valor]" para registrar pagamentos.*`;
  }

  /**
   * Formatar lista de dívidas
   * @param {Array} debts - Lista de dívidas
   * @param {string} status - Status filtrado
   * @returns {string} - Lista formatada
   */
  formatDebtsList(debts, status) {
    const statusEmoji = {
      'pending': '💳',
      'paid': '✅',
      'overdue': '🚨',
      'negotiating': '🤝'
    };
    
    let message = `${statusEmoji[status] || '📋'} **Suas dívidas:**\n\n`;
    
    debts.forEach((debt, index) => {
      const isOverdue = new Date(debt.due_date) < new Date() && debt.status === 'pending';
      const overdueText = isOverdue ? ' ⚠️ ATRASADA' : '';
      const daysUntilDue = debt.due_date ? 
        Math.ceil((new Date(debt.due_date) - new Date()) / (1000 * 60 * 60 * 24)) : null;
      
      const dueDateText = debt.due_date ? 
        (daysUntilDue !== null ? 
          (daysUntilDue > 0 ? `\n📅 Vence em ${daysUntilDue} dias` : overdueText) :
          `\n📅 ${moment(debt.due_date).format('DD/MM/YYYY')}`) : '';
      
      const priorityEmoji = this.getPriorityEmoji(debt.priority);
      
      message += `${index + 1}. ${priorityEmoji} **${debt.creditor_name}**\n` +
                 `💰 R$ ${parseFloat(debt.current_amount).toFixed(2)}\n` +
                 `📂 ${debt.category}${dueDateText}\n\n`;
    });
    
    message += `💡 *Para pagar uma dívida, use: "pagar dívida [credor] R$ [valor]"*`;
    
    return message;
  }

  /**
   * Formatar mensagem de pagamento
   * @param {Object} debt - Dívida atualizada
   * @param {Object} payment - Pagamento realizado
   * @returns {string} - Mensagem formatada
   */
  formatPaymentMessage(debt, payment) {
    const remainingAmount = parseFloat(debt.current_amount);
    const paidAmount = parseFloat(payment.amount);
    const originalAmount = parseFloat(debt.original_amount);
    const paidPercentage = ((originalAmount - remainingAmount) / originalAmount) * 100;
    
    let message = `✅ **Pagamento registrado!**\n\n` +
                  `💳 **${debt.creditor_name}**\n` +
                  `💰 **Pago:** R$ ${paidAmount.toFixed(2)}\n`;
    
    if (remainingAmount <= 0) {
      message += `🎉 **DÍVIDA QUITADA!** 🎉\n\n` +
                 `Parabéns! Você quitou completamente a dívida com ${debt.creditor_name}! 🏆`;
    } else {
      message += `🔴 **Restante:** R$ ${remainingAmount.toFixed(2)}\n` +
                 `📊 **Progresso:** ${paidPercentage.toFixed(1)}% quitado\n\n` +
                 `💪 Continue assim! Faltam R$ ${remainingAmount.toFixed(2)} para quitar.`;
    }
    
    return message;
  }

  /**
   * Formatar estatísticas das dívidas
   * @param {Object} stats - Estatísticas
   * @returns {string} - Estatísticas formatadas
   */
  formatDebtStatsMessage(stats) {
    let message = `📊 **Resumo das suas dívidas:**\n\n` +
                  `📈 **Total:** ${stats.total} dívidas\n` +
                  `💳 **Ativas:** ${stats.active}\n` +
                  `✅ **Quitadas:** ${stats.paid}\n` +
                  `🚨 **Em atraso:** ${stats.overdue}\n` +
                  `⏰ **Vencendo em 7 dias:** ${stats.upcomingSoon}\n\n` +
                  `💰 **Valor total:** R$ ${stats.totalAmount.toFixed(2)}\n`;
    
    if (stats.overdueAmount > 0) {
      message += `🚨 **Valor em atraso:** R$ ${stats.overdueAmount.toFixed(2)}\n\n`;
    }
    
    if (Object.keys(stats.byCategory).length > 0) {
      message += `📂 **Por categoria:**\n`;
      Object.entries(stats.byCategory).forEach(([category, data]) => {
        message += `• ${category}: ${data.count} dívidas - R$ ${data.amount.toFixed(2)}\n`;
      });
    }
    
    return message;
  }

  /**
   * Formatar dívidas em atraso
   * @param {Array} overdueDebts - Dívidas em atraso
   * @returns {string} - Mensagem formatada
   */
  formatOverdueDebtsMessage(overdueDebts) {
    let message = `🚨 **Dívidas em atraso:**\n\n`;
    
    overdueDebts.forEach((debt, index) => {
      const daysOverdue = Math.ceil((new Date() - new Date(debt.due_date)) / (1000 * 60 * 60 * 24));
      const priorityEmoji = this.getPriorityEmoji(debt.priority);
      
      message += `${index + 1}. ${priorityEmoji} **${debt.creditor_name}**\n` +
                 `💰 R$ ${parseFloat(debt.current_amount).toFixed(2)}\n` +
                 `⏰ ${daysOverdue} dias em atraso\n\n`;
    });
    
    message += `⚠️ **Atenção:** Dívidas em atraso podem gerar juros e multas. Considere quitar o quanto antes.`;
    
    return message;
  }

  /**
   * Formatar próximos vencimentos
   * @param {Array} upcomingDebts - Próximos vencimentos
   * @returns {string} - Mensagem formatada
   */
  formatUpcomingDebtsMessage(upcomingDebts) {
    let message = `📅 **Próximos vencimentos (7 dias):**\n\n`;
    
    upcomingDebts.forEach((debt, index) => {
      const daysUntilDue = Math.ceil((new Date(debt.due_date) - new Date()) / (1000 * 60 * 60 * 24));
      const priorityEmoji = this.getPriorityEmoji(debt.priority);
      
      message += `${index + 1}. ${priorityEmoji} **${debt.creditor_name}**\n` +
                 `💰 R$ ${parseFloat(debt.current_amount).toFixed(2)}\n` +
                 `⏰ Vence em ${daysUntilDue} dias\n\n`;
    });
    
    message += `💡 **Dica:** Organize-se para não atrasar os pagamentos e evitar juros.`;
    
    return message;
  }

  /**
   * Obter emoji para prioridade
   * @param {string} priority - Prioridade da dívida
   * @returns {string} - Emoji correspondente
   */
  getPriorityEmoji(priority) {
    const emojis = {
      'low': '🟢',
      'medium': '🟡',
      'high': '🟠',
      'urgent': '🔴'
    };
    return emojis[priority] || '🟡';
  }

  /**
   * Mensagem quando não há dívidas
   * @param {string} status - Status filtrado
   * @param {string} category - Categoria filtrada
   * @returns {string} - Mensagem
   */
  getNoDebtsMessage(status, category) {
    const statusText = status === 'pending' ? 'ativas' : status;
    const categoryText = category ? ` na categoria "${category}"` : '';
    
    return `📭 Você não tem dívidas ${statusText}${categoryText}.\n\n` +
           `💡 Para registrar uma nova dívida, envie algo como:\n` +
           `"Registrar dívida R$ 1000 cartão Nubank vence dia 15"`;
  }

  /**
   * Mensagem de ajuda
   * @returns {string} - Mensagem de ajuda
   */
  getHelpMessage() {
    return `💳 **Comandos de Dívidas Disponíveis:**\n\n` +
           `📝 **Registrar dívida:**\n` +
           `• "Registrar dívida R$ 5000 cartão Nubank vence dia 15"\n` +
           `• "Devo R$ 2000 para João empréstimo pessoal"\n\n` +
           `📋 **Ver dívidas:**\n` +
           `• "Minhas dívidas"\n` +
           `• "Dívidas ativas"\n` +
           `• "Dívidas quitadas"\n\n` +
           `💰 **Pagar dívida:**\n` +
           `• "Pagar dívida Nubank R$ 500"\n` +
           `• "Paguei R$ 1000 empréstimo João"\n\n` +
           `📊 **Consultas:**\n` +
           `• "Status dívidas"\n` +
           `• "Dívidas em atraso"\n` +
           `• "Próximos vencimentos"\n\n` +
           `🗑️ **Deletar:**\n` +
           `• "Deletar dívida Nubank"`;
  }

  /**
   * Log de ação relacionada a dívida
   * @param {string} action - Ação realizada
   * @param {string} userId - ID do usuário
   * @param {Object} debt - Dívida
   */
  logDebtAction(action, userId, debt) {
    console.log(`💳 ${action}:`, {
      userId,
      debtId: debt.id,
      creditor: debt.creditor_name,
      amount: debt.current_amount
    });
  }

  /**
   * Tratar erros específicos de dívidas
   * @param {Error} error - Erro ocorrido
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Dados da análise
   * @param {string} action - Ação que causou o erro
   * @returns {string} - Mensagem de erro
   */
  handleError(error, userId, analysisResult, action) {
    console.error(`❌ Erro ao processar ${action}:`, error);
    
    if (error.message.includes('não encontrada')) {
      return error.message;
    }
    
    if (error.message.includes('validação')) {
      return `❌ Dados inválidos: ${error.message}`;
    }
    
    return `❌ Erro ao processar ${action}. Tente novamente ou use "ajuda dívidas" para ver os comandos disponíveis.`;
  }

  /**
   * Extrair nome do credor da descrição
   * @param {string} description - Descrição da dívida
   * @returns {string} - Nome do credor
   */
  extractCreditorFromDescription(description) {
     if (!description) return 'Credor não informado';
     
     const lowerDesc = description.toLowerCase();
     
     // Padrões específicos para extrair credor
      const patterns = [
        /(?:dívida|divida)\s+(?:com|do|da)\s+(?:o\s+)?([\w\s]+?)(?:\s+(?:no|na|de)\s+valor|\s+valor|\s+de\s+r\$|\s+r\$|$)/i,
        /(?:cartão|cartao)\s+([\w\s]+?)(?:\s+(?:no|na|de)\s+valor|\s+valor|\s+de\s+r\$|\s+r\$|$)/i,
        /(?:banco|empréstimo|emprestimo)\s+([\w\s]+?)(?:\s+(?:no|na|de)\s+valor|\s+valor|\s+de\s+r\$|\s+r\$|$)/i,
        /(?:financiamento)\s+([\w\s]+?)(?:\s+(?:no|na|de)\s+valor|\s+valor|\s+de\s+r\$|\s+r\$|$)/i,
        /(?:agiota)\s*([\w\s]*?)(?:\s+(?:no|na|de)\s+valor|\s+valor|\s+de\s+r\$|\s+r\$|$)/i
      ];
     
     for (const pattern of patterns) {
       const match = description.match(pattern);
       if (match && match[1] && match[1].trim()) {
         return match[1].trim();
       }
     }
     
     // Buscar por nomes de bancos/instituições conhecidas
     const creditorKeywords = {
       'nubank': 'Nubank',
       'itau': 'Itaú',
       'bradesco': 'Bradesco',
       'santander': 'Santander',
       'caixa': 'Caixa',
       'bb': 'Banco do Brasil',
       'inter': 'Inter',
       'agiota': 'Agiota'
     };
     
     for (const [keyword, name] of Object.entries(creditorKeywords)) {
       if (lowerDesc.includes(keyword)) {
         return name;
       }
     }
     
     // Se contém "agiota" sem nome específico
     if (lowerDesc.includes('agiota')) {
       return 'Agiota';
     }
     
     return 'Credor não identificado';
   }

  /**
   * Mapear categoria do Gemini para formato do banco
   * @param {string} geminiCategory - Categoria do Gemini
   * @returns {string} - Categoria mapeada
   */
  mapCategoryFromGemini(geminiCategory) {
    if (!geminiCategory) return 'other';
    
    const categoryMap = {
      'pessoal': 'personal',
      'cartão': 'credit_card',
      'cartao': 'credit_card',
      'empréstimo': 'loan',
      'emprestimo': 'loan',
      'financiamento': 'financing',
      'fornecedor': 'supplier',
      'outros': 'other',
      'other': 'other'
    };
    
    const lowerCategory = geminiCategory.toLowerCase();
    return categoryMap[lowerCategory] || 'other';
  }
}

module.exports = DebtHandler;