const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

// Importar serviços
const financialAgent = require('./services/financial-agent');
const whatsappService = require('./services/whatsapp-service');
const databaseService = require('./config/database');
const authService = require('./services/auth-service');
const geminiService = require('./services/gemini-service');
const logger = require('./utils/logger');

// Configuração do Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  }
}));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos
app.use('/static', express.static(path.join(__dirname, 'public')));

// Middleware de log de requisições
app.use((req, res, next) => {
  logger.info('Requisição recebida', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Rotas da API

// Status da aplicação
app.get('/api/status', async (req, res) => {
  try {
    const status = {
      app: 'Financial WhatsApp Agent',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      services: {
        financialAgent: financialAgent.getStatus(),
        whatsapp: whatsappService.getStatus(),
        database: {
          connected: databaseService.isConnected,
          type: databaseService.connectionType
        },
        gemini: geminiService.getStatus(),
        auth: {
          firebase: authService.firebaseService.isInitialized
        }
      },
      environment: process.env.NODE_ENV || 'development'
    };
    
    res.json(status);
  } catch (error) {
    logger.error('Erro ao obter status', { error: error.message });
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// =====================================
// ROTAS DE AUTENTICAÇÃO
// =====================================

// Obter configuração do Firebase
app.get('/api/auth/config', (req, res) => {
  try {
    const config = authService.getFirebaseConfig();
    res.json({ config });
  } catch (error) {
    logger.error('Erro ao obter config Firebase', { error: error.message });
    res.status(500).json({ error: 'Erro ao obter configuração' });
  }
});

// Login/Autenticação
app.post('/api/auth/login', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ error: 'Token de autenticação obrigatório' });
    }
    
    const result = await authService.authenticateUser(idToken);
    
    if (result.success) {
      res.json({
        success: true,
        user: result.user,
        message: 'Autenticação realizada com sucesso'
      });
    } else {
      res.status(401).json({
        success: false,
        error: result.error,
        code: result.code
      });
    }
  } catch (error) {
    logger.error('Erro no login', { error: error.message });
    res.status(500).json({ error: 'Erro interno no login' });
  }
});

// Vincular número do WhatsApp
app.post('/api/auth/link-whatsapp', authService.requireAuth(), async (req, res) => {
  try {
    const { whatsappNumber } = req.body;
    const firebaseUid = req.user.uid;
    
    if (!whatsappNumber) {
      return res.status(400).json({ error: 'Número do WhatsApp obrigatório' });
    }
    
    const result = await authService.linkWhatsAppNumber(firebaseUid, whatsappNumber);
    
    if (result.success) {
      res.json({
        success: true,
        user: result.user,
        message: 'WhatsApp vinculado com sucesso'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        code: result.code
      });
    }
  } catch (error) {
    logger.error('Erro ao vincular WhatsApp', { error: error.message });
    res.status(500).json({ error: 'Erro interno ao vincular WhatsApp' });
  }
});

// Verificar perfil do usuário
app.get('/api/auth/profile', authService.requireAuth(), async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    const result = await authService.getUserByFirebaseUid(firebaseUid);
    
    if (result.success) {
      res.json({
        success: true,
        user: result.user
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error,
        code: result.code
      });
    }
  } catch (error) {
    logger.error('Erro ao obter perfil', { error: error.message });
    res.status(500).json({ error: 'Erro interno ao obter perfil' });
  }
});

// Verificar status do WhatsApp
app.get('/api/auth/whatsapp-status', authService.requireAuth(), async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    const result = await authService.hasWhatsAppLinked(firebaseUid);
    
    res.json(result);
  } catch (error) {
    logger.error('Erro ao verificar status WhatsApp', { error: error.message });
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Inicializar WhatsApp
app.post('/api/whatsapp/initialize', async (req, res) => {
  try {
    await whatsappService.initialize(true);
    res.json({ success: true, message: 'WhatsApp inicializado com sucesso' });
  } catch (error) {
    logger.error('Erro ao inicializar WhatsApp', { error: error.message });
    res.status(500).json({ error: 'Erro ao inicializar WhatsApp: ' + error.message });
  }
});

// Obter QR Code
app.get('/api/whatsapp/qr', (req, res) => {
  try {
    const status = whatsappService.getStatus();
    if (status.qrCode) {
      res.json({ 
        qrCode: status.qrCode,
        qrCodeSvg: status.qrCodeSvg,
        status: status.connectionStatus 
      });
    } else {
      res.json({ 
        qrCode: null, 
        qrCodeSvg: null,
        status: status.connectionStatus 
      });
    }
  } catch (error) {
    logger.error('Erro ao obter QR Code', { error: error.message });
    res.status(500).json({ error: 'Erro ao obter QR Code' });
  }
});

// Resetar WhatsApp
app.post('/api/whatsapp/reset', async (req, res) => {
  try {
    await whatsappService.reset();
    res.json({ success: true, message: 'WhatsApp resetado com sucesso' });
  } catch (error) {
    logger.error('Erro ao resetar WhatsApp', { error: error.message });
    res.status(500).json({ error: 'Erro ao resetar WhatsApp: ' + error.message });
  }
});

// Desconectar WhatsApp
app.post('/api/whatsapp/disconnect', async (req, res) => {
  try {
    await whatsappService.disconnect();
    res.json({ success: true, message: 'WhatsApp desconectado com sucesso' });
  } catch (error) {
    logger.error('Erro ao desconectar WhatsApp', { error: error.message });
    res.status(500).json({ error: 'Erro ao desconectar WhatsApp: ' + error.message });
  }
});

// Enviar mensagem (para testes)
app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({ error: 'Parâmetros "to" e "message" são obrigatórios' });
    }
    
    await whatsappService.sendMessage(to, message);
    res.json({ success: true, message: 'Mensagem enviada com sucesso' });
  } catch (error) {
    logger.error('Erro ao enviar mensagem', { error: error.message });
    res.status(500).json({ error: 'Erro ao enviar mensagem: ' + error.message });
  }
});

// Processar mensagem (para testes)
app.post('/api/process-message', async (req, res) => {
  try {
    const { message, from } = req.body;
    
    if (!message || !from) {
      return res.status(400).json({ error: 'Parâmetros "message" e "from" são obrigatórios' });
    }
    
    // Simular objeto de mensagem do WhatsApp
    const mockMessage = {
      body: message,
      from: from,
      id: { _serialized: `test_${Date.now()}` },
      timestamp: Date.now(),
      fromMe: false,
      isStatus: false
    };
    
    const response = await financialAgent.processMessage(mockMessage);
    res.json({ success: true, response });
  } catch (error) {
    logger.error('Erro ao processar mensagem de teste', { error: error.message });
    res.status(500).json({ error: 'Erro ao processar mensagem: ' + error.message });
  }
});

// Estatísticas do usuário (protegida por autenticação)
app.get('/api/user/stats', authService.requireAuth(), async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    
    // Buscar usuário pelo Firebase UID
    const user = await databaseService.getUserByFirebaseUid(firebaseUid);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    // Obter estatísticas
    const userService = require('./services/user-service');
    const stats = await userService.getUserStats(user.id);
    
    res.json({ 
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email,
        whatsappNumber: user.whatsapp_number 
      }, 
      stats 
    });
  } catch (error) {
    logger.error('Erro ao obter estatísticas', { error: error.message });
    res.status(500).json({ error: 'Erro ao obter estatísticas do usuário' });
  }
});

// Estatísticas por WhatsApp (para compatibilidade - sem autenticação)
app.get('/api/user/:whatsappNumber/stats', async (req, res) => {
  try {
    const { whatsappNumber } = req.params;
    const userService = require('./services/user-service');
    
    const user = await userService.getOrCreateUser(whatsappNumber);
    const stats = await userService.getUserStats(user.id);
    
    res.json({ success: true, stats });
  } catch (error) {
    logger.error('Erro ao obter estatísticas do usuário', { error: error.message });
    res.status(500).json({ error: 'Erro ao obter estatísticas: ' + error.message });
  }
});

// Rota principal - Interface web (com autenticação automática via WhatsApp)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota de autenticação Firebase (opcional)
app.get('/auth', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

// Middleware de tratamento de erros
app.use((error, req, res, next) => {
  logger.error('Erro não tratado', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method
  });
  
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Algo deu errado'
  });
});

// Middleware para rotas não encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    message: `A rota ${req.method} ${req.originalUrl} não existe`
  });
});

// Função para inicializar a aplicação
async function startApplication() {
  try {
    console.log('🚀 Iniciando Financial WhatsApp Agent...');
    
    // Inicializar banco de dados
    await databaseService.initialize();
    console.log('✅ Banco de dados conectado');
    
    // Inicializar serviço de autenticação
    await authService.initialize();
    console.log('✅ Serviço de autenticação inicializado');
    
    // Inicializar agente financeiro
    await financialAgent.initialize();
    console.log('✅ Agente financeiro inicializado');
    
    // Configurar processador de mensagens do WhatsApp
    whatsappService.setMessageProcessor(financialAgent);
    
    // Iniciar servidor
    const server = app.listen(PORT, async () => {
      console.log(`🌐 Servidor rodando na porta ${PORT}`);
      console.log(`📱 Acesse: http://localhost:${PORT}`);
      console.log(`🔐 Autenticação Firebase habilitada`);
      
      logger.info('Aplicação iniciada', {
        port: PORT.toString(),
        timestamp: new Date().toISOString(),
        auth: 'Firebase enabled'
      });
      
      // WhatsApp será inicializado via API /api/whatsapp/initialize
      console.log('💡 Para conectar o WhatsApp, use: POST /api/whatsapp/initialize');
    });
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('🔄 Recebido SIGTERM, encerrando aplicação...');
      
      server.close(async () => {
        try {
          await whatsappService.disconnect();
          await databaseService.close();
          console.log('✅ Aplicação encerrada com sucesso');
          process.exit(0);
        } catch (error) {
          console.error('❌ Erro ao encerrar aplicação:', error);
          process.exit(1);
        }
      });
    });
    
    process.on('SIGINT', async () => {
      console.log('🔄 Recebido SIGINT, encerrando aplicação...');
      
      server.close(async () => {
        try {
          await whatsappService.disconnect();
          await databaseService.close();
          console.log('✅ Aplicação encerrada com sucesso');
          process.exit(0);
        } catch (error) {
          console.error('❌ Erro ao encerrar aplicação:', error);
          process.exit(1);
        }
      });
    });
    
  } catch (error) {
    console.error('❌ Erro ao iniciar aplicação:', error);
    logger.error('Erro na inicialização da aplicação', { error: error.message });
    process.exit(1);
  }
}

// Iniciar aplicação
if (require.main === module) {
  startApplication();
}

module.exports = app;