-- Migração para Integração de Vendas
-- Expande o schema para suportar integração com microssaas
-- Execute este script no PostgreSQL ou Supabase

-- =====================================================
-- 1. EXPANSÃO DA TABELA PRODUCTS
-- =====================================================

-- Adicionar campos para integração com microssaas
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_stock_level INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS sku VARCHAR(100),
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS supplier_id UUID,
ADD COLUMN IF NOT EXISTS weight DECIMAL(8,3),
ADD COLUMN IF NOT EXISTS dimensions JSONB,
ADD COLUMN IF NOT EXISTS tags TEXT[],
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock_quantity);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);

-- =====================================================
-- 2. TABELA DE VENDAS (SALES)
-- =====================================================

-- Criar tabela de vendas se não existir
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    cost_price DECIMAL(10,2) DEFAULT 0,
    profit DECIMAL(10,2) GENERATED ALWAYS AS ((unit_price - COALESCE(cost_price, 0)) * quantity) STORED,
    margin_percent DECIMAL(5,2) GENERATED ALWAYS AS (
        CASE 
            WHEN unit_price > 0 THEN ((unit_price - COALESCE(cost_price, 0)) / unit_price * 100)
            ELSE 0 
        END
    ) STORED,
    buyer_name VARCHAR(255),
    buyer_email VARCHAR(255),
    buyer_phone VARCHAR(20),
    payment_method VARCHAR(50),
    payment_status VARCHAR(20) DEFAULT 'completed',
    sale_date TIMESTAMP DEFAULT NOW(),
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para tabela sales
CREATE INDEX IF NOT EXISTS idx_sales_product ON sales(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_user ON sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(payment_status);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_buyer_email ON sales(buyer_email);

-- =====================================================
-- 3. TABELA DE ESTOQUE (INVENTORY)
-- =====================================================

CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    quantity_available INTEGER NOT NULL DEFAULT 0,
    quantity_reserved INTEGER DEFAULT 0,
    quantity_sold INTEGER DEFAULT 0,
    reorder_point INTEGER DEFAULT 5,
    max_stock_level INTEGER DEFAULT 100,
    last_restock_date TIMESTAMP,
    last_sale_date TIMESTAMP,
    location VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraint para evitar estoque negativo
    CONSTRAINT chk_inventory_positive CHECK (quantity_available >= 0)
);

-- Índices para inventory
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_user ON inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_available ON inventory(quantity_available);
CREATE INDEX IF NOT EXISTS idx_inventory_reorder ON inventory(reorder_point);

-- =====================================================
-- 4. TABELA DE MÉTRICAS DE VENDAS
-- =====================================================

CREATE TABLE IF NOT EXISTS sales_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    total_sales INTEGER DEFAULT 0,
    total_revenue DECIMAL(12,2) DEFAULT 0,
    total_profit DECIMAL(12,2) DEFAULT 0,
    avg_margin_percent DECIMAL(5,2) DEFAULT 0,
    unique_customers INTEGER DEFAULT 0,
    conversion_rate DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraint para evitar duplicatas
    UNIQUE(user_id, product_id, metric_date)
);

-- Índices para sales_metrics
CREATE INDEX IF NOT EXISTS idx_metrics_user_date ON sales_metrics(user_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_metrics_product_date ON sales_metrics(product_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_metrics_date ON sales_metrics(metric_date);

-- =====================================================
-- 5. TABELA DE CLIENTES
-- =====================================================

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    country VARCHAR(50) DEFAULT 'Brasil',
    total_purchases INTEGER DEFAULT 0,
    total_spent DECIMAL(12,2) DEFAULT 0,
    avg_order_value DECIMAL(10,2) DEFAULT 0,
    last_purchase_date TIMESTAMP,
    customer_since TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para customers
CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(is_active);
CREATE INDEX IF NOT EXISTS idx_customers_last_purchase ON customers(last_purchase_date);

-- =====================================================
-- 6. TABELA DE SINCRONIZAÇÃO
-- =====================================================

CREATE TABLE IF NOT EXISTS sync_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    sync_type VARCHAR(50) NOT NULL, -- 'sales', 'products', 'inventory'
    last_sync_time TIMESTAMP NOT NULL,
    records_processed INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'success', -- 'success', 'error', 'partial'
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraint para evitar duplicatas
    UNIQUE(user_id, sync_type)
);

-- Índices para sync_status
CREATE INDEX IF NOT EXISTS idx_sync_user_type ON sync_status(user_id, sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_last_time ON sync_status(last_sync_time);
CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_status(status);

-- =====================================================
-- 7. FUNÇÕES E TRIGGERS
-- =====================================================

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para atualizar updated_at
CREATE TRIGGER update_sales_updated_at 
    BEFORE UPDATE ON sales
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_updated_at 
    BEFORE UPDATE ON inventory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at 
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_status_updated_at 
    BEFORE UPDATE ON sync_status
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 8. FUNÇÃO PARA BUSCAR VENDAS NOVAS
-- =====================================================

CREATE OR REPLACE FUNCTION get_new_sales(
    p_user_id UUID,
    p_last_sync TIMESTAMP
)
RETURNS TABLE (
    sale_id UUID,
    product_id UUID,
    user_id UUID,
    quantity INTEGER,
    unit_price DECIMAL(10,2),
    total_amount DECIMAL(10,2),
    cost_price DECIMAL(10,2),
    profit DECIMAL(10,2),
    margin_percent DECIMAL(5,2),
    buyer_name VARCHAR(255),
    buyer_email VARCHAR(255),
    sale_date TIMESTAMP,
    product_name VARCHAR(255),
    product_category VARCHAR(100),
    created_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as sale_id,
        s.product_id,
        s.user_id,
        s.quantity,
        s.unit_price,
        s.total_amount,
        s.cost_price,
        s.profit,
        s.margin_percent,
        s.buyer_name,
        s.buyer_email,
        s.sale_date,
        p.name as product_name,
        p.category as product_category,
        s.created_at
    FROM sales s
    LEFT JOIN products p ON s.product_id = p.id
    WHERE s.user_id = p_user_id
    AND s.created_at > p_last_sync
    ORDER BY s.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 9. FUNÇÃO PARA ATUALIZAR MÉTRICAS
-- =====================================================

CREATE OR REPLACE FUNCTION update_sales_metrics(
    p_user_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS VOID AS $$
DECLARE
    rec RECORD;
BEGIN
    -- Atualizar métricas por produto
    FOR rec IN 
        SELECT 
            product_id,
            COUNT(*) as total_sales,
            SUM(total_amount) as total_revenue,
            SUM(profit) as total_profit,
            AVG(margin_percent) as avg_margin,
            COUNT(DISTINCT buyer_email) as unique_customers
        FROM sales 
        WHERE user_id = p_user_id 
        AND DATE(sale_date) = p_date
        GROUP BY product_id
    LOOP
        INSERT INTO sales_metrics (
            user_id, product_id, metric_date,
            total_sales, total_revenue, total_profit,
            avg_margin_percent, unique_customers
        ) VALUES (
            p_user_id, rec.product_id, p_date,
            rec.total_sales, rec.total_revenue, rec.total_profit,
            rec.avg_margin, rec.unique_customers
        )
        ON CONFLICT (user_id, product_id, metric_date)
        DO UPDATE SET
            total_sales = EXCLUDED.total_sales,
            total_revenue = EXCLUDED.total_revenue,
            total_profit = EXCLUDED.total_profit,
            avg_margin_percent = EXCLUDED.avg_margin_percent,
            unique_customers = EXCLUDED.unique_customers,
            updated_at = NOW();
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 10. TRIGGER PARA ATUALIZAR ESTOQUE AUTOMATICAMENTE
-- =====================================================

CREATE OR REPLACE FUNCTION update_inventory_on_sale()
RETURNS TRIGGER AS $$
BEGIN
    -- Atualizar estoque quando uma venda é registrada
    UPDATE inventory 
    SET 
        quantity_available = quantity_available - NEW.quantity,
        quantity_sold = quantity_sold + NEW.quantity,
        last_sale_date = NEW.sale_date,
        updated_at = NOW()
    WHERE product_id = NEW.product_id;
    
    -- Se não existe registro de estoque, criar um
    IF NOT FOUND THEN
        INSERT INTO inventory (product_id, user_id, quantity_available, quantity_sold, last_sale_date)
        VALUES (NEW.product_id, NEW.user_id, -NEW.quantity, NEW.quantity, NEW.sale_date);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_inventory_on_sale
    AFTER INSERT ON sales
    FOR EACH ROW EXECUTE FUNCTION update_inventory_on_sale();

-- =====================================================
-- 11. VIEWS PARA ANALYTICS
-- =====================================================

-- View para dashboard de vendas
CREATE OR REPLACE VIEW sales_dashboard AS
SELECT 
    s.user_id,
    DATE(s.sale_date) as sale_date,
    COUNT(*) as total_sales,
    SUM(s.total_amount) as total_revenue,
    SUM(s.profit) as total_profit,
    AVG(s.margin_percent) as avg_margin,
    COUNT(DISTINCT s.buyer_email) as unique_customers,
    AVG(s.total_amount) as avg_order_value
FROM sales s
GROUP BY s.user_id, DATE(s.sale_date)
ORDER BY sale_date DESC;

-- View para produtos com baixo estoque
CREATE OR REPLACE VIEW low_stock_products AS
SELECT 
    p.id,
    p.name,
    p.category,
    p.user_id,
    i.quantity_available,
    i.reorder_point,
    p.min_stock_level,
    (i.quantity_available <= i.reorder_point) as needs_reorder
FROM products p
LEFT JOIN inventory i ON p.id = i.product_id
WHERE i.quantity_available <= i.reorder_point
OR (i.quantity_available IS NULL AND p.stock_quantity <= p.min_stock_level);

-- View para top produtos
CREATE OR REPLACE VIEW top_products AS
SELECT 
    p.id,
    p.name,
    p.category,
    p.user_id,
    COUNT(s.id) as total_sales,
    SUM(s.total_amount) as total_revenue,
    SUM(s.profit) as total_profit,
    AVG(s.margin_percent) as avg_margin
FROM products p
LEFT JOIN sales s ON p.id = s.product_id
WHERE s.sale_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY p.id, p.name, p.category, p.user_id
ORDER BY total_revenue DESC;

-- =====================================================
-- 12. INSERIR DADOS INICIAIS
-- =====================================================

-- Inserir categorias de produtos se não existirem
INSERT INTO categories (name, type, description) VALUES
('eletronicos', 'product', 'Produtos eletrônicos'),
('acessorios', 'product', 'Acessórios diversos'),
('casa_jardim', 'product', 'Produtos para casa e jardim'),
('moda', 'product', 'Roupas e acessórios de moda'),
('esportes', 'product', 'Produtos esportivos'),
('vendas', 'transaction', 'Receitas de vendas')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- 13. COMENTÁRIOS E DOCUMENTAÇÃO
-- =====================================================

COMMENT ON TABLE sales IS 'Registro de todas as vendas realizadas';
COMMENT ON TABLE inventory IS 'Controle de estoque dos produtos';
COMMENT ON TABLE sales_metrics IS 'Métricas agregadas de vendas por dia/produto';
COMMENT ON TABLE customers IS 'Informações dos clientes';
COMMENT ON TABLE sync_status IS 'Status da sincronização com sistemas externos';

COMMENT ON FUNCTION get_new_sales(UUID, TIMESTAMP) IS 'Busca vendas novas desde a última sincronização';
COMMENT ON FUNCTION update_sales_metrics(UUID, DATE) IS 'Atualiza métricas de vendas para uma data específica';

-- =====================================================
-- FIM DA MIGRAÇÃO
-- =====================================================

-- Log da migração
INSERT INTO sync_status (user_id, sync_type, last_sync_time, records_processed, status, error_message)
SELECT 
    id as user_id,
    'migration_sales_integration' as sync_type,
    NOW() as last_sync_time,
    0 as records_processed,
    'success' as status,
    'Schema expandido para integração de vendas' as error_message
FROM users
WHERE is_active = true
ON CONFLICT (user_id, sync_type) DO UPDATE SET
    last_sync_time = EXCLUDED.last_sync_time,
    error_message = EXCLUDED.error_message,
    updated_at = NOW();

SELECT 'Migração de integração de vendas concluída com sucesso!' as result;