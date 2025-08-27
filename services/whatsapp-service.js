// Importações dinâmicas para reduzir bundle size
const databaseService = require('../config/database');
const logger = require('../utils/logger');

// Função para carregar dependências pesadas apenas quando necessário
async function loadDependencies() {
  try {
    console.log('📦 Carregando dependências do WhatsApp...');
    
    const [whatsappModule, qrcodeModule, fsModule, pathModule] = await Promise.all([
      import('whatsapp-web.js').catch(err => {
        console.error('❌ Erro ao carregar whatsapp-web.js:', err);
        throw new Error('Falha ao carregar WhatsApp Web.js: ' + err.message);
      }),
      import('qrcode').catch(err => {
        console.error('❌ Erro ao carregar qrcode:', err);
        throw new Error('Falha ao carregar QRCode: ' + err.message);
      }),
      import('fs').catch(err => {
        console.error('❌ Erro ao carregar fs:', err);
        throw new Error('Falha ao carregar FS: ' + err.message);
      }),
      import('path').catch(err => {
        console.error('❌ Erro ao carregar path:', err);
        throw new Error('Falha ao carregar Path: ' + err.message);
      })
    ]);
    
    console.log('✅ Dependências carregadas com sucesso');
    
    return {
      WhatsAppClient: whatsappModule,
      QRCode: qrcodeModule.default || qrcodeModule,
      fs: fsModule.default || fsModule,
      path: pathModule.default || pathModule
    };
  } catch (error) {
    console.error('❌ Erro crítico ao carregar dependências:', error);
    throw error;
  }
}

class WhatsAppService {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.qrCode = null;
    this.connectionStatus = 'disconnected';
    this.eventHandlers = new Map();
    this.isInitializing = false;
    this.autoInitialized = false;
    this.messageProcessor = null;
    
    // Inicializar automaticamente em produção se houver sessão salva
    this.autoInitializeIfSessionExists();
  }

  // Definir processador de mensagens (será injetado pelo agente financeiro)
  setMessageProcessor(processor) {
    this.messageProcessor = processor;
    logger.info('💬 Processador de mensagens configurado');
  }

  // Verificar se existe sessão salva e inicializar automaticamente
  async autoInitializeIfSessionExists() {
    try {
      // Só em produção (Vercel)
      if (process.env.VERCEL) {
        console.log('🔍 Verificando sessão existente...');
        
        try {
          // Carregar dependências
          const { fs, path } = await loadDependencies();
          
          // Verificar se existe diretório de sessão
          const authDir = path.join(process.cwd(), '.wwebjs_auth', 'session-financial-agent');
          if (fs.existsSync(authDir)) {
            console.log('📱 Sessão encontrada! Inicializando automaticamente...');
            // Aguardar um pouco para evitar conflitos
            setTimeout(() => {
              this.initialize(true).catch((error) => {
                console.log('⚠️ Falha na inicialização automática:', error.message);
              });
            }, 5000);
          } else {
            console.log('📱 Nenhuma sessão encontrada. Aguardando inicialização manual.');
          }
        } catch (depError) {
          console.log('⚠️ Erro ao carregar dependências para verificação de sessão:', depError);
        }
      }
    } catch (error) {
      console.log('⚠️ Erro ao verificar sessão:', error);
    }
  }

  // Limpar sessões existentes (usado apenas no reset)
  async clearExistingSessions() {
    try {
      console.log('🧹 Limpando sessões existentes...');
      
      // Carregar dependências
      const { fs, path } = await loadDependencies();
      
      // Limpar diretório .wwebjs_auth se existir
      const authDir = path.join(process.cwd(), '.wwebjs_auth');
      if (fs.existsSync(authDir)) {
        console.log('🗑️ Removendo diretório de autenticação...');
        fs.rmSync(authDir, { recursive: true, force: true });
      }
      
      // Limpar cache se existir
      const cacheDir = path.join(process.cwd(), '.wwebjs_cache');
      if (fs.existsSync(cacheDir)) {
        console.log('🗑️ Removendo cache...');
        fs.rmSync(cacheDir, { recursive: true, force: true });
      }
      
      // Limpar outros diretórios de cache temporários
      const tempDirs = [
        path.join(process.cwd(), 'node_modules', '.cache'),
        path.join(process.cwd(), '.next', 'cache'),
        path.join(process.cwd(), 'tmp')
      ];
      
      for (const dir of tempDirs) {
        if (fs.existsSync(dir)) {
          try {
            console.log(`🗑️ Limpando cache: ${dir}`);
            fs.rmSync(dir, { recursive: true, force: true });
          } catch (err) {
            console.log(`⚠️ Não foi possível limpar ${dir}:`, err);
          }
        }
      }
      
      // Atualizar status de conexão
      await this.updateConnectionStatus('disconnected');
      
      console.log('✅ Sessões e cache limpos com sucesso!');
    } catch (error) {
      console.error('⚠️ Erro ao limpar sessões:', error);
      // Não falhar se não conseguir limpar
    }
  }

  // Inicializar cliente WhatsApp
  async initialize(forceInitialize = false) {
    // Verificar se já está inicializando
    if (this.isInitializing) {
      console.log('⚠️ Inicialização já em andamento, ignorando nova tentativa...');
      return;
    }

    // Verificar se já está conectado
    if (this.connectionStatus === 'ready' || this.connectionStatus === 'authenticated') {
      console.log('✅ WhatsApp já está conectado!');
      return;
    }

    // Só inicializar se for forçado (botão clicado)
    if (!forceInitialize && this.autoInitialized) {
      console.log('🚫 Inicialização automática bloqueada. Use o botão para conectar.');
      return;
    }

    try {
      this.isInitializing = true;
      this.autoInitialized = true;
      
      console.log('🚀 Inicializando WhatsApp Service...');
      await this.updateConnectionStatus('connecting');
      
      // Carregar dependências
      const { WhatsAppClient, fs, path } = await loadDependencies();
      const { Client, LocalAuth } = WhatsAppClient.default || WhatsAppClient;
      
      // Configurar cliente WhatsApp
      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: 'financial-agent',
          dataPath: path.join(process.cwd(), '.wwebjs_auth')
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
          ]
        }
      });
      
      // Configurar eventos
      this.setupEventHandlers();
      
      // Inicializar cliente
      await this.client.initialize();
      
      console.log('✅ WhatsApp Service inicializado com sucesso!');
      
    } catch (error) {
      console.error('❌ Erro ao inicializar WhatsApp Service:', error);
      await this.updateConnectionStatus('disconnected');
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  // Configurar manipuladores de eventos
  setupEventHandlers() {
    if (!this.client) return;
    
    // QR Code gerado
    this.client.on('qr', async (qr) => {
      console.log('📱 QR Code gerado');
      this.qrCode = qr;
      await this.updateConnectionStatus('qr_ready');
      
      // Gerar QR Code como SVG para exibição na web
      try {
        const { QRCode } = await loadDependencies();
        const qrSvg = await QRCode.toString(qr, { 
          type: 'svg',
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        this.qrCodeSvg = qrSvg;
        
        // Também gerar versão terminal para debug
        const qrString = await QRCode.toString(qr, { type: 'terminal' });
        console.log('📱 QR Code:\n', qrString);
      } catch (error) {
        console.error('❌ Erro ao gerar QR Code:', error);
      }
    });
    
    // Cliente autenticado
    this.client.on('authenticated', async () => {
      console.log('🔐 Cliente autenticado');
      await this.updateConnectionStatus('authenticated');
    });
    
    // Cliente pronto
    this.client.on('ready', async () => {
      console.log('✅ WhatsApp Client está pronto!');
      this.isReady = true;
      await this.updateConnectionStatus('ready');
      
      // Obter informações do cliente
      const info = this.client.info;
      console.log(`📱 Conectado como: ${info.pushname} (${info.wid.user})`);
      
      logger.info('WhatsApp Client conectado e pronto para receber mensagens');
    });
    
    // Mensagem recebida
    this.client.on('message', async (message) => {
      try {
        await this.handleIncomingMessage(message);
      } catch (error) {
        console.error('❌ Erro ao processar mensagem:', error);
        logger.error('Erro ao processar mensagem', { error: error.message, messageId: message.id._serialized });
      }
    });
    
    // Cliente desconectado
    this.client.on('disconnected', async (reason) => {
      console.log('🔌 Cliente desconectado:', reason);
      this.isReady = false;
      await this.updateConnectionStatus('disconnected');
      logger.warn('WhatsApp Client desconectado', { reason });
    });
    
    // Erro de autenticação
    this.client.on('auth_failure', async (message) => {
      console.error('❌ Falha na autenticação:', message);
      await this.updateConnectionStatus('disconnected');
      logger.error('Falha na autenticação do WhatsApp', { message });
    });
  }

  // Processar mensagem recebida
  async handleIncomingMessage(message) {
    // Ignorar mensagens de status e grupos por enquanto
    if (message.isStatus || message.from.includes('@g.us')) {
      return;
    }
    
    // Ignorar mensagens próprias
    if (message.fromMe) {
      return;
    }
    
    console.log(`📨 Mensagem recebida de ${message.from}: ${message.body}`);
    logger.info('Mensagem recebida', {
      from: message.from,
      body: message.body,
      timestamp: message.timestamp
    });
    
    // Se há um processador de mensagens configurado, usar ele
    if (this.messageProcessor) {
      try {
        const response = await this.messageProcessor.processMessage(message);
        if (response) {
          await this.sendMessage(message.from, response);
        }
      } catch (error) {
        console.error('❌ Erro no processador de mensagens:', error);
        await this.sendMessage(message.from, '❌ Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.');
      }
    } else {
      // Resposta padrão se não há processador configurado
      await this.sendMessage(message.from, '🤖 Olá! Sou seu assistente financeiro. Envie uma mensagem como "Gastei 50 reais no supermercado" para registrar uma transação.');
    }
  }

  // Enviar mensagem
  async sendMessage(to, message) {
    if (!this.isReady || !this.client) {
      throw new Error('WhatsApp Client não está pronto');
    }
    
    try {
      await this.client.sendMessage(to, message);
      console.log(`📤 Mensagem enviada para ${to}: ${message}`);
      logger.info('Mensagem enviada', { to, message });
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem:', error);
      logger.error('Erro ao enviar mensagem', { to, message, error: error.message });
      throw error;
    }
  }

  // Atualizar status de conexão
  async updateConnectionStatus(status) {
    this.connectionStatus = status;
    console.log(`🔄 Status de conexão atualizado: ${status}`);
    
    // Aqui você pode salvar o status no banco de dados se necessário
    // ou emitir eventos para a interface
  }

  // Obter status atual
  getStatus() {
    return {
      isReady: this.isReady,
      connectionStatus: this.connectionStatus,
      qrCode: this.qrCode,
      qrCodeSvg: this.qrCodeSvg,
      isInitializing: this.isInitializing
    };
  }

  // Resetar conexão
  async reset() {
    try {
      console.log('🔄 Resetando conexão WhatsApp...');
      
      if (this.client) {
        await this.client.destroy();
        this.client = null;
      }
      
      this.isReady = false;
      this.qrCode = null;
      this.isInitializing = false;
      
      await this.clearExistingSessions();
      
      console.log('✅ Conexão resetada com sucesso!');
      logger.info('WhatsApp Service resetado');
      
    } catch (error) {
      console.error('❌ Erro ao resetar conexão:', error);
      logger.error('Erro ao resetar WhatsApp Service', { error: error.message });
      throw error;
    }
  }

  // Desconectar
  async disconnect() {
    try {
      if (this.client) {
        await this.client.destroy();
        this.client = null;
      }
      
      this.isReady = false;
      await this.updateConnectionStatus('disconnected');
      
      console.log('🔌 WhatsApp Service desconectado');
      logger.info('WhatsApp Service desconectado');
      
    } catch (error) {
      console.error('❌ Erro ao desconectar:', error);
      logger.error('Erro ao desconectar WhatsApp Service', { error: error.message });
      throw error;
    }
  }
}

// Instância singleton
const whatsappService = new WhatsAppService();

module.exports = whatsappService;
module.exports.WhatsAppService = WhatsAppService;