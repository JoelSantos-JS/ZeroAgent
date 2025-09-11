const logger = require('../../utils/logger');

/**
 * Serviço especializado em processamento de vendas
 * Responsável por registrar, validar e processar vendas
 */
class SalesProcessingService {
  constructor(databaseService) {
    this.databaseService = databaseService;
  }

  /**
   * Processar venda completa
   * @param {string} userId - ID do usuário
   * @param {Object} product - Produto encontrado
   * @param {number} salePrice - Preço da venda
   * @param {string} description - Descrição da venda
   * @param {string} buyerName - Nome do comprador (opcional)
   * @returns {Promise<Object>} - Resultado da venda processada
   */
  async processSale(userId, product, salePrice, description, buyerName = null) {
    try {
      const dbPrice = product.selling_price || product.price || product.sale_price || 0;
      const costPrice = product.cost_price || product.purchase_price || product.buy_price || 0;
      
      // Calcular lucro real
      const realProfit = costPrice > 0 ? (salePrice - costPrice) : (salePrice * 0.3);
      const margin = costPrice > 0 && salePrice > 0 ? ((salePrice - costPrice) / salePrice * 100) : 30;
      
      // Registrar como receita no sistema financeiro
      logger.info(`💾 Salvando venda no banco: ${product.name || product.product_name} - R$ ${salePrice}`);
      
      const transaction = await this.databaseService.createTransaction(
        userId,
        'receita',
        salePrice,
        'vendas',
        description,
        new Date()
      );
      
      logger.info(`✅ Transação salva com ID: ${transaction.id}`);
      
      // Tentar salvar na tabela sales (detalhes específicos)
      try {
        await this.saveSaleDetails(userId, product, salePrice, buyerName, transaction.id);
      } catch (saleError) {
        logger.error('⚠️ Erro ao salvar na tabela sales:', saleError);
        // Continuar mesmo se falhar - transação principal já foi salva
      }
      
      return {
        success: true,
        transaction,
        product,
        salePrice,
        costPrice,
        profit: realProfit,
        margin,
        buyerName,
        priceComparison: this.comparePrices(salePrice, dbPrice)
      };
      
    } catch (error) {
      logger.error('❌ Erro ao processar venda:', error);
      throw error;
    }
  }

  /**
   * Salvar detalhes específicos da venda na tabela sales
   * @param {string} userId - ID do usuário
   * @param {Object} product - Produto
   * @param {number} salePrice - Preço da venda
   * @param {string} buyerName - Nome do comprador
   * @param {string} transactionId - ID da transação principal
   */
  async saveSaleDetails(userId, product, salePrice, buyerName, transactionId) {
    try {
      if (this.databaseService.connectionType === 'supabase') {
        const saleData = {
          product_id: product.id,
          user_id: userId,
          date: new Date().toISOString(),
          quantity: 1,
          buyer_name: buyerName,
          unit_price: Math.min(salePrice, 999.99), // Limitar para evitar overflow
          transaction_id: transactionId
        };
        
        const { data, error } = await this.databaseService.supabase
          .from('sales')
          .insert(saleData)
          .select()
          .single();
        
        if (error) {
          throw error;
        }
        
        logger.info('✅ Detalhes da venda salvos na tabela sales');
        return data;
      }
    } catch (error) {
      logger.error('❌ Erro ao salvar detalhes da venda:', error);
      throw error;
    }
  }

  /**
   * Comparar preços e gerar alertas
   * @param {number} salePrice - Preço da venda
   * @param {number} catalogPrice - Preço do catálogo
   * @returns {Object} - Resultado da comparação
   */
  comparePrices(salePrice, catalogPrice) {
    if (!catalogPrice || catalogPrice <= 0) {
      return {
        type: 'no_catalog_price',
        message: '',
        difference: 0
      };
    }
    
    const difference = Math.abs(salePrice - catalogPrice) / catalogPrice * 100;
    
    if (difference > 20) {
      return {
        type: 'significant_difference',
        message: `⚠️ *Preço diferente do cadastrado (R$ ${catalogPrice.toFixed(2)})*`,
        difference
      };
    }
    
    if (salePrice === catalogPrice) {
      return {
        type: 'exact_match',
        message: `💡 *Usando preço cadastrado: R$ ${catalogPrice.toFixed(2)}*`,
        difference: 0
      };
    }
    
    return {
      type: 'minor_difference',
      message: '',
      difference
    };
  }

  /**
   * Extrair nome do comprador da descrição
   * @param {string} descricao - Descrição da venda
   * @returns {string|null} - Nome do comprador
   */
  extractBuyerName(descricao) {
    if (!descricao) {
      return null;
    }

    const text = descricao.toLowerCase();
    
    // Padrões para extrair nome do comprador
    const buyerPatterns = [
      /(?:para|pro)\s+(?:o\s+|a\s+)?([a-záêçõ]+(?:\s+[a-záêçõ]+)?)/i,
      /cliente\s+([a-záêçõ]+(?:\s+[a-záêçõ]+)?)/i,
      /comprador\s+([a-záêçõ]+(?:\s+[a-záêçõ]+)?)/i,
      /vendido\s+para\s+([a-záêçõ]+(?:\s+[a-záêçõ]+)?)/i
    ];
    
    for (const pattern of buyerPatterns) {
      const match = descricao.match(pattern);
      if (match && match[1]) {
        const buyerName = match[1].trim();
        // Filtrar palavras comuns que não são nomes
        const commonWords = ['ele', 'ela', 'cliente', 'comprador', 'pessoa', 'cara', 'moça'];
        if (!commonWords.includes(buyerName.toLowerCase()) && buyerName.length > 2) {
          logger.info(`👤 Comprador identificado: "${buyerName}"`);
          return buyerName;
        }
      }
    }
    
    logger.info(`⚠️ Nenhum comprador encontrado em: "${descricao}"`);
    return null;
  }

  /**
   * Validar dados da venda
   * @param {Object} saleData - Dados da venda
   * @returns {Object} - Resultado da validação
   */
  validateSaleData(saleData) {
    const errors = [];
    
    if (!saleData.product) {
      errors.push('Produto é obrigatório');
    }
    
    if (!saleData.price || saleData.price <= 0) {
      errors.push('Preço deve ser maior que zero');
    }
    
    if (saleData.price > 999999) {
      errors.push('Preço muito alto (máximo: R$ 999.999,00)');
    }
    
    if (!saleData.userId) {
      errors.push('ID do usuário é obrigatório');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Formatar resposta de venda bem-sucedida
   * @param {Object} saleResult - Resultado da venda processada
   * @returns {string} - Resposta formatada
   */
  formatSaleResponse(saleResult) {
    const {
      product,
      salePrice,
      costPrice,
      profit,
      margin,
      buyerName,
      priceComparison
    } = saleResult;
    
    let response = `✅ **Venda registrada com sucesso!**\n\n`;
    
    // Adicionar comparação de preço se houver
    if (priceComparison.message) {
      response += `${priceComparison.message}\n`;
    }
    
    response += `🛒 **Produto:** ${product.name || product.product_name}\n`;
    response += `💰 **Valor da Venda:** R$ ${salePrice.toFixed(2)}\n`;
    
    if (costPrice > 0) {
      response += `💸 **Custo:** R$ ${costPrice.toFixed(2)}\n`;
      response += `📊 **Lucro:** R$ ${profit.toFixed(2)} (${margin.toFixed(1)}%)\n`;
    }
    
    if (buyerName) {
      response += `👤 **Cliente:** ${buyerName}\n`;
    }
    
    response += `📅 **Data:** ${new Date().toLocaleDateString('pt-BR')}\n\n`;
    response += `💡 *Receita adicionada automaticamente às suas finanças!*`;
    
    return response;
  }

  /**
   * Processar venda com confirmação de preço
   * @param {string} userId - ID do usuário
   * @param {Object} product - Produto
   * @param {string} description - Descrição original
   * @returns {string} - Mensagem de confirmação
   */
  requestPriceConfirmation(userId, product, description) {
    const dbPrice = product.selling_price || product.price || product.sale_price || 0;
    const productName = this.extractProductNameFromDescription(description);
    
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
  }

  /**
   * Extrair nome do produto da descrição para usar em mensagens
   * @param {string} description - Descrição
   * @returns {string} - Nome simplificado do produto
   */
  extractProductNameFromDescription(description) {
    // Extrair primeira palavra significativa do produto
    const words = description.toLowerCase().split(' ');
    const productWords = words.filter(word => 
      word.length > 2 && 
      !['vendi', 'venda', 'cliente', 'comprou', 'por', 'reais', 'real'].includes(word)
    );
    
    return productWords[0] || 'produto';
  }
}

module.exports = SalesProcessingService;