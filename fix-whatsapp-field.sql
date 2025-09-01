-- CORREÇÃO COMPLETA: Campo whatsapp_number e vinculação de usuários
-- Execute este script no Supabase para corrigir o problema atual e prevenir futuros

-- 1. CORREÇÃO ESTRUTURAL: Aumentar tamanho dos campos
ALTER TABLE users ALTER COLUMN whatsapp_number TYPE VARCHAR(50);
ALTER TABLE user_sessions ALTER COLUMN phone_number TYPE VARCHAR(50);
ALTER TABLE auth_processes ALTER COLUMN phone_number TYPE VARCHAR(50);

-- 2. CORREÇÃO DOS DADOS ATUAIS: Vincular WhatsApp ao usuário Firebase correto
-- Atualizar sessão para usar usuário correto
UPDATE user_sessions 
SET user_id = 'a8a4b3fb-a614-4690-9f5d-fd4dda9c3b53'
WHERE phone_number = '557388229995@c.us';

-- Vincular WhatsApp ao usuário Firebase correto
UPDATE users 
SET whatsapp_number = '557388229995@c.us',
    updated_at = NOW()
WHERE id = 'a8a4b3fb-a614-4690-9f5d-fd4dda9c3b53';

-- 3. LIMPEZA: Remover usuário duplicado criado por erro
-- Primeiro, remover dependências
DELETE FROM user_sessions WHERE user_id = 'b09c1f11-d15a-4b06-99ce-05dc43184d18';
DELETE FROM transactions WHERE user_id = 'b09c1f11-d15a-4b06-99ce-05dc43184d18';
DELETE FROM products WHERE user_id = 'b09c1f11-d15a-4b06-99ce-05dc43184d18';

-- Depois, remover o usuário duplicado
DELETE FROM users WHERE id = 'b09c1f11-d15a-4b06-99ce-05dc43184d18';

-- 4. VERIFICAÇÃO: Mostrar resultado final
SELECT 
    id,
    email,
    name,
    whatsapp_number,
    firebase_uid,
    created_at
FROM users 
WHERE email LIKE '%joeltere9@gmail.com%'
ORDER BY created_at;

-- 5. VERIFICAR SESSÕES ATIVAS
SELECT 
    us.phone_number,
    us.user_id,
    u.email,
    u.name,
    us.created_at
FROM user_sessions us
JOIN users u ON us.user_id = u.id
WHERE us.phone_number = '557388229995@c.us';

-- RESULTADO ESPERADO:
-- - Campo whatsapp_number agora suporta 50 caracteres
-- - Usuário correto (a8a4b3fb...) vinculado ao WhatsApp
-- - Usuário duplicado (b09c1f11...) removido
-- - Sessão ativa apontando para usuário correto
-- - Produtos agora aparecerão corretamente no WhatsApp