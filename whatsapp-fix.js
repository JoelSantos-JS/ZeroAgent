// Correção para o problema do evento 'ready' no WhatsApp Web.js
// Este arquivo contém várias estratégias para resolver o problema

const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');

class WhatsAppFix {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.connectionStatus = 'disconnected';
    this.readyTimeout = null;
    this.retryCount = 0;
    this.maxRetries = 3;
  }

  // Configuração otimizada baseada em issues conhecidos
  getOptimizedConfig() {
    return {
      authStrategy: new LocalAuth({
        clientId: 'vox-agent-fixed',
        dataPath: path.join(process.cwd(), '.wwebjs_auth_fixed')
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
          '--disable-hang-monitor',
          '--disable-client-side-phishing-detection',
          '--disable-component-update',
          '--disable-default-apps',
          '--disable-domain-reliability',
          '--disable-extensions',
          '--disable-features=TranslateUI',
          '--disable-sync',
          '--hide-scrollbars',
          '--mute-audio',
          '--no-default-browser-check',
          '--no-pings',
          '--window-size=1366,768'
        ],
        // Configurações adicionais
        defaultViewport: null,
        devtools: false,
        timeout: 60000,
        protocolTimeout: 60000,
        slowMo: 0
      },
      // Configurações específicas do WhatsApp Web.js
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
      },
      // Timeout personalizado
      takeoverOnConflict: true,
      takeoverTimeoutMs: 60000
    };
  }

  async initialize() {
    try {
      console.log('🔧 Inicializando WhatsApp com correções...');
      
      this.client = new Client(this.getOptimizedConfig());
      this.setupEventHandlers();
      
      await this.client.initialize();
      
    } catch (error) {
      console.error('❌ Erro na inicialização:', error);
      
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        console.log(`🔄 Tentativa ${this.retryCount}/${this.maxRetries} em 5 segundos...`);
        
        setTimeout(() => {
          this.initialize();
        }, 5000);
      } else {
        console.error('❌ Máximo de tentativas atingido');
        throw error;
      }
    }
  }

  setupEventHandlers() {
    if (!this.client) return;

    this.client.on('qr', (qr) => {
      console.log('📱 QR Code gerado (versão corrigida)');
      // Aqui você pode integrar com sua lógica de QR code
    });

    this.client.on('authenticated', () => {
      console.log('🔐 Cliente autenticado');
      this.connectionStatus = 'authenticated';
      
      // Implementar timeout mais longo e com retry
      this.readyTimeout = setTimeout(() => {
        console.log('⚠️ Timeout do evento ready - Aplicando correção...');
        this.handleReadyTimeout();
      }, 60000); // 60 segundos em vez de 30
    });

    this.client.on('ready', () => {
      console.log('✅ Cliente pronto! (Correção aplicada com sucesso)');
      
      if (this.readyTimeout) {
        clearTimeout(this.readyTimeout);
        this.readyTimeout = null;
      }
      
      this.isReady = true;
      this.connectionStatus = 'ready';
      this.retryCount = 0; // Reset contador
      
      try {
        const info = this.client.info;
        console.log(`📱 Conectado como: ${info.pushname} (${info.wid.user})`);
      } catch (error) {
        console.log('⚠️ Erro ao obter info, mas conexão OK');
      }
    });

    this.client.on('auth_failure', (msg) => {
      console.error('❌ Falha na autenticação:', msg);
      this.connectionStatus = 'auth_failure';
    });

    this.client.on('disconnected', (reason) => {
      console.log('🔌 Desconectado:', reason);
      this.isReady = false;
      this.connectionStatus = 'disconnected';
      
      if (this.readyTimeout) {
        clearTimeout(this.readyTimeout);
        this.readyTimeout = null;
      }
    });

    // Capturar erros específicos
    this.client.on('error', (error) => {
      console.error('❌ Erro do cliente:', error.message);
    });
  }

  // Método para lidar com timeout do evento ready
  async handleReadyTimeout() {
    console.log('🔧 Aplicando correção para timeout do ready...');
    
    try {
      // Estratégia 1: Forçar refresh da página
      if (this.client.pupPage) {
        console.log('🔄 Tentando refresh da página...');
        await this.client.pupPage.reload({ waitUntil: 'networkidle0' });
        
        // Aguardar mais 30 segundos após reload
        setTimeout(() => {
          if (!this.isReady) {
            console.log('🔧 Refresh não funcionou, tentando reinicialização...');
            this.forceReconnect();
          }
        }, 30000);
      } else {
        this.forceReconnect();
      }
    } catch (error) {
      console.error('❌ Erro na correção:', error);
      this.forceReconnect();
    }
  }

  // Forçar reconexão
  async forceReconnect() {
    console.log('🔄 Forçando reconexão...');
    
    try {
      if (this.client) {
        await this.client.destroy();
      }
    } catch (error) {
      console.log('⚠️ Erro ao destruir cliente:', error.message);
    }
    
    // Aguardar e reinicializar
    setTimeout(() => {
      if (this.retryCount < this.maxRetries) {
        this.initialize();
      } else {
        console.error('❌ Máximo de reconexões atingido');
      }
    }, 3000);
  }

  getStatus() {
    return {
      isReady: this.isReady,
      connectionStatus: this.connectionStatus,
      retryCount: this.retryCount
    };
  }

  async disconnect() {
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = null;
    }
    
    if (this.client) {
      await this.client.destroy();
    }
    
    this.isReady = false;
    this.connectionStatus = 'disconnected';
  }
}

module.exports = WhatsAppFix;

// Exemplo de uso:
// const WhatsAppFix = require('./whatsapp-fix');
// const whatsappFix = new WhatsAppFix();
// whatsappFix.initialize();