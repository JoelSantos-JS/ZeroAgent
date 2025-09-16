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
    this.readyTimeout = null;
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
          const authDir = path.join(process.cwd(), '.wwebjs_auth', 'session-vox-agent');
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
      
      // Configurar cliente WhatsApp com correções para o problema do 'ready'
      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: 'vox-agent',
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
            '--disable-gpu',
            // Correções específicas para o problema do 'ready'
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-ipc-flooding-protection',
            '--window-size=1366,768'
          ],
          defaultViewport: null,
          timeout: 60000,
          protocolTimeout: 60000
        },
        // Configurações adicionais para estabilidade
        webVersionCache: {
          type: 'remote',
          remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
        },
        takeoverOnConflict: true,
        takeoverTimeoutMs: 60000
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
      
      // Debug: Aguardar evento 'ready'
      console.log('⏳ Aguardando evento \'ready\' do WhatsApp...');
      
      // Timeout mais longo com lógica de retry
      this.readyTimeout = setTimeout(async () => {
        if (!this.isReady) {
          console.log('⚠️ AVISO: Evento \'ready\' não disparou em 60 segundos!');
          console.log('🔧 Aplicando correção automática...');
          
          try {
            // Tentar refresh da página do WhatsApp Web
            if (this.client.pupPage) {
              console.log('🔄 Fazendo refresh da página...');
              await this.client.pupPage.reload({ waitUntil: 'networkidle0' });
              
              // Aguardar mais 30 segundos após refresh
              setTimeout(() => {
                if (!this.isReady) {
                  console.log('❌ Correção não funcionou. Sessão pode estar corrompida.');
                  console.log('💡 Recomendação: Use /api/whatsapp/reset e tente novamente');
                }
              }, 30000);
            } else {
              console.log('❌ Não foi possível acessar a página do navegador');
              console.log('💡 Recomendação: Use /api/whatsapp/reset e tente novamente');
            }
          } catch (error) {
            console.error('❌ Erro na correção automática:', error.message);
            console.log('💡 Recomendação: Use /api/whatsapp/reset e tente novamente');
          }
        }
      }, 60000); // 60 segundos em vez de 30
    });
    
    // Cliente pronto
    this.client.on('ready', async () => {
      console.log('✅ WhatsApp Client está pronto!');
      
      // Limpar timeout se existir
      if (this.readyTimeout) {
        clearTimeout(this.readyTimeout);
        this.readyTimeout = null;
      }
      
      this.isReady = true;
      await this.updateConnectionStatus('ready');
      
      try {
        // Obter informações do cliente
        const info = this.client.info;
        console.log(`📱 Conectado como: ${info.pushname} (${info.wid.user})`);
        console.log('🎉 SUCESSO: Evento \'ready\' disparou corretamente!');
        console.log('🔗 WhatsApp totalmente operacional para receber mensagens');
        
        logger.info('WhatsApp Client conectado e pronto para receber mensagens', {
          pushname: info.pushname,
          user: info.wid.user,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('❌ Erro ao obter informações do cliente:', error);
        console.log('⚠️ Cliente pronto mas sem informações completas');
      }
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
    // Log simplificado
    console.log(`📨 Mensagem recebida de ${message.from}: ${message.body}`);
    
    // Ignorar mensagens de status e grupos por enquanto
    if (message.isStatus || message.from.includes('@g.us')) {
      console.log('⏭️ Ignorando mensagem de status ou grupo');
      return;
    }
    
    // Ignorar mensagens próprias
    if (message.fromMe) {
      console.log('⏭️ Ignorando mensagem própria');
      return;
    }
    
    // Verificar se é mensagem de áudio (incluindo PTT do WhatsApp)
    if (message.hasMedia && (message.type === 'audio' || message.type === 'ptt')) {
      console.log(`🎙️ Áudio recebido de ${message.from} (tipo: ${message.type})`);
      logger.info('Áudio recebido', {
        from: message.from,
        type: message.type,
        timestamp: message.timestamp
      });
      
      // Processar áudio
      await this.handleAudioMessage(message);
      return;
    }
    
    // Verificar se é mensagem de imagem
    if (message.hasMedia && message.type === 'image') {
      console.log(`📸 Imagem recebida de ${message.from}`);
      logger.info('Imagem recebida', {
        from: message.from,
        type: message.type,
        timestamp: message.timestamp
      });
      
      // Processar imagem
      await this.handleImageMessage(message);
      return;
    }
    
    // Log sanitizado para proteger senhas
    const sanitizedBody = this.sanitizeMessageForLog(message.body);
    logger.info('Mensagem recebida', {
      from: message.from,
      body: sanitizedBody,
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
      await this.sendMessage(message.from, '🤖 Olá! Eu sou o **Vox**, seu assistente financeiro. Envie uma mensagem como "Gastei 50 reais no supermercado" para registrar uma transação.');
    }
  }

  // Processar mensagem de áudio
  async handleAudioMessage(message) {
    try {
      console.log('🔄 Processando áudio...');
      
      // Enviar mensagem de confirmação
      await this.sendMessage(message.from, '🎙️ Áudio recebido! Processando sua transação...');
      
      // Baixar áudio
      const media = await message.downloadMedia();
      
      if (!media) {
        throw new Error('Falha ao baixar áudio');
      }
      
      // Validar tamanho do arquivo
      const maxSize = 40 * 1024 * 1024; // 40MB
      if (media.data && Buffer.from(media.data, 'base64').length > maxSize) {
        await this.sendMessage(message.from, '❌ Áudio muito grande. Por favor, envie um áudio menor que 40MB.');
        return;
      }
      
      // Converter base64 para buffer
      const audioBuffer = Buffer.from(media.data, 'base64');
      
      console.log('📁 Áudio baixado:', {
        size: `${(audioBuffer.length / 1024).toFixed(2)}KB`,
        mimetype: media.mimetype
      });
      
      // Criar mensagem simulada para processamento
      const audioMessage = {
        ...message,
        hasAudio: true,
        audioBuffer: audioBuffer,
        audioMimetype: media.mimetype,
        body: '[ÁUDIO]' // Placeholder para identificação
      };
      
      // Processar com o processador de mensagens
      if (this.messageProcessor) {
        const response = await this.messageProcessor.processMessage(audioMessage);
        if (response) {
          await this.sendMessage(message.from, response);
        }
      } else {
        await this.sendMessage(message.from, '❌ Processador de áudio não configurado.');
      }
      
    } catch (error) {
      console.error('❌ Erro ao processar áudio:', error);
      logger.error('Erro no processamento de áudio', {
        from: message.from,
        error: error.message
      });
      
      // Mensagens de erro específicas
      let errorMessage = '❌ Erro ao processar áudio. ';
      
      if (error.message.includes('Falha ao baixar')) {
        errorMessage += 'Não consegui baixar o áudio. Tente enviar novamente.';
      } else if (error.message.includes('muito grande')) {
        errorMessage += 'Áudio muito grande. Envie um áudio menor que 40MB.';
      } else if (error.message.includes('formato')) {
        errorMessage += 'Formato de áudio não suportado. Use MP3, WAV ou OGG.';
      } else {
        errorMessage += 'Tente novamente ou digite sua transação.';
      }
      
      await this.sendMessage(message.from, errorMessage);
    }
  }

  // Processar mensagem de imagem
  async handleImageMessage(message) {
    try {
      console.log('🔄 Processando imagem...');
      
      // Enviar mensagem de confirmação
      await this.sendMessage(message.from, '📸 Imagem recebida! Analisando produto...');
      
      // Baixar imagem
      const media = await message.downloadMedia();
      
      if (!media) {
        throw new Error('Falha ao baixar imagem');
      }
      
      // Validar tamanho do arquivo
      const maxSize = 20 * 1024 * 1024; // 20MB
      if (media.data && Buffer.from(media.data, 'base64').length > maxSize) {
        await this.sendMessage(message.from, '❌ Imagem muito grande. Por favor, envie uma imagem menor que 20MB.');
        return;
      }
      
      // Converter base64 para buffer
      const imageBuffer = Buffer.from(media.data, 'base64');
      
      console.log('📁 Imagem baixada:', {
        size: `${(imageBuffer.length / 1024).toFixed(2)}KB`,
        mimetype: media.mimetype
      });
      
      // Criar mensagem simulada para processamento
      const imageMessage = {
        ...message,
        hasImage: true,
        imageBuffer: imageBuffer,
        imageMimetype: media.mimetype,
        body: '[IMAGEM]' // Placeholder para identificação
      };
      
      // Processar com o processador de mensagens
      if (this.messageProcessor) {
        const response = await this.messageProcessor.processMessage(imageMessage);
        if (response) {
          await this.sendMessage(message.from, response);
        }
      } else {
        await this.sendMessage(message.from, '❌ Processador de imagem não configurado.');
      }
      
    } catch (error) {
      console.error('❌ Erro ao processar imagem:', error);
      logger.error('Erro no processamento de imagem', {
        from: message.from,
        error: error.message
      });
      
      // Mensagens de erro específicas
      let errorMessage = '❌ Erro ao processar imagem. ';
      
      if (error.message.includes('Falha ao baixar')) {
        errorMessage += 'Não consegui baixar a imagem. Tente enviar novamente.';
      } else if (error.message.includes('muito grande')) {
        errorMessage += 'Imagem muito grande. Envie uma imagem menor que 20MB.';
      } else if (error.message.includes('formato')) {
        errorMessage += 'Formato de imagem não suportado. Use JPG, PNG ou WebP.';
      } else {
        errorMessage += 'Tente novamente ou digite o nome do produto.';
      }
      
      await this.sendMessage(message.from, errorMessage);
    }
  }

  // Sanitizar mensagem para logs (proteger senhas)
  sanitizeMessageForLog(message) {
    if (!message) return message;
    
    // Verificar se parece ser uma senha (6-50 caracteres, sem espaços)
    if (message.length >= 6 && message.length <= 50 && !message.includes(' ')) {
      // Verificar se não é email ou transação comum
      if (!message.includes('@') && !message.toLowerCase().includes('real') && 
          !message.toLowerCase().includes('gastei') && !message.toLowerCase().includes('recebi')) {
        return '[POSSÍVEL SENHA PROTEGIDA]';
      }
    }
    
    return message;
  }

  // Enviar mensagem
  async sendMessage(to, message) {
    if (!this.isReady || !this.client) {
      throw new Error('WhatsApp Client não está pronto');
    }
    
    try {
      const result = await this.client.sendMessage(to, message);
      console.log(`📤 Mensagem enviada para ${to}: ${message}`);
      logger.info('Mensagem enviada', { to, message });
      return result;
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem:', error.message);
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
      
      // Limpar timeout se existir
      if (this.readyTimeout) {
        clearTimeout(this.readyTimeout);
        this.readyTimeout = null;
      }
      
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