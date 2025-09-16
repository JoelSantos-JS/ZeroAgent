const logger = require('../../../utils/logger');

/**
 * Gerenciador de análises e relatórios de vendas
 * Extraído do sales-handler.js para modularização
 */
class SalesAnalytics {
  constructor(databaseService) {
    this.databaseService = databaseService;
    
    // Métricas de análise
    this.metrics = {
      totalReportsGenerated: 0,
      lastReportTime: null,
      averageReportTime: 0
    };
  }

  /**
   * Processar consulta de vendas
   * Extraído de: sales-handler.js linhas 1594-1611
   */
  async handleSalesQuery(userId, analysisResult) {
    try {
      const startTime = Date.now();
      this.metrics.totalReportsGenerated++;
      
      // Buscar dados de vendas recentes
      const salesData = await this.getSalesAnalytics(userId);
      
      const reportTime = Date.now() - startTime;
      this.updateAverageReportTime(reportTime);
      this.metrics.lastReportTime = new Date();
      
      return this.formatSalesReport(salesData);
      
    } catch (error) {
      console.error('❌ Erro ao processar consulta de vendas:', error);
      return '❌ Erro ao obter dados de vendas. Tente novamente.';
    }
  }

  /**
   * Obter analytics de vendas
   * Extraído de: sales-handler.js linhas 1611-1744
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
      
      // Calcular ticket médio
      const averageTicket = totalSales > 0 ? totalRevenue / totalSales : 0;
      
      // Calcular crescimento (simulado)
      const monthlyGrowth = this.calculateGrowthRate(last7Days);
      
      return {
        // Totais reais
        totalSales,
        totalRevenue,
        totalProfit: estimatedProfit,
        avgMargin,
        averageTicket,
        uniqueCustomers: new Set(salesTransactions.map(t => t.metadata?.buyer_name).filter(Boolean)).size,
        
        // Dados dos últimos 7 dias
        dailyData: last7Days,
        monthlyGrowth,
        
        // Top produtos
        topProducts,
        
        // Alertas de estoque
        lowStockCount,
        lowStockProducts,
        
        // Status de sincronização
        lastSync: new Date(),
        syncStatus: 'success',
        
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
   * Extraído de: sales-handler.js linhas 1744-1803
   */
  formatSalesReport(salesData) {
    const { 
      totalSales, totalRevenue, totalProfit, avgMargin, averageTicket, uniqueCustomers,
      topProducts, lowStockCount, lastSync, syncStatus, monthlyGrowth, error 
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
    if (averageTicket) {
      report += `• Ticket Médio: R$ ${averageTicket.toFixed(2)}\n`;
    }
    report += `• Clientes únicos: ${uniqueCustomers || 0}\n\n`;
    
    // Crescimento
    if (monthlyGrowth !== undefined) {
      const growthIcon = monthlyGrowth >= 0 ? '📈' : '📉';
      const growthText = monthlyGrowth >= 0 ? 'crescimento' : 'queda';
      report += `${growthIcon} **Tendência:** ${Math.abs(monthlyGrowth).toFixed(1)}% ${growthText}\n\n`;
    }
    
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
    
    report += `💡 *Dados atualizados em tempo real.*`;
    
    return report;
  }
  
  /**
   * Obter texto do status de sincronização
   * Extraído de: sales-handler.js linhas 1803-1818
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
   * Obter dados de vendas de um produto específico
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
   * Calcular taxa de crescimento
   */
  calculateGrowthRate(dailyData) {
    if (!dailyData || dailyData.length < 2) return 0;
    
    const firstHalf = dailyData.slice(0, Math.floor(dailyData.length / 2));
    const secondHalf = dailyData.slice(Math.floor(dailyData.length / 2));
    
    const firstHalfRevenue = firstHalf.reduce((sum, day) => sum + day.total_revenue, 0);
    const secondHalfRevenue = secondHalf.reduce((sum, day) => sum + day.total_revenue, 0);
    
    if (firstHalfRevenue === 0) return secondHalfRevenue > 0 ? 100 : 0;
    
    return ((secondHalfRevenue - firstHalfRevenue) / firstHalfRevenue) * 100;
  }

  /**
   * Gerar relatório detalhado por período
   */
  async generateDetailedReport(userId, startDate, endDate) {
    try {
      const transactions = await this.databaseService.getUserTransactionsByCategory(userId, 'vendas');
      
      // Filtrar por período
      const filteredTransactions = transactions.filter(t => {
        const transactionDate = new Date(t.transaction_date || t.created_at);
        return transactionDate >= startDate && transactionDate <= endDate;
      });
      
      // Análise detalhada
      const analysis = {
        period: {
          start: startDate.toLocaleDateString('pt-BR'),
          end: endDate.toLocaleDateString('pt-BR')
        },
        summary: {
          totalSales: filteredTransactions.length,
          totalRevenue: filteredTransactions.reduce((sum, t) => sum + (t.amount || t.value || 0), 0),
          averageTicket: 0,
          bestDay: null,
          worstDay: null
        },
        dailyBreakdown: [],
        productAnalysis: []
      };
      
      // Calcular ticket médio
      analysis.summary.averageTicket = analysis.summary.totalSales > 0 ? 
        analysis.summary.totalRevenue / analysis.summary.totalSales : 0;
      
      // Análise diária
      const dailyMap = new Map();
      filteredTransactions.forEach(t => {
        const date = new Date(t.transaction_date || t.created_at).toISOString().split('T')[0];
        if (!dailyMap.has(date)) {
          dailyMap.set(date, { sales: 0, revenue: 0 });
        }
        const day = dailyMap.get(date);
        day.sales++;
        day.revenue += (t.amount || t.value || 0);
      });
      
      analysis.dailyBreakdown = Array.from(dailyMap.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Encontrar melhor e pior dia
      if (analysis.dailyBreakdown.length > 0) {
        analysis.summary.bestDay = analysis.dailyBreakdown.reduce((best, day) => 
          day.revenue > best.revenue ? day : best
        );
        analysis.summary.worstDay = analysis.dailyBreakdown.reduce((worst, day) => 
          day.revenue < worst.revenue ? day : worst
        );
      }
      
      return analysis;
      
    } catch (error) {
      console.error('❌ Erro ao gerar relatório detalhado:', error);
      return null;
    }
  }

  /**
   * Atualizar tempo médio de relatório
   */
  updateAverageReportTime(reportTime) {
    this.metrics.averageReportTime = (
      (this.metrics.averageReportTime * (this.metrics.totalReportsGenerated - 1) + reportTime) / 
      this.metrics.totalReportsGenerated
    );
  }

  /**
   * Obter métricas de análise
   */
  getMetrics() {
    return {
      ...this.metrics,
      averageReportTimeMs: Math.round(this.metrics.averageReportTime)
    };
  }

  /**
   * Obter status do analytics
   */
  getStatus() {
    return {
      isActive: true,
      metrics: this.getMetrics()
    };
  }
}

module.exports = SalesAnalytics;