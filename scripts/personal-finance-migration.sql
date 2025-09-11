-- Personal Finance Tables Migration
-- Adiciona tabelas específicas para finanças pessoais ao sistema existente

-- =====================================
-- ENUM TYPES FOR PERSONAL FINANCE
-- =====================================

-- Personal Income Categories
CREATE TYPE personal_income_category AS ENUM (
    'salary', 'freelance', 'investment', 'rental', 'bonus', 
    'gift', 'pension', 'benefit', 'other'
);

-- Personal Expense Categories
CREATE TYPE personal_expense_category AS ENUM (
    'housing', 'food', 'transportation', 'healthcare', 'education', 
    'entertainment', 'clothing', 'utilities', 'insurance', 'personal_care', 
    'gifts', 'pets', 'charity', 'taxes', 'debt_payment', 'savings', 'other'
);

-- Payment Methods
CREATE TYPE personal_payment_method AS ENUM (
    'cash', 'debit_card', 'credit_card', 'pix', 'bank_transfer', 'automatic_debit'
);

-- Goal Types
CREATE TYPE personal_goal_type AS ENUM (
    'emergency_fund', 'savings', 'debt_payoff', 'investment', 'purchase', 
    'vacation', 'retirement', 'education', 'home_purchase', 'wedding', 'other'
);

-- Goal Status
CREATE TYPE personal_goal_status AS ENUM ('active', 'paused', 'completed', 'cancelled');

-- Priority Levels
CREATE TYPE personal_priority AS ENUM ('low', 'medium', 'high', 'critical');

-- Budget Status
CREATE TYPE budget_status AS ENUM ('active', 'completed', 'exceeded');

-- =====================================
-- PERSONAL INCOMES TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS personal_incomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    category personal_income_category NOT NULL,
    source TEXT NOT NULL,
    is_recurring BOOLEAN DEFAULT false,
    recurring_info JSONB,
    is_taxable BOOLEAN DEFAULT false,
    tax_withheld DECIMAL(10,2) DEFAULT 0,
    notes TEXT,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================
-- PERSONAL EXPENSES TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS personal_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    category personal_expense_category NOT NULL,
    subcategory TEXT,
    payment_method personal_payment_method NOT NULL,
    is_essential BOOLEAN DEFAULT false,
    is_recurring BOOLEAN DEFAULT false,
    recurring_info JSONB,
    location TEXT,
    merchant TEXT,
    receipt_url TEXT,
    is_tax_deductible BOOLEAN DEFAULT false,
    notes TEXT,
    tags TEXT[],
    is_installment BOOLEAN DEFAULT false,
    installment_info JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================
-- PERSONAL BUDGETS TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS personal_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL CHECK (year >= 2020),
    categories JSONB NOT NULL, -- {"housing": 1500, "food": 800, ...}
    total_budget DECIMAL(10,2) NOT NULL,
    total_spent DECIMAL(10,2) DEFAULT 0,
    total_remaining DECIMAL(10,2) DEFAULT 0,
    status budget_status DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, month, year)
);

-- =====================================
-- PERSONAL GOALS TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS personal_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    type personal_goal_type NOT NULL,
    target_amount DECIMAL(10,2) NOT NULL,
    current_amount DECIMAL(10,2) DEFAULT 0,
    deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    priority personal_priority DEFAULT 'medium',
    status personal_goal_status DEFAULT 'active',
    monthly_contribution DECIMAL(10,2),
    auto_contribution JSONB, -- {"enabled": true, "amount": 500, "day": 5}
    milestones JSONB, -- [{"amount": 1000, "description": "First milestone", "completed": false}]
    progress_percentage DECIMAL(5,2) GENERATED ALWAYS AS (
        CASE 
            WHEN target_amount > 0 THEN (current_amount / target_amount * 100)
            ELSE 0 
        END
    ) STORED,
    estimated_completion_date TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_date TIMESTAMP WITH TIME ZONE
);

-- =====================================
-- INDEXES FOR PERFORMANCE
-- =====================================

-- Personal Incomes
CREATE INDEX idx_personal_incomes_user_id ON personal_incomes(user_id);
CREATE INDEX idx_personal_incomes_date ON personal_incomes(date);
CREATE INDEX idx_personal_incomes_category ON personal_incomes(category);
CREATE INDEX idx_personal_incomes_is_recurring ON personal_incomes(is_recurring);

-- Personal Expenses
CREATE INDEX idx_personal_expenses_user_id ON personal_expenses(user_id);
CREATE INDEX idx_personal_expenses_date ON personal_expenses(date);
CREATE INDEX idx_personal_expenses_category ON personal_expenses(category);
CREATE INDEX idx_personal_expenses_is_essential ON personal_expenses(is_essential);
CREATE INDEX idx_personal_expenses_payment_method ON personal_expenses(payment_method);

-- Personal Budgets
CREATE INDEX idx_personal_budgets_user_id ON personal_budgets(user_id);
CREATE INDEX idx_personal_budgets_month_year ON personal_budgets(month, year);
CREATE INDEX idx_personal_budgets_status ON personal_budgets(status);

-- Personal Goals
CREATE INDEX idx_personal_goals_user_id ON personal_goals(user_id);
CREATE INDEX idx_personal_goals_status ON personal_goals(status);
CREATE INDEX idx_personal_goals_deadline ON personal_goals(deadline);
CREATE INDEX idx_personal_goals_type ON personal_goals(type);

-- =====================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================

-- Enable RLS on all personal finance tables
ALTER TABLE personal_incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_goals ENABLE ROW LEVEL SECURITY;

-- Personal Incomes policies
CREATE POLICY personal_incomes_own_data ON personal_incomes FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE firebase_uid = auth.uid()::text)
);

-- Personal Expenses policies
CREATE POLICY personal_expenses_own_data ON personal_expenses FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE firebase_uid = auth.uid()::text)
);

-- Personal Budgets policies
CREATE POLICY personal_budgets_own_data ON personal_budgets FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE firebase_uid = auth.uid()::text)
);

-- Personal Goals policies
CREATE POLICY personal_goals_own_data ON personal_goals FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE firebase_uid = auth.uid()::text)
);

-- =====================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_personal_incomes_updated_at 
    BEFORE UPDATE ON personal_incomes 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_personal_expenses_updated_at 
    BEFORE UPDATE ON personal_expenses 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_personal_budgets_updated_at 
    BEFORE UPDATE ON personal_budgets 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_personal_goals_updated_at 
    BEFORE UPDATE ON personal_goals 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================
-- FUNCTIONS FOR PERSONAL FINANCE
-- =====================================

-- Function to update budget totals when expenses change
CREATE OR REPLACE FUNCTION update_budget_totals()
RETURNS TRIGGER AS $$
DECLARE
    budget_record RECORD;
BEGIN
    -- Find the budget for this user, month, and year
    FOR budget_record IN 
        SELECT id, total_budget 
        FROM personal_budgets 
        WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
        AND month = EXTRACT(MONTH FROM COALESCE(NEW.date, OLD.date))
        AND year = EXTRACT(YEAR FROM COALESCE(NEW.date, OLD.date))
    LOOP
        -- Calculate total spent for this budget period
        UPDATE personal_budgets SET
            total_spent = (
                SELECT COALESCE(SUM(amount), 0)
                FROM personal_expenses
                WHERE user_id = budget_record.id
                AND EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM COALESCE(NEW.date, OLD.date))
                AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM COALESCE(NEW.date, OLD.date))
            ),
            total_remaining = budget_record.total_budget - (
                SELECT COALESCE(SUM(amount), 0)
                FROM personal_expenses
                WHERE user_id = budget_record.id
                AND EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM COALESCE(NEW.date, OLD.date))
                AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM COALESCE(NEW.date, OLD.date))
            )
        WHERE id = budget_record.id;
    END LOOP;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- Trigger to update budget totals when expenses change
CREATE TRIGGER update_budget_totals_on_expense_change
    AFTER INSERT OR UPDATE OR DELETE ON personal_expenses
    FOR EACH ROW EXECUTE FUNCTION update_budget_totals();

-- Function to update goal progress
CREATE OR REPLACE FUNCTION update_goal_progress()
RETURNS TRIGGER AS $$
BEGIN
    -- Update estimated completion date based on monthly contribution
    IF NEW.monthly_contribution > 0 AND NEW.current_amount < NEW.target_amount THEN
        NEW.estimated_completion_date := NOW() + INTERVAL '1 month' * 
            CEIL((NEW.target_amount - NEW.current_amount) / NEW.monthly_contribution);
    END IF;
    
    -- Mark as completed if target is reached
    IF NEW.current_amount >= NEW.target_amount AND NEW.status != 'completed' THEN
        NEW.status := 'completed';
        NEW.completed_date := NOW();
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update goal progress
CREATE TRIGGER update_goal_progress_trigger
    BEFORE UPDATE ON personal_goals
    FOR EACH ROW EXECUTE FUNCTION update_goal_progress();

-- =====================================
-- VIEWS FOR REPORTING
-- =====================================

-- Monthly Personal Finance Summary
CREATE VIEW personal_monthly_summary AS
SELECT 
    u.id as user_id,
    u.name,
    DATE_TRUNC('month', COALESCE(pi.date, pe.date)) as month,
    COALESCE(SUM(pi.amount), 0) as total_income,
    COALESCE(SUM(pe.amount), 0) as total_expenses,
    COALESCE(SUM(pi.amount), 0) - COALESCE(SUM(pe.amount), 0) as net_balance,
    CASE 
        WHEN COALESCE(SUM(pi.amount), 0) > 0 THEN 
            ((COALESCE(SUM(pi.amount), 0) - COALESCE(SUM(pe.amount), 0)) / COALESCE(SUM(pi.amount), 0) * 100)
        ELSE 0 
    END as savings_rate
FROM users u
LEFT JOIN personal_incomes pi ON u.id = pi.user_id
LEFT JOIN personal_expenses pe ON u.id = pe.user_id AND DATE_TRUNC('month', pi.date) = DATE_TRUNC('month', pe.date)
GROUP BY u.id, u.name, DATE_TRUNC('month', COALESCE(pi.date, pe.date));

-- Personal Expense Categories Summary
CREATE VIEW personal_expense_categories AS
SELECT 
    u.id as user_id,
    u.name,
    pe.category,
    DATE_TRUNC('month', pe.date) as month,
    SUM(pe.amount) as total_spent,
    COUNT(pe.id) as transaction_count,
    AVG(pe.amount) as avg_transaction
FROM users u
LEFT JOIN personal_expenses pe ON u.id = pe.user_id
GROUP BY u.id, u.name, pe.category, DATE_TRUNC('month', pe.date);

-- Personal Goals Progress
CREATE VIEW personal_goals_progress AS
SELECT 
    u.id as user_id,
    u.name,
    pg.name as goal_name,
    pg.type,
    pg.target_amount,
    pg.current_amount,
    pg.progress_percentage,
    pg.deadline,
    pg.estimated_completion_date,
    pg.status,
    CASE 
        WHEN pg.deadline < NOW() AND pg.status != 'completed' THEN 'overdue'
        WHEN pg.deadline < NOW() + INTERVAL '30 days' AND pg.status != 'completed' THEN 'due_soon'
        ELSE 'on_track'
    END as urgency_status
FROM users u
LEFT JOIN personal_goals pg ON u.id = pg.user_id
WHERE pg.status IN ('active', 'paused');

-- =====================================
-- SAMPLE DATA (OPTIONAL)
-- =====================================

-- Insert sample categories for testing (uncomment if needed)
/*
INSERT INTO categories (name, type, description) VALUES
-- Personal Income Categories
('salary', 'personal_income', 'Salário mensal'),
('freelance', 'personal_income', 'Trabalho freelance'),
('investment', 'personal_income', 'Rendimentos de investimentos'),
('rental', 'personal_income', 'Renda de aluguel'),
('bonus', 'personal_income', 'Bônus e gratificações'),

-- Personal Expense Categories
('housing', 'personal_expense', 'Moradia (aluguel, financiamento)'),
('food', 'personal_expense', 'Alimentação'),
('transportation', 'personal_expense', 'Transporte'),
('healthcare', 'personal_expense', 'Saúde'),
('education', 'personal_expense', 'Educação'),
('entertainment', 'personal_expense', 'Entretenimento'),
('utilities', 'personal_expense', 'Contas básicas (luz, água, internet)')
ON CONFLICT (name) DO NOTHING;
*/

-- Success message
SELECT 'Personal Finance tables created successfully!' as status;