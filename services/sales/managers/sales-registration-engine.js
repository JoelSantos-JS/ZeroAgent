const logger = require('../../../utils/logger');

/**
 * Motor de registro de vendas manuais
 * Extraído do sales-handler.js para modularização
 */
class SalesRegistrationEngine {
  constructor(databaseService, productSearchEngine) {
    this.databaseService = databaseService;
    this.productSearchEngine = productSearchEngine;
    
    // Métricas de registro
    this.metrics = {
      totalSalesRegistered: 0,
      totalRevenue: 0,
      averageTicket: 0,
      lastSaleTime: null
    };
  }

  /**
   * Verificar se é comando de registro de venda
   * Extraído de: sales-handler.js linhas 665-682
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
   * Verificar se é resposta numérica a sugestão de produto
   * Extraído de: sales-handler.js linhas 356-359
   */
  isProductSuggestionResponse(descricao) {
    const text = descricao?.toLowerCase().trim() || '';
    return /^[1-3]$/.test(text); // Aceita apenas números 1, 2 ou 3
  }

  /**
   * Processar registro manual de venda
   * Extraído de: sales-handler.js linhas 759-959
   */
  async handleSaleRegistration(userId, analysisResult) {
    try {
      const { valor, descricao, produto_nome } = analysisResult;
      
      // Extrair nome do produto da descrição
      const productName = produto_nome || this.productSearchEngine.extractProductName(descricao);
      
      if (!productName) {
        return `❌ **Produto não identificado**\n\n` +
               `💡 *Exemplo: "Vendi fone por 60 reais"*\n` +
               `💡 *Ou: "Cliente comprou projetor por 50"*`;
      }
      
      // Buscar produto no banco de dados com lógica inteligente melhorada
      const products = await this.databaseService.getUserProducts(userId, 100);
      
      // Sistema de busca inteligente em múltiplas etapas
      let product = await this.productSearchEngine.findProductIntelligent(products, productName);
      
      // Se não encontrou produto, oferecer sugestões inteligentes
      if (!product) {
        const suggestions = this.productSearchEngine.findProductSuggestions(products, productName);
        
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
        const buyerName = this.productSearchEngine.extractBuyerName(descricao) || 'Cliente';
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
        this.updateMetrics(finalPrice);
        
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
        
        logger.info('Venda manual registrada', {
          userId,
          productName: product.name || product.product_name,
          valor: finalPrice,
          buyerName
        });
        
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
        const buyerName = this.productSearchEngine.extractBuyerName(descricao) || 'Cliente';
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
        
        this.updateMetrics(valor);
        
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
   * Processar resposta numérica a sugestão de produto
   * Extraído de: sales-handler.js linhas 377-383
   */
  async handleProductSuggestionResponse(userId, descricao) {
    // TODO: Implementar sistema de cache de sugestões por usuário
    // Por enquanto, retornar mensagem informativa
    return `💡 **Sistema de sugestões ativo!**\n\n` +
           `Para usar as sugestões, primeiro faça uma venda que não encontre o produto.\n` +
           `Exemplo: "Vendi kz por 85 reais"`;
  }

  /**
   * Processar venda em lote
   */
  async processBatchSale(userId, salesData) {
    try {
      const results = [];
      let totalRevenue = 0;
      let successCount = 0;
      let errorCount = 0;
      
      for (const sale of salesData) {
        try {
          const result = await this.handleSaleRegistration(userId, sale);
          results.push({ sale, result, status: 'success' });
          totalRevenue += sale.valor || 0;
          successCount++;
        } catch (error) {
          results.push({ sale, error: error.message, status: 'error' });
          errorCount++;
        }
      }
      
      logger.info('Venda em lote processada', {
        userId,
        totalSales: salesData.length,
        successCount,
        errorCount,
        totalRevenue
      });
      
      return {
        totalSales: salesData.length,
        successCount,
        errorCount,
        totalRevenue,
        results
      };
      
    } catch (error) {
      console.error('❌ Erro no processamento em lote:', error);
      throw error;
    }
  }

  /**
   * Validar dados de venda
   */
  validateSaleData(saleData) {
    const errors = [];
    
    if (!saleData.produto_nome || saleData.produto_nome.trim().length === 0) {
      errors.push('Nome do produto é obrigatório');
    }
    
    if (!saleData.valor || saleData.valor <= 0) {
      errors.push('Valor da venda deve ser maior que zero');
    }
    
    if (saleData.valor && saleData.valor > 100000) {
      errors.push('Valor da venda parece muito alto');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Obter histórico de vendas recentes
   */
  async getRecentSales(userId, limit = 10) {
    try {
      const transactions = await this.databaseService.getUserTransactionsByCategory(userId, 'vendas');
      
      return transactions
        .sort((a, b) => new Date(b.transaction_date || b.created_at) - new Date(a.transaction_date || a.created_at))
        .slice(0, limit)
        .map(t => ({
          id: t.id,
          produto: t.description?.replace('Venda: ', '') || 'Produto',
          valor: t.amount || t.value || 0,
          data: new Date(t.transaction_date || t.created_at).toLocaleDateString('pt-BR'),
          comprador: t.metadata?.buyer_name || 'Cliente'
        }));
        
    } catch (error) {
      console.error('❌ Erro ao obter vendas recentes:', error);
      return [];
    }
  }

  /**
   * Atualizar métricas
   */
  updateMetrics(saleValue) {
    this.metrics.totalSalesRegistered++;
    this.metrics.totalRevenue += saleValue;
    this.metrics.averageTicket = this.metrics.totalRevenue / this.metrics.totalSalesRegistered;
    this.metrics.lastSaleTime = new Date();
  }

  /**
   * Obter métricas de registro
   */
  getMetrics() {
    return {
      ...this.metrics
    };
  }

  /**
   * Obter status do motor de registro
   */
  getStatus() {
    return {
      isActive: true,
      metrics: this.getMetrics()
    };
  }
}

module.exports = SalesRegistrationEngine;