const BaseHandler = require('./base-handler');
const DataParser = require('../parsers/data-parser');
const ResponseFormatter = require('../formatters/response-formatter');
const moment = require('moment');

/**
 * Handler específico para processamento de metas financeiras
 * Processa comandos relacionados a criação, consulta e gerenciamento de metas
 */
class GoalHandler extends BaseHandler {
  constructor(databaseService, userService, goalModel) {
    super(databaseService, userService);
    this.goalModel = goalModel;
  }

  /**
   * Processar comando de meta
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise do Gemini
   * @returns {Promise<string>} - Resposta formatada
   */
  async process(userId, analysisResult) {
    try {
      const { acao, tipo } = analysisResult;
      
      switch (acao?.toLowerCase()) {
        case 'criar_meta':
        case 'nova_meta':
          return await this.createGoal(userId, analysisResult);
          
        case 'listar_metas':
        case 'minhas_metas':
        case 'ver_metas':
          return await this.listGoals(userId, analysisResult);
          
        case 'progresso_meta':
        case 'status_meta':
          return await this.getGoalProgress(userId, analysisResult);
          
        case 'atualizar_meta':
        case 'adicionar_progresso':
          return await this.updateGoalProgress(userId, analysisResult);
          
        case 'deletar_meta':
        case 'remover_meta':
          return await this.deleteGoal(userId, analysisResult);
          
        case 'categorias_meta':
        case 'tipos_meta':
          return await this.listGoalCategories(analysisResult);
          
        case 'estatisticas_metas':
        case 'resumo_metas':
          return await this.getGoalStats(userId);
          
        default:
          return this.getHelpMessage();
      }
    } catch (error) {
      return this.handleError(error, userId, analysisResult, 'meta');
    }
  }

  /**
   * Criar nova meta
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Dados da meta
   * @returns {Promise<string>} - Resposta formatada
   */
  async createGoal(userId, analysisResult) {
    try {
      const validation = this.validateGoalInput(analysisResult);
      if (!validation.isValid) {
        return ResponseFormatter.formatValidationMessage(validation.errors);
      }

      const {
        titulo,
        descricao,
        valor_meta: targetAmount,
        categoria,
        tipo_meta: goalType,
        data_limite: targetDate,
        prioridade = 'medium'
      } = analysisResult;

      // Processar data limite se fornecida
      let parsedTargetDate = null;
      if (targetDate) {
        parsedTargetDate = DataParser.parseDate(targetDate);
        if (parsedTargetDate < new Date()) {
          return '❌ A data limite não pode ser no passado. Escolha uma data futura.';
        }
      }

      const goalData = {
        title: titulo,
        description: descricao,
        targetAmount: parseFloat(targetAmount),
        category: categoria,
        goalType: goalType,
        targetDate: parsedTargetDate,
        priority: prioridade
      };

      const goal = await this.goalModel.createGoal(userId, goalData);

      console.log('🎯 Meta criada:', goal);
      this.logGoalAction('Meta criada', userId, goal);

      return this.formatGoalCreatedMessage(goal);
    } catch (error) {
      console.error('❌ Erro ao criar meta:', error);
      return '❌ Erro ao criar meta. Tente novamente.';
    }
  }

  /**
   * Listar metas do usuário
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Filtros opcionais
   * @returns {Promise<string>} - Lista formatada de metas
   */
  async listGoals(userId, analysisResult) {
    try {
      const { status = 'active', categoria } = analysisResult;
      
      let goals;
      if (categoria) {
        goals = await this.goalModel.getGoalsByCategory(userId, categoria, status);
      } else {
        goals = await this.goalModel.getUserGoals(userId, status);
      }

      if (!goals || goals.length === 0) {
        return this.getNoGoalsMessage(status, categoria);
      }

      return this.formatGoalsList(goals, status);
    } catch (error) {
      console.error('❌ Erro ao listar metas:', error);
      return '❌ Erro ao buscar suas metas. Tente novamente.';
    }
  }

  /**
   * Obter progresso de uma meta específica
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Dados da consulta
   * @returns {Promise<string>} - Progresso formatado
   */
  async getGoalProgress(userId, analysisResult) {
    try {
      const { meta_id: goalId, titulo } = analysisResult;
      
      let goal;
      if (goalId) {
        goal = await this.goalModel.getGoalById(goalId, userId);
      } else if (titulo) {
        // Buscar por título
        const goals = await this.goalModel.getUserGoals(userId, 'active');
        goal = goals.find(g => g.title.toLowerCase().includes(titulo.toLowerCase()));
      }

      if (!goal) {
        return '❌ Meta não encontrada. Use "minhas metas" para ver todas as suas metas.';
      }

      const history = await this.goalModel.getGoalProgressHistory(goal.id, 5);
      
      return this.formatGoalProgressMessage(goal, history);
    } catch (error) {
      console.error('❌ Erro ao buscar progresso da meta:', error);
      return '❌ Erro ao buscar progresso da meta. Tente novamente.';
    }
  }

  /**
   * Atualizar progresso de uma meta
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Dados da atualização
   * @returns {Promise<string>} - Resultado da atualização
   */
  async updateGoalProgress(userId, analysisResult) {
    try {
      const { meta_id: goalId, titulo, valor, tipo_atualizacao = 'adicionar' } = analysisResult;
      
      let goal;
      if (goalId) {
        goal = await this.goalModel.getGoalById(goalId, userId);
      } else if (titulo) {
        const goals = await this.goalModel.getUserGoals(userId, 'active');
        goal = goals.find(g => g.title.toLowerCase().includes(titulo.toLowerCase()));
      }

      if (!goal) {
        return '❌ Meta não encontrada. Use "minhas metas" para ver todas as suas metas.';
      }

      if (goal.status !== 'active') {
        return '❌ Não é possível atualizar uma meta que não está ativa.';
      }

      const amount = parseFloat(valor);
      if (isNaN(amount) || amount <= 0) {
        return '❌ Valor deve ser um número positivo.';
      }

      let updatedGoal;
      if (tipo_atualizacao === 'definir') {
        updatedGoal = await this.goalModel.updateGoalProgress(goal.id, amount, 'manual_update');
      } else {
        updatedGoal = await this.goalModel.addToGoalProgress(goal.id, amount, 'manual_update');
      }

      console.log('🎯 Progresso da meta atualizado:', updatedGoal);
      this.logGoalAction('Progresso atualizado', userId, updatedGoal);

      return this.formatGoalUpdateMessage(updatedGoal, amount, tipo_atualizacao);
    } catch (error) {
      console.error('❌ Erro ao atualizar progresso da meta:', error);
      return '❌ Erro ao atualizar progresso da meta. Tente novamente.';
    }
  }

  /**
   * Deletar uma meta
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Dados da meta a deletar
   * @returns {Promise<string>} - Resultado da operação
   */
  async deleteGoal(userId, analysisResult) {
    try {
      const { meta_id: goalId, titulo, confirmar = false } = analysisResult;
      
      let goal;
      if (goalId) {
        goal = await this.goalModel.getGoalById(goalId, userId);
      } else if (titulo) {
        const goals = await this.goalModel.getUserGoals(userId);
        goal = goals.find(g => g.title.toLowerCase().includes(titulo.toLowerCase()));
      }

      if (!goal) {
        return '❌ Meta não encontrada. Use "minhas metas" para ver todas as suas metas.';
      }

      if (!confirmar) {
        return `⚠️ Tem certeza que deseja deletar a meta "${goal.title}"?\n\nPara confirmar, envie: "deletar meta ${goal.title} confirmar"`;
      }

      await this.goalModel.deleteGoal(goal.id, userId);

      console.log('🗑️ Meta deletada:', goal);
      this.logGoalAction('Meta deletada', userId, goal);

      return `✅ Meta "${goal.title}" foi deletada com sucesso.`;
    } catch (error) {
      console.error('❌ Erro ao deletar meta:', error);
      return '❌ Erro ao deletar meta. Tente novamente.';
    }
  }

  /**
   * Listar categorias de metas disponíveis
   * @param {Object} analysisResult - Filtros opcionais
   * @returns {Promise<string>} - Lista de categorias
   */
  async listGoalCategories(analysisResult) {
    try {
      const { tipo_meta: goalType } = analysisResult;
      
      const categories = await this.goalModel.getGoalCategories(goalType);
      
      if (!categories || categories.length === 0) {
        return '❌ Nenhuma categoria encontrada.';
      }

      return this.formatCategoriesList(categories, goalType);
    } catch (error) {
      console.error('❌ Erro ao buscar categorias:', error);
      return '❌ Erro ao buscar categorias. Tente novamente.';
    }
  }

  /**
   * Obter estatísticas das metas do usuário
   * @param {string} userId - ID do usuário
   * @returns {Promise<string>} - Estatísticas formatadas
   */
  async getGoalStats(userId) {
    try {
      const stats = await this.goalModel.getUserGoalStats(userId);
      const goalsDueSoon = await this.goalModel.getGoalsDueSoon(userId, 7);
      
      return this.formatGoalStatsMessage(stats, goalsDueSoon);
    } catch (error) {
      console.error('❌ Erro ao buscar estatísticas:', error);
      return '❌ Erro ao buscar estatísticas das metas. Tente novamente.';
    }
  }

  /**
   * Validar dados de entrada para criação de meta
   * @param {Object} analysisResult - Dados a serem validados
   * @returns {Object} - Resultado da validação
   */
  validateGoalInput(analysisResult) {
    const errors = [];
    const { titulo, valor_meta, categoria, tipo_meta } = analysisResult;
    
    if (!titulo || titulo.trim().length === 0) {
      errors.push('Título da meta é obrigatório');
    }
    
    if (!valor_meta || parseFloat(valor_meta) <= 0) {
      errors.push('Valor da meta deve ser maior que zero');
    }
    
    if (!categoria || categoria.trim().length === 0) {
      errors.push('Categoria é obrigatória');
    }
    
    if (!tipo_meta || !['saving', 'expense_limit', 'income_target', 'investment', 'debt_payment'].includes(tipo_meta)) {
      errors.push('Tipo de meta inválido. Use: saving, expense_limit, income_target, investment ou debt_payment');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Formatar mensagem de meta criada
   * @param {Object} goal - Meta criada
   * @returns {string} - Mensagem formatada
   */
  formatGoalCreatedMessage(goal) {
    const targetDateText = goal.target_date ? 
      `\n📅 **Data limite:** ${moment(goal.target_date).format('DD/MM/YYYY')}` : '';
    
    const typeEmoji = this.getGoalTypeEmoji(goal.goal_type);
    
    return `✅ **Meta criada com sucesso!**\n\n` +
           `${typeEmoji} **${goal.title}**\n` +
           `💰 **Valor:** R$ ${parseFloat(goal.target_amount).toFixed(2)}\n` +
           `📂 **Categoria:** ${goal.category}\n` +
           `📊 **Progresso:** R$ 0,00 (0%)${targetDateText}\n\n` +
           `💡 *Dica: Suas transações serão automaticamente vinculadas a esta meta quando possível.*`;
  }

  /**
   * Formatar lista de metas
   * @param {Array} goals - Lista de metas
   * @param {string} status - Status filtrado
   * @returns {string} - Lista formatada
   */
  formatGoalsList(goals, status) {
    const statusEmoji = {
      'active': '🎯',
      'completed': '✅',
      'paused': '⏸️',
      'cancelled': '❌'
    };
    
    let message = `${statusEmoji[status] || '📋'} **Suas metas ${status === 'active' ? 'ativas' : status}:**\n\n`;
    
    goals.forEach((goal, index) => {
      const progress = parseFloat(goal.progress_percentage || 0);
      const progressBar = this.createProgressBar(progress);
      const typeEmoji = this.getGoalTypeEmoji(goal.goal_type);
      
      const daysRemaining = goal.days_remaining ? 
        `\n⏰ ${goal.days_remaining} dias restantes` : '';
      
      message += `${index + 1}. ${typeEmoji} **${goal.title}**\n` +
                 `💰 R$ ${parseFloat(goal.current_amount).toFixed(2)} / R$ ${parseFloat(goal.target_amount).toFixed(2)}\n` +
                 `${progressBar} ${progress.toFixed(1)}%${daysRemaining}\n\n`;
    });
    
    message += `💡 *Para ver detalhes de uma meta, use: "progresso meta [nome da meta]"*`;
    
    return message;
  }

  /**
   * Formatar mensagem de progresso da meta
   * @param {Object} goal - Meta
   * @param {Array} history - Histórico de progresso
   * @returns {string} - Mensagem formatada
   */
  formatGoalProgressMessage(goal, history) {
    const progress = parseFloat(goal.progress_percentage || 0);
    const progressBar = this.createProgressBar(progress);
    const typeEmoji = this.getGoalTypeEmoji(goal.goal_type);
    
    const remaining = parseFloat(goal.target_amount) - parseFloat(goal.current_amount);
    const daysText = goal.days_remaining ? 
      `\n⏰ **Prazo:** ${goal.days_remaining} dias restantes` : '';
    
    let message = `${typeEmoji} **${goal.title}**\n\n` +
                  `💰 **Progresso:** R$ ${parseFloat(goal.current_amount).toFixed(2)} / R$ ${parseFloat(goal.target_amount).toFixed(2)}\n` +
                  `${progressBar} **${progress.toFixed(1)}%**\n` +
                  `💸 **Faltam:** R$ ${remaining.toFixed(2)}${daysText}\n\n`;
    
    if (goal.description) {
      message += `📝 **Descrição:** ${goal.description}\n\n`;
    }
    
    if (history && history.length > 0) {
      message += `📈 **Últimas atualizações:**\n`;
      history.slice(0, 3).forEach(entry => {
        const date = moment(entry.created_at).format('DD/MM');
        const changeText = entry.change_amount > 0 ? 
          `+R$ ${entry.change_amount.toFixed(2)}` : 
          `R$ ${entry.change_amount.toFixed(2)}`;
        message += `• ${date}: ${changeText}\n`;
      });
    }
    
    return message;
  }

  /**
   * Formatar mensagem de atualização de meta
   * @param {Object} goal - Meta atualizada
   * @param {number} amount - Valor adicionado/definido
   * @param {string} type - Tipo de atualização
   * @returns {string} - Mensagem formatada
   */
  formatGoalUpdateMessage(goal, amount, type) {
    const progress = (parseFloat(goal.current_amount) / parseFloat(goal.target_amount)) * 100;
    const progressBar = this.createProgressBar(progress);
    
    const actionText = type === 'definir' ? 
      `definido para R$ ${amount.toFixed(2)}` : 
      `adicionado R$ ${amount.toFixed(2)}`;
    
    let message = `✅ **Progresso ${actionText}!**\n\n` +
                  `🎯 **${goal.title}**\n` +
                  `💰 R$ ${parseFloat(goal.current_amount).toFixed(2)} / R$ ${parseFloat(goal.target_amount).toFixed(2)}\n` +
                  `${progressBar} **${progress.toFixed(1)}%**\n\n`;
    
    if (progress >= 100) {
      message += `🎉 **PARABÉNS! Meta atingida!** 🎉\n\n` +
                 `Você conseguiu alcançar sua meta "${goal.title}"! 🏆`;
    } else {
      const remaining = parseFloat(goal.target_amount) - parseFloat(goal.current_amount);
      message += `💪 Continue assim! Faltam apenas R$ ${remaining.toFixed(2)} para atingir sua meta.`;
    }
    
    return message;
  }

  /**
   * Formatar lista de categorias
   * @param {Array} categories - Lista de categorias
   * @param {string} goalType - Tipo de meta filtrado
   * @returns {string} - Lista formatada
   */
  formatCategoriesList(categories, goalType) {
    const typeText = goalType ? ` para ${goalType}` : '';
    let message = `📂 **Categorias de metas${typeText}:**\n\n`;
    
    const groupedByType = {};
    categories.forEach(cat => {
      if (!groupedByType[cat.goal_type]) {
        groupedByType[cat.goal_type] = [];
      }
      groupedByType[cat.goal_type].push(cat);
    });
    
    Object.keys(groupedByType).forEach(type => {
      const typeEmoji = this.getGoalTypeEmoji(type);
      const typeName = this.getGoalTypeName(type);
      message += `${typeEmoji} **${typeName}:**\n`;
      
      groupedByType[type].forEach(cat => {
        message += `• ${cat.icon || '📌'} ${cat.name}\n`;
      });
      message += '\n';
    });
    
    return message;
  }

  /**
   * Formatar estatísticas das metas
   * @param {Object} stats - Estatísticas
   * @param {Array} goalsDueSoon - Metas próximas do vencimento
   * @returns {string} - Estatísticas formatadas
   */
  formatGoalStatsMessage(stats, goalsDueSoon) {
    let message = `📊 **Resumo das suas metas:**\n\n` +
                  `📈 **Total:** ${stats.total} metas\n` +
                  `🎯 **Ativas:** ${stats.active}\n` +
                  `✅ **Concluídas:** ${stats.completed}\n` +
                  `⏸️ **Pausadas:** ${stats.paused}\n\n` +
                  `💰 **Valor total das metas:** R$ ${stats.totalTargetAmount.toFixed(2)}\n` +
                  `💸 **Progresso total:** R$ ${stats.totalCurrentAmount.toFixed(2)}\n`;
    
    const overallProgress = stats.totalTargetAmount > 0 ? 
      (stats.totalCurrentAmount / stats.totalTargetAmount) * 100 : 0;
    const progressBar = this.createProgressBar(overallProgress);
    message += `${progressBar} **${overallProgress.toFixed(1)}%**\n\n`;
    
    if (goalsDueSoon && goalsDueSoon.length > 0) {
      message += `⚠️ **Metas próximas do vencimento:**\n`;
      goalsDueSoon.forEach(goal => {
        message += `• ${goal.title} (${goal.days_remaining} dias)\n`;
      });
      message += '\n';
    }
    
    return message;
  }

  /**
   * Criar barra de progresso visual
   * @param {number} percentage - Percentual (0-100)
   * @returns {string} - Barra de progresso
   */
  createProgressBar(percentage) {
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * Obter emoji para tipo de meta
   * @param {string} goalType - Tipo da meta
   * @returns {string} - Emoji correspondente
   */
  getGoalTypeEmoji(goalType) {
    const emojis = {
      'saving': '💰',
      'expense_limit': '🚫',
      'income_target': '📈',
      'investment': '📊',
      'debt_payment': '💳'
    };
    return emojis[goalType] || '🎯';
  }

  /**
   * Obter nome amigável para tipo de meta
   * @param {string} goalType - Tipo da meta
   * @returns {string} - Nome amigável
   */
  getGoalTypeName(goalType) {
    const names = {
      'saving': 'Economia',
      'expense_limit': 'Limite de Gastos',
      'income_target': 'Meta de Renda',
      'investment': 'Investimento',
      'debt_payment': 'Pagamento de Dívida'
    };
    return names[goalType] || 'Meta';
  }

  /**
   * Mensagem quando não há metas
   * @param {string} status - Status filtrado
   * @param {string} category - Categoria filtrada
   * @returns {string} - Mensagem
   */
  getNoGoalsMessage(status, category) {
    const statusText = status === 'active' ? 'ativas' : status;
    const categoryText = category ? ` na categoria "${category}"` : '';
    
    return `📭 Você não tem metas ${statusText}${categoryText}.\n\n` +
           `💡 Para criar uma nova meta, envie algo como:\n` +
           `"Criar meta economizar R$ 1000 para viagem até dezembro"`;
  }

  /**
   * Mensagem de ajuda
   * @returns {string} - Mensagem de ajuda
   */
  getHelpMessage() {
    return `🎯 **Comandos de Metas Disponíveis:**\n\n` +
           `📝 **Criar meta:**\n` +
           `• "Criar meta economizar R$ 1000 para viagem"\n` +
           `• "Nova meta limite gastos alimentação R$ 500"\n\n` +
           `📋 **Ver metas:**\n` +
           `• "Minhas metas"\n` +
           `• "Metas ativas"\n` +
           `• "Metas concluídas"\n\n` +
           `📊 **Progresso:**\n` +
           `• "Progresso meta viagem"\n` +
           `• "Status meta casa própria"\n\n` +
           `✏️ **Atualizar:**\n` +
           `• "Adicionar R$ 100 meta viagem"\n` +
           `• "Definir progresso meta R$ 500"\n\n` +
           `🗑️ **Deletar:**\n` +
           `• "Deletar meta viagem"\n\n` +
           `📂 **Outros:**\n` +
           `• "Categorias de metas"\n` +
           `• "Resumo metas"`;
  }

  /**
   * Log de ação relacionada a meta
   * @param {string} action - Ação realizada
   * @param {string} userId - ID do usuário
   * @param {Object} goal - Meta
   */
  logGoalAction(action, userId, goal) {
    console.log(`🎯 ${action}:`, {
      userId,
      goalId: goal.id,
      title: goal.title,
      targetAmount: goal.target_amount,
      currentAmount: goal.current_amount
    });
  }

  /**
   * Tratar erros específicos de metas
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
    
    return `❌ Erro ao processar ${action}. Tente novamente ou use "ajuda metas" para ver os comandos disponíveis.`;
  }
}

module.exports = GoalHandler;