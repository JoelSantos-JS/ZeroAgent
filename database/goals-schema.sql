-- Schema para Sistema de Metas Financeiras
-- Adicionar ao schema principal do banco de dados

-- Tabela de metas financeiras
CREATE TABLE IF NOT EXISTS goals (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    target_amount DECIMAL(12, 2) NOT NULL CHECK (target_amount > 0),
    current_amount DECIMAL(12, 2) DEFAULT 0.00 CHECK (current_amount >= 0),
    category VARCHAR(100) NOT NULL,
    goal_type VARCHAR(50) NOT NULL CHECK (goal_type IN ('saving', 'expense_limit', 'income_target', 'investment', 'debt_payment')),
    target_date DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
    priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    auto_update BOOLEAN DEFAULT true, -- Se deve ser atualizada automaticamente com transações
    reminder_frequency VARCHAR(20) DEFAULT 'weekly' CHECK (reminder_frequency IN ('daily', 'weekly', 'monthly', 'never')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP NULL,
    
    -- Índices para melhor performance
    INDEX idx_goals_user_id (user_id),
    INDEX idx_goals_status (status),
    INDEX idx_goals_category (category),
    INDEX idx_goals_type (goal_type),
    INDEX idx_goals_target_date (target_date)
);

-- Tabela de histórico de progresso das metas
CREATE TABLE IF NOT EXISTS goal_progress_history (
    id SERIAL PRIMARY KEY,
    goal_id INT REFERENCES goals(id) ON DELETE CASCADE,
    previous_amount DECIMAL(12, 2) NOT NULL,
    new_amount DECIMAL(12, 2) NOT NULL,
    change_amount DECIMAL(12, 2) NOT NULL,
    change_reason VARCHAR(100), -- 'transaction', 'manual_update', 'correction'
    transaction_id INT NULL, -- Referência à transação que causou a mudança
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_progress_goal_id (goal_id),
    INDEX idx_progress_date (created_at)
);

-- Tabela de categorias de metas
CREATE TABLE IF NOT EXISTS goal_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(50), -- Emoji ou nome do ícone
    color VARCHAR(7), -- Código hexadecimal da cor
    goal_type VARCHAR(50) NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Inserir categorias padrão de metas
INSERT INTO goal_categories (name, description, icon, color, goal_type, is_default) VALUES
-- Metas de Economia
('Reserva de Emergência', 'Meta para criar uma reserva de emergência', '🚨', '#FF6B6B', 'saving', true),
('Viagem', 'Economizar para uma viagem', '✈️', '#4ECDC4', 'saving', true),
('Casa Própria', 'Juntar dinheiro para comprar uma casa', '🏠', '#45B7D1', 'saving', true),
('Carro', 'Economizar para comprar um carro', '🚗', '#96CEB4', 'saving', true),
('Educação', 'Investir em educação e cursos', '📚', '#FFEAA7', 'saving', true),

-- Limites de Gastos
('Alimentação', 'Controlar gastos com alimentação', '🍽️', '#FD79A8', 'expense_limit', true),
('Transporte', 'Limitar gastos com transporte', '🚌', '#FDCB6E', 'expense_limit', true),
('Lazer', 'Controlar gastos com entretenimento', '🎮', '#6C5CE7', 'expense_limit', true),
('Roupas', 'Limitar compras de roupas', '👕', '#A29BFE', 'expense_limit', true),
('Supermercado', 'Controlar gastos no supermercado', '🛒', '#FD79A8', 'expense_limit', true),

-- Metas de Renda
('Renda Extra', 'Meta de renda adicional', '💰', '#00B894', 'income_target', true),
('Freelance', 'Renda com trabalhos freelance', '💻', '#00CEC9', 'income_target', true),
('Vendas', 'Meta de vendas mensais', '📈', '#E17055', 'income_target', true),

-- Investimentos
('Ações', 'Investir em ações', '📊', '#0984E3', 'investment', true),
('Tesouro Direto', 'Investir no Tesouro Direto', '🏛️', '#2D3436', 'investment', true),
('Fundos', 'Investir em fundos de investimento', '📈', '#00B894', 'investment', true),

-- Pagamento de Dívidas
('Cartão de Crédito', 'Quitar dívida do cartão', '💳', '#E74C3C', 'debt_payment', true),
('Financiamento', 'Quitar financiamento', '🏦', '#E67E22', 'debt_payment', true),
('Empréstimo', 'Quitar empréstimo', '💸', '#E74C3C', 'debt_payment', true)
ON CONFLICT (name) DO NOTHING;

-- Trigger para atualizar updated_at na tabela goals
CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON goals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Função para calcular progresso percentual
CREATE OR REPLACE FUNCTION calculate_goal_progress(goal_id INT)
RETURNS DECIMAL(5,2) AS $$
DECLARE
    goal_record RECORD;
    progress_percentage DECIMAL(5,2);
BEGIN
    SELECT target_amount, current_amount INTO goal_record
    FROM goals WHERE id = goal_id;
    
    IF goal_record.target_amount = 0 THEN
        RETURN 0;
    END IF;
    
    progress_percentage := (goal_record.current_amount / goal_record.target_amount) * 100;
    
    -- Limitar a 100%
    IF progress_percentage > 100 THEN
        progress_percentage := 100;
    END IF;
    
    RETURN progress_percentage;
END;
$$ LANGUAGE plpgsql;

-- View para relatório de metas do usuário
CREATE VIEW user_goals_summary AS
SELECT 
    g.id,
    g.user_id,
    u.name as user_name,
    g.title,
    g.description,
    g.target_amount,
    g.current_amount,
    g.category,
    g.goal_type,
    g.target_date,
    g.status,
    g.priority,
    calculate_goal_progress(g.id) as progress_percentage,
    CASE 
        WHEN g.target_date IS NOT NULL THEN 
            EXTRACT(DAYS FROM (g.target_date - CURRENT_DATE))
        ELSE NULL 
    END as days_remaining,
    g.created_at,
    g.updated_at,
    gc.icon as category_icon,
    gc.color as category_color
FROM goals g
JOIN users u ON g.user_id = u.id
LEFT JOIN goal_categories gc ON g.category = gc.name;

-- View para metas próximas do vencimento
CREATE VIEW goals_due_soon AS
SELECT 
    g.*,
    u.name as user_name,
    u.whatsapp_number,
    calculate_goal_progress(g.id) as progress_percentage,
    EXTRACT(DAYS FROM (g.target_date - CURRENT_DATE)) as days_remaining
FROM goals g
JOIN users u ON g.user_id = u.id
WHERE g.status = 'active' 
    AND g.target_date IS NOT NULL 
    AND g.target_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days';

-- View para metas completadas recentemente
CREATE VIEW recently_completed_goals AS
SELECT 
    g.*,
    u.name as user_name,
    u.whatsapp_number,
    calculate_goal_progress(g.id) as progress_percentage
FROM goals g
JOIN users u ON g.user_id = u.id
WHERE g.status = 'completed' 
    AND g.completed_at >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY g.completed_at DESC;