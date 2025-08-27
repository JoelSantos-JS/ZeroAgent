-- Script para corrigir estrutura do banco para o Agente Financeiro WhatsApp
-- Baseado na estrutura existente do Supabase

-- =====================================
-- VERIFICAR ESTRUTURA ATUAL
-- =====================================

-- 1. Verificar tabelas existentes
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'transactions', 'products', 'categories')
ORDER BY table_name;

-- 2. Verificar colunas da tabela users
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- =====================================
-- ADICIONAR COLUNA WHATSAPP_NUMBER
-- =====================================

-- Adicionar coluna whatsapp_number na tabela users existente
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20) UNIQUE;

-- Adicionar coluna firebase_uid para autenticação
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128) UNIQUE;

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_users_whatsapp ON users(whatsapp_number);
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- =====================================
-- CRIAR TABELAS PARA AUTENTICAÇÃO VIA WHATSAPP
-- =====================================

-- Tabela para sessões de usuário (WhatsApp Auth)
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para processos de autenticação
CREATE TABLE IF NOT EXISTS auth_processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  step VARCHAR(50) NOT NULL,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para as novas tabelas
CREATE INDEX IF NOT EXISTS idx_user_sessions_phone ON user_sessions(phone_number);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_auth_processes_phone ON auth_processes(phone_number);
CREATE INDEX IF NOT EXISTS idx_auth_processes_step ON auth_processes(step);

-- =====================================
-- CORRIGIR TABELA TRANSACTIONS
-- =====================================

-- Verificar se as colunas necessárias existem na tabela transactions
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'transactions'
ORDER BY ordinal_position;

-- Adicionar colunas necessárias para o agente financeiro
-- (baseado na estrutura existente que usa 'amount' ao invés de 'value')
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS value DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Copiar dados de 'amount' para 'value' se necessário
UPDATE transactions 
SET value = amount 
WHERE value IS NULL AND amount IS NOT NULL;

-- Copiar dados de 'date' para 'transaction_date' se necessário
UPDATE transactions 
SET transaction_date = date 
WHERE transaction_date IS NULL AND date IS NOT NULL;

-- =====================================
-- CORRIGIR TABELA PRODUCTS
-- =====================================

-- Verificar colunas da tabela products
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'products'
ORDER BY ordinal_position;

-- Adicionar colunas necessárias para compatibilidade
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS product_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS product_category VARCHAR(100),
ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2);

-- Copiar dados das colunas existentes se necessário
UPDATE products 
SET product_name = name 
WHERE product_name IS NULL AND name IS NOT NULL;

UPDATE products 
SET product_category = category 
WHERE product_category IS NULL AND category IS NOT NULL;

UPDATE products 
SET price = selling_price 
WHERE price IS NULL AND selling_price IS NOT NULL;

-- =====================================
-- CRIAR TABELA CATEGORIES SIMPLES
-- =====================================

-- Criar tabela categories para o agente financeiro
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('transaction', 'product')),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserir categorias padrão para o agente financeiro
INSERT INTO categories (name, type, description) VALUES
('salario', 'transaction', 'Receitas de salário'),
('freelance', 'transaction', 'Receitas de freelance'),
('vendas', 'transaction', 'Receitas de vendas'),
('alimentacao', 'transaction', 'Gastos com alimentação'),
('transporte', 'transaction', 'Gastos com transporte'),
('supermercado', 'transaction', 'Compras no supermercado'),
('saude', 'transaction', 'Gastos com saúde'),
('educacao', 'transaction', 'Gastos com educação'),
('lazer', 'transaction', 'Gastos com lazer'),
('casa', 'transaction', 'Gastos domésticos'),
('roupas', 'transaction', 'Gastos com vestuário'),
('aluguel', 'transaction', 'Pagamento de aluguel'),
('financiamento', 'transaction', 'Pagamentos de financiamento'),
('seguro', 'transaction', 'Pagamentos de seguro'),
('assinatura', 'transaction', 'Assinaturas e mensalidades'),
('aplicacao', 'transaction', 'Investimentos em aplicações'),
('acoes', 'transaction', 'Investimentos em ações'),
('fundos', 'transaction', 'Investimentos em fundos'),
('tecnologia', 'product', 'Produtos de tecnologia'),
('casa_decoracao', 'product', 'Produtos para casa'),
('roupas_acessorios', 'product', 'Roupas e acessórios'),
('livros', 'product', 'Livros e materiais educativos'),
('esportes', 'product', 'Produtos esportivos')
ON CONFLICT (name) DO NOTHING;

-- =====================================
-- VERIFICAR FOREIGN KEYS
-- =====================================

-- Verificar se foreign key existe entre transactions e users
SELECT constraint_name, table_name, column_name
FROM information_schema.key_column_usage
WHERE table_schema = 'public' 
AND table_name = 'transactions'
AND column_name = 'user_id';

-- Verificar se foreign key existe entre products e users
SELECT constraint_name, table_name, column_name
FROM information_schema.key_column_usage
WHERE table_schema = 'public' 
AND table_name = 'products'
AND column_name = 'user_id';

-- =====================================
-- CRIAR ÍNDICES PARA PERFORMANCE
-- =====================================

-- Índices para transactions
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_value ON transactions(value);

-- Índices para products
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_product_category ON products(product_category);
CREATE INDEX IF NOT EXISTS idx_products_purchase_date ON products(purchase_date);

-- =====================================
-- TESTAR ESTRUTURA FINAL
-- =====================================

-- Testar se podemos inserir um usuário
INSERT INTO users (whatsapp_number, name, email) 
VALUES ('test_whatsapp_123', 'Teste Usuario', 'teste@example.com') 
ON CONFLICT (whatsapp_number) DO NOTHING;

-- Obter ID do usuário de teste
SELECT id FROM users WHERE whatsapp_number = 'test_whatsapp_123' LIMIT 1;

-- Testar se podemos inserir uma transação
WITH test_user AS (
  SELECT id FROM users WHERE whatsapp_number = 'test_whatsapp_123' LIMIT 1
)
INSERT INTO transactions (user_id, amount, value, type, category, description, date, transaction_date)
SELECT id, 50.00, 50.00, 'expense', 'alimentacao', 'Teste de transação', NOW(), NOW()
FROM test_user;

-- Testar se podemos inserir um produto
WITH test_user AS (
  SELECT id FROM users WHERE whatsapp_number = 'test_whatsapp_123' LIMIT 1
)
INSERT INTO products (user_id, name, product_name, category, product_category, selling_price, price, purchase_date)
SELECT id, 'Produto Teste', 'Produto Teste', 'tecnologia', 'tecnologia', 100.00, 100.00, NOW()
FROM test_user;

-- Limpar dados de teste
DELETE FROM transactions WHERE description = 'Teste de transação';
DELETE FROM products WHERE name = 'Produto Teste' OR product_name = 'Produto Teste';
DELETE FROM users WHERE whatsapp_number = 'test_whatsapp_123';

-- =====================================
-- VERIFICAÇÃO FINAL
-- =====================================

-- Verificar estrutura final das tabelas principais
SELECT 
  t.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_schema = 'public' 
  AND t.table_name IN ('users', 'transactions', 'products', 'categories')
  AND c.table_schema = 'public'
ORDER BY t.table_name, c.ordinal_position;

-- Verificar se as colunas necessárias existem
SELECT 
  'users.whatsapp_number' as required_column,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'whatsapp_number'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 
  'transactions.value' as required_column,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'value'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 
  'transactions.transaction_date' as required_column,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'transaction_date'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 
  'products.product_name' as required_column,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'product_name'
  ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status;

SELECT 'Database structure updated for WhatsApp Financial Agent!' as status;