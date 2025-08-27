const whatsappService = require('./whatsapp-service');
const databaseService = require('../config/database');
const userService = require('./user-service');
const geminiService = require('./gemini-service');
const logger = require('../utils/logger');
const moment = require('moment');

class FinancialAgent {
  constructor() {
    this.isInitialized = false;
    this.processingQueue = new Map(); // Para evitar processamento duplicado
    this.conversationHistory = new Map(); // phoneNumber -> array of last messages
    this.maxHistorySize = 5; // Manter últimas 5 mensagens por usuário
  }

  // Inicializar o agente financeiro
  async initialize() {
    try {
      console.log('🤖 Inicializando Agente Financeiro...');
      
      // Inicializar serviços
      await databaseService.initialize();
      await geminiService.initialize();
      
      // Configurar processador de mensagens no WhatsApp Service
      whatsappService.setMessageProcessor(this);
      
      this.isInitialized = true;
      console.log('✅ Agente Financeiro inicializado com sucesso!');
      logger.info('Agente Financeiro inicializado');
      
    } catch (error) {
      console.error('❌ Erro ao inicializar Agente Financeiro:', error);
      logger.error('Erro na inicialização do Agente Financeiro', { error: error.message });
      throw error;
    }
  }

  // Processar mensagem recebida do WhatsApp
  async processMessage(message) {
    const messageId = message.id._serialized;
    
    // Evitar processamento duplicado
    if (this.processingQueue.has(messageId)) {
      console.log('⚠️ Mensagem já está sendo processada:', messageId);
      return null;
    }
    
    this.processingQueue.set(messageId, true);
    
    try {
      console.log(`🔄 Processando mensagem: ${message.body}`);
      
      // Adicionar mensagem do usuário ao histórico
      this.addToConversationHistory(message.from, message.body, 'user');
      
      // Verificar se usuário está autenticado
      const authStatus = await this.checkUserAuthentication(message.from);
      
      if (!authStatus.isAuthenticated) {
        // Processar fluxo de autenticação
        const authResponse = await this.handleAuthenticationFlow(message.from, message.body, authStatus.step);
        return authResponse;
      }
      
      // Usuário autenticado - processar mensagem normalmente
      const user = authStatus.user;
      
      // Obter contexto da conversa
      const conversationContext = this.getConversationContext(message.from);
      
      // Analisar se é uma mensagem contextual
      const contextAnalysis = this.analyzeContextualMessage(message.body, conversationContext);
      
      // Processar mensagem com contexto
      let analysisResult;
      if (contextAnalysis.isContextual) {
        console.log('🔗 Mensagem contextual detectada:', contextAnalysis);
        analysisResult = {
          tipo: 'consulta',
          intencao: contextAnalysis.originalIntent || 'consultar_gastos',
          categoria: 'consulta',
          valor: 0,
          descricao: message.body,
          confianca: 0.9,
          analise: 'Análise contextual baseada no histórico',
          dica: 'Vou buscar os detalhes solicitados!'
        };
      } else {
        // Processar mensagem com Gemini
        const userContext = await this.getUserContext(user.id);
        analysisResult = await geminiService.processFinancialMessage(message.body, userContext);
      }
      
      console.log('🧠 Análise do Gemini:', analysisResult);
      
      // Salvar análise no histórico
      const history = this.conversationHistory.get(message.from);
      if (history && history.length > 0) {
        history[history.length - 1].analysis = analysisResult;
      }
      
      // Processar baseado no tipo identificado
      let response;
      switch (analysisResult.tipo) {
        case 'receita':
          response = await this.processIncomeTransaction(user.id, analysisResult);
          break;
        case 'despesa_fixa':
        case 'despesa_variavel':
          response = await this.processExpenseTransaction(user.id, analysisResult);
          break;
        case 'investimento':
          response = await this.processInvestmentTransaction(user.id, analysisResult);
          break;
        case 'consulta':
          // Verificar se é consulta detalhada
          if (analysisResult.intencao === 'consultar_gastos_detalhado' || 
              (contextAnalysis.isContextual && contextAnalysis.referenceType.includes('consulta'))) {
            response = await this.processDetailedQuery(user.id, analysisResult);
          } else {
            response = await this.processQuery(user.id, analysisResult);
          }
          break;
        default:
          response = await this.processOtherMessage(user.id, analysisResult);
      }
      
      logger.info('Mensagem processada com sucesso', {
        userId: user.id,
        messageType: analysisResult.tipo,
        confidence: analysisResult.confianca
      });
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error);
      logger.error('Erro no processamento de mensagem', {
        messageId,
        error: error.message
      });
      
      return '❌ Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em alguns instantes.';
      
    } finally {
      // Remover da fila de processamento
      setTimeout(() => {
        this.processingQueue.delete(messageId);
      }, 5000); // Manter por 5 segundos para evitar duplicatas
    }
  }

  // Adicionar mensagem ao histórico de conversa
   addToConversationHistory(phoneNumber, message, type = 'user') {
     if (!this.conversationHistory.has(phoneNumber)) {
       this.conversationHistory.set(phoneNumber, []);
     }
     
     const history = this.conversationHistory.get(phoneNumber);
     history.push({
       message: message,
       type: type, // 'user' ou 'bot'
       timestamp: new Date(),
       analysis: null
     });
     
     // Manter apenas as últimas mensagens
     if (history.length > this.maxHistorySize) {
       history.shift();
     }
   }
   
   // Obter contexto da conversa
   getConversationContext(phoneNumber) {
     const history = this.conversationHistory.get(phoneNumber) || [];
     return history.slice(-3); // Últimas 3 mensagens para contexto
   }
   
   // Analisar se mensagem atual é contextual baseada no histórico
    analyzeContextualMessage(message, history) {
      const messageLower = message.toLowerCase();
      
      // Palavras que indicam referência a mensagem anterior
      const contextualWords = {
        consulta: ['mostre', 'detalhe', 'cada', 'lista', 'veja', 'exiba', 'me fale', 'conte', 
                  'explique', 'isso', 'elas', 'eles', 'me diga', 'mostra', 'apresente',
                  'discrimine', 'especifique', 'detalha', 'uma por uma', 'separadamente'],
        confirmacao: ['sim', 'ok', 'certo', 'confirmo', 'pode', 'vai', 'continua', 'prossiga'],
        negacao: ['não', 'nao', 'cancel', 'para', 'stop', 'volta', 'sair']
      };
      
      // Verificar diferentes tipos de contexto
      if (history.length > 0) {
        const lastMessage = history[history.length - 1];
        const lastBotMessage = history.slice().reverse().find(h => h.type === 'bot');
        
        // 1. Referência direta a consulta anterior
        const hasConsultaWord = contextualWords.consulta.some(word => messageLower.includes(word));
        if (hasConsultaWord && lastMessage.analysis && lastMessage.analysis.tipo === 'consulta') {
          return {
            isContextual: true,
            referenceType: 'consulta_detalhada',
            originalIntent: 'consultar_gastos_detalhado',
            confidence: 0.95
          };
        }
        
        // 2. Mensagens muito curtas após consulta (provável continuação)
        if (message.length <= 20 && lastMessage.analysis && lastMessage.analysis.tipo === 'consulta') {
          const hasConfirmacao = contextualWords.confirmacao.some(word => messageLower.includes(word));
          if (hasConfirmacao) {
            return {
              isContextual: true,
              referenceType: 'confirmacao_consulta',
              originalIntent: 'consultar_gastos_detalhado',
              confidence: 0.9
            };
          }
        }
        
        // 3. Pronomes e referências implícitas
        const pronouns = ['isso', 'elas', 'eles', 'essa', 'essas', 'este', 'esta'];
        const hasPronoun = pronouns.some(word => messageLower.includes(word));
        if (hasPronoun && history.length >= 2) {
          const recentConsulta = history.slice(-3).find(h => h.analysis && h.analysis.tipo === 'consulta');
          if (recentConsulta) {
            return {
              isContextual: true,
              referenceType: 'pronome_referencia',
              originalIntent: 'consultar_gastos_detalhado',
              confidence: 0.85
            };
          }
        }
        
        // 4. Padrão de pergunta seguida de especificação
        if (history.length >= 2) {
          const penultimate = history[history.length - 2];
          if (penultimate.analysis && penultimate.analysis.tipo === 'consulta' && 
              messageLower.length < 30 && hasConsultaWord) {
            return {
              isContextual: true,
              referenceType: 'especificacao_consulta',
              originalIntent: 'consultar_gastos_detalhado',
              confidence: 0.9
            };
          }
        }
      }
      
      return { isContextual: false };
    }

   // Verificar autenticação do usuário
    async checkUserAuthentication(phoneNumber) {
      try {
        console.log(`🔍 Verificando autenticação para: ${phoneNumber}`);
        
        // Verificar se existe sessão ativa
        const session = await databaseService.getUserSession(phoneNumber);
        console.log(`📋 Sessão encontrada:`, session);
        
        if (session && session.is_active) {
          const user = await userService.getUserById(session.user_id);
          console.log(`👤 Usuário encontrado:`, user?.name);
          
          return {
            isAuthenticated: true,
            user: user,
            step: null
          };
        }
      
      // Verificar se está no processo de autenticação
      const authProcess = await databaseService.getAuthProcess(phoneNumber);
      
      if (authProcess) {
        return {
          isAuthenticated: false,
          user: null,
          step: authProcess.step
        };
      }
      
      // Novo usuário - iniciar processo de autenticação
      return {
        isAuthenticated: false,
        user: null,
        step: 'welcome'
      };
      
    } catch (error) {
      console.error('❌ Erro ao verificar autenticação:', error);
      return {
        isAuthenticated: false,
        user: null,
        step: 'welcome'
      };
    }
  }

  // Gerenciar fluxo de autenticação
  async handleAuthenticationFlow(phoneNumber, message, step) {
    try {
      switch (step) {
        case 'welcome':
          // Iniciar processo de autenticação
          await databaseService.createAuthProcess(phoneNumber, 'email');
          return '👋 Olá! Bem-vindo ao **Financial Agent**! 🤖💰\n\n' +
                 'Sou seu assistente financeiro pessoal e vou te ajudar a:\n' +
                 '💰 Registrar gastos e receitas\n' +
                 '📊 Acompanhar seu orçamento\n' +
                 '📈 Analisar seus hábitos financeiros\n' +
                 '🛒 Gerenciar produtos e compras\n\n' +
                 '🔐 **Para sua segurança**, preciso que você se identifique primeiro.\n\n' +
                 '📧 **Digite seu email:**';
        
        case 'email':
          // Validar email e solicitar senha
          const email = message.trim().toLowerCase();
          
          if (!this.isValidEmail(email)) {
            return '❌ Email inválido. Por favor, digite um email válido:';
          }
          
          await databaseService.updateAuthProcess(phoneNumber, 'password', { email });
          return '✅ **Email registrado com sucesso!**\n\n🔑 **Agora digite sua senha:**\n\n💡 *Sua senha deve ter pelo menos 6 caracteres*';
        
        case 'password':
          // Validar credenciais
          const authProcess = await databaseService.getAuthProcess(phoneNumber);
          const userEmail = authProcess.data.email;
          const password = message.trim();
          
          // Autenticar com Firebase
          const authResult = await userService.authenticateUser(userEmail, password);
          
          if (authResult.success) {
            // Criar sessão
            await databaseService.createUserSession(phoneNumber, authResult.user.id);
            await databaseService.deleteAuthProcess(phoneNumber);
            
            return `🎉 **Autenticação realizada com sucesso!**\n\n` +
                   `👋 Olá, **${authResult.user.name}**! Seja bem-vindo(a)!\n\n` +
                   `🤖 **Agora estou pronto para te ajudar!** Você pode:\n\n` +
                   `💰 *"Gastei 50 reais no supermercado"*\n` +
                   `💵 *"Recebi 1000 reais de salário"*\n` +
                   `📊 *"Quanto gastei este mês?"*\n` +
                   `🛒 *"Comprei um notebook por 2000 reais"*\n` +
                   `📈 *"Investi 500 reais na poupança"*\n\n` +
                   `✨ **Como posso te ajudar hoje?**`;
          } else {
             // Falha na autenticação
             await databaseService.updateAuthProcess(phoneNumber, 'email');
             return '❌ **Email ou senha incorretos.**\n\n🔄 Vamos tentar novamente!\n\n📧 **Digite seu email:**';
          }
        
        default:
           await databaseService.deleteAuthProcess(phoneNumber);
           return this.handleAuthenticationFlow(phoneNumber, message, 'welcome');
      }
      
    } catch (error) {
       console.error('❌ Erro no fluxo de autenticação:', error);
       await databaseService.deleteAuthProcess(phoneNumber);
       return '⚠️ **Ops! Algo deu errado.**\n\n🔄 Vamos recomeçar!\n\n👋 Olá! Bem-vindo ao **Financial Agent**! 🤖💰\n\n📧 **Digite seu email para começar:**';
    }
  }

  // Validar formato de email
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Obter contexto do usuário
  async getUserContext(userId) {
    try {
      const stats = await userService.getUserStats(userId);
      const recentTransactions = await databaseService.getUserTransactions(userId, 5);
      
      return {
        totalSpent: stats.totalSpent,
        monthlySpent: stats.monthlySpent,
        recentTransactions: recentTransactions.map(t => ({
          value: t.amount,
          category: t.category,
          description: t.description,
          date: t.date
        })),
        topCategories: stats.topCategories
      };
    } catch (error) {
      console.error('❌ Erro ao obter contexto do usuário:', error);
      return {};
    }
  }

  // Processar transação de despesa (fixa ou variável)
  async processExpenseTransaction(userId, analysisResult) {
    try {
      const { valor, categoria, descricao, data, tipo, analise, dica } = analysisResult;
      
      // Processar data
      const transactionDate = this.parseDate(data);
      
      // Registrar transação no banco
      const transaction = await databaseService.createTransaction(
        userId,
        valor,
        categoria,
        descricao,
        transactionDate,
        'other'  // Tipo da transação (enum expense_type)
      );
      
      console.log(`💸 ${tipo.toUpperCase()} registrada:`, transaction);
      
      // Obter contexto atualizado para resposta personalizada
      const userContext = await this.getUserContext(userId);
      
      // Gerar resposta mais humana e natural
       const tipoFormatado = tipo === 'despesa_fixa' ? 'despesa fixa' : 'despesa variável';
       const categoriaFormatada = categoria ? categoria.charAt(0).toUpperCase() + categoria.slice(1) : 'Outros';
      
      // Mensagens mais naturais baseadas na categoria
      const mensagensCategoria = {
        'alimentacao': 'Anotei seu gasto com alimentação! 🍽️',
        'transporte': 'Registrei sua despesa de transporte! 🚗',
        'supermercado': 'Compra do supermercado anotada! 🛒',
        'lazer': 'Diversão também é importante! 🎉',
        'saude': 'Cuidar da saúde é investimento! 💊',
        'casa': 'Despesa doméstica registrada! 🏠',
        'roupas': 'Nova peça no guarda-roupa! 👕',
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

  // Processar transação de receita
  async processIncomeTransaction(userId, analysisResult) {
    try {
      const { valor, categoria, descricao, data, analise, dica } = analysisResult;
      
      // Processar data
      const transactionDate = this.parseDate(data);
      
      // Registrar receita no banco usando tabela revenues
      const transaction = await databaseService.createRevenue(
        userId,
        valor,
        categoria,
        descricao,
        transactionDate,
        'other'  // Source da receita
      );
      
      console.log('💰 Receita registrada:', transaction);
      
      // Obter contexto atualizado para resposta personalizada
      const userContext = await this.getUserContext(userId);
      
      // Gerar resposta mais humana e natural
      const categoriaFormatada = categoria ? categoria.charAt(0).toUpperCase() + categoria.slice(1) : 'Outros';
      
      // Mensagens mais naturais baseadas na categoria
      const mensagensCategoria = {
        'salario': 'Salário recebido! 💼',
        'freelance': 'Trabalho freelance registrado! 💻',
        'vendas': 'Venda realizada com sucesso! 💰',
        'bonus': 'Bônus recebido! 🎉',
        'investimento': 'Retorno de investimento! 📈',
        'outros': 'Receita registrada com sucesso! ✅'
      };
      
      const mensagemInicial = mensagensCategoria[categoria] || mensagensCategoria['outros'];
      
      let response = `${mensagemInicial}\n\n`;
      response += `💰 **R$ ${valor.toFixed(2)}** em ${categoriaFormatada}\n`;
      
      // Dicas personalizadas para receitas
      const dicasPersonalizadas = {
        'salario': 'Que tal separar uma parte para investimentos? 💡',
        'freelance': 'Considere guardar 20% para impostos! 📊',
        'vendas': 'Ótimo! Continue focando nas vendas! 🚀',
        'bonus': 'Uma boa oportunidade para investir ou quitar dívidas! 💪',
        'investimento': 'Seus investimentos estão dando retorno! Continue assim! 📈'
      };
      
      const dicaFinal = dica || dicasPersonalizadas[categoria] || 'Continue registrando suas receitas para ter controle total das finanças! 📈';
      response += `💡 ${dicaFinal}`;
      
      logger.info('Receita registrada', {
        userId,
        transactionId: transaction.id,
        value: valor,
        category: categoria
      });
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao processar receita:', error);
      logger.error('Erro ao processar receita', {
        userId,
        analysisResult,
        error: error.message
      });
      
      return `❌ Erro ao registrar receita de R$ ${analysisResult.valor}. Tente novamente.`;
    }
  }

  // Processar transação de investimento
  async processInvestmentTransaction(userId, analysisResult) {
    try {
      const { valor, categoria, descricao, data, analise, dica } = analysisResult;
      
      // Processar data
      const transactionDate = this.parseDate(data);
      
      // Registrar investimento no banco
      const transaction = await databaseService.createTransaction(
        userId,
        valor,
        categoria,
        descricao,
        transactionDate,
        'expense'  // Investimentos como despesa no sistema
      );
      
      console.log('📈 Investimento registrado:', transaction);
      
      // Também registrar como produto se houver nome específico
      if (analysisResult.produto_nome) {
        await databaseService.createProduct(
          userId,
          analysisResult.produto_nome,
          categoria,
          valor,
          transactionDate
        );
      }
      
      // Obter contexto atualizado
      const userContext = await this.getUserContext(userId);
      
      // Gerar resposta no formato do analista financeiro
      const currentDateTime = new Date().toLocaleString('pt-BR');
      const response = `✅ INVESTIMENTO registrado: R$ ${valor.toFixed(2)} em ${categoria.toUpperCase()} em ${currentDateTime}\n📊 Impacto: ${analise || 'Investimento adicionado ao seu portfólio'}\n💡 Dica: ${dica || 'Parabéns por investir! Continue diversificando seus investimentos.'}`;
      
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

  // Processar consulta
  async processQuery(userId, analysisResult) {
    try {
      const { intencao } = analysisResult;
      
      console.log('📊 Processando consulta:', intencao);
      
      let response;
      
      switch (intencao) {
        case 'consultar_gastos_mes':
        case 'gastos_mes':
          response = await this.getMonthlyExpenses(userId);
          break;
        case 'consultar_gastos_categoria':
          response = await this.getCategoryExpenses(userId, analysisResult.categoria);
          break;
        case 'consultar_produtos':
        case 'listar_produtos':
          response = await this.getUserProducts(userId);
          break;
        case 'consultar_saldo':
        case 'saldo':
          response = await this.getUserBalance(userId);
          break;
        case 'relatorio':
        case 'resumo':
          response = await this.getUserSummary(userId);
          break;
        default:
          response = await this.getGeneralStats(userId);
      }
      
      logger.info('Consulta processada', {
        userId,
        queryType: intencao
      });
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao processar consulta:', error);
      logger.error('Erro ao processar consulta', {
        userId,
        analysisResult,
        error: error.message
      });
      
      return '❌ Erro ao processar sua consulta. Tente novamente.';
    }
  }

  // Processar consulta detalhada
  async processDetailedQuery(userId, analysisResult) {
    try {
      console.log('🔍 Processando consulta detalhada');
      
      // Obter transações recentes do usuário
      const transactions = await databaseService.getUserTransactions(userId, 10);
      
      if (transactions.length === 0) {
        return '📊 Você ainda não possui transações registradas.';
      }
      
      let response = `📊 **Suas últimas transações:**\n\n`;
      
      transactions.forEach((transaction, index) => {
         const date = moment(transaction.transaction_date).format('DD/MM/YYYY HH:mm');
         const value = parseFloat(transaction.value);
         const isRevenue = transaction.transaction_type === 'revenue';
         
         // Emojis por categoria
         const categoryEmojis = {
           'alimentacao': '🍽️',
           'transporte': '🚗',
           'lazer': '🎉',
           'saude': '🏥',
           'educacao': '📚',
           'casa': '🏠',
           'roupas': '👕',
           'salario': '💼',
           'freelance': '💻',
           'vendas': '🛒',
           'aplicacao': '📈',
           'outros': '📋'
         };
         
         const categoryEmoji = categoryEmojis[transaction.category] || '📋';
         const typeEmoji = isRevenue ? '💰' : '💸';
         const valueColor = isRevenue ? '+' : '-';
         
         response += `${typeEmoji} ${categoryEmoji} **${transaction.category.toUpperCase()}**\n`;
         response += `   💵 ${valueColor}R$ ${value.toFixed(2)}`;
         response += ` | 📅 ${date}\n`;
         
         if (transaction.description && transaction.description.trim()) {
           response += `   📝 ${transaction.description}\n`;
         }
         
         response += '\n';
       });
      
      // Adicionar resumo
      const totalExpenses = transactions
        .filter(t => t.transaction_type === 'expense')
        .reduce((sum, t) => sum + parseFloat(t.value), 0);
      
      const totalRevenues = transactions
        .filter(t => t.transaction_type === 'revenue')
        .reduce((sum, t) => sum + parseFloat(t.value), 0);
      
      response += `📈 **Resumo das últimas ${transactions.length} transações:**\n`;
      response += `💸 Gastos: R$ ${totalExpenses.toFixed(2)}\n`;
      response += `💰 Receitas: R$ ${totalRevenues.toFixed(2)}\n`;
      response += `📊 Saldo: R$ ${(totalRevenues - totalExpenses).toFixed(2)}`;
      
      logger.info('Consulta detalhada processada', {
        userId,
        transactionCount: transactions.length
      });
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao processar consulta detalhada:', error);
      logger.error('Erro ao processar consulta detalhada', {
        userId,
        error: error.message
      });
      
      return '❌ Erro ao processar consulta detalhada. Tente novamente.';
    }
  }

  // Processar outras mensagens
  async processOtherMessage(userId, analysisResult) {
    try {
      // Se a confiança for muito baixa, pedir esclarecimento
      if (analysisResult.confianca < 0.5) {
        return '🤔 Não consegui entender sua mensagem. Você pode tentar algo como:\n\n' +
               '• "Gastei 50 reais no supermercado"\n' +
               '• "Comprei um celular por 800 reais"\n' +
               '• "Quanto gastei este mês?"\n' +
               '• "Mostre meus produtos"';
      }
      
      // Tentar processar como gasto genérico se houver valor
      if (analysisResult.valor > 0) {
        return await this.processExpenseTransaction(userId, {
          ...analysisResult,
          tipo: 'gasto',
          categoria: 'outros'
        });
      }
      
      // Resposta padrão
      return '👋 Olá! Sou seu assistente financeiro. Posso ajudar você a:\n\n' +
             '💰 Registrar gastos\n' +
             '🛒 Registrar produtos\n' +
             '📊 Consultar relatórios\n' +
             '💳 Ver resumos financeiros\n\n' +
             'Como posso ajudar você hoje?';
      
    } catch (error) {
      console.error('❌ Erro ao processar mensagem genérica:', error);
      return '❌ Erro ao processar mensagem. Tente novamente.';
    }
  }

  // Obter gastos mensais
  async getMonthlyExpenses(userId) {
    try {
      const currentDate = new Date();
      const expenses = await databaseService.getUserMonthlyExpenses(
        userId,
        currentDate.getFullYear(),
        currentDate.getMonth() + 1
      );
      
      const total = Object.values(expenses).reduce((sum, value) => sum + value, 0);
      
      if (total === 0) {
        return '📊 Você ainda não registrou gastos este mês.';
      }
      
      let response = `📊 **Gastos de ${moment().format('MMMM/YYYY')}**\n\n`;
      response += `💰 **Total: R$ ${total.toFixed(2)}**\n\n`;
      
      const sortedExpenses = Object.entries(expenses)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5);
      
      response += '**Por categoria:**\n';
      for (const [category, amount] of sortedExpenses) {
        const percentage = ((amount / total) * 100).toFixed(1);
        response += `• ${category}: R$ ${amount.toFixed(2)} (${percentage}%)\n`;
      }
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao obter gastos mensais:', error);
      return '❌ Erro ao consultar gastos mensais.';
    }
  }

  // Obter gastos por categoria
  async getCategoryExpenses(userId, category) {
    try {
      const currentDate = new Date();
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      const transactions = await databaseService.getUserTransactionsByCategory(
        userId,
        category,
        startOfMonth,
        endOfMonth
      );
      
      if (transactions.length === 0) {
        return `📊 Você não tem gastos em ${category} este mês.`;
      }
      
      const total = transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
      
      let response = `📊 **Gastos em ${category} - ${moment().format('MMMM/YYYY')}**\n\n`;
      response += `💰 **Total: R$ ${total.toFixed(2)}**\n`;
      response += `📈 **Transações: ${transactions.length}**\n\n`;
      
      response += '**Últimas transações:**\n';
      transactions.slice(0, 5).forEach(t => {
        const date = moment(t.date).format('DD/MM');
        response += `• ${date}: R$ ${parseFloat(t.amount).toFixed(2)} - ${t.description || 'Sem descrição'}\n`;
      });
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao obter gastos por categoria:', error);
      return '❌ Erro ao consultar gastos por categoria.';
    }
  }

  // Obter produtos do usuário
  async getUserProducts(userId) {
    try {
      const products = await databaseService.getUserProducts(userId, 10);
      
      if (products.length === 0) {
        return '🛒 Você ainda não registrou nenhum produto.';
      }
      
      let response = `🛒 **Seus produtos (${products.length} registrados)**\n\n`;
      
      products.forEach(product => {
        const date = moment(product.purchase_date).format('DD/MM/YYYY');
        response += `• **${product.product_name}**\n`;
        response += `  💰 R$ ${parseFloat(product.price).toFixed(2)}\n`;
        response += `  📅 ${date}\n`;
        if (product.product_category) {
          response += `  🏷️ ${product.product_category}\n`;
        }
        response += '\n';
      });
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao obter produtos:', error);
      return '❌ Erro ao consultar produtos.';
    }
  }

  // Obter resumo do usuário
  async getUserSummary(userId) {
    try {
      const stats = await userService.getUserStats(userId);
      
      let response = `📊 **Resumo Financeiro**\n\n`;
      response += `💰 **Total gasto:** R$ ${stats.totalSpent.toFixed(2)}\n`;
      response += `📅 **Este mês:** R$ ${stats.monthlySpent.toFixed(2)}\n`;
      response += `📈 **Transações:** ${stats.totalTransactions}\n`;
      response += `🛒 **Produtos:** ${stats.totalProducts}\n\n`;
      
      if (stats.topCategories.length > 0) {
        response += '**Top categorias este mês:**\n';
        stats.topCategories.forEach(cat => {
          response += `• ${cat.category}: R$ ${cat.amount.toFixed(2)}\n`;
        });
      }
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao obter resumo:', error);
      return '❌ Erro ao gerar resumo.';
    }
  }

  // Obter estatísticas gerais
  async getGeneralStats(userId) {
    try {
      const stats = await userService.getUserStats(userId);
      
      return `📊 Você tem ${stats.totalTransactions} transações registradas, ` +
             `totalizando R$ ${stats.totalSpent.toFixed(2)}. ` +
             `Este mês você gastou R$ ${stats.monthlySpent.toFixed(2)}.`;
      
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas:', error);
      return '❌ Erro ao consultar estatísticas.';
    }
  }

  // Parsear data
  parseDate(dateString) {
    const today = new Date();
    
    switch (dateString.toLowerCase()) {
      case 'hoje':
        return today;
      case 'ontem':
        return new Date(today.getTime() - 24 * 60 * 60 * 1000);
      case 'anteontem':
        return new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
      default:
        // Tentar parsear data específica
        const parsed = moment(dateString, ['DD/MM/YYYY', 'DD/MM', 'YYYY-MM-DD'], true);
        return parsed.isValid() ? parsed.toDate() : today;
    }
  }

  // Verificar se está pronto
  isReady() {
    return this.isInitialized && 
           databaseService.isConnected && 
           geminiService.isReady();
  }

  // Obter status
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      database: databaseService.isConnected,
      gemini: geminiService.isReady(),
      whatsapp: whatsappService.getStatus(),
      processingQueue: this.processingQueue.size
    };
  }
}

// Instância singleton
const financialAgent = new FinancialAgent();

module.exports = financialAgent;
module.exports.FinancialAgent = FinancialAgent;