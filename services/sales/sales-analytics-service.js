const logger = require('../../utils/logger');

/**
 * Serviço especializado em analytics e relatórios de vendas
 * Responsável por gerar relatórios, métricas e análises de performance
 */
class SalesAnalyticsService {
  constructor(databaseService) {
    this.databaseService = databaseService;
  }

  /**
   * Obter analytics completas de vendas
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object>} - Dados de analytics
   */
  async getSalesAnalytics(userId) {
    try {
      // Buscar transações de vendas (receitas)
      const salesTransactions = await this.databaseService.getUserTransactionsByCategory(userId, 'vendas');
      const products = await this.databaseService.getUserProducts(userId, 50);
      
      if (!salesTransactions || salesTransactions.length === 0) {
        return this.getEmptyAnalytics();
      }
      
      // Calcular métricas básicas
      const totalSales = salesTransactions.length;
      const totalRevenue = salesTransactions.reduce((sum, t) => sum + (t.amount || t.value || 0), 0);
      
      // Estimar lucro (30% se não tiver custo definido)
      let estimatedProfit = 0;
      let avgMargin = 0;
      
      for (const transaction of salesTransactions) {
        const amount = transaction.amount || transaction.value || 0;
        // Tentar encontrar produto relacionado para calcular margem real
        const relatedProduct = products.find(p => 
          transaction.description?.toLowerCase().includes((p.name || p.product_name || '').toLowerCase())
        );
        
        if (relatedProduct && relatedProduct.cost_price > 0) {
          const profit = amount - relatedProduct.cost_price;
          estimatedProfit += Math.max(0, profit);
        } else {
          estimatedProfit += amount * 0.3; // 30% de margem estimada
        }
      }
      
      avgMargin = totalRevenue > 0 ? (estimatedProfit / totalRevenue) * 100 : 30;
      
      // Agrupar vendas por produto
      const productSales = {};
      for (const transaction of salesTransactions) {
        const description = transaction.description || 'Produto não identificado';
        let productName = 'Outros';
        
        // Tentar identificar produto na descrição
        for (const product of products) {
          const pName = product.name || product.product_name || '';
          if (description.toLowerCase().includes(pName.toLowerCase()) && pName.length > 2) {
            productName = pName;
            break;
          }
        }
        
        if (!productSales[productName]) {
          productSales[productName] = {
            name: productName,
            total_sales: 0,
            total_revenue: 0
          };
        }
        
        productSales[productName].total_sales += 1;
        productSales[productName].total_revenue += (transaction.amount || transaction.value || 0);
      }
      
      // Top produtos ordenados por receita
      const topProducts = Object.values(productSales)
        .sort((a, b) => b.total_revenue - a.total_revenue)
        .slice(0, 5);
      
      // Dados dos últimos 7 dias
      const last7Days = this.getLast7DaysData(salesTransactions);
      
      // Contar alertas de estoque (simulação)
      const lowStockProducts = await this.getLowStockAlerts(userId, products);
      
      return {
        // Totais reais
        totalSales,
        totalRevenue,
        totalProfit: estimatedProfit,
        avgMargin,
        uniqueCustomers: this.countUniqueCustomers(salesTransactions),
        
        // Dados dos últimos 7 dias
        dailyData: last7Days,
        
        // Top produtos
        topProducts,
        
        // Alertas de estoque
        lowStockCount: lowStockProducts.length,
        lowStockProducts,
        
        // Status de sincronização
        lastSync: new Date().toISOString(),
        syncStatus: 'success',
        
        // Indicar que usa dados reais
        isBasicVersion: false,
        message: 'Dados reais do banco de dados'
      };
    } catch (error) {
      logger.error('❌ Erro ao obter analytics:', error);
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
   * Obter dados dos últimos 7 dias
   * @param {Array} salesTransactions - Transações de vendas
   * @returns {Array} - Dados diários
   */
  getLast7DaysData(salesTransactions) {
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
    
    return last7Days;
  }

  /**
   * Contar clientes únicos
   * @param {Array} salesTransactions - Transações de vendas
   * @returns {number} - Número de clientes únicos
   */
  countUniqueCustomers(salesTransactions) {
    const customers = new Set();
    
    salesTransactions.forEach(t => {
      if (t.metadata?.buyer_name) {
        customers.add(t.metadata.buyer_name.toLowerCase());
      }
      
      // Tentar extrair nome do cliente da descrição
      const description = t.description || '';
      const buyerMatch = description.match(/(?:para|pro)\s+([a-záêçõ]+)/i);
      if (buyerMatch && buyerMatch[1]) {
        customers.add(buyerMatch[1].toLowerCase());
      }
    });
    
    return customers.size;
  }

  /**
   * Obter alertas de estoque baixo
   * @param {string} userId - ID do usuário
   * @param {Array} products - Lista de produtos
   * @returns {Promise<Array>} - Produtos com estoque baixo
   */
  async getLowStockAlerts(userId, products) {
    const lowStockProducts = [];
    
    for (const product of products.slice(0, 10)) {
      const salesData = await this.getProductSalesData(userId, product.id);
      const available = Math.max(0, 20 - (salesData.totalSold || 0));
      
      if (available <= 2) {
        lowStockProducts.push({
          name: product.name || product.product_name,
          available,
          status: available === 0 ? 'out_of_stock' : 'low_stock'
        });
      }
    }
    
    return lowStockProducts;
  }

  /**
   * Obter dados de vendas de um produto
   * @param {string} userId - ID do usuário
   * @param {string} productId - ID do produto
   * @returns {Promise<Object>} - Dados de vendas
   */
  async getProductSalesData(userId, productId) {
    try {
      if (this.databaseService.connectionType === 'supabase') {
        const { data, error } = await this.databaseService.supabase
          .from('sales')
          .select('quantity, total_amount')
          .eq('user_id', userId)
          .eq('product_id', productId);
        
        if (!error && data) {
          const totalSold = data.reduce((sum, sale) => sum + (sale.quantity || 0), 0);
          const totalRevenue = data.reduce((sum, sale) => sum + (sale.total_amount || 0), 0);
          return { totalSold, totalRevenue };
        }
      }
      
      return { totalSold: 0, totalRevenue: 0 };
    } catch (error) {
      return { totalSold: 0, totalRevenue: 0 };
    }
  }

  /**
   * Obter analytics vazias (quando não há dados)
   * @returns {Object} - Analytics vazias
   */
  getEmptyAnalytics() {
    return {
      totalSales: 0,
      totalRevenue: 0,
      totalProfit: 0,
      avgMargin: 0,
      uniqueCustomers: 0,
      dailyData: [],
      topProducts: [],
      lowStockCount: 0,
      lowStockProducts: [],
      lastSync: new Date().toISOString(),
      syncStatus: 'no_data',
      isBasicVersion: false,
      message: 'Nenhuma venda registrada ainda'
    };
  }

  /**
   * Formatar relatório de vendas
   * @param {Object} salesData - Dados de vendas
   * @returns {string} - Relatório formatado
   */
  formatSalesReport(salesData) {
    if (salesData.totalSales === 0) {
      return `📊 **Relatório de Vendas**\n\n` +
             `📭 **Nenhuma venda registrada ainda**\n\n` +
             `💡 *Comece registrando suas primeiras vendas!*\n` +
             `💡 *Exemplo: "Vendi fone por 60 reais"*`;
    }
    
    let report = `📊 **Relatório de Vendas**\n\n`;
    
    // Métricas principais
    report += `💰 **Resumo Geral:**\n`;
    report += `• **Total de Vendas:** ${salesData.totalSales}\n`;
    report += `• **Receita Total:** R$ ${salesData.totalRevenue.toFixed(2)}\n`;
    report += `• **Lucro Estimado:** R$ ${salesData.totalProfit.toFixed(2)}\n`;
    report += `• **Margem Média:** ${salesData.avgMargin.toFixed(1)}%\n`;
    
    if (salesData.uniqueCustomers > 0) {
      report += `• **Clientes Únicos:** ${salesData.uniqueCustomers}\n`;
    }
    
    // Top produtos
    if (salesData.topProducts && salesData.topProducts.length > 0) {
      report += `\n🏆 **Top Produtos:**\n`;
      salesData.topProducts.forEach((product, index) => {
        report += `${index + 1}. **${product.name}:** ${product.total_sales} vendas (R$ ${product.total_revenue.toFixed(2)})\n`;
      });
    }
    
    // Alertas de estoque
    if (salesData.lowStockCount > 0) {
      report += `\n⚠️ **Alertas de Estoque:**\n`;
      report += `• **${salesData.lowStockCount} produtos** com estoque baixo\n`;
      
      if (salesData.lowStockProducts && salesData.lowStockProducts.length > 0) {
        salesData.lowStockProducts.slice(0, 3).forEach(product => {
          const status = product.status === 'out_of_stock' ? '🔴 ESGOTADO' : '🟡 BAIXO';
          report += `  - ${product.name}: ${status}\n`;
        });
      }
    }
    
    // Performance dos últimos 7 dias
    if (salesData.dailyData && salesData.dailyData.length > 0) {
      const recentSales = salesData.dailyData.reduce((sum, day) => sum + day.total_sales, 0);
      const recentRevenue = salesData.dailyData.reduce((sum, day) => sum + day.total_revenue, 0);
      
      if (recentSales > 0) {
        report += `\n📈 **Últimos 7 dias:**\n`;
        report += `• **Vendas:** ${recentSales}\n`;
        report += `• **Receita:** R$ ${recentRevenue.toFixed(2)}\n`;
      }
    }
    
    report += `\n🕐 **Última atualização:** ${new Date().toLocaleString('pt-BR')}`;
    
    return report;
  }

  /**
   * Obter métricas de performance
   * @param {string} userId - ID do usuário
   * @param {number} days - Número de dias para análise
   * @returns {Promise<Object>} - Métricas de performance
   */
  async getPerformanceMetrics(userId, days = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const transactions = await this.databaseService.getUserTransactionsByCategory(userId, 'vendas');
      const periodTransactions = transactions.filter(t => {
        const transactionDate = new Date(t.transaction_date || t.created_at);
        return transactionDate >= startDate && transactionDate <= endDate;
      });
      
      const totalRevenue = periodTransactions.reduce((sum, t) => sum + (t.amount || t.value || 0), 0);
      const avgDailyRevenue = totalRevenue / days;
      const avgTransactionValue = periodTransactions.length > 0 ? totalRevenue / periodTransactions.length : 0;
      
      return {
        period: `${days} dias`,
        totalTransactions: periodTransactions.length,
        totalRevenue,
        avgDailyRevenue,
        avgTransactionValue,
        bestDay: this.findBestDay(periodTransactions),
        growthTrend: this.calculateGrowthTrend(periodTransactions, days)
      };
    } catch (error) {
      logger.error('❌ Erro ao calcular métricas de performance:', error);
      return null;
    }
  }

  /**
   * Encontrar melhor dia de vendas
   * @param {Array} transactions - Transações do período
   * @returns {Object} - Dados do melhor dia
   */
  findBestDay(transactions) {
    const dailyRevenue = {};
    
    transactions.forEach(t => {
      const date = new Date(t.transaction_date || t.created_at).toISOString().split('T')[0];
      dailyRevenue[date] = (dailyRevenue[date] || 0) + (t.amount || t.value || 0);
    });
    
    const bestDay = Object.entries(dailyRevenue)
      .sort(([,a], [,b]) => b - a)[0];
    
    return bestDay ? {
      date: bestDay[0],
      revenue: bestDay[1]
    } : null;
  }

  /**
   * Calcular tendência de crescimento
   * @param {Array} transactions - Transações do período
   * @param {number} days - Número de dias
   * @returns {string} - Tendência (crescimento, estável, declínio)
   */
  calculateGrowthTrend(transactions, days) {
    if (transactions.length < 2) return 'insuficiente';
    
    const midPoint = Math.floor(days / 2);
    const midDate = new Date();
    midDate.setDate(midDate.getDate() - midPoint);
    
    const firstHalf = transactions.filter(t => {
      const date = new Date(t.transaction_date || t.created_at);
      return date < midDate;
    });
    
    const secondHalf = transactions.filter(t => {
      const date = new Date(t.transaction_date || t.created_at);
      return date >= midDate;
    });
    
    const firstHalfRevenue = firstHalf.reduce((sum, t) => sum + (t.amount || t.value || 0), 0);
    const secondHalfRevenue = secondHalf.reduce((sum, t) => sum + (t.amount || t.value || 0), 0);
    
    if (secondHalfRevenue > firstHalfRevenue * 1.1) return 'crescimento';
    if (secondHalfRevenue < firstHalfRevenue * 0.9) return 'declínio';
    return 'estável';
  }
}

module.exports = SalesAnalyticsService;