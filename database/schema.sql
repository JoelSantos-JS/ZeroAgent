-- Criação do banco de dados para o agente financeiro
-- Execute este script no PostgreSQL ou use as migrações do Supabase

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    whatsapp_number VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

-- Tabela de transações financeiras
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    value DECIMAL(10, 2) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    transaction_date TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Índices para melhor performance
    INDEX idx_transactions_user_id (user_id),
    INDEX idx_transactions_category (category),
    INDEX idx_transactions_date (transaction_date)
);

-- Tabela de produtos
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    product_name VARCHAR(255) NOT NULL,
    product_category VARCHAR(100),
    price DECIMAL(10, 2) NOT NULL,
    purchase_date TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Índices para melhor performance
    INDEX idx_products_user_id (user_id),
    INDEX idx_products_category (product_category),
    INDEX idx_products_date (purchase_date)
);

-- Tabela de categorias predefinidas
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    type ENUM('transaction', 'product') NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de sessões do WhatsApp (para controle de estado)
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    session_data TEXT,
    is_active BOOLEAN DEFAULT true,
    last_activity TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_sessions_user_id (user_id),
    INDEX idx_sessions_active (is_active)
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

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para atualizar updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views úteis para relatórios
CREATE VIEW user_monthly_expenses AS
SELECT 
    u.id as user_id,
    u.name,
    DATE_TRUNC('month', t.transaction_date) as month,
    SUM(t.value) as total_expenses,
    COUNT(t.id) as transaction_count
FROM users u
LEFT JOIN transactions t ON u.id = t.user_id
GROUP BY u.id, u.name, DATE_TRUNC('month', t.transaction_date);

CREATE VIEW user_category_summary AS
SELECT 
    u.id as user_id,
    u.name,
    t.category,
    SUM(t.value) as total_spent,
    COUNT(t.id) as transaction_count,
    AVG(t.value) as avg_transaction
FROM users u
LEFT JOIN transactions t ON u.id = t.user_id
GROUP BY u.id, u.name, t.category;