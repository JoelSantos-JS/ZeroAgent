-- Migração para Sistema de Reconhecimento de Imagem
-- Adiciona campos necessários para comparação visual de produtos

-- =====================================================
-- 1. ADICIONAR CAMPOS NA TABELA PRODUCTS
-- =====================================================

-- Adicionar campo para URL da imagem de referência
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Adicionar campo para armazenar features visuais (para comparação)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS image_features TEXT; -- JSON com features extraídas da imagem

-- Adicionar campo para hash da imagem (para detecção de duplicatas)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS image_hash VARCHAR(64);

-- Adicionar campos de preço específicos para vendas
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS selling_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2);

-- Adicionar campo para nome alternativo/comercial
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS name VARCHAR(255),
ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- Adicionar campos de controle de imagem
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS image_processed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS image_processed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS image_confidence DECIMAL(3, 2); -- Confiança da análise (0.00 a 1.00)

-- =====================================================
-- 2. CRIAR TABELA DE HISTÓRICO DE RECONHECIMENTO
-- =====================================================

CREATE TABLE IF NOT EXISTS image_recognition_history (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id) ON DELETE SET NULL,
    image_hash VARCHAR(64),
    recognized_product_name VARCHAR(255),
    confidence_score DECIMAL(3, 2),
    processing_time_ms INT,
    image_size_bytes INT,
    recognition_method VARCHAR(50), -- 'gemini_vision', 'opencv', 'manual'
    was_correct BOOLEAN, -- Feedback do usuário
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Índices
    INDEX idx_recognition_user_id (user_id),
    INDEX idx_recognition_product_id (product_id),
    INDEX idx_recognition_hash (image_hash),
    INDEX idx_recognition_date (created_at)
);

-- =====================================================
-- 3. CRIAR TABELA DE COMPARAÇÃO DE IMAGENS
-- =====================================================

CREATE TABLE IF NOT EXISTS image_comparisons (
    id SERIAL PRIMARY KEY,
    source_image_hash VARCHAR(64) NOT NULL,
    target_product_id INT REFERENCES products(id) ON DELETE CASCADE,
    similarity_score DECIMAL(5, 4), -- Score de 0.0000 a 1.0000
    comparison_method VARCHAR(50), -- 'feature_matching', 'template_matching', 'gemini_comparison'
    processing_time_ms INT,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Índices
    INDEX idx_comparison_source (source_image_hash),
    INDEX idx_comparison_target (target_product_id),
    INDEX idx_comparison_score (similarity_score),
    UNIQUE KEY unique_comparison (source_image_hash, target_product_id)
);

-- =====================================================
-- 4. ATUALIZAR DADOS EXISTENTES
-- =====================================================

-- Copiar product_name para name se name estiver vazio
UPDATE products 
SET name = product_name 
WHERE name IS NULL OR name = '';

-- Copiar product_category para category se category estiver vazio
UPDATE products 
SET category = product_category 
WHERE category IS NULL OR category = '';

-- Copiar price para selling_price se selling_price estiver vazio
UPDATE products 
SET selling_price = price 
WHERE selling_price IS NULL;

-- =====================================================
-- 5. CRIAR FUNÇÕES AUXILIARES
-- =====================================================

-- Função para calcular similaridade média de um produto
CREATE OR REPLACE FUNCTION get_product_avg_similarity(product_id_param INT)
RETURNS DECIMAL(5, 4) AS $$
DECLARE
    avg_similarity DECIMAL(5, 4);
BEGIN
    SELECT AVG(similarity_score) INTO avg_similarity
    FROM image_comparisons
    WHERE target_product_id = product_id_param
    AND similarity_score > 0.5; -- Apenas similaridades significativas
    
    RETURN COALESCE(avg_similarity, 0.0000);
END;
$$ LANGUAGE plpgsql;

-- Função para buscar produtos similares por hash de imagem
CREATE OR REPLACE FUNCTION find_similar_products(image_hash_param VARCHAR(64), min_similarity DECIMAL(5, 4) DEFAULT 0.7)
RETURNS TABLE(
    product_id INT,
    product_name VARCHAR(255),
    similarity_score DECIMAL(5, 4),
    selling_price DECIMAL(10, 2),
    image_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        COALESCE(p.name, p.product_name) as product_name,
        ic.similarity_score,
        p.selling_price,
        p.image_url
    FROM image_comparisons ic
    JOIN products p ON ic.target_product_id = p.id
    WHERE ic.source_image_hash = image_hash_param
    AND ic.similarity_score >= min_similarity
    ORDER BY ic.similarity_score DESC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. CRIAR VIEWS ÚTEIS
-- =====================================================

-- View para produtos com imagens
CREATE OR REPLACE VIEW products_with_images AS
SELECT 
    p.*,
    CASE WHEN p.image_url IS NOT NULL AND p.image_url != '' THEN true ELSE false END as has_image,
    CASE WHEN p.image_processed = true THEN 'processed' 
         WHEN p.image_url IS NOT NULL THEN 'pending' 
         ELSE 'no_image' END as image_status
FROM products p;

-- View para estatísticas de reconhecimento
CREATE OR REPLACE VIEW recognition_stats AS
SELECT 
    u.id as user_id,
    u.name as user_name,
    COUNT(irh.id) as total_recognitions,
    COUNT(CASE WHEN irh.was_correct = true THEN 1 END) as correct_recognitions,
    COUNT(CASE WHEN irh.was_correct = false THEN 1 END) as incorrect_recognitions,
    AVG(irh.confidence_score) as avg_confidence,
    AVG(irh.processing_time_ms) as avg_processing_time
FROM users u
LEFT JOIN image_recognition_history irh ON u.id = irh.user_id
GROUP BY u.id, u.name;

-- =====================================================
-- 7. INSERIR DADOS DE EXEMPLO (OPCIONAL)
-- =====================================================

-- Inserir algumas categorias específicas para produtos com imagem
INSERT INTO categories (name, type, description) VALUES
('eletronicos_imagem', 'product', 'Eletrônicos identificados por imagem'),
('roupas_imagem', 'product', 'Roupas identificadas por imagem'),
('casa_imagem', 'product', 'Produtos para casa identificados por imagem'),
('acessorios_imagem', 'product', 'Acessórios identificados por imagem')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- 8. COMENTÁRIOS E DOCUMENTAÇÃO
-- =====================================================

COMMENT ON COLUMN products.image_url IS 'URL da imagem de referência do produto';
COMMENT ON COLUMN products.image_features IS 'Features visuais extraídas da imagem (JSON)';
COMMENT ON COLUMN products.image_hash IS 'Hash MD5/SHA256 da imagem para comparação';
COMMENT ON COLUMN products.image_confidence IS 'Confiança da análise de imagem (0.00 a 1.00)';

COMMENT ON TABLE image_recognition_history IS 'Histórico de reconhecimentos de imagem realizados';
COMMENT ON TABLE image_comparisons IS 'Comparações de similaridade entre imagens';

COMMENT ON FUNCTION get_product_avg_similarity(INT) IS 'Calcula similaridade média de um produto';
COMMENT ON FUNCTION find_similar_products(VARCHAR, DECIMAL) IS 'Busca produtos similares por hash de imagem';

-- =====================================================
-- FIM DA MIGRAÇÃO
-- =====================================================

SELECT 'Migração de reconhecimento de imagem concluída com sucesso!' as result;