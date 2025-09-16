const logger = require('../../utils/logger');

/**
 * Processador especializado para análises e consultas de vendas
 */
class SalesAnalyticsProcessor {
  constructor(databaseService) {
    this.databaseService = databaseService;
  }

  /**
   * Verificar se é consulta de vendas
   * @param {string} descricao - Descrição da mensagem
   * @param {string} intencao - Intenção identificada
   * @returns {boolean}
   */
  isSalesQuery(descricao, intencao) {
    const salesKeywords = [
      'vendas', 'venda', 'faturamento', 'receita', 'lucro',
      'relatório', 'relatorio', 'análise', 'analise',
      'performance', 'resultado', 'balanço', 'balanco'
    ];
    
    const text = descricao.toLowerCase();
    return salesKeywords.some(keyword => text.includes(keyword)) ||
           intencao === 'consultar_vendas' ||
           intencao === 'relatorio_vendas';
  }

  /**
   * Verificar se é consulta de estoque
   * @param {string} descricao - Descrição da mensagem
   * @param {string} intencao - Intenção identificada
   * @returns {boolean}
   */
  isStockQuery(descricao, intencao) {
    const stockKeywords = [
      'estoque', 'stock', 'quantidade', 'qtd',
      'disponível', 'disponivel', 'tem',
      'sobrou', 'restou', 'inventário', 'inventario'
    ];
    
    const text = descricao.toLowerCase();
    return stockKeywords.some(keyword => text.includes(keyword)) ||
           intencao === 'consultar_estoque' ||
           intencao === 'verificar_estoque';
  }

  /**
   * Processar consulta de vendas
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise
   * @returns {Promise<string>} - Resposta formatada
   */
  async handleSalesQuery(userId, analysisResult) {
    try {
      console.log('📊 Processando consulta de vendas para usuário:', userId);
      
      const salesData = await this.getSalesAnalytics(userId);
      
      if (!salesData || salesData.totalSales === 0) {
        return '📊 **Relatório de Vendas**\n\n' +
               '📈 Ainda não há vendas registradas.\n\n' +
               '💡 *Comece registrando suas vendas para ver análises detalhadas!*';
      }
      
      return this.formatSalesReport(salesData);
      
    } catch (error) {
      console.error('❌ Erro ao processar consulta de vendas:', error);
      return '❌ Erro ao gerar relatório de vendas. Tente novamente.';
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
      console.log('📦 Processando consulta de estoque para usuário:', userId);
      
      const productName = this.extractProductName(analysisResult.descricao);
      
      if (productName) {
        // Consulta específica de produto
        const stockData = await this.getProductStock(userId, productName);
        return this.formatProductStockResponse(productName, stockData);
      } else {
        // Consulta geral de estoque
        const generalStock = await this.getGeneralStockSummary(userId);
        return this.formatGeneralStockResponse(generalStock);
      }
      
    } catch (error) {
      console.error('❌ Erro ao processar consulta de estoque:', error);
      return '❌ Erro ao consultar estoque. Tente novamente.';
    }
  }

  /**
   * Obter análises de vendas
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object>} - Dados de análise
   */
  async getSalesAnalytics(userId) {
    try {
      // Aqui você implementaria a consulta real ao banco
      // Por enquanto, retornando dados mock
      return {
        totalSales: 0,
        totalRevenue: 0,
        averageTicket: 0,
        topProducts: [],
        monthlyGrowth: 0,
        period: 'últimos 30 dias'
      };
      
    } catch (error) {
      console.error('❌ Erro ao obter análises de vendas:', error);
      throw error;
    }
  }

  /**
   * Obter estoque de produto específico
   * @param {string} userId - ID do usuário
   * @param {string} productName - Nome do produto
   * @returns {Promise<Object>} - Dados do estoque
   */
  async getProductStock(userId, productName) {
    try {
      // Implementar consulta real ao banco
      return {
        productName,
        currentStock: 0,
        reservedStock: 0,
        availableStock: 0,
        lastUpdate: new Date()
      };
      
    } catch (error) {
      console.error('❌ Erro ao obter estoque do produto:', error);
      throw error;
    }
  }

  /**
   * Obter resumo geral do estoque
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object>} - Resumo do estoque
   */
  async getGeneralStockSummary(userId) {
    try {
      // Implementar consulta real ao banco
      return {
        totalProducts: 0,
        totalStock: 0,
        lowStockProducts: [],
        outOfStockProducts: [],
        lastUpdate: new Date()
      };
      
    } catch (error) {
      console.error('❌ Erro ao obter resumo do estoque:', error);
      throw error;
    }
  }

  /**
   * Formatar relatório de vendas
   * @param {Object} salesData - Dados de vendas
   * @returns {string} - Relatório formatado
   */
  formatSalesReport(salesData) {
    let report = '📊 **Relatório de Vendas**\n\n';
    
    report += `📈 **Vendas Totais:** ${salesData.totalSales}\n`;
    report += `💰 **Faturamento:** R$ ${salesData.totalRevenue.toFixed(2)}\n`;
    report += `🎯 **Ticket Médio:** R$ ${salesData.averageTicket.toFixed(2)}\n`;
    report += `📅 **Período:** ${salesData.period}\n\n`;
    
    if (salesData.topProducts && salesData.topProducts.length > 0) {
      report += '🏆 **Top Produtos:**\n';
      salesData.topProducts.slice(0, 5).forEach((product, index) => {
        report += `${index + 1}. ${product.name}: ${product.sales} vendas\n`;
      });
      report += '\n';
    }
    
    if (salesData.monthlyGrowth !== undefined) {
      const growthIcon = salesData.monthlyGrowth >= 0 ? '📈' : '📉';
      report += `${growthIcon} **Crescimento:** ${salesData.monthlyGrowth.toFixed(1)}%`;
    }
    
    return report;
  }

  /**
   * Formatar resposta de estoque de produto
   * @param {string} productName - Nome do produto
   * @param {Object} stockData - Dados do estoque
   * @returns {string} - Resposta formatada
   */
  formatProductStockResponse(productName, stockData) {
    let response = `📦 **Estoque: ${productName}**\n\n`;
    
    response += `📊 **Quantidade Total:** ${stockData.currentStock}\n`;
    response += `🔒 **Reservado:** ${stockData.reservedStock}\n`;
    response += `✅ **Disponível:** ${stockData.availableStock}\n\n`;
    
    if (stockData.availableStock === 0) {
      response += '⚠️ **Status:** Produto em falta\n';
      response += '💡 *Considere reabastecer o estoque*';
    } else if (stockData.availableStock < 5) {
      response += '🟡 **Status:** Estoque baixo\n';
      response += '💡 *Recomendado reabastecer em breve*';
    } else {
      response += '🟢 **Status:** Estoque adequado';
    }
    
    return response;
  }

  /**
   * Formatar resposta de estoque geral
   * @param {Object} stockData - Dados gerais do estoque
   * @returns {string} - Resposta formatada
   */
  formatGeneralStockResponse(stockData) {
    let response = '📦 **Resumo do Estoque**\n\n';
    
    response += `📊 **Total de Produtos:** ${stockData.totalProducts}\n`;
    response += `📦 **Itens em Estoque:** ${stockData.totalStock}\n\n`;
    
    if (stockData.outOfStockProducts && stockData.outOfStockProducts.length > 0) {
      response += '🔴 **Produtos em Falta:**\n';
      stockData.outOfStockProducts.slice(0, 5).forEach(product => {
        response += `• ${product}\n`;
      });
      response += '\n';
    }
    
    if (stockData.lowStockProducts && stockData.lowStockProducts.length > 0) {
      response += '🟡 **Estoque Baixo:**\n';
      stockData.lowStockProducts.slice(0, 5).forEach(product => {
        response += `• ${product.name} (${product.stock} unidades)\n`;
      });
      response += '\n';
    }
    
    if (stockData.outOfStockProducts.length === 0 && stockData.lowStockProducts.length === 0) {
      response += '✅ **Status:** Todos os produtos com estoque adequado';
    }
    
    return response;
  }

  /**
   * Extrair nome do produto da descrição
   * @param {string} descricao - Descrição da mensagem
   * @returns {string|null} - Nome do produto ou null
   */
  extractProductName(descricao) {
    // Implementar lógica de extração de nome de produto
    // Por enquanto, retorna null para consulta geral
    const text = descricao.toLowerCase();
    
    // Padrões simples para detectar produto específico
    const patterns = [
      /estoque\s+(?:do|da|de)\s+(.+)/,
      /quanto\s+(?:tem|tenho)\s+(?:do|da|de)?\s*(.+)/,
      /(.+)\s+(?:tem|tenho|sobrou|restou)/
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return null;
  }
}

module.exports = SalesAnalyticsProcessor;