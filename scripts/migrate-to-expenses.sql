-- Script para migrar tabela 'transactions' para 'expenses'
-- Este script cria a nova tabela 'expenses' e migra os dados

-- =====================================
-- CRIAR NOVA TABELA EXPENSES
-- =====================================

-- Criar tabela expenses baseada na estrutura de transactions
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  value DECIMAL(10, 2), -- Para compatibilidade
  type VARCHAR(20) NOT NULL DEFAULT 'expense',
  category VARCHAR(50) NOT NULL,
  subcategory VARCHAR(50),
  description TEXT,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  payment_method VARCHAR(30),
  status VARCHAR(20) DEFAULT 'completed',
  notes TEXT,
  tags TEXT[],
  product_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================
-- MIGRAR DADOS DE TRANSACTIONS PARA EXPENSES
-- =====================================

-- Copiar todos os dados de transactions para expenses
INSERT INTO expenses (
  user_id,
  amount,
  value,
  type,
  category,
  subcategory,
  description,
  date,
  transaction_date,
  payment_method,
  status,
  notes,
  tags,
  product_id,
  created_at,
  updated_at
)
SELECT 
  user_id,
  COALESCE(amount, value, 0) as amount,
  COALESCE(value, amount, 0) as value,
  COALESCE(type, 'expense') as type,
  COALESCE(category, 'outros') as category,
  subcategory,
  description,
  COALESCE(date, transaction_date, NOW()) as date,
  COALESCE(transaction_date, date, NOW()) as transaction_date,
  payment_method,
  COALESCE(status, 'completed') as status,
  notes,
  tags,
  product_id,
  COALESCE(created_at, NOW()) as created_at,
  COALESCE(updated_at, NOW()) as updated_at
FROM transactions
WHERE NOT EXISTS (
  SELECT 1 FROM expenses e 
  WHERE e.user_id = transactions.user_id 
  AND e.amount = COALESCE(transactions.amount, transactions.value, 0)
  AND e.description = transactions.description
  AND e.created_at = transactions.created_at
);

-- =====================================
-- CRIAR ÍNDICES PARA EXPENSES
-- =====================================

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_transaction_date ON expenses(transaction_date);
CREATE INDEX IF NOT EXISTS idx_expenses_amount ON expenses(amount);
CREATE INDEX IF NOT EXISTS idx_expenses_value ON expenses(value);
CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(type);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);

-- =====================================
-- CRIAR TRIGGERS PARA EXPENSES
-- =====================================

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_expenses_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para atualizar updated_at
CREATE TRIGGER update_expenses_updated_at 
    BEFORE UPDATE ON expenses
    FOR EACH ROW 
    EXECUTE FUNCTION update_expenses_updated_at_column();

-- =====================================
-- VERIFICAR MIGRAÇÃO
-- =====================================

-- Verificar contagem de registros
SELECT 
  'transactions' as tabela,
  COUNT(*) as total_registros
FROM transactions
UNION ALL
SELECT 
  'expenses' as tabela,
  COUNT(*) as total_registros
FROM expenses;

-- Verificar estrutura da nova tabela
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'expenses'
ORDER BY ordinal_position;

-- =====================================
-- BACKUP E LIMPEZA (OPCIONAL)
-- =====================================

-- ATENÇÃO: Descomente as linhas abaixo apenas após confirmar que a migração foi bem-sucedida
-- e que todos os sistemas estão funcionando com a nova tabela 'expenses'

-- Renomear tabela transactions para backup
-- ALTER TABLE transactions RENAME TO transactions_backup;

-- Ou deletar a tabela transactions (CUIDADO!)
-- DROP TABLE transactions CASCADE;

SELECT 'Migração de transactions para expenses concluída!' as status;