const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Configurando Financial WhatsApp Agent...');

// Verificar se o arquivo .env existe
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

if (!fs.existsSync(envPath)) {
  console.log('📝 Criando arquivo .env...');
  fs.copyFileSync(envExamplePath, envPath);
  console.log('✅ Arquivo .env criado! Configure suas variáveis de ambiente.');
} else {
  console.log('✅ Arquivo .env já existe.');
}

// Criar diretórios necessários
const directories = [
  'logs',
  'public',
  'uploads',
  'temp'
];

directories.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Diretório ${dir} criado.`);
  }
});

// Verificar dependências
console.log('📦 Verificando dependências...');
try {
  execSync('npm list --depth=0', { stdio: 'pipe' });
  console.log('✅ Dependências instaladas.');
} catch (error) {
  console.log('⚠️ Algumas dependências podem estar faltando. Execute: npm install');
}

// Verificar variáveis de ambiente essenciais
console.log('🔧 Verificando configuração...');
require('dotenv').config();

const requiredEnvVars = [
  'GEMINI_API_KEY',
  'DATABASE_URL',
  'SUPABASE_URL'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.log('⚠️ Variáveis de ambiente faltando:');
  missingVars.forEach(varName => {
    console.log(`   - ${varName}`);
  });
  console.log('\n📝 Configure essas variáveis no arquivo .env');
} else {
  console.log('✅ Variáveis de ambiente configuradas.');
}

// Instruções finais
console.log('\n🎉 Setup concluído!');
console.log('\n📋 Próximos passos:');
console.log('1. Configure as variáveis de ambiente no arquivo .env');
console.log('2. Configure seu banco de dados (PostgreSQL ou Supabase)');
console.log('3. Execute: npm run dev');
console.log('4. Acesse: http://localhost:3000');
console.log('\n📚 Documentação: README.md');

// Criar arquivo de exemplo de configuração
const configExample = {
  database: {
    type: 'supabase', // ou 'postgresql'
    url: 'sua_url_do_banco',
    key: 'sua_chave_do_supabase'
  },
  gemini: {
    apiKey: 'sua_chave_da_api_gemini'
  },
  whatsapp: {
    sessionName: 'financial-agent-session',
    timeout: 60000
  },
  server: {
    port: 3000,
    environment: 'development'
  }
};

const configPath = path.join(__dirname, '..', 'config.example.json');
fs.writeFileSync(configPath, JSON.stringify(configExample, null, 2));
console.log('\n📄 Arquivo config.example.json criado para referência.');