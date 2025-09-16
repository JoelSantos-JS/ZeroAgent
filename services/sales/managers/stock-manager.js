const logger = require('../../../utils/logger');

/**
 * Gerenciador de estoque e consultas de produtos
 * Extraído do sales-handler.js para modularização
 */
class StockManager {
  constructor(databaseService) {
    this.databaseService = databaseService;
    
    // Métricas de estoque
    this.metrics = {
      totalQueries: 0,
      lowStockAlerts: 0,
      outOfStockAlerts: 0
    };
  }

  /**
   * Processar consulta de estoque
   * Extraído de: sales-handler.js linhas 959-986
   */
  async handleStockQuery(userId, analysisResult) {
    try {
      const { descricao, produto_nome } = analysisResult;
      this.metrics.totalQueries++;
      
      // Extrair nome do produto
      const productName = produto_nome || this.extractProductNameFromQuery(descricao);
      
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
   * Obter estoque de produto específico
   * Extraído de: sales-handler.js linhas 1354-1461
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
      
      // Alertas de estoque
      if (available === 0) {
        response += `⚠️ **ATENÇÃO:** Produto em falta!\n`;
        response += `💡 *Considere repor o estoque.*`;
        this.metrics.outOfStockAlerts++;
      } else if (available <= 2) {
        response += `🟡 **ALERTA:** Estoque baixo!\n`;
        response += `💡 *Recomendo repor em breve.*`;
        this.metrics.lowStockAlerts++;
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
   * Extraído de: sales-handler.js linhas 1461-1502
   */
  async getProductSalesData(userId, productId) {
    try {
      // Tentar buscar da tabela sales (se existir)
      if (this.databaseService.connectionType === 'supabase' && this.databaseService.supabase) {
        try {
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
        } catch (supabaseError) {
          console.warn('⚠️ Erro no Supabase, usando fallback:', supabaseError.message);
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
   * Extraído de: sales-handler.js linhas 1502-1594
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
      
      // Atualizar métricas
      this.metrics.lowStockAlerts += lowStockCount;
      this.metrics.outOfStockAlerts += outOfStockCount;
      
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
   * Extrair nome do produto de consulta de estoque
   */
  extractProductNameFromQuery(descricao) {
    if (!descricao) return null;
    
    const text = descricao.toLowerCase();
    
    // Padrões para detectar produto específico
    const patterns = [
      /estoque\s+(?:do|da|de)\s+(.+)/,
      /quanto\s+(?:tem|tenho)\s+(?:do|da|de)?\s*(.+)/,
      /(.+)\s+(?:tem|tenho|sobrou|restou)/,
      /quantos\s+(.+)\s+(?:tem|tenho)/
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        let productName = match[1].trim();
        
        // Limpar palavras desnecessárias
        productName = productName.replace(/\b(em\s+estoque|disponível|disponivel)\b/gi, '');
        productName = productName.replace(/\s+/g, ' ').trim();
        
        if (productName.length > 2) {
          return productName;
        }
      }
    }
    
    return null;
  }

  /**
   * Verificar alertas de estoque baixo
   */
  async checkLowStockAlerts(userId) {
    try {
      const products = await this.databaseService.getUserProducts(userId, 100);
      const alerts = [];
      
      for (const product of products) {
        const salesData = await this.getProductSalesData(userId, product.id);
        const initialStock = product.stock_quantity || product.quantity || product.available_quantity || 1;
        const available = Math.max(0, initialStock - (salesData.totalSold || 0));
        
        if (available === 0) {
          alerts.push({
            product: product.name || product.product_name,
            status: 'out_of_stock',
            available: 0
          });
        } else if (available <= 2) {
          alerts.push({
            product: product.name || product.product_name,
            status: 'low_stock',
            available
          });
        }
      }
      
      return alerts;
      
    } catch (error) {
      console.error('❌ Erro ao verificar alertas de estoque:', error);
      return [];
    }
  }

  /**
   * Obter estatísticas de estoque
   */
  async getStockStatistics(userId) {
    try {
      const products = await this.databaseService.getUserProducts(userId, 100);
      
      let totalProducts = products.length;
      let totalStock = 0;
      let totalValue = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;
      
      for (const product of products) {
        const salesData = await this.getProductSalesData(userId, product.id);
        const initialStock = product.stock_quantity || product.quantity || product.available_quantity || 1;
        const available = Math.max(0, initialStock - (salesData.totalSold || 0));
        const price = product.selling_price || product.price || 0;
        
        totalStock += available;
        totalValue += available * price;
        
        if (available === 0) {
          outOfStockCount++;
        } else if (available <= 2) {
          lowStockCount++;
        }
      }
      
      return {
        totalProducts,
        totalStock,
        totalValue,
        lowStockCount,
        outOfStockCount,
        averageStockPerProduct: totalProducts > 0 ? (totalStock / totalProducts).toFixed(1) : 0
      };
      
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas de estoque:', error);
      return null;
    }
  }

  /**
   * Obter métricas do gerenciador de estoque
   */
  getMetrics() {
    return {
      ...this.metrics
    };
  }

  /**
   * Obter status do gerenciador
   */
  getStatus() {
    return {
      isActive: true,
      metrics: this.getMetrics()
    };
  }
}

module.exports = StockManager;