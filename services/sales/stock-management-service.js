const logger = require('../../utils/logger');

/**
 * Serviço especializado em gerenciamento de estoque
 * Responsável por consultas de estoque, relatórios e controle de produtos
 */
class StockManagementService {
  constructor(databaseService) {
    this.databaseService = databaseService;
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
        logger.info(`⚠️ Produto ${product.name || product.product_name} sem campo de estoque definido`);
        initialStock = 20; // Valor padrão para demonstração
      }
      
      const available = Math.max(0, initialStock - (salesData.totalSold || 0));
      const status = available === 0 ? '🔴 **ESGOTADO**' : 
                    available <= 2 ? '🟡 **ESTOQUE BAIXO**' : 
                    '🟢 **DISPONÍVEL**';
      
      return `📦 **Estoque: ${product.name || product.product_name}**\n\n` +
             `${status}\n\n` +
             `📊 **Detalhes:**\n` +
             `• **Disponível:** ${available} unidades\n` +
             `• **Vendidos:** ${salesData.totalSold || 0} unidades\n` +
             `• **Receita Total:** R$ ${(salesData.totalRevenue || 0).toFixed(2)}\n` +
             `• **Preço Unitário:** R$ ${(product.selling_price || product.price || 0).toFixed(2)}\n\n` +
             `💡 *${available <= 2 ? 'Considere repor o estoque!' : 'Estoque em bom nível.'}'*`;
             
    } catch (error) {
      logger.error('❌ Erro ao consultar estoque:', error);
      return '❌ Erro ao consultar estoque do produto.';
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
        
        // Fallback para demonstração
        if (initialStock === 0) {
          initialStock = 20;
        }
        
        const available = Math.max(0, initialStock - (salesData.totalSold || 0));
        const status = available === 0 ? '🔴' : available <= 2 ? '🟡' : '🟢';
        
        if (available === 0) outOfStockCount++;
        else if (available <= 2) lowStockCount++;
        
        response += `${status} **${productName}:** ${available} unidades\n`;
      }
      
      response += `\n📈 **Resumo:**\n`;
      response += `• **Total de produtos:** ${products.length}\n`;
      response += `• **Estoque baixo:** ${lowStockCount}\n`;
      response += `• **Esgotados:** ${outOfStockCount}\n`;
      
      // Se há mais produtos, informar
      if (products.length > 10) {
        response += `\n\n📋 *Mostrando 10 de ${products.length} produtos cadastrados.*`;
      }
      
      return response;
             
    } catch (error) {
      logger.error('❌ Erro ao obter resumo do estoque:', error);
      return '❌ Erro ao obter resumo do estoque.';
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
      const margin = productData.costPrice > 0 && productData.sellingPrice > 0 ? 
        ((productData.sellingPrice - productData.costPrice) / productData.sellingPrice * 100) : 0;
      
      let response = `📋 **Detalhes: ${productData.name}**\n\n`;
      
      // Informações básicas
      response += `💰 **Preços:**\n`;
      response += `• Venda: R$ ${productData.sellingPrice.toFixed(2)}\n`;
      if (productData.costPrice > 0) {
        response += `• Custo: R$ ${productData.costPrice.toFixed(2)}\n`;
        response += `• Margem: ${margin.toFixed(1)}%\n`;
      }
      
      // Estoque
      response += `\n📦 **Estoque:**\n`;
      response += `• Disponível: ${available} unidades\n`;
      response += `• Vendidos: ${salesData.totalSold || 0} unidades\n`;
      
      // Performance de vendas
      if (salesData.totalRevenue > 0) {
        response += `\n📊 **Performance:**\n`;
        response += `• Receita Total: R$ ${salesData.totalRevenue.toFixed(2)}\n`;
        response += `• Vendas Realizadas: ${salesData.salesCount}\n`;
        if (salesData.salesCount > 0) {
          response += `• Ticket Médio: R$ ${(salesData.totalRevenue / salesData.salesCount).toFixed(2)}\n`;
        }
      }
      
      // Informações adicionais
      if (productData.category !== 'Sem categoria') {
        response += `\n🏷️ **Categoria:** ${productData.category}\n`;
      }
      
      if (productData.brand) {
        response += `🏢 **Marca:** ${productData.brand}\n`;
      }
      
      if (productData.sku) {
        response += `🔢 **SKU:** ${productData.sku}\n`;
      }
      
      if (productData.description) {
        response += `\n📝 **Descrição:** ${productData.description}\n`;
      }
      
      return response;
      
    } catch (error) {
      logger.error('❌ Erro ao obter detalhes do produto:', error);
      return '❌ Erro ao obter detalhes do produto.';
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
      logger.error('❌ Erro ao obter dados de vendas do produto:', error);
      return { totalSold: 0, totalRevenue: 0, salesCount: 0 };
    }
  }

  /**
   * Verificar produtos com estoque baixo
   * @param {string} userId - ID do usuário
   * @param {number} threshold - Limite para considerar estoque baixo
   * @returns {Promise<Array>} - Lista de produtos com estoque baixo
   */
  async getLowStockProducts(userId, threshold = 2) {
    try {
      const products = await this.databaseService.getUserProducts(userId, 100);
      const lowStockProducts = [];
      
      for (const product of products) {
        const salesData = await this.getProductSalesData(userId, product.id);
        let initialStock = product.stock_quantity || product.quantity || product.available_quantity || 20;
        const available = Math.max(0, initialStock - (salesData.totalSold || 0));
        
        if (available <= threshold) {
          lowStockProducts.push({
            ...product,
            available,
            totalSold: salesData.totalSold || 0,
            status: available === 0 ? 'out_of_stock' : 'low_stock'
          });
        }
      }
      
      return lowStockProducts;
    } catch (error) {
      logger.error('❌ Erro ao verificar produtos com estoque baixo:', error);
      return [];
    }
  }

  /**
   * Atualizar estoque de produto
   * @param {string} userId - ID do usuário
   * @param {string} productId - ID do produto
   * @param {number} newQuantity - Nova quantidade
   * @returns {Promise<boolean>} - Sucesso da operação
   */
  async updateProductStock(userId, productId, newQuantity) {
    try {
      if (this.databaseService.connectionType === 'supabase') {
        const { error } = await this.databaseService.supabase
          .from('products')
          .update({ stock_quantity: newQuantity })
          .eq('id', productId)
          .eq('user_id', userId);
        
        if (error) {
          throw error;
        }
        
        logger.info(`✅ Estoque atualizado: produto ${productId} = ${newQuantity} unidades`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('❌ Erro ao atualizar estoque:', error);
      return false;
    }
  }
}

module.exports = StockManagementService;