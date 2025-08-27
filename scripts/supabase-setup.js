const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function setupSupabase() {
  try {
    console.log('🚀 Configurando Supabase...');
    
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log('✅ Conectado ao Supabase');
    
    // Testar conexão
    const { data: testData, error: testError } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (testError && testError.code === 'PGRST116') {
      console.log('⚠️ Tabela users não existe. Você precisa criar as tabelas manualmente no Supabase.');
      console.log('\n📋 Execute o seguinte SQL no Editor SQL do Supabase:');
      console.log(`
-- Criar tabela users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  whatsapp_number VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- Criar tabela transactions
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  value DECIMAL(10, 2) NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT,
  transaction_date TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Criar tabela products
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  product_name VARCHAR(255) NOT NULL,
  product_category VARCHAR(100),
  price DECIMAL(10, 2) NOT NULL,
  purchase_date TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Criar tabela categories
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  type VARCHAR(20) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Inserir categorias padrão
INSERT INTO categories (name, type, description) VALUES
('alimentacao', 'transaction', 'Gastos com alimentação'),
('transporte', 'transaction', 'Gastos com transporte'),
('supermercado', 'transaction', 'Compras no supermercado'),
('saude', 'transaction', 'Gastos com saúde'),
('educacao', 'transaction', 'Gastos com educação'),
('lazer', 'transaction', 'Gastos com lazer'),
('casa', 'transaction', 'Gastos domésticos'),
('roupas', 'transaction', 'Gastos com vestuário'),
('tecnologia', 'product', 'Produtos de tecnologia'),
('casa_decoracao', 'product', 'Produtos para casa'),
('roupas_acessorios', 'product', 'Roupas e acessórios'),
('livros', 'product', 'Livros e materiais educativos'),
('esportes', 'product', 'Produtos esportivos')
ON CONFLICT (name) DO NOTHING;
      `);
      
      console.log('\n🔗 Acesse: https://supabase.com/dashboard/project/[SEU_PROJETO]/sql');
      console.log('📝 Cole o SQL acima e execute');
      
    } else {
      console.log('✅ Tabelas já existem no Supabase');
      
      // Inserir categorias padrão se não existirem
      console.log('📋 Verificando categorias padrão...');
      const categories = [
        { name: 'alimentacao', type: 'transaction', description: 'Gastos com alimentação' },
        { name: 'transporte', type: 'transaction', description: 'Gastos com transporte' },
        { name: 'supermercado', type: 'transaction', description: 'Compras no supermercado' },
        { name: 'saude', type: 'transaction', description: 'Gastos com saúde' },
        { name: 'educacao', type: 'transaction', description: 'Gastos com educação' },
        { name: 'lazer', type: 'transaction', description: 'Gastos com lazer' },
        { name: 'casa', type: 'transaction', description: 'Gastos domésticos' },
        { name: 'roupas', type: 'transaction', description: 'Gastos com vestuário' },
        { name: 'tecnologia', type: 'product', description: 'Produtos de tecnologia' },
        { name: 'casa_decoracao', type: 'product', description: 'Produtos para casa' },
        { name: 'roupas_acessorios', type: 'product', description: 'Roupas e acessórios' },
        { name: 'livros', type: 'product', description: 'Livros e materiais educativos' },
        { name: 'esportes', type: 'product', description: 'Produtos esportivos' }
      ];
      
      for (const category of categories) {
        const { error } = await supabase
          .from('categories')
          .upsert(category, { onConflict: 'name' });
        
        if (error) {
          console.log(`⚠️ Erro ao inserir categoria ${category.name}:`, error.message);
        }
      }
      
      console.log('✅ Categorias padrão verificadas');
    }
    
    console.log('🎉 Setup do Supabase concluído!');
    
  } catch (error) {
    console.error('❌ Erro durante setup do Supabase:', error);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  setupSupabase();
}

module.exports = { setupSupabase }; 