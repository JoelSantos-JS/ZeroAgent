# VoxCash - Assistente Financeiro IA

VoxCash é um assistente de IA financeiro integrado ao WhatsApp que utiliza o Google Gemini para processar mensagens, identificar transações financeiras e registrar dados automaticamente.

## 🚀 Funcionalidades

- **Processamento de Mensagens**: Análise automática de mensagens do WhatsApp
- **IA Gemini**: Identificação inteligente de valores, categorias e descrições
- **Isolamento de Dados**: Cada usuário tem seus dados isolados por user_id
- **CRM Integrado**: Registro de transações e produtos no banco de dados
- **Respostas Personalizadas**: Respostas dinâmicas baseadas no histórico

## 📋 Pré-requisitos

- Node.js >= 18.0.0
- PostgreSQL ou conta Supabase
- Chave da API do Google Gemini
- WhatsApp Web

## 🛠️ Instalação

1. Clone o repositório:
```bash
git clone <repository-url>
cd voxcash
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
# Edite o arquivo .env com suas configurações
```

4. Execute as migrações do banco de dados:
```bash
npm run migrate
```

5. Inicie o servidor:
```bash
npm run dev
```

## 💬 Exemplos de Uso

### Registrar Gasto
**Usuário**: "Gastei 50 reais hoje no supermercado"
**Bot**: "Seu gasto de R$ 50 no supermercado foi registrado com sucesso."

### Consultar Gastos
**Usuário**: "Quanto eu gastei em transporte este mês?"
**Bot**: "Você gastou R$ 150 em transporte este mês."

### Listar Produtos
**Usuário**: "Me mostre os produtos que comprei"
**Bot**: "Você comprou o produto X por R$ Y, na data Z."

## 🗄️ Estrutura do Banco

### Tabela de Transações
```sql
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    value DECIMAL(10, 2),
    category VARCHAR(50),
    description TEXT,
    transaction_date TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Tabela de Produtos
```sql
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    product_name VARCHAR(255),
    product_category VARCHAR(100),
    price DECIMAL(10, 2),
    purchase_date TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);
```

## 🔧 Tecnologias

- **Node.js** - Runtime JavaScript
- **whatsapp-web.js** - Integração WhatsApp
- **Google Gemini** - Processamento de linguagem natural
- **PostgreSQL/Supabase** - Banco de dados
- **Express.js** - Framework web

## 📝 Licença

MIT License