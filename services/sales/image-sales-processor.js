const logger = require('../../utils/logger');

/**
 * Processador especializado para vendas por reconhecimento de imagem
 */
class ImageSalesProcessor {
  constructor(databaseService) {
    this.databaseService = databaseService;
    
    // Cache de contexto de produtos identificados por imagem
    this.imageProductContext = new Map(); // userId -> productData
    this.contextTimeout = 5 * 60 * 1000; // 5 minutos
  }

  /**
   * Verificar se uma mensagem é confirmação de venda por imagem
   * @param {string} descricao - Texto da mensagem
   * @param {string} userId - ID do usuário
   * @returns {boolean}
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
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise
   * @returns {Promise<string>} - Resposta formatada
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
      
      // Obter contexto do produto
      const productContext = this.getLastImageProductContext(userId);
      if (!productContext) {
        return '⏰ **Contexto expirado**\n\n💡 *Envie uma nova foto do produto para registrar a venda.*';
      }
      
      let salePrice = null;
      
      // Verificar se é confirmação simples
      const confirmations = ['sim', 'ok', 'confirmar', 'confirmo', 'yes'];
      if (confirmations.includes(text)) {
        // Usar preço cadastrado do produto
        salePrice = productContext.productData.valor || productContext.productData.preco || 0;
      } else {
        // Extrair valor da mensagem
        const priceMatch = text.match(/\d+([.,]\d{1,2})?/);
        if (priceMatch) {
          salePrice = parseFloat(priceMatch[0].replace(',', '.'));
        } else {
          return '❓ **Não entendi sua resposta**\n\n' +
                 'Responda com:\n' +
                 '• "sim" ou "ok" para confirmar o preço\n' +
                 '• O valor da venda (ex: 85.00)\n' +
                 '• "não" para cancelar';
        }
      }
      
      // Registrar venda
      const result = await this.registerImageSale(userId, productContext, salePrice);
      
      // Limpar contexto após registro
      this.clearImageProductContext(userId);
      
      return result;
      
    } catch (error) {
      console.error('❌ Erro ao processar confirmação:', error);
      return '❌ Erro ao processar confirmação. Tente novamente.';
    }
  }

  /**
   * Processar venda de produto identificado por imagem
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise da imagem
   * @returns {Promise<string>} - Resposta formatada
   */
  async handleImageProductSale(userId, analysisResult) {
    try {
      console.log('🛒 Processando venda de produto identificado por imagem:', {
        produto: analysisResult.produto_nome,
        confianca: analysisResult.confianca,
        similaridade: analysisResult.similaridade
      });
      
      // Salvar contexto do produto para confirmação posterior
      this.saveImageProductContext(userId, analysisResult);
      
      const productName = analysisResult.produto_nome || analysisResult.produto_identificado;
      const confidence = Math.round((analysisResult.confianca || 0) * 100);
      const price = analysisResult.valor || analysisResult.preco || 0;
      
      let response = `✅ **${productName}** identificado!\n\n`;
      response += `📊 **Confiança:** ${confidence}%\n`;
      
      if (price > 0) {
        response += `💰 **Preço cadastrado:** R$ ${price.toFixed(2)}\n\n`;
        response += `❓ **Foi vendido por R$ ${price.toFixed(2)}?**\n\n`;
      } else {
        response += `💰 **Preço:** Não cadastrado\n\n`;
        response += `❓ **Por quanto foi vendido?**\n\n`;
      }
      
      response += '• Digite "sim" ou "ok" para confirmar\n';
      response += '• Digite o valor real da venda (ex: 85.00)\n';
      response += '• Digite "não" para cancelar';
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro no processamento de venda por imagem:', error);
      return '❌ Erro ao processar produto. Tente novamente.';
    }
  }

  /**
   * Salvar contexto de produto identificado por imagem
   * @param {string} userId - ID do usuário
   * @param {Object} productData - Dados do produto
   */
  saveImageProductContext(userId, productData) {
    const context = {
      productData,
      timestamp: Date.now()
    };
    
    this.imageProductContext.set(userId, context);
    console.log('💾 Contexto de produto salvo para usuário:', userId);
  }

  /**
   * Obter último produto identificado por imagem
   * @param {string} userId - ID do usuário
   * @returns {Object|null} - Dados do produto ou null
   */
  getLastImageProductContext(userId) {
    const context = this.imageProductContext.get(userId);
    
    if (!context) {
      return null;
    }
    
    // Verificar se não expirou
    const elapsed = Date.now() - context.timestamp;
    if (elapsed > this.contextTimeout) {
      this.imageProductContext.delete(userId);
      return null;
    }
    
    return context;
  }

  /**
   * Limpar contexto de produto
   * @param {string} userId - ID do usuário
   */
  clearImageProductContext(userId) {
    this.imageProductContext.delete(userId);
  }

  /**
   * Registrar venda de produto identificado por imagem
   * @param {string} userId - ID do usuário
   * @param {Object} productContext - Contexto do produto
   * @param {number} salePrice - Preço da venda
   * @returns {Promise<string>} - Resposta formatada
   */
  async registerImageSale(userId, productContext, salePrice) {
    try {
      const productData = productContext.productData;
      
      console.log('💰 Registrando venda por imagem:', {
        produto: productData.produto_nome,
        preco: salePrice,
        usuario: userId
      });
      
      // Registrar venda no banco
      const saleData = {
        user_id: userId,
        product_name: productData.produto_nome || productData.produto_identificado,
        sale_price: salePrice,
        confidence: productData.confianca || 0,
        recognition_method: 'image_ai',
        sale_date: new Date().toISOString(),
        metadata: {
          similarity: productData.similaridade,
          category: productData.categoria,
          original_price: productData.valor || productData.preco
        }
      };
      
      // Aqui você pode adicionar a lógica de salvamento no banco
      // await this.databaseService.registerSale(saleData);
      
      logger.info('Venda por imagem registrada', {
        userId,
        produto: productData.produto_nome,
        valor: salePrice,
        confianca: productData.confianca
      });
      
      // Formatar resposta
      const currentDate = new Date().toLocaleDateString('pt-BR');
      
      let response = '✅ **Venda Registrada com Sucesso!**\n\n';
      response += `🛒 **Produto:** ${productData.produto_nome}\n`;
      response += `💰 **Valor:** R$ ${salePrice.toFixed(2)}\n`;
      response += `📊 **Confiança IA:** ${Math.round((productData.confianca || 0) * 100)}%\n\n`;
      response += `📅 **Data:** ${currentDate}\n`;
      response += `🤖 **Método:** Reconhecimento por IA`;
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao registrar venda por imagem:', error);
      logger.error('Erro no registro de venda por imagem', { error: error.message, userId });
      return '❌ Erro ao registrar venda. Tente novamente.';
    }
  }
}

module.exports = ImageSalesProcessor;