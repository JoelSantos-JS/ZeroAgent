-- Supabase Migration: Replace Firebase as Primary Database
-- This schema creates all necessary tables to store user data

-- Enable RLS (Row Level Security)
ALTER DATABASE postgres SET row_security = on;

-- Create enum types for better data integrity
CREATE TYPE product_status AS ENUM ('purchased', 'shipping', 'received', 'selling', 'sold');
CREATE TYPE transaction_type AS ENUM ('revenue', 'expense');
CREATE TYPE payment_method AS ENUM ('pix', 'credit_card', 'debit_card', 'bank_transfer', 'cash');
CREATE TYPE transaction_status AS ENUM ('completed', 'pending', 'cancelled');
CREATE TYPE debt_category AS ENUM ('credit_card', 'loan', 'financing', 'supplier', 'personal', 'other');
CREATE TYPE debt_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE debt_status AS ENUM ('pending', 'overdue', 'paid', 'negotiating', 'cancelled');
CREATE TYPE goal_category AS ENUM ('financial', 'business', 'personal', 'health', 'education', 'other');
CREATE TYPE goal_type AS ENUM ('savings', 'revenue', 'profit', 'roi', 'quantity', 'percentage', 'custom');
CREATE TYPE goal_unit AS ENUM ('BRL', 'USD', 'percentage', 'quantity', 'days', 'custom');
CREATE TYPE goal_priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE goal_status AS ENUM ('active', 'paused', 'completed', 'cancelled', 'overdue');
CREATE TYPE dream_type AS ENUM ('travel', 'business', 'personal');
CREATE TYPE dream_status AS ENUM ('planning', 'in_progress', 'completed');
CREATE TYPE bet_type AS ENUM ('single', 'surebet');
CREATE TYPE bet_status AS ENUM ('pending', 'won', 'lost', 'cashed_out', 'void');
CREATE TYPE revenue_source AS ENUM ('sale', 'commission', 'bonus', 'other');
CREATE TYPE expense_type AS ENUM ('purchase', 'shipping', 'tax', 'marketing', 'operational', 'other');

-- =====================================
-- USERS TABLE (replacing Firebase Auth)
-- =====================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid TEXT UNIQUE, -- For migration compatibility
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    avatar_url TEXT,
    account_type TEXT DEFAULT 'personal',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true
);

-- =====================================
-- PRODUCTS TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    supplier TEXT,
    aliexpress_link TEXT,
    image_url TEXT,
    description TEXT,
    notes TEXT,
    tracking_code TEXT,
    purchase_email TEXT,
    
    -- Costs
    purchase_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    shipping_cost DECIMAL(10,2) DEFAULT 0,
    import_taxes DECIMAL(10,2) DEFAULT 0,
    packaging_cost DECIMAL(10,2) DEFAULT 0,
    marketing_cost DECIMAL(10,2) DEFAULT 0,
    other_costs DECIMAL(10,2) DEFAULT 0,
    total_cost DECIMAL(10,2) GENERATED ALWAYS AS (
        purchase_price + shipping_cost + import_taxes + 
        packaging_cost + marketing_cost + other_costs
    ) STORED,
    
    -- Sales
    selling_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    expected_profit DECIMAL(10,2) DEFAULT 0,
    profit_margin DECIMAL(5,2) DEFAULT 0,
    
    -- Control
    quantity INTEGER NOT NULL DEFAULT 1,
    quantity_sold INTEGER DEFAULT 0,
    status product_status DEFAULT 'purchased',
    purchase_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Metrics (calculated via triggers)
    roi DECIMAL(5,2) DEFAULT 0,
    actual_profit DECIMAL(10,2) DEFAULT 0,
    days_to_sell INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================
-- SALES TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    quantity INTEGER NOT NULL DEFAULT 1,
    buyer_name TEXT,
    unit_price DECIMAL(10,2),
    total_amount DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================
-- TRANSACTIONS TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    description TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    type transaction_type NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT,
    payment_method payment_method,
    status transaction_status DEFAULT 'completed',
    notes TEXT,
    tags TEXT[],
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================
-- DEBTS TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    creditor_name TEXT NOT NULL,
    description TEXT NOT NULL,
    original_amount DECIMAL(10,2) NOT NULL,
    current_amount DECIMAL(10,2) NOT NULL,
    interest_rate DECIMAL(5,2),
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    category debt_category NOT NULL,
    priority debt_priority DEFAULT 'medium',
    status debt_status DEFAULT 'pending',
    payment_method payment_method,
    installments_total INTEGER,
    installments_paid INTEGER DEFAULT 0,
    installment_amount DECIMAL(10,2),
    notes TEXT,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================
-- DEBT PAYMENTS TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS debt_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debt_id UUID REFERENCES debts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    amount DECIMAL(10,2) NOT NULL,
    payment_method payment_method NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================
-- GOALS TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    category goal_category NOT NULL,
    type goal_type NOT NULL,
    target_value DECIMAL(15,2) NOT NULL,
    current_value DECIMAL(15,2) DEFAULT 0,
    unit goal_unit DEFAULT 'BRL',
    deadline TIMESTAMP WITH TIME ZONE,
    created_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    priority goal_priority DEFAULT 'medium',
    status goal_status DEFAULT 'active',
    notes TEXT,
    tags TEXT[],
    linked_product_ids UUID[],
    linked_dream_ids UUID[],
    linked_transaction_ids UUID[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================
-- GOAL MILESTONES TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS goal_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_value DECIMAL(15,2) NOT NULL,
    target_date TIMESTAMP WITH TIME ZONE,
    is_completed BOOLEAN DEFAULT false,
    completed_date TIMESTAMP WITH TIME ZONE,
    reward TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================
-- GOAL REMINDERS TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS goal_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'daily', 'weekly', 'monthly', 'custom'
    frequency INTEGER DEFAULT 1,
    message TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_sent TIMESTAMP WITH TIME ZONE,
    next_send TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================
-- DREAMS TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS dreams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type dream_type NOT NULL,
    target_amount DECIMAL(15,2) NOT NULL,
    current_amount DECIMAL(15,2) DEFAULT 0,
    status dream_status DEFAULT 'planning',
    notes TEXT,
    plan JSONB, -- Store AI-generated plan
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================
-- BETS TABLE
-- =====================================
CREATE TABLE IF NOT EXISTS bets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type bet_type NOT NULL,
    sport TEXT NOT NULL,
    event TEXT NOT NULL,
    date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status bet_status DEFAULT 'pending',
    notes TEXT,
    earned_freebet_value DECIMAL(10,2),
    
    -- Single bet fields
    bet_type_single TEXT,
    stake DECIMAL(10,2),
    odds DECIMAL(8,3),
    
    -- Surebet fields
    sub_bets JSONB,
    total_stake DECIMAL(10,2),
    guaranteed_profit DECIMAL(10,2),
    profit_percentage DECIMAL(5,2),
    
    -- Analysis
    analysis JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================
-- REVENUES TABLE (separate from transactions)
-- =====================================
CREATE TABLE IF NOT EXISTS revenues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    description TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    category TEXT NOT NULL,
    source revenue_source DEFAULT 'other',
    notes TEXT,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================
-- EXPENSES TABLE (separate from transactions)
-- =====================================
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    description TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    category TEXT NOT NULL,
    type expense_type DEFAULT 'other',
    supplier TEXT,
    notes TEXT,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================
-- FIREBASE BACKUP TABLE (legacy support)
-- =====================================
CREATE TABLE IF NOT EXISTS firebase_backup (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    products JSONB DEFAULT '[]'::jsonb,
    dreams JSONB DEFAULT '[]'::jsonb,
    bets JSONB DEFAULT '[]'::jsonb,
    last_sync TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================
-- INDEXES FOR PERFORMANCE
-- =====================================

-- Users
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_users_email ON users(email);

-- Products
CREATE INDEX idx_products_user_id ON products(user_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_purchase_date ON products(purchase_date);

-- Sales
CREATE INDEX idx_sales_product_id ON sales(product_id);
CREATE INDEX idx_sales_user_id ON sales(user_id);
CREATE INDEX idx_sales_date ON sales(date);

-- Transactions
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_category ON transactions(category);

-- Debts
CREATE INDEX idx_debts_user_id ON debts(user_id);
CREATE INDEX idx_debts_status ON debts(status);
CREATE INDEX idx_debts_due_date ON debts(due_date);

-- Goals
CREATE INDEX idx_goals_user_id ON goals(user_id);
CREATE INDEX idx_goals_status ON goals(status);
CREATE INDEX idx_goals_deadline ON goals(deadline);

-- Dreams
CREATE INDEX idx_dreams_user_id ON dreams(user_id);
CREATE INDEX idx_dreams_status ON dreams(status);

-- Bets
CREATE INDEX idx_bets_user_id ON bets(user_id);
CREATE INDEX idx_bets_status ON bets(status);
CREATE INDEX idx_bets_date ON bets(date);

-- Firebase Backup (legacy)
CREATE INDEX idx_firebase_backup_user_id ON firebase_backup(user_id);
CREATE INDEX idx_firebase_backup_last_sync ON firebase_backup(last_sync);

-- =====================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE dreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY users_own_data ON users FOR ALL USING (auth.uid()::text = firebase_uid);

-- Products policies
CREATE POLICY products_own_data ON products FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE firebase_uid = auth.uid()::text)
);

-- Sales policies
CREATE POLICY sales_own_data ON sales FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE firebase_uid = auth.uid()::text)
);

-- Transactions policies
CREATE POLICY transactions_own_data ON transactions FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE firebase_uid = auth.uid()::text)
);

-- Debts policies
CREATE POLICY debts_own_data ON debts FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE firebase_uid = auth.uid()::text)
);

-- Debt payments policies
CREATE POLICY debt_payments_own_data ON debt_payments FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE firebase_uid = auth.uid()::text)
);

-- Goals policies
CREATE POLICY goals_own_data ON goals FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE firebase_uid = auth.uid()::text)
);

-- Goal milestones policies
CREATE POLICY goal_milestones_own_data ON goal_milestones FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE firebase_uid = auth.uid()::text)
);

-- Goal reminders policies
CREATE POLICY goal_reminders_own_data ON goal_reminders FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE firebase_uid = auth.uid()::text)
);

-- Dreams policies
CREATE POLICY dreams_own_data ON dreams FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE firebase_uid = auth.uid()::text)
);

-- Bets policies
CREATE POLICY bets_own_data ON bets FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE firebase_uid = auth.uid()::text)
);

-- Revenues policies
CREATE POLICY revenues_own_data ON revenues FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE firebase_uid = auth.uid()::text)
);

-- Expenses policies
CREATE POLICY expenses_own_data ON expenses FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE firebase_uid = auth.uid()::text)
);

-- =====================================
-- FUNCTIONS AND TRIGGERS
-- =====================================

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to calculate product profit metrics
CREATE OR REPLACE FUNCTION calculate_product_profit()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate total_cost, expected_profit, and profit_margin
    NEW.expected_profit := NEW.selling_price - (NEW.purchase_price + NEW.shipping_cost + NEW.import_taxes + NEW.packaging_cost + NEW.marketing_cost + NEW.other_costs);
    
    NEW.profit_margin := CASE 
        WHEN NEW.selling_price > 0 THEN 
            (NEW.expected_profit / NEW.selling_price * 100)
        ELSE 0 
    END;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_debts_updated_at BEFORE UPDATE ON debts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_dreams_updated_at BEFORE UPDATE ON dreams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bets_updated_at BEFORE UPDATE ON bets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_revenues_updated_at BEFORE UPDATE ON revenues FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create triggers for product profit calculation
CREATE TRIGGER calculate_product_profit_on_insert BEFORE INSERT ON products FOR EACH ROW EXECUTE FUNCTION calculate_product_profit();
CREATE TRIGGER calculate_product_profit_on_update BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION calculate_product_profit();

-- Function to calculate product metrics after sales
CREATE OR REPLACE FUNCTION calculate_product_metrics()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE products SET
        quantity_sold = (SELECT COALESCE(SUM(quantity), 0) FROM sales WHERE product_id = NEW.product_id),
        actual_profit = (SELECT COALESCE(SUM(total_amount), 0) FROM sales WHERE product_id = NEW.product_id) - (purchase_price + shipping_cost + import_taxes + packaging_cost + marketing_cost + other_costs),
        roi = CASE 
            WHEN (purchase_price + shipping_cost + import_taxes + packaging_cost + marketing_cost + other_costs) > 0 THEN 
                (((SELECT COALESCE(SUM(total_amount), 0) FROM sales WHERE product_id = NEW.product_id) - (purchase_price + shipping_cost + import_taxes + packaging_cost + marketing_cost + other_costs)) / (purchase_price + shipping_cost + import_taxes + packaging_cost + marketing_cost + other_costs) * 100)
            ELSE 0 
        END,
        days_to_sell = CASE 
            WHEN status = 'sold' THEN 
                EXTRACT(DAY FROM (SELECT MAX(date) FROM sales WHERE product_id = NEW.product_id) - purchase_date)
            ELSE NULL 
        END
    WHERE id = NEW.product_id;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to recalculate metrics when sales change
CREATE TRIGGER calculate_product_metrics_on_sale 
    AFTER INSERT OR UPDATE OR DELETE ON sales 
    FOR EACH ROW EXECUTE FUNCTION calculate_product_metrics();