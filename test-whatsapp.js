const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');

console.log('🧪 Teste isolado do WhatsApp Web.js');
console.log('📦 Versão whatsapp-web.js:', require('./node_modules/whatsapp-web.js/package.json').version);

// Configurações de teste com diferentes opções
const testConfigs = [
  {
    name: 'Configuração Padrão',
    config: {
      authStrategy: new LocalAuth({
        clientId: 'test-client',
        dataPath: path.join(process.cwd(), '.test_auth')
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
    }
  },
  {
    name: 'Configuração Alternativa',
    config: {
      authStrategy: new LocalAuth({
        clientId: 'test-client-alt',
        dataPath: path.join(process.cwd(), '.test_auth_alt')
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      }
    }
  }
];

let currentTestIndex = 0;
let client = null;
let readyTimeout = null;
let authTimeout = null;

function cleanup() {
  if (readyTimeout) clearTimeout(readyTimeout);
  if (authTimeout) clearTimeout(authTimeout);
  if (client) {
    try {
      client.destroy();
    } catch (error) {
      console.log('⚠️ Erro ao destruir cliente:', error.message);
    }
  }
}

function runTest(configIndex = 0) {
  if (configIndex >= testConfigs.length) {
    console.log('❌ Todos os testes falharam!');
    console.log('💡 Possíveis soluções:');
    console.log('   1. Verificar se o WhatsApp Web está funcionando no navegador');
    console.log('   2. Atualizar whatsapp-web.js: npm update whatsapp-web.js');
    console.log('   3. Limpar cache: rm -rf .wwebjs_auth .test_auth*');
    console.log('   4. Verificar firewall/antivírus');
    process.exit(1);
  }

  const testConfig = testConfigs[configIndex];
  console.log(`\n🧪 Executando teste ${configIndex + 1}/${testConfigs.length}: ${testConfig.name}`);
  
  cleanup();
  
  client = new Client(testConfig.config);
  
  // Timeout para autenticação (2 minutos)
  authTimeout = setTimeout(() => {
    console.log('⏰ Timeout: Autenticação não completada em 2 minutos');
    console.log('🔄 Tentando próxima configuração...');
    runTest(configIndex + 1);
  }, 120000);
  
  // Timeout para evento ready (45 segundos após autenticação)
  let readyTimeoutStarted = false;
  
  client.on('qr', (qr) => {
    console.log('📱 QR Code gerado!');
    qrcode.generate(qr, { small: true });
    console.log('📲 Escaneie o QR code acima com seu WhatsApp');
  });
  
  client.on('authenticated', () => {
    console.log('✅ Cliente autenticado com sucesso!');
    
    if (!readyTimeoutStarted) {
      readyTimeoutStarted = true;
      readyTimeout = setTimeout(() => {
        console.log('⚠️ PROBLEMA DETECTADO: Evento \'ready\' não disparou em 45 segundos!');
        console.log('🔍 Diagnóstico:');
        console.log('   - Autenticação: ✅ OK');
        console.log('   - Evento Ready: ❌ FALHOU');
        console.log('   - Possível causa: Incompatibilidade de versão ou problema de rede');
        console.log('🔄 Tentando próxima configuração...');
        runTest(configIndex + 1);
      }, 45000);
    }
  });
  
  client.on('ready', () => {
    console.log('🎉 SUCESSO! Cliente WhatsApp pronto!');
    
    try {
      const info = client.info;
      console.log(`📱 Conectado como: ${info.pushname} (${info.wid.user})`);
      console.log('✅ Teste concluído com sucesso!');
      
      // Enviar mensagem de teste para si mesmo
      const myNumber = info.wid.user + '@c.us';
      client.sendMessage(myNumber, '🧪 Teste de conexão WhatsApp Web.js - Funcionando perfeitamente!')
        .then(() => {
          console.log('📤 Mensagem de teste enviada!');
          console.log('🏁 Teste completo! Pressione Ctrl+C para sair.');
        })
        .catch(err => {
          console.log('⚠️ Erro ao enviar mensagem de teste:', err.message);
          console.log('🏁 Conexão OK, mas erro no envio. Pressione Ctrl+C para sair.');
        });
        
    } catch (error) {
      console.log('⚠️ Erro ao obter informações:', error.message);
      console.log('🏁 Conexão estabelecida! Pressione Ctrl+C para sair.');
    }
    
    cleanup();
  });
  
  client.on('auth_failure', (msg) => {
    console.log('❌ Falha na autenticação:', msg);
    console.log('🔄 Tentando próxima configuração...');
    runTest(configIndex + 1);
  });
  
  client.on('disconnected', (reason) => {
    console.log('🔌 Cliente desconectado:', reason);
    console.log('🔄 Tentando próxima configuração...');
    runTest(configIndex + 1);
  });
  
  // Capturar erros não tratados
  client.on('error', (error) => {
    console.log('❌ Erro do cliente:', error.message);
    console.log('🔄 Tentando próxima configuração...');
    runTest(configIndex + 1);
  });
  
  console.log('🚀 Inicializando cliente...');
  client.initialize().catch(error => {
    console.log('❌ Erro na inicialização:', error.message);
    console.log('🔄 Tentando próxima configuração...');
    runTest(configIndex + 1);
  });
}

// Capturar Ctrl+C para limpeza
process.on('SIGINT', () => {
  console.log('\n🛑 Interrompido pelo usuário');
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Processo terminado');
  cleanup();
  process.exit(0);
});

// Iniciar teste
console.log('🎯 Iniciando diagnóstico do WhatsApp Web.js...');
runTest(0);