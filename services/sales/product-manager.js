const logger = require('../../utils/logger');

/**
 * Gerenciador especializado para produtos e catálogo
 */
class ProductManager {
  constructor(databaseService) {
    this.databaseService = databaseService;
  }

  /**
   * Verificar se é comando para criar produto
   * @param {string} descricao - Descrição da mensagem
   * @returns {boolean}
   */
  isCreateProductCommand(descricao) {
    const createKeywords = ['criar produto', 'novo produto', 'adicionar produto', 'cadastrar produto'];
    return createKeywords.some(keyword => descricao.toLowerCase().includes(keyword));
  }

  /**
   * Verificar se é consulta de produto
   * @param {string} descricao - Descrição da mensagem
   * @param {string} intencao - Intenção identificada
   * @returns {boolean}
   */
  isProductQuery(descricao, intencao) {
    const productKeywords = [
      'produto', 'item', 'mercadoria',
      'preço', 'preco', 'valor', 'custa',
      'detalhes', 'informações', 'informacoes',
      'descrição', 'descricao'
    ];
    
    const text = descricao.toLowerCase();
    return productKeywords.some(keyword => text.includes(keyword)) ||
           intencao === 'consultar_produto' ||
           intencao === 'buscar_produto';
  }

  /**
   * Verificar se é resposta de sugestão de produto
   * @param {string} descricao - Descrição da mensagem
   * @returns {boolean}
   */
  isProductSuggestionResponse(descricao) {
    const responses = ['1', '2', '3', '4', '5', 'primeiro', 'segundo', 'terceiro'];
    return responses.includes(descricao.toLowerCase().trim());
  }

  /**
   * Processar comando de criação de produto
   * @param {string} userId - ID do usuário
   * @param {string} descricao - Descrição da mensagem
   * @param {Object} analysisResult - Resultado da análise
   * @returns {Promise<string>} - Resposta formatada
   */
  async handleCreateProductCommand(userId, descricao, analysisResult) {
    try {
      console.log('🆕 Processando criação de produto para usuário:', userId);
      
      const productName = this.extractProductNameFromCreateCommand(descricao);
      
      if (!productName) {
        return '🆕 **Criar Novo Produto**\n\n' +
               '📝 Por favor, informe o nome do produto que deseja criar.\n\n' +
               '💡 *Exemplo: "Criar produto Fone Bluetooth JBL"*';
      }
      
      // Verificar se produto já existe
      const existingProduct = await this.findProductByName(userId, productName);
      if (existingProduct) {
        return `⚠️ **Produto já existe**\n\n` +
               `📦 **${productName}** já está cadastrado.\n\n` +
               `💡 *Use "editar produto ${productName}" para modificar.*`;
      }
      
      // Criar produto básico
      const newProduct = await this.createProduct(userId, {
        name: productName,
        price: analysisResult.valor || 0,
        category: analysisResult.categoria || 'outros',
        description: analysisResult.descricao || '',
        status: 'active'
      });
      
      return `✅ **Produto Criado!**\n\n` +
             `📦 **Nome:** ${newProduct.name}\n` +
             `💰 **Preço:** R$ ${newProduct.price.toFixed(2)}\n` +
             `📂 **Categoria:** ${newProduct.category}\n\n` +
             `💡 *Use "editar produto ${productName}" para adicionar mais detalhes.*`;
      
    } catch (error) {
      console.error('❌ Erro ao criar produto:', error);
      return '❌ Erro ao criar produto. Tente novamente.';
    }
  }

  /**
   * Processar consulta de produto
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise
   * @returns {Promise<string>} - Resposta formatada
   */
  async handleProductQuery(userId, analysisResult) {
    try {
      console.log('🔍 Processando consulta de produto para usuário:', userId);
      
      const productName = this.extractProductName(analysisResult.descricao);
      
      if (!productName) {
        return '🔍 **Buscar Produto**\n\n' +
               '📝 Por favor, informe o nome do produto que deseja consultar.\n\n' +
               '💡 *Exemplo: "Preço do Fone Bluetooth"*';
      }
      
      // Buscar produtos
      const products = await this.searchProducts(userId, productName);
      
      if (products.length === 0) {
        return `❌ **Produto não encontrado**\n\n` +
               `🔍 Não encontrei "${productName}" no seu catálogo.\n\n` +
               `💡 *Use "criar produto ${productName}" para cadastrar.*`;
      }
      
      if (products.length === 1) {
        return await this.getProductDetails(userId, products[0]);
      }
      
      // Múltiplos produtos encontrados
      return this.formatProductSuggestions(products, productName);
      
    } catch (error) {
      console.error('❌ Erro ao consultar produto:', error);
      return '❌ Erro ao consultar produto. Tente novamente.';
    }
  }

  /**
   * Processar resposta de sugestão de produto
   * @param {string} userId - ID do usuário
   * @param {string} descricao - Descrição da resposta
   * @returns {Promise<string>} - Resposta formatada
   */
  async handleProductSuggestionResponse(userId, descricao) {
    // Implementar lógica de seleção de produto sugerido
    return '💡 Funcionalidade de seleção de sugestões em desenvolvimento.';
  }

  /**
   * Buscar produtos por nome
   * @param {string} userId - ID do usuário
   * @param {string} searchName - Nome para busca
   * @returns {Promise<Array>} - Lista de produtos
   */
  async searchProducts(userId, searchName) {
    try {
      // Implementar busca real no banco
      // Por enquanto, retorna array vazio
      return [];
      
    } catch (error) {
      console.error('❌ Erro ao buscar produtos:', error);
      throw error;
    }
  }

  /**
   * Encontrar produto por nome exato
   * @param {string} userId - ID do usuário
   * @param {string} productName - Nome do produto
   * @returns {Promise<Object|null>} - Produto ou null
   */
  async findProductByName(userId, productName) {
    try {
      // Implementar busca real no banco
      return null;
      
    } catch (error) {
      console.error('❌ Erro ao buscar produto por nome:', error);
      throw error;
    }
  }

  /**
   * Criar novo produto
   * @param {string} userId - ID do usuário
   * @param {Object} productData - Dados do produto
   * @returns {Promise<Object>} - Produto criado
   */
  async createProduct(userId, productData) {
    try {
      // Implementar criação real no banco
      const newProduct = {
        id: Date.now().toString(),
        userId,
        ...productData,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      logger.info('Produto criado', { userId, productName: productData.name });
      
      return newProduct;
      
    } catch (error) {
      console.error('❌ Erro ao criar produto no banco:', error);
      throw error;
    }
  }

  /**
   * Obter detalhes completos do produto
   * @param {string} userId - ID do usuário
   * @param {Object} product - Produto
   * @returns {Promise<string>} - Detalhes formatados
   */
  async getProductDetails(userId, product) {
    try {
      let details = `📦 **${product.name}**\n\n`;
      
      details += `💰 **Preço:** R$ ${(product.price || 0).toFixed(2)}\n`;
      details += `📂 **Categoria:** ${product.category || 'Não definida'}\n`;
      
      if (product.description) {
        details += `📝 **Descrição:** ${product.description}\n`;
      }
      
      // Adicionar dados de estoque se disponível
      const stockData = await this.getProductStock(userId, product.name);
      if (stockData) {
        details += `📊 **Estoque:** ${stockData.currentStock} unidades\n`;
      }
      
      // Adicionar dados de vendas se disponível
      const salesData = await this.getProductSalesData(userId, product.id);
      if (salesData && salesData.totalSales > 0) {
        details += `📈 **Vendas:** ${salesData.totalSales} unidades\n`;
        details += `💰 **Faturamento:** R$ ${salesData.totalRevenue.toFixed(2)}`;
      }
      
      return details;
      
    } catch (error) {
      console.error('❌ Erro ao obter detalhes do produto:', error);
      return '❌ Erro ao carregar detalhes do produto.';
    }
  }

  /**
   * Formatar sugestões de produtos
   * @param {Array} products - Lista de produtos
   * @param {string} searchName - Nome buscado
   * @returns {string} - Sugestões formatadas
   */
  formatProductSuggestions(products, searchName) {
    let response = `🔍 **Encontrei ${products.length} produtos similares a "${searchName}":**\n\n`;
    
    products.slice(0, 5).forEach((product, index) => {
      response += `${index + 1}. **${product.name}** - R$ ${(product.price || 0).toFixed(2)}\n`;
    });
    
    response += '\n💡 *Digite o número do produto para ver detalhes.*';
    
    return response;
  }

  /**
   * Extrair nome do produto de comando de criação
   * @param {string} descricao - Descrição da mensagem
   * @returns {string|null} - Nome do produto ou null
   */
  extractProductNameFromCreateCommand(descricao) {
    const patterns = [
      /criar\s+produto\s+(.+)/i,
      /novo\s+produto\s+(.+)/i,
      /adicionar\s+produto\s+(.+)/i,
      /cadastrar\s+produto\s+(.+)/i
    ];
    
    for (const pattern of patterns) {
      const match = descricao.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return null;
  }

  /**
   * Extrair nome do produto da descrição
   * @param {string} descricao - Descrição da mensagem
   * @returns {string|null} - Nome do produto ou null
   */
  extractProductName(descricao) {
    // Implementar lógica mais sofisticada de extração
    const text = descricao.toLowerCase();
    
    // Padrões para detectar produto
    const patterns = [
      /(?:preço|preco|valor)\s+(?:do|da|de)\s+(.+)/,
      /(?:quanto|qual)\s+(?:custa|vale)\s+(?:o|a)?\s*(.+)/,
      /(?:detalhes|informações|informacoes)\s+(?:do|da|de)\s+(.+)/,
      /(.+)\s+(?:preço|preco|valor|custa)/
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return null;
  }

  /**
   * Obter dados de estoque do produto
   * @param {string} userId - ID do usuário
   * @param {string} productName - Nome do produto
   * @returns {Promise<Object|null>} - Dados do estoque
   */
  async getProductStock(userId, productName) {
    try {
      // Implementar consulta real
      return null;
    } catch (error) {
      console.error('❌ Erro ao obter estoque:', error);
      return null;
    }
  }

  /**
   * Obter dados de vendas do produto
   * @param {string} userId - ID do usuário
   * @param {string} productId - ID do produto
   * @returns {Promise<Object|null>} - Dados de vendas
   */
  async getProductSalesData(userId, productId) {
    try {
      // Implementar consulta real
      return null;
    } catch (error) {
      console.error('❌ Erro ao obter dados de vendas:', error);
      return null;
    }
  }
}

module.exports = ProductManager;