const logger = require('../../../utils/logger');

/**
 * Gerenciador especializado para vendas por reconhecimento de imagem
 * Extraído do sales-handler.js para modularização
 */
class ImageSalesManager {
  constructor(databaseService) {
    this.databaseService = databaseService;
    
    // Cache de contexto de produtos identificados por imagem
    this.imageProductContext = new Map(); // userId -> productData
    this.contextTimeout = 5 * 60 * 1000; // 5 minutos
    
    // Métricas específicas de vendas por imagem
    this.metrics = {
      totalImageSales: 0,
      totalImageRevenue: 0,
      averageConfidence: 0
    };
  }

  /**
   * Processar venda de produto identificado por imagem
   * Extraído de: sales-handler.js linhas 391-456
   */
  async handleImageProductSale(userId, analysisResult) {
    try {
      const { produto_nome, produto_id, valor, confianca, similaridade } = analysisResult;
      
      console.log('🛒 Processando venda de produto identificado por imagem:', {
        produto: produto_nome,
        confianca,
        similaridade
      });
      
      // Buscar dados completos do produto no banco
      let product = null;
      if (produto_id) {
        const products = await this.databaseService.getUserProducts(userId, 100);
        product = products.find(p => p.id === produto_id);
      }
      
      if (!product) {
        // Buscar por nome se não encontrou por ID
        const products = await this.databaseService.getUserProducts(userId, 100);
        product = products.find(p => 
          (p.name && p.name.toLowerCase().includes(produto_nome.toLowerCase())) ||
          (p.product_name && p.product_name.toLowerCase().includes(produto_nome.toLowerCase()))
        );
      }
      
      if (!product) {
        return `❌ **Produto não encontrado no banco de dados**\n\n` +
               `📸 Identifiquei: **${produto_nome}**\n` +
               `⚠️ Confiança: ${(confianca * 100).toFixed(0)}%\n\n` +
               `💡 *O produto precisa estar cadastrado para registrar vendas.*`;
      }
      
      // Verificar se tem preço cadastrado
      const sellingPrice = product.selling_price || product.price || valor;
      
      // Salvar contexto do produto para próxima interação
      this.saveImageProductContext(userId, {
        product: product,
        sellingPrice: sellingPrice,
        confianca: confianca,
        produto_nome: produto_nome
      });
      
      if (sellingPrice && sellingPrice > 0) {
        // Produto tem preço - sugerir preço cadastrado
        return `✅ **${product.name || product.product_name}** identificado!\n\n` +
               `📊 **Confiança:** ${(confianca * 100).toFixed(0)}%\n` +
               `💰 **Preço cadastrado:** R$ ${sellingPrice.toFixed(2)}\n\n` +
               `❓ **Foi vendido por R$ ${sellingPrice.toFixed(2)}?**\n\n` +
               `• Digite "sim" ou "ok" para confirmar\n` +
               `• Digite o valor real da venda (ex: 85.00)\n` +
               `• Digite "não" para cancelar`;
      } else {
        // Produto sem preço - solicitar valor
        return `✅ **${product.name || product.product_name}** identificado!\n\n` +
               `📊 **Confiança:** ${(confianca * 100).toFixed(0)}%\n\n` +
               `💰 **Qual foi o valor da venda?**\n` +
               `💡 *Digite o valor em reais (ex: 89.90)*`;
      }
      
    } catch (error) {
      console.error('❌ Erro ao processar venda de imagem:', error);
      return '❌ Erro ao processar venda do produto identificado. Tente novamente.';
    }
  }

  /**
   * Verificar se é confirmação de venda de produto identificado por imagem
   * Extraído de: sales-handler.js linhas 463-504
   */
  isImageSaleConfirmation(descricao, userId) {
    if (!descricao || !userId) return false;
    
    // PRIMEIRO: Verificar se há contexto de venda ativo
    const context = this.imageProductContext.get(userId);
    if (!context) return false; // Sem contexto, não é confirmação de venda
    
    // Verificar se não expirou
    const elapsed = Date.now() - context.timestamp;
    if (elapsed > this.contextTimeout) {
      this.imageProductContext.delete(userId);
      return false;
    }
    
    const text = descricao.toLowerCase().trim();
    
    // Verificar confirmações
    const confirmations = ['sim', 'ok', 'confirmar', 'confirmo', 'yes'];
    if (confirmations.includes(text)) return true;
    
    // Verificar valores monetários (incluindo "reais", "R$", etc.)
    const pricePattern = /^\d+([.,]\d{1,2})?\s*(reais?|r\$?)?$/i;
    if (pricePattern.test(text.replace(',', '.'))) return true;
    
    // Verificar padrões alternativos como "R$ 70", "70.00 reais", etc.
    const altPricePattern = /(r\$?\s*)?\d+([.,]\d{1,2})?(\s*(reais?|r\$?))?/i;
    if (altPricePattern.test(text)) return true;
    
    // Verificar negações
    const negations = ['não', 'nao', 'no', 'cancelar', 'cancel'];
    if (negations.includes(text)) return true;
    
    return false;
  }

  /**
   * Processar confirmação de venda de produto identificado por imagem
   * Extraído de: sales-handler.js linhas 504-564
   */
  async handleImageSaleConfirmation(userId, analysisResult) {
    try {
      const { descricao } = analysisResult;
      const text = descricao.toLowerCase().trim();
      
      console.log('🔄 Processando confirmação de venda por imagem:', text);
      
      // Verificar se é cancelamento
      const negations = ['não', 'nao', 'no', 'cancelar', 'cancel'];
      if (negations.includes(text)) {
        this.clearImageProductContext(userId);
        return '❌ **Venda cancelada**\n\n💡 *Envie uma nova foto quando quiser registrar uma venda.*';
      }
      
      // Buscar último produto identificado por imagem no contexto do usuário
      const lastImageProduct = this.getLastImageProductContext(userId);
      
      if (!lastImageProduct) {
        return '❌ **Contexto perdido**\n\n' +
               '💡 *Envie a foto do produto novamente para registrar a venda.*';
      }
      
      const confirmations = ['sim', 'ok', 'confirmar', 'confirmo', 'yes'];
      if (confirmations.includes(text)) {
        // Confirmar com preço cadastrado
        const salePrice = lastImageProduct.sellingPrice;
        return await this.registerImageSale(userId, lastImageProduct, salePrice);
      }
      
      // Verificar se é um valor monetário (melhorado para português brasileiro)
      const price = this.extractPriceFromText(text);
      if (price !== null) {
        if (price <= 0) {
          return '❌ **Valor inválido**\n\n💡 *Digite um valor maior que zero (ex: 89.90)*';
        }
        
        // Registrar com preço informado pelo usuário
        return await this.registerImageSale(userId, lastImageProduct, price);
      }
      
      return '❓ **Não entendi sua resposta**\n\n' +
             'Responda com:\n' +
             '• "sim" ou "ok" para confirmar o preço\n' +
             '• O valor da venda (ex: 85.00)\n' +
             '• "não" para cancelar';
      
    } catch (error) {
      console.error('❌ Erro ao processar confirmação:', error);
      return '❌ Erro ao processar confirmação. Tente novamente.';
    }
  }

  /**
   * Extrair preço de texto em português brasileiro
   * @param {string} text - Texto a ser analisado
   * @returns {number|null} - Preço extraído ou null se não encontrado
   */
  extractPriceFromText(text) {
    // Remover espaços e converter para minúsculas
    const cleanText = text.toLowerCase().trim();
    
    // Padrões para valores monetários em português brasileiro
    const patterns = [
      // "80 reais", "50 real"
      /(?:por\s+)?(\d+(?:[.,]\d{1,2})?)\s*(?:reais?|r\$?)\s*$/,
      // "R$ 80", "r$ 50.00"
      /^r\$?\s*(\d+(?:[.,]\d{1,2})?)\s*$/,
      // "80.00", "50,90", "80"
      /^(\d+(?:[.,]\d{1,2})?)\s*$/,
      // "por 80", "custou 50"
      /(?:por|custou|vendi|vendido)\s+(\d+(?:[.,]\d{1,2})?)\s*(?:reais?)?\s*$/
    ];
    
    for (const pattern of patterns) {
      const match = cleanText.match(pattern);
      if (match) {
        const priceStr = match[1].replace(',', '.');
        const price = parseFloat(priceStr);
        if (!isNaN(price) && price > 0) {
          return price;
        }
      }
    }
    
    return null;
  }

  /**
   * Salvar contexto de produto identificado por imagem
   * Extraído de: sales-handler.js linhas 1843-1862
   */
  saveImageProductContext(userId, productData) {
    const contextData = {
      ...productData,
      timestamp: Date.now()
    };
    
    this.imageProductContext.set(userId, contextData);
    
    // Limpar contexto após timeout (igual ao original)
    setTimeout(() => {
      const currentContext = this.imageProductContext.get(userId);
      if (currentContext && currentContext.timestamp === contextData.timestamp) {
        this.imageProductContext.delete(userId);
        console.log(`🗑️ Contexto auto-removido para usuário: ${userId}`);
      }
    }, this.contextTimeout);
    
    console.log('💾 Contexto de produto salvo para usuário:', userId);
  }

  /**
   * Obter último produto identificado por imagem
   * Extraído de: sales-handler.js linhas 1862-1886
   */
  async getLastImageProductContext(userId) {
    const context = this.imageProductContext.get(userId);
    
    if (!context) {
      return null;
    }
    
    // Verificar se não expirou
    const elapsed = Date.now() - (context.timestamp || Date.now());
    if (elapsed > this.contextTimeout) {
      this.imageProductContext.delete(userId);
      console.log(`🗑️ Contexto expirado removido para usuário: ${userId}`);
      return null;
    }
    
    return context;
  }

  /**
   * Limpar contexto de produto
   */
  clearImageProductContext(userId) {
    this.imageProductContext.delete(userId);
    console.log('🗑️ Contexto de produto removido para usuário:', userId);
  }

  /**
   * Registrar venda de produto identificado por imagem
   * Extraído de: sales-handler.js linhas 1886-1955
   */
  async registerImageSale(userId, productContext, salePrice) {
    try {
      const { product, produto_nome, confianca } = productContext;
      
      // Usar nome do produto do banco de dados (prioritário) ou nome identificado pela IA
      const finalProductName = (product && (product.name || product.product_name)) || produto_nome || 'Produto não identificado';
      
      console.log('💰 Registrando venda por imagem:', {
        produto: finalProductName,
        preco: salePrice,
        usuario: userId
      });
      
      // Registrar como receita no sistema financeiro
      await this.databaseService.createRevenue(
        userId,
        salePrice,
        'vendas',
        `Venda: ${finalProductName} (identificado por IA)`,
        new Date(),
        'vendas_ai'
      );
      
      // Atualizar métricas
      this.metrics.totalImageSales++;
      this.metrics.totalImageRevenue += salePrice;
      this.metrics.averageConfidence = (
        (this.metrics.averageConfidence * (this.metrics.totalImageSales - 1) + confianca) / 
        this.metrics.totalImageSales
      );
      
      // Limpar contexto após registro
      this.clearImageProductContext(userId);
      
      // Calcular lucro se houver preço de custo
      const costPrice = (product && product.cost_price) || 0;
      const profit = costPrice > 0 ? salePrice - costPrice : null;
      const margin = profit && costPrice > 0 ? ((profit / salePrice) * 100) : null;
      
      let response = `✅ **Venda Registrada com Sucesso!**\n\n`;
      response += `🛒 **Produto:** ${finalProductName}\n`;
      response += `💰 **Valor:** R$ ${salePrice.toFixed(2)}\n`;
      response += `📊 **Confiança IA:** ${(confianca * 100).toFixed(0)}%\n`;
      
      if (profit !== null) {
        response += `\n💹 **Análise Financeira:**\n`;
        response += `• **Custo:** R$ ${costPrice.toFixed(2)}\n`;
        response += `• **Lucro:** R$ ${profit.toFixed(2)}\n`;
        if (margin !== null) {
          response += `• **Margem:** ${margin.toFixed(1)}%\n`;
        }
      }
      
      response += `\n📅 **Data:** ${new Date().toLocaleDateString('pt-BR')}\n`;
      response += `🤖 **Método:** Reconhecimento por IA`;
      
      logger.info('Venda por imagem registrada', {
        userId,
        produto: finalProductName,
        valor: salePrice,
        confianca
      });
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao registrar venda por imagem:', error);
      logger.error('Erro no registro de venda por imagem', {
        userId,
        error: error.message
      });
      
      return '❌ **Erro ao registrar venda**\n\n' +
             'Ocorreu um erro ao salvar a transação. Tente novamente ou registre manualmente.';
    }
  }

  /**
   * Obter métricas de vendas por imagem
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeContexts: this.imageProductContext.size
    };
  }

  /**
   * Obter status do manager
   */
  getStatus() {
    return {
      isActive: true,
      contextTimeout: this.contextTimeout,
      metrics: this.getMetrics()
    };
  }
}

module.exports = ImageSalesManager;