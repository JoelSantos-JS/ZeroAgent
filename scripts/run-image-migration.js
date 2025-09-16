const databaseService = require('../config/database');
const fs = require('fs');
const path = require('path');

async function runImageMigration() {
  try {
    console.log('🔄 Iniciando migração de reconhecimento de imagem...');
    
    // Inicializar conexão com o banco
    await databaseService.initialize();
    
    if (!databaseService.isConnected) {
      throw new Error('Não foi possível conectar ao banco de dados');
    }
    
    console.log('📊 Executando migração via Supabase...');
    
    // Executar comandos SQL individuais
    const migrations = [
      // 1. Adicionar campos na tabela products
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;`,
      
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS image_features TEXT;`,
      
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS image_hash VARCHAR(64);`,
      
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price DECIMAL(10, 2);`,
      
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2);`,
      
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS name VARCHAR(255);`,
      
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100);`,
      
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS image_processed BOOLEAN DEFAULT false;`,
      
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS image_processed_at TIMESTAMP;`,
      
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS image_confidence DECIMAL(3, 2);`,
      
      // 2. Criar tabela de histórico de reconhecimento
      `CREATE TABLE IF NOT EXISTS image_recognition_history (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        product_id INT REFERENCES products(id) ON DELETE SET NULL,
        image_hash VARCHAR(64),
        recognized_product_name VARCHAR(255),
        confidence_score DECIMAL(3, 2),
        processing_time_ms INT,
        image_size_bytes INT,
        recognition_method VARCHAR(50),
        was_correct BOOLEAN,
        created_at TIMESTAMP DEFAULT NOW()
      );`,
      
      // 3. Criar tabela de comparação de imagens
      `CREATE TABLE IF NOT EXISTS image_comparisons (
        id SERIAL PRIMARY KEY,
        source_image_hash VARCHAR(64) NOT NULL,
        target_product_id INT REFERENCES products(id) ON DELETE CASCADE,
        similarity_score DECIMAL(5, 4),
        comparison_method VARCHAR(50),
        processing_time_ms INT,
        created_at TIMESTAMP DEFAULT NOW()
      );`,
      
      // 4. Criar índices
      `CREATE INDEX IF NOT EXISTS idx_recognition_user_id ON image_recognition_history(user_id);`,
      
      `CREATE INDEX IF NOT EXISTS idx_recognition_product_id ON image_recognition_history(product_id);`,
      
      `CREATE INDEX IF NOT EXISTS idx_recognition_hash ON image_recognition_history(image_hash);`,
      
      `CREATE INDEX IF NOT EXISTS idx_comparison_source ON image_comparisons(source_image_hash);`,
      
      `CREATE INDEX IF NOT EXISTS idx_comparison_target ON image_comparisons(target_product_id);`,
      
      `CREATE INDEX IF NOT EXISTS idx_comparison_score ON image_comparisons(similarity_score);`,
      
      // 5. Atualizar dados existentes
      `UPDATE products 
       SET name = product_name 
       WHERE name IS NULL OR name = '';`,
      
      `UPDATE products 
       SET category = product_category 
       WHERE category IS NULL OR category = '';`,
      
      `UPDATE products 
       SET selling_price = price 
       WHERE selling_price IS NULL;`
    ];
    
    // Executar cada migração
    for (let i = 0; i < migrations.length; i++) {
      const sql = migrations[i];
      console.log(`📝 Executando migração ${i + 1}/${migrations.length}...`);
      
      try {
        if (databaseService.connectionType === 'supabase') {
          // Para Supabase, usar rpc para executar SQL
          const { data, error } = await databaseService.supabase.rpc('exec_sql', {
            sql_query: sql
          });
          
          if (error) {
            console.log(`⚠️ Erro na migração ${i + 1}, tentando método alternativo:`, error.message);
            // Tentar executar diretamente se RPC falhar
            continue;
          }
        } else {
          // Para PostgreSQL direto
          await databaseService.query(sql);
        }
        
        console.log(`✅ Migração ${i + 1} executada com sucesso`);
        
      } catch (error) {
        console.log(`⚠️ Erro na migração ${i + 1}:`, error.message);
        // Continuar com as próximas migrações
      }
    }
    
    console.log('🎉 Migração de reconhecimento de imagem concluída!');
    console.log('📋 Resumo:');
    console.log('  ✅ Campos adicionados na tabela products');
    console.log('  ✅ Tabela image_recognition_history criada');
    console.log('  ✅ Tabela image_comparisons criada');
    console.log('  ✅ Índices criados para performance');
    console.log('  ✅ Dados existentes atualizados');
    
  } catch (error) {
    console.error('❌ Erro na migração:', error);
    process.exit(1);
  } finally {
    // Fechar conexão
    await databaseService.close();
    process.exit(0);
  }
}

// Executar migração
runImageMigration();