const whatsappService = require('./whatsapp-service');
const databaseService = require('../config/database');
const userService = require('./user-service');
const geminiService = require('./gemini-service');
const AudioProcessor = require('./audio-processor');
const logger = require('../utils/logger');
const { GoalModel, DebtModel } = require('../database/models');

// Importar handlers especializados
const ExpenseHandler = require('./handlers/expense-handler');
const IncomeHandler = require('./handlers/income-handler');
const InvestmentHandler = require('./handlers/investment-handler');
const QueryHandler = require('./handlers/query-handler');
const CorrectionHandler = require('./handlers/correction-handler');
const SalesHandler = require('./handlers/sales-handler');
const GoalHandler = require('./handlers/goal-handler');
const DebtHandler = require('./handlers/debt-handler');

// Importar handlers de finanças pessoais
const PersonalIncomeHandler = require('./handlers/personal-income-handler');
const PersonalExpenseHandler = require('./handlers/personal-expense-handler');
const { personalFinanceService } = require('./personal-finance-service');

// Importar utilitários
const DataParser = require('./parsers/data-parser');
const ResponseFormatter = require('./formatters/response-formatter');
const TransactionValidator = require('./validators/transaction-validator');

/**
 * Agente Financeiro Principal - Arquitetura Modular
 * Coordena handlers especializados para diferentes tipos de transações
 */
class FinancialAgent {
  constructor() {
    this.isInitialized = false;
    this.processingQueue = new Map(); // Para evitar processamento duplicado
    this.conversationHistory = new Map(); // phoneNumber -> array of last messages
    this.maxHistorySize = 5; // Manter últimas 5 mensagens por usuário
    this.audioProcessor = new AudioProcessor(); // Processador de áudio
    
    // Inicializar handlers especializados
    this.handlers = {
      expense: null,
      income: null,
      investment: null,
      query: null,
      correction: null,
      goal: null,
      debt: null,
      // Handlers de finanças pessoais
      personalIncome: null,
      personalExpense: null
    };
    
    // Modelos
    this.goalModel = null;
    this.debtModel = null;
  }

  /**
   * Inicializar o agente financeiro e todos os handlers
   */
  async initialize() {
    try {
      console.log('🤖 Inicializando Agente Financeiro...');
      
      // Inicializar serviços base
      await databaseService.initialize();
      await geminiService.initialize();
      await this.audioProcessor.initialize();
      
      // Inicializar modelos
      this.goalModel = new GoalModel(databaseService);
      this.debtModel = new DebtModel(databaseService);
      
      // Inicializar serviço de finanças pessoais
      await personalFinanceService.initialize();
      
      // Inicializar handlers especializados
      this.handlers.correction = new CorrectionHandler(databaseService, userService);
      this.handlers.sales = new SalesHandler(databaseService, userService);
      this.handlers.expense = new ExpenseHandler(databaseService, userService, this.handlers.correction);
      this.handlers.income = new IncomeHandler(databaseService, userService);
      this.handlers.investment = new InvestmentHandler(databaseService, userService);
      this.handlers.query = new QueryHandler(databaseService, userService);
      this.handlers.goal = new GoalHandler(databaseService, userService, this.goalModel);
      this.handlers.debt = new DebtHandler(databaseService, userService, this.debtModel);
      
      // Inicializar handlers de finanças pessoais
      this.handlers.personalIncome = new PersonalIncomeHandler(databaseService, userService);
      this.handlers.personalExpense = new PersonalExpenseHandler(databaseService, userService);
      
      // Conectar correction handler com outros handlers
      this.handlers.expense.setCorrectionHandler(this.handlers.correction);
      
      // Inicializar SalesHandler (sincronização automática)
      await this.handlers.sales.initialize();
      
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

  /**
   * Processar mensagem recebida do WhatsApp
   * @param {Object} message - Mensagem do WhatsApp
   * @returns {Promise<string|null>} - Resposta para o usuário
   */
  async processMessage(message) {
    const messageId = message.id._serialized;
    
    // Evitar processamento duplicado
    if (this.processingQueue.has(messageId)) {
      console.log('⚠️ Mensagem já está sendo processada:', messageId);
      return null;
    }
    
    this.processingQueue.set(messageId, Date.now());
    
    try {
      // Log sanitizado para não expor senhas
      const sanitizedBody = this.sanitizeLogMessage(message.from, message.body);
      logger.info('Mensagem recebida', {
        from: message.from,
        body: sanitizedBody
      });
      
      // Adicionar ao histórico de conversação (exceto placeholders de mídia)
      if (message.body !== '[IMAGEM]' && message.body !== '[ÁUDIO]') {
        this.addToConversationHistory(message.from, message.body, 'user');
      }
      
      // Verificar se é mensagem de áudio
      if (message.hasMedia && message.type === 'audio') {
        return await this.processAudioMessage(message);
      }
      
      // Verificar se é mensagem de imagem
      if (message.hasMedia && message.type === 'image') {
        return await this.processImageMessage(message);
      }
      
      // Processar mensagem de texto
      return await this.processTextMessage(message);
      
    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error);
      logger.error('Erro no processamento de mensagem', {
        messageId,
        error: error.message
      });
      
      return '❌ Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em alguns instantes.';
      
    } finally {
      // Remover da fila de processamento após 5 segundos
      setTimeout(() => {
        this.processingQueue.delete(messageId);
      }, 5000);
    }
  }

  /**
   * Processar mensagem de texto
   * @param {Object} message - Mensagem do WhatsApp
   * @returns {Promise<string>} - Resposta para o usuário
   */
  async processTextMessage(message) {
    console.log('🔄 Processando mensagem:', message.body);
    
    // Verificar autenticação
    const authStatus = await this.checkUserAuthentication(message.from);
    
    if (!authStatus.isAuthenticated) {
      return await this.handleAuthenticationFlow(message.from, message.body, authStatus.step);
    }
    
    const user = authStatus.user;
    console.log('🔍 Verificando autenticação para:', message.from);
    console.log('👤 Usuário existente encontrado:', user.email);
    
    // PRIORIDADE 1: Verificar se há contexto de venda ativo
    const salesHandler = this.handlers.sales;
    if (salesHandler && salesHandler.isImageSaleConfirmation) {
      const isImageSaleResponse = salesHandler.isImageSaleConfirmation(message.body, user.id);
      if (isImageSaleResponse) {
        console.log('🛒 Detectado resposta de venda por imagem, processando...');
        const salesResponse = await salesHandler.handleImageSaleConfirmation(user.id, { descricao: message.body });
        return salesResponse;
      }
    }
    
    // PRIORIDADE 2: Analisar contexto da conversa
    const contextAnalysis = this.analyzeConversationContext(message.from, message.body);
    
    let analysisResult;
    
    if (contextAnalysis.isContextual) {
      // Usar análise contextual
      analysisResult = await this.processContextualMessage(message.body, contextAnalysis, user.id);
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
    
    // Processar baseado no tipo identificado usando handlers especializados
    const response = await this.routeToHandler(user.id, analysisResult);
    
    logger.info('Mensagem processada com sucesso', {
      userId: user.id,
      messageType: analysisResult.tipo,
      confidence: analysisResult.confianca
    });
    
    return response;
  }

  /**
   * Rotear para o handler apropriado baseado no tipo de transação
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise do Gemini
   * @returns {Promise<string>} - Resposta formatada
   */
  async routeToHandler(userId, analysisResult) {
    try {
      // Verificar primeiro se é uma correção (prioridade alta)
      const correctionResult = await this.handlers.correction.process(userId, analysisResult);
      if (correctionResult !== null) {
        return correctionResult;
      }
      
      // Verificar se é comando relacionado a metas
      if (this.isGoalCommand(analysisResult)) {
        return await this.handlers.goal.process(userId, analysisResult);
      }
      
      // Verificar se é comando relacionado a dívidas
      if (this.isDebtCommand(analysisResult)) {
        return await this.handlers.debt.process(userId, analysisResult);
      }
      
      // Verificar se é comando relacionado a vendas
      const salesResult = await this.handlers.sales.process(userId, analysisResult);
      if (salesResult !== null) {
        return salesResult;
      }
      
      const { tipo } = analysisResult;
      
      switch (tipo) {
        case 'venda':
        case 'produto':
          return await this.handlers.sales.process(userId, analysisResult);
          
        case 'receita':
          return await this.handlers.income.process(userId, analysisResult);
          
        case 'receita_pessoal':
          return await this.handlers.personalIncome.process(userId, analysisResult);
          
        case 'despesa_fixa':
        case 'despesa_variavel':
          return await this.handlers.expense.process(userId, analysisResult);
          
        case 'gasto_pessoal':
        case 'despesa_pessoal':
          return await this.handlers.personalExpense.process(userId, analysisResult);
          
        case 'investimento':
          return await this.handlers.investment.process(userId, analysisResult);
          
        case 'consulta':
          return await this.handlers.query.process(userId, analysisResult);
          
        case 'correcao':
          return await this.handlers.correction.process(userId, analysisResult);
          
        default:
          return await this.handleOtherMessage(userId, analysisResult);
      }
    } catch (error) {
      console.error('❌ Erro ao rotear para handler:', error);
      return ResponseFormatter.formatErrorMessage('transação', analysisResult.valor, error.message);
    }
  }

  /**
   * Verificar se é um comando relacionado a metas
   * @param {Object} analysisResult - Resultado da análise do Gemini
   * @returns {boolean} - True se for comando de meta
   */
  isGoalCommand(analysisResult) {
     const { intencao, tipo, texto_original } = analysisResult;
     
     // Verificar ações específicas de metas
     const goalActions = [
       'criar_meta', 'nova_meta', 'listar_metas', 'minhas_metas', 'ver_metas',
       'progresso_meta', 'status_meta', 'atualizar_meta', 'adicionar_progresso',
       'deletar_meta', 'remover_meta', 'categorias_meta', 'tipos_meta',
       'estatisticas_metas', 'resumo_metas'
     ];
     
     if (intencao && goalActions.includes(intencao.toLowerCase())) {
       return true;
     }
    
    // Verificar tipo específico de meta
    if (tipo === 'meta' || tipo === 'objetivo') {
      return true;
    }
    
    // Verificar palavras-chave no texto original
    if (texto_original) {
      const goalKeywords = [
        'meta', 'objetivo', 'juntar', 'economizar', 'limite de gasto',
        'limite gasto', 'meta de', 'quero juntar', 'vou economizar',
        'minha meta', 'minhas metas', 'progresso', 'atingir',
        'conquistar', 'poupar', 'guardar dinheiro'
      ];
      
      const lowerText = texto_original.toLowerCase();
      return goalKeywords.some(keyword => lowerText.includes(keyword));
    }
    
    return false;
   }

   /**
    * Verificar se é um comando relacionado a dívidas
    * @param {Object} analysisResult - Resultado da análise do Gemini
    * @returns {boolean} - True se for comando de dívida
    */
   isDebtCommand(analysisResult) {
     const { intencao, tipo, texto_original } = analysisResult;
     
     // Verificar ações específicas de dívidas
     const debtActions = [
       'registrar_divida', 'nova_divida', 'criar_divida', 'listar_dividas', 'minhas_dividas',
       'ver_dividas', 'pagar_divida', 'pagamento_divida', 'status_dividas', 'resumo_dividas',
       'dividas_atrasadas', 'dividas_vencidas', 'proximos_vencimentos', 'dividas_vencendo',
       'deletar_divida', 'remover_divida'
     ];
     
     if (intencao && debtActions.includes(intencao.toLowerCase())) {
       return true;
     }
     
     // Verificar tipo específico de dívida
     if (tipo === 'divida' || tipo === 'dívida' || tipo === 'debt') {
       return true;
     }
     
     // Verificar palavras-chave no texto original
     if (texto_original) {
       const debtKeywords = [
         'dívida', 'divida', 'devo', 'pagar', 'quitar', 'empréstimo', 'emprestimo',
         'financiamento', 'cartão', 'cartao', 'credor', 'débito', 'debito',
         'parcela', 'prestação', 'prestacao', 'juros', 'vencimento', 'atraso',
         'quitação', 'quitacao', 'pagamento', 'saldo devedor'
       ];
       
       const lowerText = texto_original.toLowerCase();
       return debtKeywords.some(keyword => lowerText.includes(keyword));
     }
     
     return false;
   }
 
   /**
     * Processar mensagem de áudio
   * @param {Object} message - Mensagem do WhatsApp
   * @returns {Promise<string>} - Resposta para o usuário
   */
  async processAudioMessage(message) {
    try {
      console.log('🎵 Iniciando processamento de áudio...');
      
      // Verificar autenticação
      const authStatus = await this.checkUserAuthentication(message.from);
      
      if (!authStatus.isAuthenticated) {
        return '🔐 Por favor, faça login primeiro antes de enviar áudios. Digite seu email para começar.';
      }
      
      const user = authStatus.user;
      
      // Obter contexto do usuário para melhor análise
      const userContext = await this.getUserContext(user.id);
      
      // Processar áudio com AudioProcessor
      const audioResult = await this.audioProcessor.processAudio(message.audioBuffer, {
        userId: user.id,
        phoneNumber: message.from,
        userContext: userContext
      });
      
      if (!audioResult.success) {
        console.error('❌ Falha no processamento de áudio:', audioResult.error);
        return audioResult.fallback || '❌ Não consegui processar o áudio. Tente novamente ou digite sua transação.';
      }
      
      console.log('✅ Áudio processado:', {
        transcription: audioResult.transcription?.substring(0, 50) + '...',
        type: audioResult.financialData?.tipo,
        value: audioResult.financialData?.valor
      });
      
      // Adicionar transcrição ao histórico
      this.addToConversationHistory(message.from, audioResult.transcription, 'user');
      
      // Processar dados financeiros extraídos do áudio
      if (audioResult.financialData) {
        return await this.routeToHandler(user.id, audioResult.financialData);
      } else {
        return '🎵 Áudio processado, mas não consegui identificar informações financeiras. Pode repetir de forma mais clara?';
      }
      
    } catch (error) {
      console.error('❌ Erro no processamento de áudio:', error);
      return '❌ Erro ao processar áudio. Tente enviar uma mensagem de texto.';
    }
  }

  /**
   * Processar mensagem de imagem
   * @param {Object} message - Mensagem do WhatsApp com imagem
   * @returns {Promise<string>} - Resposta para o usuário
   */
  async processImageMessage(message) {
    try {
      console.log('📸 Iniciando processamento de imagem...');
      
      // Verificar autenticação
      const authStatus = await this.checkUserAuthentication(message.from);
      
      if (!authStatus.isAuthenticated) {
        return '🔐 Por favor, faça login primeiro antes de enviar imagens. Digite seu email para começar.';
      }
      
      const user = authStatus.user;
      
      // Verificar se há texto junto com a imagem (venda direta)
      // Ignorar placeholder '[IMAGEM]' criado pelo WhatsApp service
      const hasCaption = message.body && message.body.trim().length > 0 && message.body.trim() !== '[IMAGEM]';
      
      if (hasCaption) {
        console.log('📸 Imagem com descrição detectada:', message.body);
        
        // Processar como venda direta com imagem
        const salesHandler = this.handlers.sales;
        if (salesHandler) {
          try {
            // Primeiro, identificar o produto na imagem
            const userContext = await this.getUserContext(user.id);
            const imageResult = await geminiService.processProductImage(message.imageBuffer, {
              userId: user.id,
              phoneNumber: message.from,
              userContext: userContext,
              databaseService: databaseService
            });
            
            if (imageResult && imageResult.produto_nome) {
              console.log('✅ Produto identificado na imagem:', imageResult.produto_nome);
              
              // Processar texto como venda com produto identificado
              const analysisResult = await geminiService.processFinancialMessage(message.body, userContext);
              analysisResult.produto_identificado = imageResult.produto_nome;
              analysisResult.confianca_imagem = imageResult.confianca;
              analysisResult.metodo_identificacao = 'imagem_com_texto';
              
              return await salesHandler.process(user.id, analysisResult);
            }
          } catch (error) {
            console.error('❌ Erro no processamento de venda com imagem:', error);
          }
        }
      }
      
      // Processamento normal de imagem (sem texto)
      const userContext = await this.getUserContext(user.id);
      
      // Processar imagem com Gemini Vision e comparação com banco
       const imageResult = await geminiService.processProductImage(message.imageBuffer, {
         userId: user.id,
         phoneNumber: message.from,
         userContext: userContext,
         databaseService: databaseService
       });
      
      if (!imageResult || !imageResult.produto_nome) {
        console.error('❌ Falha no reconhecimento do produto');
        return '📸 Não consegui identificar o produto na imagem. Tente enviar uma foto mais clara ou digite o nome do produto.';
      }
      
      console.log('✅ Produto identificado:', {
        produto: imageResult.produto_nome,
        categoria: imageResult.categoria,
        confianca: imageResult.confianca
      });
      
      // Adicionar descrição da imagem ao histórico
      this.addToConversationHistory(message.from, `[IMAGEM: ${imageResult.produto_nome}]`, 'user');
      
      // Verificar se a confiança é suficiente
      if (imageResult.confianca < 0.5) {
        return `📸 Identifiquei possivelmente: **${imageResult.produto_nome}**\n\n` +
               `⚠️ Confiança baixa (${(imageResult.confianca * 100).toFixed(0)}%). ` +
               `Confirme o produto ou envie uma foto mais clara.\n\n` +
               `💡 *Digite o nome correto do produto para continuar.*`;
      }
      
      // Rotear para o sales handler
      return await this.routeToHandler(user.id, imageResult);
      
    } catch (error) {
      console.error('❌ Erro no processamento de imagem:', error);
      return '❌ Erro ao processar imagem. Tente enviar uma mensagem de texto com o nome do produto.';
    }
  }

  /**
   * Verificar autenticação do usuário
   * @param {string} phoneNumber - Número do WhatsApp
   * @returns {Promise<Object>} - Status da autenticação
   */
  async checkUserAuthentication(phoneNumber) {
    try {
      // Primeiro, verificar se existe usuário pelo WhatsApp
      const existingUser = await databaseService.getUserByWhatsApp(phoneNumber);
      
      if (existingUser) {
        // Limpar sessões antigas (ignorar erros se não houver sessão)
        try {
          await databaseService.deleteUserSession(phoneNumber);
        } catch (error) {
          // Ignorar erro se não houver sessão para deletar
        }
        
        // Criar nova sessão para usuário existente
        await databaseService.createUserSession(phoneNumber, existingUser.id);
        
        return {
          isAuthenticated: true,
          user: existingUser,
          step: 'authenticated'
        };
      }
      
      // Verificar se há sessão ativa
      const session = await databaseService.getUserSession(phoneNumber);
      
      if (session && session.user_id) {
        const user = await userService.getUserById(session.user_id);
        if (user) {
          return {
            isAuthenticated: true,
            user: user,
            step: 'authenticated'
          };
        }
      }
      
      // Verificar se há processo de autenticação em andamento
      const authProcess = await databaseService.getAuthProcess(phoneNumber);
      
      if (authProcess) {
        return {
          isAuthenticated: false,
          step: authProcess.step,
          data: authProcess.data
        };
      }
      
      // Novo usuário - iniciar processo de autenticação
      return {
        isAuthenticated: false,
        step: 'welcome'
      };
      
    } catch (error) {
      console.error('❌ Erro na verificação de autenticação:', error);
      return {
        isAuthenticated: false,
        step: 'welcome'
      };
    }
  }

  /**
   * Gerenciar fluxo de autenticação
   * @param {string} phoneNumber - Número do WhatsApp
   * @param {string} message - Mensagem do usuário
   * @param {string} step - Etapa atual da autenticação
   * @returns {Promise<string>} - Resposta para o usuário
   */
  async handleAuthenticationFlow(phoneNumber, message, step) {
    try {
      switch (step) {
        case 'welcome':
          await databaseService.createAuthProcess(phoneNumber, 'email', {});
          return '👋 Olá! Bem-vindo ao **Zero**! 🤖💰\n\n' +
                  '📧 **Digite seu email para começar:**';
        
        case 'email':
          const email = message.trim();
          
          // Validar email
          const emailValidation = TransactionValidator.validateEmail(email);
          if (!emailValidation.isValid) {
            return ResponseFormatter.formatValidationMessage(emailValidation.errors) + 
                   '\n\n📧 **Digite um email válido:**';
          }
          
          // Salvar email e pedir senha
          await databaseService.updateAuthProcess(phoneNumber, 'password', { email });
          return `✅ **Email confirmado:** ${email}\n\n🔐 **Agora digite sua senha:**`;
        
        case 'password':
          const authProcess = await databaseService.getAuthProcess(phoneNumber);
          const userEmail = authProcess.data.email;
          const password = message.trim();
          
          // Validar senha
          const passwordValidation = TransactionValidator.validatePassword(password);
          if (!passwordValidation.isValid) {
            return ResponseFormatter.formatValidationMessage(passwordValidation.errors) + 
                   '\n\n🔐 **Digite uma senha válida:**';
          }
          
          try {
            // CORREÇÃO: Verificar se já existe usuário com este email
            let user = await databaseService.getUserByEmail(userEmail);
            
            if (user) {
              // Usuário já existe, apenas vincular WhatsApp
              console.log(`👤 Usuário existente encontrado: ${user.email} (ID: ${user.id})`);
              
              // Atualizar número do WhatsApp se necessário
              if (user.whatsapp_number !== phoneNumber) {
                await databaseService.updateUserWhatsApp(user.id, phoneNumber);
                console.log(`📱 WhatsApp vinculado ao usuário existente: ${phoneNumber}`);
              }
              
              // Criar sessão
              await databaseService.createUserSession(phoneNumber, user.id);
              
              // Limpar processo de autenticação
              await databaseService.deleteAuthProcess(phoneNumber);
              
              return `🎉 **Bem-vindo de volta!**\n\n` +
                     `👋 Olá, **${user.name || user.email}**!\n\n` +
                     `🤖 **Estou pronto para te ajudar!** Como posso ajudar você hoje?`;
            } else {
              // Criar novo usuário com parâmetros corretos: (whatsappNumber, name, firebaseUid, email)
              user = await databaseService.createUser(phoneNumber, userEmail.split('@')[0], null, userEmail);
              console.log(`👤 Novo usuário criado: ${user.email} (ID: ${user.id})`);
              
              // Criar sessão
              await databaseService.createUserSession(phoneNumber, user.id);
              
              // Limpar processo de autenticação
              await databaseService.deleteAuthProcess(phoneNumber);
              
              return `🎉 **Conta criada com sucesso!**\n\n` +
                     `👋 Bem-vindo, **${user.name || user.email}**!\n\n` +
                     ResponseFormatter.formatWelcomeMessage(user.name);
            }
            
          } catch (error) {
            console.error('❌ Erro no fluxo de autenticação:', error);
            
            // Se erro de constraint (usuário já existe), tentar recuperar sessão
            if (error.code === '23505' && error.message.includes('phone_number')) {
              try {
                const existingUser = await databaseService.getUserByEmail(userEmail);
                if (existingUser) {
                  await databaseService.updateUserWhatsApp(existingUser.id, phoneNumber);
                  await databaseService.createUserSession(phoneNumber, existingUser.id);
                  await databaseService.deleteAuthProcess(phoneNumber);
                  
                  return `🎉 **Bem-vindo de volta!**\n\n` +
                         `👋 Olá, **${existingUser.name}**!\n\n` +
                         `🤖 **Estou pronto para te ajudar!** Como posso ajudar você hoje?`;
                }
              } catch (recoveryError) {
                console.error('❌ Erro na recuperação de sessão:', recoveryError);
              }
            }
            
            // Reiniciar fluxo em caso de erro
            await databaseService.deleteAuthProcess(phoneNumber);
            return '⚠️ **Ops! Algo deu errado.**\n\n🔄 Vamos recomeçar!\n\n' +
                   '👋 Olá! Bem-vindo ao **Zero**! 🤖💰\n\n' +
                   '📧 **Digite seu email para começar:**';
          }
        
        default:
          await databaseService.deleteAuthProcess(phoneNumber);
          return this.handleAuthenticationFlow(phoneNumber, message, 'welcome');
      }
      
    } catch (error) {
      console.error('❌ Erro no fluxo de autenticação:', error);
      await databaseService.deleteAuthProcess(phoneNumber);
      return '⚠️ **Ops! Algo deu errado.**\n\n🔄 Vamos recomeçar!\n\n' +
              '👋 Olá! Bem-vindo ao **Zero**! 🤖💰\n\n' +
              '📧 **Digite seu email para começar:**';
    }
  }

  /**
   * Obter contexto do usuário
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object>} - Contexto do usuário
   */
  async getUserContext(userId) {
    try {
      const stats = await userService.getUserStats(userId);
      const recentTransactions = await databaseService.getUserTransactions(userId, 5);
      
      return {
        totalSpent: stats.totalSpent,
        monthlySpent: stats.monthlySpent,
        recentTransactions: recentTransactions.map(t => ({
          value: t.amount,
          categoria: t.category,
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

  /**
   * Processar outras mensagens não categorizadas
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise
   * @returns {Promise<string>} - Resposta para o usuário
   */
  async handleOtherMessage(userId, analysisResult) {
    // Tentar processar como consulta genérica
    return await this.handlers.query.process(userId, analysisResult);
  }

  /**
   * Adicionar mensagem ao histórico de conversação
   * @param {string} phoneNumber - Número do WhatsApp
   * @param {string} message - Mensagem
   * @param {string} sender - Remetente ('user' ou 'bot')
   */
  addToConversationHistory(phoneNumber, message, sender) {
    if (!this.conversationHistory.has(phoneNumber)) {
      this.conversationHistory.set(phoneNumber, []);
    }
    
    const history = this.conversationHistory.get(phoneNumber);
    history.push({
      message,
      sender,
      timestamp: new Date(),
      analysis: null
    });
    
    // Manter apenas as últimas mensagens
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
  }

  /**
   * Analisar contexto da conversa
   * @param {string} phoneNumber - Número do WhatsApp
   * @param {string} currentMessage - Mensagem atual
   * @returns {Object} - Análise do contexto
   */
  analyzeConversationContext(phoneNumber, currentMessage) {
    const history = this.conversationHistory.get(phoneNumber) || [];
    
    if (history.length === 0) {
      return { isContextual: false };
    }
    
    // Implementar lógica de análise contextual aqui
    // Por enquanto, retornar não contextual
    return { isContextual: false };
  }

  /**
   * Processar mensagem contextual
   * @param {string} message - Mensagem atual
   * @param {Object} context - Contexto da conversa
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object>} - Resultado da análise
   */
  async processContextualMessage(message, context, userId) {
    // Implementar processamento contextual aqui
    // Por enquanto, usar processamento normal
    const userContext = await this.getUserContext(userId);
    return await geminiService.processFinancialMessage(message, userContext);
  }

  /**
   * Sanitizar mensagem para logs (proteger senhas)
   * @param {string} phoneNumber - Número do telefone
   * @param {string} message - Mensagem original
   * @returns {string} - Mensagem sanitizada
   */
  sanitizeLogMessage(phoneNumber, message) {
    try {
      // Verificar se usuário está no processo de autenticação
      const authProcess = this.authProcesses?.get?.(phoneNumber);
      
      // Se está no passo de senha, não logar a mensagem completa
      if (authProcess && authProcess.step === 'password') {
        return '[SENHA PROTEGIDA]';
      }
      
      // Verificar se a mensagem parece ser uma senha (6+ caracteres, sem espaços)
      if (message && message.length >= 6 && message.length <= 50 && !message.includes(' ')) {
        // Verificar se não é um email ou transação comum
        if (!message.includes('@') && !message.toLowerCase().includes('real') && 
            !message.toLowerCase().includes('gastei') && !message.toLowerCase().includes('recebi')) {
          return '[POSSÍVEL SENHA PROTEGIDA]';
        }
      }
      
      return message;
    } catch (error) {
      return '[ERRO NA SANITIZAÇÃO]';
    }
  }

  /**
   * Verificar se o agente está pronto
   * @returns {boolean} - Status de prontidão
   */
  isReady() {
    return this.isInitialized && 
           databaseService.isConnected && 
           geminiService.isReady() &&
           Object.values(this.handlers).every(handler => handler !== null);
  }

  /**
   * Obter status do agente
   * @returns {Object} - Status detalhado
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      database: databaseService.isConnected,
      gemini: geminiService.isReady(),
      whatsapp: whatsappService.getStatus(),
      processingQueue: this.processingQueue.size,
      handlers: {
        expense: this.handlers.expense !== null,
        income: this.handlers.income !== null,
        investment: this.handlers.investment !== null,
        query: this.handlers.query !== null,
        correction: this.handlers.correction !== null,
        sales: this.handlers.sales !== null
      }
    };
  }
}

// Instância singleton
const financialAgent = new FinancialAgent();

module.exports = financialAgent;
module.exports.FinancialAgent = FinancialAgent;