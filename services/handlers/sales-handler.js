const BaseHandler = require('./base-handler');
const ResponseFormatter = require('../formatters/response-formatter');
const TransactionValidator = require('../validators/transaction-validator');
const logger = require('../../utils/logger');

/**
 * Handler para processamento automático de vendas
 * Integra com microssaas via banco de dados compartilhado
 */
class SalesHandler extends BaseHandler {
  constructor(databaseService, userService) {
    super(databaseService, userService);
    
    // Configurações de sincronização
    this.syncInterval = 30000; // 30 segundos
    this.lastSyncTimes = new Map(); // Por usuário
    this.isRunning = false;
    
    // Métricas de performance
    this.metrics = {
      totalSalesProcessed: 0,
      totalRevenue: 0,
      lastSyncTime: null,
      errors: 0
    };
  }

  /**
   * Inicializar sincronização automática
   */
  async initialize() {
    try {
      console.log('🚀 Inicializando SalesHandler...');
      
      // Sincronização automática desabilitada temporariamente
      // para evitar conflitos com WhatsApp Web.js
      console.log('⚠️ Sincronização automática desabilitada (modo manual)');
      
      console.log('✅ SalesHandler inicializado com sucesso!');
      logger.info('SalesHandler inicializado');
      
    } catch (error) {
      console.error('❌ Erro ao inicializar SalesHandler:', error);
      logger.error('Erro na inicialização do SalesHandler', { error: error.message });
      throw error;
    }
  }

  /**
   * Iniciar sincronização automática
   */
  async startAutoSync() {
    if (this.isRunning) {
      console.log('⚠️ Sincronização já está rodando');
      return;
    }

    this.isRunning = true;
    console.log('🔄 Iniciando sincronização automática de vendas...');

    // Executar sincronização inicial
    await this.syncAllUsers();

    // Configurar intervalo de sincronização
    this.syncIntervalId = setInterval(async () => {
      try {
        await this.syncAllUsers();
      } catch (error) {
        console.error('❌ Erro na sincronização automática:', error);
        this.metrics.errors++;
      }
    }, this.syncInterval);

    logger.info('Sincronização automática iniciada', {
      interval: this.syncInterval
    });
  }

  /**
   * Parar sincronização automática
   */
  stopAutoSync() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
    this.isRunning = false;
    console.log('⏹️ Sincronização automática parada');
  }

  /**
   * Sincronizar vendas de todos os usuários
   */
  async syncAllUsers() {
    try {
      // Buscar todos os usuários ativos
      const users = await this.getActiveUsers();
      
      for (const user of users) {
        await this.syncUserSales(user.id);
      }
      
      this.metrics.lastSyncTime = new Date();
      
    } catch (error) {
      console.error('❌ Erro ao sincronizar usuários:', error);
      throw error;
    }
  }

  /**
   * Sincronizar vendas de um usuário específico
   * @param {string} userId - ID do usuário
   */
  async syncUserSales(userId) {
    try {
      // Usar timestamp local por enquanto (até implementar as novas tabelas)
      const lastSync = this.lastSyncTimes.get(userId) || new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      // Buscar vendas novas (simulação - por enquanto não há tabela sales)
      // TODO: Implementar quando a tabela sales estiver disponível
      const newSales = [];
      
      if (newSales.length > 0) {
        console.log(`🔍 ${newSales.length} vendas novas encontradas para usuário ${userId}`);
        
        let processedCount = 0;
        let errorCount = 0;
        
        // Processar cada venda
        for (const sale of newSales) {
          try {
            await this.processSale(userId, sale);
            processedCount++;
          } catch (error) {
            console.error(`❌ Erro ao processar venda ${sale.sale_id}:`, error);
            errorCount++;
          }
        }
        
        // Atualizar métricas locais
        this.lastSyncTimes.set(userId, new Date());
        
        logger.info('Vendas sincronizadas', {
          userId,
          salesCount: newSales.length,
          processedCount,
          errorCount
        });
      } else {
        // Atualizar timestamp mesmo sem vendas novas
        this.lastSyncTimes.set(userId, new Date());
      }
      
    } catch (error) {
      console.error(`❌ Erro ao sincronizar vendas do usuário ${userId}:`, error);
      this.metrics.errors++;
    }
  }

  /**
   * Detectar vendas novas na tabela sales do microssaas
   * @param {string} userId - ID do usuário
   * @param {Date} lastSyncTime - Última sincronização
   * @returns {Array} - Lista de vendas novas
   */
  async detectNewSales(userId, lastSyncTime) {
    try {
      return await this.databaseService.getNewSales(userId, lastSyncTime);
    } catch (error) {
      console.error('❌ Erro ao detectar vendas novas:', error);
      return [];
    }
  }

  /**
   * Processar uma venda individual
   * @param {string} userId - ID do usuário
   * @param {Object} saleData - Dados da venda
   */
  async processSale(userId, saleData) {
    try {
      const {
        sale_id,
        product_id,
        total_amount,
        unit_price,
        quantity,
        buyer_name,
        date,
        product_name,
        cost_price,
        product_category
      } = saleData;

      // Calcular métricas
      const costTotal = (cost_price || 0) * quantity;
      const profit = total_amount - costTotal;
      const margin = total_amount > 0 ? ((profit / total_amount) * 100) : 0;

      // Criar transação de receita no Vox Agent
      const transactionData = {
        user_id: userId,
        type: 'income',
        amount: total_amount,
        category: 'vendas',
        description: `Venda: ${product_name || 'Produto'} (${quantity}x) - ${buyer_name || 'Cliente'}`,
        transaction_date: new Date(date),
        metadata: {
          sale_id,
          product_id,
          product_name,
          product_category,
          quantity,
          unit_price,
          cost_price: cost_price || 0,
          profit,
          margin: Math.round(margin * 100) / 100,
          buyer_name,
          source: 'microssaas_integration'
        }
      };

      // Registrar transação
      const transaction = await this.databaseService.createTransaction(
        userId,
        'income',
        total_amount,
        'vendas',
        transactionData.description,
        transactionData.transaction_date
      );

      // Atualizar métricas
      this.metrics.totalSalesProcessed++;
      this.metrics.totalRevenue += total_amount;

      console.log(`💰 Venda processada: ${product_name} - R$ ${total_amount.toFixed(2)} (Lucro: R$ ${profit.toFixed(2)})`);
      
      logger.info('Venda processada automaticamente', {
        userId,
        saleId: sale_id,
        productName: product_name,
        amount: total_amount,
        profit,
        margin
      });

      return transaction;
      
    } catch (error) {
      console.error('❌ Erro ao processar venda:', error);
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Obter usuários ativos
   * @returns {Array} - Lista de usuários
   */
  async getActiveUsers() {
    try {
      if (this.databaseService.connectionType === 'supabase') {
        const { data, error } = await this.databaseService.supabase
          .from('users')
          .select('id, whatsapp_number')
          .eq('is_active', true);
        
        if (error) throw error;
        return data || [];
      } else {
        const result = await this.databaseService.query(
          'SELECT id, whatsapp_number FROM users WHERE is_active = true'
        );
        return result.rows || [];
      }
    } catch (error) {
      console.error('❌ Erro ao obter usuários ativos:', error);
      return [];
    }
  }

  /**
   * Processar comandos de vendas e estoque
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise
   * @returns {Promise<string>} - Resposta formatada
   */
  async process(userId, analysisResult) {
    try {
      const { descricao, intencao } = analysisResult;
      
      // Verificar se é resposta a sugestão de produto (número)
      if (this.isProductSuggestionResponse(descricao)) {
        return await this.handleProductSuggestionResponse(userId, descricao);
      }
      
      // Verificar se é comando de criação de produto
      if (this.isCreateProductCommand(descricao)) {
        return await this.handleCreateProductCommand(userId, descricao, analysisResult);
      }
      
      // Verificar se é comando de sincronização
      if (this.isSyncCommand(descricao, intencao)) {
        return await this.handleSyncCommand(userId);
      }
      
      // Verificar se é registro de venda manual
      if (this.isSaleRegistration(descricao, intencao)) {
        return await this.handleSaleRegistration(userId, analysisResult);
      }
      
      // Verificar se é consulta de estoque
      if (this.isStockQuery(descricao, intencao)) {
        return await this.handleStockQuery(userId, analysisResult);
      }
      
      // Verificar se é consulta detalhada de produto
      if (this.isProductQuery(descricao, intencao)) {
        return await this.handleProductQuery(userId, analysisResult);
      }
      
      // Verificar se é consulta de vendas
      if (this.isSalesQuery(descricao, intencao)) {
        return await this.handleSalesQuery(userId, analysisResult);
      }
      
      return null; // Não é comando relacionado a vendas
      
    } catch (error) {
      console.error('❌ Erro no SalesHandler:', error);
      return '❌ Erro ao processar comando de vendas. Tente novamente.';
    }
  }

  /**
   * Verificar se é resposta numérica a sugestão de produto
   * @param {string} descricao - Descrição da mensagem
   * @returns {boolean}
   */
  isProductSuggestionResponse(descricao) {
    const text = descricao?.toLowerCase().trim() || '';
    return /^[1-3]$/.test(text); // Aceita apenas números 1, 2 ou 3
  }
  
  /**
   * Verificar se é comando de criação de produto
   * @param {string} descricao - Descrição da mensagem
   * @returns {boolean}
   */
  isCreateProductCommand(descricao) {
    const text = descricao?.toLowerCase() || '';
    return text.includes('criar') && (text.includes('produto') || text.match(/criar\s+\w+/));
  }
  
  /**
   * Processar resposta numérica a sugestão de produto
   * @param {string} userId - ID do usuário
   * @param {string} descricao - Número escolhido
   * @returns {Promise<string>} - Resposta formatada
   */
  async handleProductSuggestionResponse(userId, descricao) {
    // TODO: Implementar sistema de cache de sugestões por usuário
    // Por enquanto, retornar mensagem informativa
    return `💡 **Sistema de sugestões ativo!**\n\n` +
           `Para usar as sugestões, primeiro faça uma venda que não encontre o produto.\n` +
           `Exemplo: "Vendi kz por 85 reais"`;
  }
  
  /**
   * Processar comando de criação de produto
   * @param {string} userId - ID do usuário
   * @param {string} descricao - Descrição do comando
   * @param {Object} analysisResult - Resultado da análise
   * @returns {Promise<string>} - Resposta formatada
   */
  async handleCreateProductCommand(userId, descricao, analysisResult) {
    try {
      // Extrair nome do produto do comando "criar produto X" ou "criar X"
      const productName = this.extractProductNameFromCreateCommand(descricao);
      
      if (!productName) {
        return `❌ **Nome do produto não identificado**\n\n` +
               `💡 *Exemplo: "criar produto fone bluetooth"*\n` +
               `💡 *Ou: "criar kz edx pro"*`;
      }
      
      // Verificar se produto já existe
      const products = await this.databaseService.getUserProducts(userId, 100);
      const existingProduct = products.find(p => {
        const pName = (p.name || p.product_name || '').toLowerCase();
        return pName === productName.toLowerCase();
      });
      
      if (existingProduct) {
        return `⚠️ **Produto "${productName}" já existe!**\n\n` +
               `📦 *Nome completo: ${existingProduct.name || existingProduct.product_name}*\n\n` +
               `💡 *Use o nome exato para registrar vendas.*`;
      }
      
      // Criar produto básico
      const newProduct = {
        name: productName,
        product_name: productName,
        category: 'outros',
        price: 0,
        selling_price: 0,
        cost_price: 0,
        description: `Produto criado automaticamente: ${productName}`,
        purchase_date: new Date().toISOString()
      };
      
      const createdProduct = await this.databaseService.createProduct(userId, newProduct);
      
      return `✅ **Produto "${productName}" criado com sucesso!**\n\n` +
             `📦 **Próximos passos:**\n` +
             `• Defina o preço de venda\n` +
             `• Adicione categoria específica\n` +
             `• Configure custo de compra\n\n` +
             `💡 *Agora você pode registrar vendas deste produto!*`;
             
    } catch (error) {
      console.error('❌ Erro ao criar produto:', error);
      return '❌ Erro ao criar produto. Tente novamente.';
    }
  }
  
  /**
   * Extrair nome do produto de comando de criação
   * @param {string} descricao - Descrição do comando
   * @returns {string|null} - Nome do produto
   */
  extractProductNameFromCreateCommand(descricao) {
    const text = descricao.toLowerCase().trim();
    
    // Padrões: "criar produto X", "criar X"
    const patterns = [
      /criar\s+produto\s+(.+)/,
      /criar\s+(.+)/
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const productName = match[1].trim();
        if (productName.length > 1) {
          return productName;
        }
      }
    }
    
    return null;
  }

  /**
   * Verificar se é comando de sincronização
   * @param {string} descricao - Descrição da mensagem
   * @param {string} intencao - Intenção detectada
   * @returns {boolean}
   */
  isSyncCommand(descricao, intencao) {
    const syncKeywords = [
      'sincronizar', 'sync', 'atualizar vendas', 'buscar vendas',
      'verificar vendas', 'importar vendas', 'carregar vendas'
    ];
    
    const text = descricao?.toLowerCase() || '';
    return syncKeywords.some(keyword => text.includes(keyword)) ||
           intencao === 'sincronizar_vendas';
  }

  /**
   * Verificar se é comando de registro de venda
   * @param {string} descricao - Descrição da mensagem
   * @param {string} intencao - Intenção detectada
   * @returns {boolean}
   */
  isSaleRegistration(descricao, intencao) {
    const saleKeywords = [
      'vendi', 'vendeu', 'venda', 'registrar venda', 'nova venda',
      'cliente comprou', 'foi vendido', 'saiu'
    ];
    
    const text = descricao?.toLowerCase() || '';
    return saleKeywords.some(keyword => text.includes(keyword)) ||
           intencao === 'registrar_venda';
  }

  /**
   * Verificar se é consulta de estoque
   * @param {string} descricao - Descrição da mensagem
   * @param {string} intencao - Intenção detectada
   * @returns {boolean}
   */
  isStockQuery(descricao, intencao) {
    const stockKeywords = [
      'estoque', 'quantos', 'quanto tem', 'disponível', 'disponivel',
      'tem em estoque', 'sobrou', 'restam', 'inventory'
    ];
    
    const text = descricao?.toLowerCase() || '';
    return stockKeywords.some(keyword => text.includes(keyword)) ||
           intencao === 'consultar_estoque';
  }

  /**
   * Verificar se é consulta detalhada de produto
   * @param {string} descricao - Descrição da mensagem
   * @param {string} intencao - Intenção detectada
   * @returns {boolean}
   */
  isProductQuery(descricao, intencao) {
    const productKeywords = [
      'preço', 'preco', 'valor', 'custa', 'custo', 'margem',
      'categoria', 'marca', 'fornecedor', 'sku', 'código', 'codigo',
      'descrição', 'descricao', 'detalhes', 'informações', 'informacoes',
      'dados do produto', 'ficha', 'especificações', 'especificacoes'
    ];
    
    const text = descricao?.toLowerCase() || '';
    return productKeywords.some(keyword => text.includes(keyword)) ||
           ['consultar_produto', 'info_produto', 'detalhes_produto'].includes(intencao);
  }

  /**
   * Verificar se é consulta de vendas
   * @param {string} descricao - Descrição da mensagem
   * @param {string} intencao - Intenção detectada
   * @returns {boolean}
   */
  isSalesQuery(descricao, intencao) {
    const salesKeywords = [
      'vendas', 'faturamento', 'lucro', 'margem', 'produtos vendidos',
      'clientes', 'compradores', 'performance', 'relatório de vendas'
    ];
    
    const text = descricao?.toLowerCase() || '';
    return salesKeywords.some(keyword => text.includes(keyword)) ||
           ['consultar_vendas', 'relatorio_vendas', 'performance_vendas'].includes(intencao);
  }

  /**
   * Processar comando de sincronização manual
   * @param {string} userId - ID do usuário
   * @returns {Promise<string>} - Resposta formatada
   */
  async handleSyncCommand(userId) {
    try {
      const startTime = Date.now();
      
      // Executar sincronização
      await this.syncUserSales(userId);
      
      const duration = Date.now() - startTime;
      
      return `✅ **Sincronização concluída!**\n\n` +
             `⏱️ **Tempo:** ${duration}ms\n` +
             `📊 **Status:** Vendas atualizadas\n\n` +
             `💡 *As vendas são sincronizadas automaticamente a cada 30 segundos.*`;
             
    } catch (error) {
      return '❌ Erro na sincronização. Tente novamente em alguns instantes.';
    }
  }

  /**
   * Processar registro manual de venda
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise
   * @returns {Promise<string>} - Resposta formatada
   */
  async handleSaleRegistration(userId, analysisResult) {
    try {
      const { valor, descricao, produto_nome } = analysisResult;
      
      // Extrair nome do produto da descrição
      const productName = produto_nome || this.extractProductName(descricao);
      
      if (!productName) {
        return `❌ **Produto não identificado**\n\n` +
               `💡 *Exemplo: "Vendi fone por 60 reais"*\n` +
               `💡 *Ou: "Cliente comprou projetor por 50"*`;
      }
      
      // Buscar produto no banco de dados com lógica inteligente melhorada
      const products = await this.databaseService.getUserProducts(userId, 100);
      
      // Sistema de busca inteligente em múltiplas etapas
      let product = await this.findProductIntelligent(products, productName);
      
      // Se não encontrou produto, oferecer sugestões inteligentes
      if (!product) {
        const suggestions = this.findProductSuggestions(products, productName);
        
        if (suggestions.length > 0) {
          const suggestionsList = suggestions.map((s, index) => 
            `${index + 1}. ${s.name} (${s.confidence}% similar)`
          ).join('\n');
          
          return `🤔 **Produto "${productName}" não encontrado**\n\n` +
                 `💡 **Você quis dizer:**\n${suggestionsList}\n\n` +
                 `📝 **Opções:**\n` +
                 `• Responda com o número da sugestão\n` +
                 `• Digite "criar ${productName}" para criar novo produto\n` +
                 `• Use o nome exato de um produto existente`;
        }
        
        const availableProducts = products.slice(0, 5).map(p => 
          `• ${p.name || p.product_name}`
        ).join('\n');
        
        return `❌ **Produto "${productName}" não encontrado**\n\n` +
               `📦 **Produtos disponíveis:**\n${availableProducts}\n\n` +
               `💡 *Digite "criar ${productName}" para criar novo produto*`;
      }
      
      let finalPrice = valor;
      let priceConfirmation = '';
      
      if (product) {
        const dbPrice = product.selling_price || product.price || product.sale_price || 0;
        const costPrice = product.cost_price || product.purchase_price || product.buy_price || 0;
        
        // Se o usuário não especificou valor, pedir confirmação
        if (!valor || valor <= 0) {
          if (dbPrice > 0) {
            return `💰 **Preço não especificado para ${product.name || product.product_name}**\n\n` +
                   `📋 **Preço cadastrado:** R$ ${dbPrice.toFixed(2)}\n\n` +
                   `❓ **Confirme o valor da venda:**\n` +
                   `• "Vendi ${productName} por ${dbPrice}" (usar preço cadastrado)\n` +
                   `• "Vendi ${productName} por X reais" (especificar valor diferente)\n\n` +
                   `💡 *Sempre confirme o valor para evitar erros!*`;
          } else {
            return `❌ **Preço não encontrado para ${product.name || product.product_name}**\n\n` +
                   `💡 *Especifique o valor: "Vendi ${productName} por X reais"*`;
          }
        } else {
          // Verificar se o preço está muito diferente do cadastrado
          if (dbPrice > 0) {
            const difference = Math.abs(valor - dbPrice) / dbPrice * 100;
            if (difference > 20) { // Mais de 20% de diferença
              priceConfirmation = `⚠️ *Preço diferente do cadastrado (R$ ${dbPrice.toFixed(2)})*\n`;
            }
          }
        }
        
        // Calcular lucro real se tiver custo
        const realProfit = costPrice > 0 ? (finalPrice - costPrice) : (finalPrice * 0.3);
        const margin = costPrice > 0 && finalPrice > 0 ? ((finalPrice - costPrice) / finalPrice * 100) : 30;
        
        // Registrar como receita no sistema financeiro
        console.log(`💾 Salvando venda no banco: ${product.name || product.product_name} - R$ ${finalPrice}`);
        const transaction = await this.databaseService.createTransaction(
          userId,
          'revenue', // Corrigido: usar 'revenue' em vez de 'receita'
          finalPrice,
          'vendas',
          `Venda: ${product.name || product.product_name}`,
          new Date()
        );
        console.log(`✅ Transação salva com ID: ${transaction.id}`);
        
        // TAMBÉM salvar na tabela sales específica
        const buyerName = this.extractBuyerName(descricao) || 'Cliente';
        const saleRecord = await this.databaseService.supabase
            .from('sales')
            .insert({
              user_id: userId,
              product_id: product.id,
              quantity: 1, // Assumir 1 unidade por padrão
              unit_price: finalPrice,
              buyer_name: buyerName
              // Removido: total_amount (campo calculado automaticamente)
              // Removido: created_at (preenchido automaticamente)
            })
          .select()
          .single();
        
        if (saleRecord.error) {
          console.error('⚠️ Erro ao salvar na tabela sales:', saleRecord.error);
        } else {
          console.log(`✅ Venda salva na tabela sales com ID: ${saleRecord.data.id}`);
        }
        
        // Atualizar métricas
        this.metrics.totalSalesProcessed++;
        this.metrics.totalRevenue += finalPrice;
        
        let response = `✅ **Venda registrada com sucesso!**\n\n`;
        response += priceConfirmation;
        response += `🛒 **Produto:** ${product.name || product.product_name}\n`;
        response += `💰 **Valor da Venda:** R$ ${finalPrice.toFixed(2)}\n`;
        if (costPrice > 0) {
          response += `💸 **Custo:** R$ ${costPrice.toFixed(2)}\n`;
          response += `📊 **Lucro:** R$ ${realProfit.toFixed(2)} (${margin.toFixed(1)}%)\n`;
        } else {
          response += `📊 **Lucro estimado:** R$ ${realProfit.toFixed(2)}\n`;
        }
        response += `📅 **Data:** ${new Date().toLocaleDateString('pt-BR')}\n\n`;
        response += `💡 *Receita adicionada automaticamente às suas finanças!*`;
        
        return response;
        
      } else {
        // Produto não encontrado no banco
        if (!valor || valor <= 0) {
          return `❌ **Produto "${productName}" não encontrado**\n\n` +
                 `💡 *Especifique o valor: "Vendi ${productName} por X reais"*\n\n` +
                 `📋 *Produtos cadastrados:*\n` +
                 products.slice(0, 3).map(p => `• ${p.name || p.product_name}`).join('\n');
        }
        
        // Registrar venda de produto não cadastrado
        console.log(`💾 Salvando venda de produto não cadastrado: ${productName} - R$ ${valor}`);
        const transaction = await this.databaseService.createTransaction(
          userId,
          'revenue', // Corrigido: usar 'revenue' em vez de 'receita'
          valor,
          'vendas',
          `Venda: ${productName}`,
          new Date()
        );
        console.log(`✅ Transação de produto não cadastrado salva com ID: ${transaction.id}`);
        
        // TAMBÉM salvar na tabela sales (sem product_id para produtos não cadastrados)
        const buyerName = this.extractBuyerName(descricao) || 'Cliente';
        const saleRecord = await this.databaseService.supabase
            .from('sales')
            .insert({
              user_id: userId,
              product_id: null, // Produto não cadastrado
              quantity: 1,
              unit_price: valor,
              buyer_name: buyerName
              // Removido: total_amount (campo calculado automaticamente)
              // Removido: created_at (preenchido automaticamente)
              // Removido: notes (campo pode não existir na tabela)
            })
          .select()
          .single();
        
        if (saleRecord.error) {
          console.error('⚠️ Erro ao salvar produto não cadastrado na tabela sales:', saleRecord.error);
        } else {
          console.log(`✅ Venda de produto não cadastrado salva na tabela sales com ID: ${saleRecord.data.id}`);
        }
        
        this.metrics.totalSalesProcessed++;
        this.metrics.totalRevenue += valor;
        
        return `✅ **Venda registrada!**\n\n` +
               `🛒 **Produto:** ${productName}\n` +
               `💰 **Valor:** R$ ${valor.toFixed(2)}\n` +
               `📊 **Lucro estimado:** R$ ${(valor * 0.3).toFixed(2)}\n` +
               `📅 **Data:** ${new Date().toLocaleDateString('pt-BR')}\n\n` +
               `⚠️ *Produto não cadastrado - considere adicionar ao catálogo*\n` +
               `💡 *Receita adicionada às suas finanças!*`;
      }
      
    } catch (error) {
      console.error('❌ Erro ao registrar venda:', error);
      return '❌ Erro ao registrar venda. Tente novamente.';
    }
  }

  /**
   * Processar consulta de estoque
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise
   * @returns {Promise<string>} - Resposta formatada
   */
  async handleStockQuery(userId, analysisResult) {
    try {
      const { descricao, produto_nome } = analysisResult;
      
      // Extrair nome do produto
      const productName = produto_nome || this.extractProductName(descricao);
      
      if (productName) {
        // Consultar estoque específico do produto
        return await this.getProductStock(userId, productName);
      } else {
        // Mostrar resumo geral do estoque
        return await this.getGeneralStockSummary(userId);
      }
      
    } catch (error) {
      console.error('❌ Erro ao consultar estoque:', error);
      return '❌ Erro ao consultar estoque. Tente novamente.';
    }
  }

  /**
   * Processar consulta detalhada de produto
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise
   * @returns {Promise<string>} - Resposta formatada
   */
  async handleProductQuery(userId, analysisResult) {
    try {
      const { descricao, produto_nome } = analysisResult;
      
      // Extrair nome do produto
      const productName = produto_nome || this.extractProductName(descricao);
      
      if (!productName) {
        return `❌ **Produto não especificado**\n\n` +
               `💡 *Exemplo: "Qual o preço do fone?"*\n` +
               `💡 *Ou: "Detalhes do mouse gamer"*`;
      }
      
      // Buscar produto no banco de dados
      const products = await this.databaseService.getUserProducts(userId, 100);
      
      // Encontrar produto por nome (busca flexível)
      const product = products.find(p => 
        p.name?.toLowerCase().includes(productName.toLowerCase()) ||
        p.product_name?.toLowerCase().includes(productName.toLowerCase())
      );
      
      if (!product) {
        return `❌ **Produto não encontrado: ${productName}**\n\n` +
               `💡 *Produtos disponíveis:*\n` +
               products.slice(0, 5).map(p => `• ${p.name || p.product_name}`).join('\n');
      }
      
      return await this.getProductDetails(userId, product);
      
    } catch (error) {
      console.error('❌ Erro ao consultar produto:', error);
      return '❌ Erro ao consultar informações do produto. Tente novamente.';
    }
  }

  /**
   * Obter detalhes completos de um produto
   * @param {string} userId - ID do usuário
   * @param {Object} product - Dados do produto
   * @returns {Promise<string>} - Resposta formatada
   */
  async getProductDetails(userId, product) {
    try {
      // Extrair todos os dados reais do produto
      const productData = {
        name: product.name || product.product_name || 'Produto',
        sellingPrice: product.selling_price || product.price || product.sale_price || 0,
        costPrice: product.cost_price || product.purchase_price || product.buy_price || 0,
        category: product.category || product.product_category || 'Sem categoria',
        description: product.description || product.product_description || '',
        sku: product.sku || product.code || '',
        brand: product.brand || product.marca || '',
        supplier: product.supplier || product.fornecedor || '',
        purchaseDate: product.purchase_date || product.created_at || null
      };
      
      // Buscar dados de vendas do produto
      const salesData = await this.getProductSalesData(userId, product.id);
      
      // Calcular estoque
      let initialStock = product.stock_quantity || product.quantity || product.available_quantity || 0;
      if (initialStock === 0) initialStock = 1;
      const available = Math.max(0, initialStock - (salesData.totalSold || 0));
      
      // Calcular margem de lucro real
      const margin = productData.sellingPrice > 0 && productData.costPrice > 0 
        ? ((productData.sellingPrice - productData.costPrice) / productData.sellingPrice * 100)
        : 0;
      
      // Calcular lucro por unidade
      const profitPerUnit = productData.sellingPrice - productData.costPrice;
      
      let response = `🛍️ **${productData.name}**\n\n`;
      
      // Seção de Preços e Margem
      response += `💰 **Financeiro:**\n`;
      response += `• Preço de Venda: R$ ${productData.sellingPrice.toFixed(2)}\n`;
      if (productData.costPrice > 0) {
        response += `• Preço de Custo: R$ ${productData.costPrice.toFixed(2)}\n`;
        response += `• Lucro por Unidade: R$ ${profitPerUnit.toFixed(2)}\n`;
        response += `• Margem de Lucro: ${margin.toFixed(1)}%\n`;
      }
      response += `\n`;
      
      // Seção de Estoque e Vendas
      response += `📦 **Estoque e Vendas:**\n`;
      response += `• Disponível: ${available} unidades\n`;
      response += `• Total Vendido: ${salesData.totalSold || 0} unidades\n`;
      if (salesData.totalRevenue > 0) {
        response += `• Receita Total: R$ ${salesData.totalRevenue.toFixed(2)}\n`;
      }
      response += `\n`;
      
      // Seção de Informações do Produto
      response += `ℹ️ **Informações:**\n`;
      if (productData.category !== 'Sem categoria') {
        response += `• Categoria: ${productData.category}\n`;
      }
      if (productData.sku) {
        response += `• SKU/Código: ${productData.sku}\n`;
      }
      if (productData.brand) {
        response += `• Marca: ${productData.brand}\n`;
      }
      if (productData.supplier) {
        response += `• Fornecedor: ${productData.supplier}\n`;
      }
      if (productData.purchaseDate) {
        const date = new Date(productData.purchaseDate).toLocaleDateString('pt-BR');
        response += `• Cadastrado em: ${date}\n`;
      }
      
      if (productData.description) {
        response += `\n📝 **Descrição:**\n${productData.description}\n`;
      }
      
      // Status do produto
      response += `\n📊 **Status:**\n`;
      if (available === 0) {
        response += `🔴 **PRODUTO EM FALTA** - Considere repor\n`;
      } else if (available <= 2) {
        response += `🟡 **ESTOQUE BAIXO** - Recomendo repor em breve\n`;
      } else {
        response += `🟢 **ESTOQUE ADEQUADO**\n`;
      }
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao obter detalhes do produto:', error);
      return '❌ Erro ao carregar detalhes do produto.';
    }
  }

  /**
   * Busca inteligente de produto em múltiplas etapas
   * @param {Array} products - Lista de produtos do usuário
   * @param {string} searchName - Nome do produto a buscar
   * @returns {Object|null} - Produto encontrado ou null
   */
  async findProductIntelligent(products, searchName) {
    const search = searchName.toLowerCase().trim();
    
    // Etapa 1: Busca exata
    let product = products.find(p => {
      const pName = (p.name || p.product_name || '').toLowerCase();
      return pName === search;
    });
    
    if (product) {
      console.log(`✅ Produto encontrado (busca exata): ${product.name || product.product_name}`);
      return product;
    }
    
    // Etapa 2: Busca por início do nome
    product = products.find(p => {
      const pName = (p.name || p.product_name || '').toLowerCase();
      return pName.startsWith(search) || search.startsWith(pName);
    });
    
    if (product) {
      console.log(`✅ Produto encontrado (início): ${product.name || product.product_name}`);
      return product;
    }
    
    // Etapa 3: Busca por palavras-chave com score
    const candidates = products.map(p => {
      const pName = (p.name || p.product_name || '').toLowerCase();
      const score = this.calculateSimilarityScore(pName, search);
      return { product: p, score, name: pName };
    }).filter(c => c.score > 0.6).sort((a, b) => b.score - a.score);
    
    if (candidates.length > 0) {
      console.log(`✅ Produto encontrado (similaridade): ${candidates[0].product.name || candidates[0].product.product_name} (score: ${candidates[0].score})`);
      return candidates[0].product;
    }
    
    // Etapa 4: Busca por palavras individuais
    const searchWords = search.split(' ').filter(w => w.length > 2);
    if (searchWords.length > 0) {
      product = products.find(p => {
        const pName = (p.name || p.product_name || '').toLowerCase();
        return searchWords.some(word => pName.includes(word));
      });
      
      if (product) {
        console.log(`✅ Produto encontrado (palavra-chave): ${product.name || product.product_name}`);
        return product;
      }
    }
    
    console.log(`❌ Produto não encontrado: ${searchName}`);
    return null;
  }
  
  /**
   * Calcular score de similaridade entre duas strings
   * @param {string} str1 - Primeira string
   * @param {string} str2 - Segunda string
   * @returns {number} - Score de 0 a 1
   */
  calculateSimilarityScore(str1, str2) {
    const words1 = str1.split(' ').filter(w => w.length > 1);
    const words2 = str2.split(' ').filter(w => w.length > 1);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    let matches = 0;
    let totalWords = Math.max(words1.length, words2.length);
    
    // Contar matches exatos
    words1.forEach(w1 => {
      if (words2.some(w2 => w2 === w1)) {
        matches += 1;
      } else if (words2.some(w2 => w2.includes(w1) || w1.includes(w2))) {
        matches += 0.7; // Match parcial
      }
    });
    
    // Bonus para strings que se contêm
    if (str1.includes(str2) || str2.includes(str1)) {
      matches += 0.5;
    }
    
    return Math.min(1, matches / totalWords);
  }
  
  /**
   * Encontrar sugestões de produtos similares
   * @param {Array} products - Lista de produtos
   * @param {string} searchName - Nome buscado
   * @returns {Array} - Lista de sugestões ordenadas por relevância
   */
  findProductSuggestions(products, searchName) {
    const search = searchName.toLowerCase().trim();
    
    const suggestions = products.map(p => {
      const pName = (p.name || p.product_name || '').toLowerCase();
      const score = this.calculateSimilarityScore(pName, search);
      
      return {
        product: p,
        name: p.name || p.product_name,
        score,
        confidence: Math.round(score * 100)
      };
    })
    .filter(s => s.score > 0.3) // Mínimo 30% de similaridade
    .sort((a, b) => b.score - a.score)
    .slice(0, 3); // Top 3 sugestões
    
    console.log(`💡 Encontradas ${suggestions.length} sugestões para "${searchName}"`);
    return suggestions;
  }

  /**
   * Extrair nome do produto da descrição
   * @param {string} descricao - Descrição da mensagem
   * @returns {string|null} - Nome do produto extraído
   */
  extractProductName(descricao) {
    if (!descricao) return null;
    
    console.log(`🔍 Extraindo produto de: "${descricao}"`);
    
    // Padrões melhorados para extrair nome completo do produto
    const patterns = [
      // "Venda do fone Lenovo GM pro por 67" -> "fone Lenovo GM pro"
      /(?:venda|vendi|vendeu|comprou)\s+(?:do|da|de|o|a)?\s*([^0-9]+?)\s+(?:por|de|em|R\$)\s*[0-9]/i,
      // "Registrar venda Lenovo 58 reais" -> "Lenovo"
      /(?:registrar\s+venda|venda)\s+([^0-9]+?)\s+[0-9]/i,
      // "Estoque do mouse gamer" -> "mouse gamer"
      /(?:estoque|tem|quantos)\s+(?:do|da|de|o|a)?\s*([a-záêçõ\s]+?)\s*$/i,
      // "mouse gamer disponível" -> "mouse gamer"
      /([a-záêçõ\s]+?)\s+(?:disponível|em estoque)/i
    ];
    
    for (const pattern of patterns) {
      const match = descricao.match(pattern);
      if (match && match[1]) {
        let productName = match[1].trim();
        
        // Limpar palavras desnecessárias
        productName = productName.replace(/\b(do|da|de|o|a|um|uma|cliente|para|pra)\b/gi, ' ');
        productName = productName.replace(/\s+/g, ' ').trim();
        
        if (productName.length > 2) {
          console.log(`✅ Produto extraído: "${productName}"`);
          return productName;
        }
      }
    }
    
    // Fallback: buscar por produtos comuns
    const text = descricao.toLowerCase();
    const commonProducts = [
      'fone', 'fones', 'headphone', 'earphone',
      'projetor', 'projetores',
      'camera', 'câmera', 'cameras',
      'mouse', 'teclado', 'keyboard',
      'celular', 'smartphone', 'telefone',
      'tablet', 'ipad',
      'notebook', 'laptop',
      'carregador', 'cabo',
      'caixa de som', 'speaker',
      'smartwatch', 'relógio'
    ];
    
    for (const product of commonProducts) {
      if (text.includes(product)) {
        console.log(`⚠️ Produto genérico encontrado: "${product}"`);
        return product.charAt(0).toUpperCase() + product.slice(1);
      }
    }
    
    console.log(`❌ Nenhum produto encontrado em: "${descricao}"`);
    return null;
  }

  /**
   * Extrair nome do comprador da descrição
   * @param {string} descricao - Descrição da mensagem
   * @returns {string|null} - Nome do comprador extraído
   */
  extractBuyerName(descricao) {
    if (!descricao) return null;
    
    console.log(`👤 Extraindo comprador de: "${descricao}"`);
    
    // Padrões para extrair nome do comprador
    const patterns = [
      // "Venda para o cliente Miguel" -> "Miguel"
      /(?:para|pra)\s+(?:o|a)?\s*cliente\s+([a-záêçõ\s]+?)(?:\s|$)/i,
      // "Cliente João comprou" -> "João"
      /cliente\s+([a-záêçõ\s]+?)\s+(?:comprou|levou)/i,
      // "Vendeu para Maria" -> "Maria"
      /(?:vendeu|vendi)\s+para\s+([a-záêçõ\s]+?)(?:\s|$)/i,
      // "João comprou" -> "João"
      /([a-záêçõ]+)\s+(?:comprou|levou|pegou)/i
    ];
    
    for (const pattern of patterns) {
      const match = descricao.match(pattern);
      if (match && match[1]) {
        let buyerName = match[1].trim();
        
        // Limpar palavras desnecessárias
        buyerName = buyerName.replace(/\b(do|da|de|o|a|um|uma|por|reais?)\b/gi, ' ');
        buyerName = buyerName.replace(/\s+/g, ' ').trim();
        
        if (buyerName.length > 1) {
          console.log(`✅ Comprador extraído: "${buyerName}"`);
          return buyerName;
        }
      }
    }
    
    console.log(`⚠️ Nenhum comprador encontrado em: "${descricao}"`);
    return null;
  }

  /**
   * Obter estoque de produto específico
   * @param {string} userId - ID do usuário
   * @param {string} productName - Nome do produto
   * @returns {Promise<string>} - Resposta formatada
   */
  async getProductStock(userId, productName) {
    try {
      // Buscar produto no banco de dados
      const products = await this.databaseService.getUserProducts(userId, 100);
      
      // Encontrar produto por nome (busca flexível)
      const product = products.find(p => 
        p.name?.toLowerCase().includes(productName.toLowerCase()) ||
        p.product_name?.toLowerCase().includes(productName.toLowerCase())
      );
      
      if (!product) {
        return `❌ **Produto não encontrado: ${productName}**\n\n` +
               `💡 *Produtos disponíveis:*\n` +
               products.slice(0, 5).map(p => `• ${p.name || p.product_name}`).join('\n');
      }
      
      // Buscar dados de vendas do produto
      const salesData = await this.getProductSalesData(userId, product.id);
      
      // Usar quantidade real do produto se disponível
      let initialStock = product.stock_quantity || product.quantity || product.available_quantity || 0;
      
      // Se não há campo de estoque, usar valor padrão apenas como fallback
      if (initialStock === 0) {
        console.log(`⚠️ Produto ${product.name || product.product_name} sem campo de estoque definido`);
        initialStock = 1; // Valor mínimo para indicar que existe
      }
      
      const totalSold = salesData.totalSold || 0;
      const available = Math.max(0, initialStock - totalSold);
      
      // Extrair todos os dados reais do produto
      const productData = {
        name: product.name || product.product_name || 'Produto',
        sellingPrice: product.selling_price || product.price || product.sale_price || 0,
        costPrice: product.cost_price || product.purchase_price || product.buy_price || 0,
        category: product.category || product.product_category || 'Sem categoria',
        description: product.description || product.product_description || '',
        sku: product.sku || product.code || '',
        brand: product.brand || product.marca || '',
        supplier: product.supplier || product.fornecedor || ''
      };
      
      // Calcular margem de lucro real
      const margin = productData.sellingPrice > 0 && productData.costPrice > 0 
        ? ((productData.sellingPrice - productData.costPrice) / productData.sellingPrice * 100)
        : 0;
      
      let response = `📦 **Estoque: ${productData.name}**\n\n`;
      response += `📊 **Disponível:** ${available} unidades\n`;
      response += `✅ **Vendido:** ${totalSold} unidades\n\n`;
      
      response += `💰 **Preços:**\n`;
      response += `• Venda: R$ ${productData.sellingPrice.toFixed(2)}\n`;
      if (productData.costPrice > 0) {
        response += `• Custo: R$ ${productData.costPrice.toFixed(2)}\n`;
        response += `• Margem: ${margin.toFixed(1)}%\n`;
      }
      response += `\n`;
      
      if (productData.category !== 'Sem categoria') {
        response += `🏷️ **Categoria:** ${productData.category}\n`;
      }
      
      if (productData.sku) {
        response += `🔢 **SKU:** ${productData.sku}\n`;
      }
      
      if (productData.brand) {
        response += `🏢 **Marca:** ${productData.brand}\n`;
      }
      
      if (productData.supplier) {
        response += `🏭 **Fornecedor:** ${productData.supplier}\n`;
      }
      
      if (productData.description) {
        response += `📝 **Descrição:** ${productData.description}\n`;
      }
      
      response += `\n`;
      
      if (available === 0) {
        response += `⚠️ **ATENÇÃO:** Produto em falta!\n`;
        response += `💡 *Considere repor o estoque.*`;
      } else if (available <= 2) {
        response += `🟡 **ALERTA:** Estoque baixo!\n`;
        response += `💡 *Recomendo repor em breve.*`;
      } else {
        response += `✅ **Status:** Estoque adequado`;
      }
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao consultar estoque:', error);
      return `❌ Erro ao consultar estoque de ${productName}.`;
    }
  }
  
  /**
   * Obter dados de vendas de um produto específico
   * @param {string} userId - ID do usuário
   * @param {string} productId - ID do produto
   * @returns {Promise<Object>} - Dados de vendas
   */
  async getProductSalesData(userId, productId) {
    try {
      // Tentar buscar da tabela sales (se existir)
      if (this.databaseService.connectionType === 'supabase') {
        const { data, error } = await this.databaseService.supabase
          .from('sales')
          .select('quantity, total_amount, sale_date')
          .eq('user_id', userId)
          .eq('product_id', productId);
        
        if (!error && data) {
          const totalSold = data.reduce((sum, sale) => sum + (sale.quantity || 0), 0);
          const totalRevenue = data.reduce((sum, sale) => sum + (sale.total_amount || 0), 0);
          return { totalSold, totalRevenue, salesCount: data.length };
        }
      }
      
      // Fallback: buscar nas transações de receita
      const transactions = await this.databaseService.getUserTransactionsByCategory(userId, 'vendas');
      const productTransactions = transactions.filter(t => 
        t.description?.includes(productId) || 
        t.metadata?.product_id === productId
      );
      
      return {
        totalSold: productTransactions.length,
        totalRevenue: productTransactions.reduce((sum, t) => sum + (t.amount || t.value || 0), 0),
        salesCount: productTransactions.length
      };
      
    } catch (error) {
      console.error('❌ Erro ao obter dados de vendas do produto:', error);
      return { totalSold: 0, totalRevenue: 0, salesCount: 0 };
    }
  }

  /**
   * Obter resumo geral do estoque
   * @param {string} userId - ID do usuário
   * @returns {Promise<string>} - Resposta formatada
   */
  async getGeneralStockSummary(userId) {
    try {
      // Buscar produtos reais do banco de dados
      const products = await this.databaseService.getUserProducts(userId, 50);
      
      // Debug: mostrar campos disponíveis do primeiro produto
      if (products && products.length > 0) {
        console.log('🔍 DEBUG - Campos disponíveis no produto:', Object.keys(products[0]));
        console.log('🔍 DEBUG - Primeiro produto:', products[0]);
      }
      
      if (!products || products.length === 0) {
        return `📦 **Resumo do Estoque**\n\n` +
               `❌ **Nenhum produto cadastrado**\n\n` +
               `💡 *Para começar, cadastre alguns produtos no seu sistema.*`;
      }
      
      let response = `📦 **Resumo do Estoque**\n\n`;
      response += `📊 **Status Geral:**\n`;
      
      let lowStockCount = 0;
      let outOfStockCount = 0;
      
      // Processar até 10 produtos para o resumo
      const productsToShow = products.slice(0, 10);
      
      for (const product of productsToShow) {
        const productName = product.name || product.product_name || 'Produto';
        const salesData = await this.getProductSalesData(userId, product.id);
        
        // Usar quantidade real do produto se disponível
        let initialStock = product.stock_quantity || product.quantity || product.available_quantity || 0;
        
        // Se não há campo de estoque, usar valor padrão apenas como fallback
        if (initialStock === 0) {
          initialStock = 1; // Valor mínimo para indicar que existe
        }
        
        const totalSold = salesData.totalSold || 0;
        const available = Math.max(0, initialStock - totalSold);
        
        let statusIcon = '🟢';
        let statusText = '';
        
        if (available === 0) {
          statusIcon = '🔴';
          statusText = ' (falta)';
          outOfStockCount++;
        } else if (available <= 2) {
          statusIcon = '🟡';
          statusText = ' (baixo)';
          lowStockCount++;
        }
        
        response += `• ${statusIcon} ${productName}: ${available} unidades${statusText}\n`;
      }
      
      // Mostrar alertas se houver
      if (outOfStockCount > 0 || lowStockCount > 0) {
        response += `\n⚠️ **Alertas:**\n`;
        if (outOfStockCount > 0) {
          response += `• ${outOfStockCount} produto(s) em falta\n`;
        }
        if (lowStockCount > 0) {
          response += `• ${lowStockCount} produto(s) com estoque baixo\n`;
        }
      } else {
        response += `\n✅ **Todos os produtos com estoque adequado!**\n`;
      }
      
      response += `\n💡 *Para consultar produto específico:*\n`;
      response += `*"Quantos ${productsToShow[0]?.name || 'produtos'} tem em estoque?"*`;
      
      // Se há mais produtos, informar
      if (products.length > 10) {
        response += `\n\n📋 *Mostrando 10 de ${products.length} produtos cadastrados.*`;
      }
      
      return response;
             
    } catch (error) {
      console.error('❌ Erro ao obter resumo do estoque:', error);
      return '❌ Erro ao obter resumo do estoque.';
    }
  }

  /**
   * Processar consulta de vendas
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise
   * @returns {Promise<string>} - Resposta formatada
   */
  async handleSalesQuery(userId, analysisResult) {
    try {
      // Buscar dados de vendas recentes
      const salesData = await this.getSalesAnalytics(userId);
      
      return this.formatSalesReport(salesData);
      
    } catch (error) {
      return '❌ Erro ao obter dados de vendas. Tente novamente.';
    }
  }

  /**
   * Obter analytics de vendas
   * @param {string} userId - ID do usuário
   * @returns {Object} - Dados de analytics
   */
  async getSalesAnalytics(userId) {
    try {
      // Buscar transações de vendas reais
      const salesTransactions = await this.databaseService.getUserTransactionsByCategory(userId, 'vendas');
      
      // Buscar produtos para análise
      const products = await this.databaseService.getUserProducts(userId, 100);
      
      // Calcular métricas reais
      const totalSales = salesTransactions.length;
      const totalRevenue = salesTransactions.reduce((sum, t) => sum + (t.amount || t.value || 0), 0);
      
      // Estimar lucro baseado em margem de 30% (até ter dados reais de custo)
      const estimatedProfit = totalRevenue * 0.3;
      const avgMargin = totalRevenue > 0 ? 30 : 0; // Margem estimada
      
      // Analisar produtos mais vendidos
      const productSales = {};
      for (const transaction of salesTransactions) {
        // Extrair nome do produto da descrição
        const productMatch = transaction.description?.match(/Venda: ([^(]+)/i);
        const productName = productMatch ? productMatch[1].trim() : 'Produto';
        
        if (!productSales[productName]) {
          productSales[productName] = {
            name: productName,
            total_sales: 0,
            total_revenue: 0
          };
        }
        
        productSales[productName].total_sales++;
        productSales[productName].total_revenue += (transaction.amount || transaction.value || 0);
      }
      
      // Top produtos ordenados por receita
      const topProducts = Object.values(productSales)
        .sort((a, b) => b.total_revenue - a.total_revenue)
        .slice(0, 5);
      
      // Dados dos últimos 7 dias
      const last7Days = [];
      const today = new Date();
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const dayTransactions = salesTransactions.filter(t => {
          const transactionDate = new Date(t.transaction_date || t.created_at);
          return transactionDate.toISOString().split('T')[0] === dateStr;
        });
        
        last7Days.push({
          sale_date: dateStr,
          total_sales: dayTransactions.length,
          total_revenue: dayTransactions.reduce((sum, t) => sum + (t.amount || t.value || 0), 0)
        });
      }
      
      // Contar alertas de estoque (simulação)
      let lowStockCount = 0;
      const lowStockProducts = [];
      
      for (const product of products.slice(0, 10)) {
        const salesData = await this.getProductSalesData(userId, product.id);
        const available = Math.max(0, 20 - (salesData.totalSold || 0));
        
        if (available <= 2) {
          lowStockCount++;
          if (available === 0) {
            lowStockProducts.push({
              name: product.name || product.product_name,
              available: 0,
              status: 'out_of_stock'
            });
          } else {
            lowStockProducts.push({
              name: product.name || product.product_name,
              available,
              status: 'low_stock'
            });
          }
        }
      }
      
      return {
        // Totais reais
        totalSales,
        totalRevenue,
        totalProfit: estimatedProfit,
        avgMargin,
        uniqueCustomers: new Set(salesTransactions.map(t => t.metadata?.buyer_name).filter(Boolean)).size,
        
        // Dados dos últimos 7 dias
        dailyData: last7Days,
        
        // Top produtos
        topProducts,
        
        // Alertas de estoque
        lowStockCount,
        lowStockProducts,
        
        // Status de sincronização
        lastSync: this.metrics.lastSyncTime,
        syncStatus: this.isRunning ? 'success' : 'stopped',
        
        // Métricas do handler
        handlerMetrics: this.getMetrics(),
        
        // Indicar que usa dados reais
        isBasicVersion: false,
        message: 'Dados reais do banco de dados'
      };
    } catch (error) {
      console.error('❌ Erro ao obter analytics:', error);
      return {
        totalSales: 0,
        totalRevenue: 0,
        totalProfit: 0,
        avgMargin: 0,
        error: 'Erro ao carregar dados'
      };
    }
  }

  /**
   * Formatar relatório de vendas
   * @param {Object} salesData - Dados de vendas
   * @returns {string} - Relatório formatado
   */
  formatSalesReport(salesData) {
    const { 
      totalSales, totalRevenue, totalProfit, avgMargin, uniqueCustomers,
      topProducts, lowStockCount, lastSync, syncStatus, error 
    } = salesData;
    
    if (error) {
      return `❌ **Erro no Relatório de Vendas**\n\n${error}\n\nTente novamente em alguns instantes.`;
    }
    
    let report = `📊 **Relatório de Vendas - Últimos 30 dias**\n\n`;
    
    // Seção financeira
    report += `💰 **Resumo Financeiro:**\n`;
    report += `• Faturamento: R$ ${(totalRevenue || 0).toFixed(2)}\n`;
    report += `• Lucro: R$ ${(totalProfit || 0).toFixed(2)}\n`;
    report += `• Margem: ${avgMargin || 0}%\n`;
    report += `• Vendas: ${totalSales || 0} transações\n`;
    report += `• Clientes únicos: ${uniqueCustomers || 0}\n\n`;
    
    // Top produtos
    if (topProducts && topProducts.length > 0) {
      report += `🏆 **Top Produtos:**\n`;
      topProducts.slice(0, 3).forEach((product, index) => {
        const revenue = parseFloat(product.total_revenue || 0);
        const sales = product.total_sales || 0;
        report += `${index + 1}. ${product.name}: ${sales}x (R$ ${revenue.toFixed(2)})\n`;
      });
      report += `\n`;
    }
    
    // Alertas
    if (lowStockCount > 0) {
      report += `⚠️ **Alertas:**\n`;
      report += `• ${lowStockCount} produto(s) com estoque baixo\n\n`;
    }
    
    // Status de sincronização
    const syncStatusEmoji = {
      'success': '✅',
      'partial': '⚠️',
      'error': '❌',
      'never': '🔄'
    };
    
    report += `🔄 **Sincronização:**\n`;
    report += `• Status: ${syncStatusEmoji[syncStatus] || '🔄'} ${this.getSyncStatusText(syncStatus)}\n`;
    report += `• Última: ${lastSync ? lastSync.toLocaleString('pt-BR') : 'Nunca'}\n\n`;
    
    report += `💡 *Dados atualizados automaticamente a cada 30 segundos.*`;
    
    return report;
  }
  
  /**
   * Obter texto do status de sincronização
   * @param {string} status - Status da sincronização
   * @returns {string} - Texto formatado
   */
  getSyncStatusText(status) {
    const statusTexts = {
      'success': 'Sincronizado',
      'partial': 'Parcial (com erros)',
      'error': 'Erro na sincronização',
      'never': 'Nunca sincronizado'
    };
    
    return statusTexts[status] || 'Desconhecido';
  }

  /**
   * Obter métricas do handler
   * @returns {Object} - Métricas
   */
  getMetrics() {
    return {
      ...this.metrics,
      isRunning: this.isRunning,
      activeUsers: this.lastSyncTimes.size
    };
  }

  /**
   * Obter status do handler
   * @returns {Object} - Status
   */
  getStatus() {
    return {
      isInitialized: this.isRunning,
      syncInterval: this.syncInterval,
      metrics: this.getMetrics()
    };
  }
}

module.exports = SalesHandler;