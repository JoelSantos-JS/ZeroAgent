const fs = require('fs');
const path = require('path');
const databaseService = require('../config/database');
require('dotenv').config();

async function runMigrations() {
  try {
    console.log('🚀 Executando migrações do banco de dados...');
    
    // Inicializar conexão com o banco
    await databaseService.initialize();
    console.log('✅ Conexão com banco de dados estabelecida');
    
    // Ler o arquivo de schema
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Dividir o schema em comandos individuais
    const commands = schema
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));
    
    console.log(`📋 Executando ${commands.length} comandos SQL...`);
    
    // Executar cada comando
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      try {
        console.log(`🔄 Executando comando ${i + 1}/${commands.length}...`);
        await databaseService.query(command);
        console.log(`✅ Comando ${i + 1} executado com sucesso`);
      } catch (error) {
        // Ignorar erros de tabela já existente
        if (error.message.includes('already exists') || error.message.includes('duplicate key')) {
          console.log(`⚠️ Comando ${i + 1} ignorado (já existe): ${error.message}`);
        } else {
          console.error(`❌ Erro no comando ${i + 1}:`, error.message);
          throw error;
        }
      }
    }
    
    console.log('🎉 Migrações concluídas com sucesso!');
    console.log('\n📊 Tabelas criadas:');
    console.log('- users');
    console.log('- transactions');
    console.log('- products');
    console.log('- categories');
    console.log('- whatsapp_sessions');
    
  } catch (error) {
    console.error('❌ Erro durante as migrações:', error);
    process.exit(1);
  } finally {
    // Fechar conexão
    await databaseService.close();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations }; 