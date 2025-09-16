const logger = require('../../../utils/logger');

/**
 * Gerenciador do catálogo de produtos
 * Extraído do sales-handler.js para modularização
 */
class ProductCatalogManager {
  constructor(databaseService) {
    this.databaseService = databaseService;
    
    // Métricas do catálogo
    this.metrics = {
      totalProductsCreated: 0,
      totalQueries: 0,
      lastProductCreated: null
    };
  }

  /**
   * Verificar se é comando de criação de produto
   * Extraído de: sales-handler.js linhas 366-369
   */
  isCreateProductCommand(descricao) {
    const text = descricao?.toLowerCase() || '';
    return text.includes('criar') && (text.includes('produto') || text.match(/criar\s+\w+/));
  }

  /**
   * Verificar se é consulta detalhada de produto
   * Extraído de: sales-handler.js linhas 684-703
   */
  isProductQuery(descricao, intencao) {
    const productKeywords = [
      'preço', 'preco', 'valor', 'custa', 'custo', 'margem',
      'categoria', 'marca', 'fornecedor', 'sku', 'código', 'codigo',
      'descrição', 'descricao', 'detalhes', 'informações', 'informacoes',
      'dados do produto', 'ficha', 'especificações', 'especificacoes'
    ];
    
    const text = descricao?.toLowerCase() || '';
    return productKeywords.some(keyword => text.includes(keyword)) ||
           ['consultar_produto', 'info_produto', 'detalhes_produto'].includes(intencao);
  }

  /**
   * Processar comando de criação de produto
   * Extraído de: sales-handler.js linhas 564-620
   */
  async handleCreateProductCommand(userId, descricao, analysisResult) {
    try {
      // Extrair nome do produto do comando "criar produto X" ou "criar X"
      const productName = this.extractProductNameFromCreateCommand(descricao);
      
      if (!productName) {
        return `❌ **Nome do produto não identificado**\n\n` +
               `💡 *Exemplo: "criar produto fone bluetooth"*\n` +
               `💡 *Ou: "criar kz edx pro"*`;
      }
      
      // Verificar se produto já existe
      const products = await this.databaseService.getUserProducts(userId, 100);
      const existingProduct = products.find(p => {
        const pName = (p.name || p.product_name || '').toLowerCase();
        return pName === productName.toLowerCase();
      });
      
      if (existingProduct) {
        return `⚠️ **Produto "${productName}" já existe!**\n\n` +
               `📦 *Nome completo: ${existingProduct.name || existingProduct.product_name}*\n\n` +
               `💡 *Use o nome exato para registrar vendas.*`;
      }
      
      // Criar produto básico
      const newProduct = {
        name: productName,
        product_name: productName,
        category: 'outros',
        price: 0,
        selling_price: 0,
        cost_price: 0,
        description: `Produto criado automaticamente: ${productName}`,
        purchase_date: new Date().toISOString()
      };
      
      const createdProduct = await this.databaseService.createProduct(userId, newProduct);
      
      // Atualizar métricas
      this.metrics.totalProductsCreated++;
      this.metrics.lastProductCreated = new Date();
      
      logger.info('Produto criado via comando', {
        userId,
        productName,
        productId: createdProduct.id
      });
      
      return `✅ **Produto "${productName}" criado com sucesso!**\n\n` +
             `📦 **Próximos passos:**\n` +
             `• Defina o preço de venda\n` +
             `• Adicione categoria específica\n` +
             `• Configure custo de compra\n\n` +
             `💡 *Agora você pode registrar vendas deste produto!*`;
             
    } catch (error) {
      console.error('❌ Erro ao criar produto:', error);
      return '❌ Erro ao criar produto. Tente novamente.';
    }
  }

  /**
   * Processar consulta detalhada de produto
   * Extraído de: sales-handler.js linhas 986-1028
   */
  async handleProductQuery(userId, analysisResult) {
    try {
      const { descricao, produto_nome } = analysisResult;
      this.metrics.totalQueries++;
      
      // Extrair nome do produto
      const productName = produto_nome || this.extractProductNameFromQuery(descricao);
      
      if (!productName) {
        return `❌ **Produto não especificado**\n\n` +
               `💡 *Exemplo: "Qual o preço do fone?"*\n` +
               `💡 *Ou: "Detalhes do mouse gamer"*`;
      }
      
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
      
      return await this.getProductDetails(userId, product);
      
    } catch (error) {
      console.error('❌ Erro ao consultar produto:', error);
      return '❌ Erro ao consultar informações do produto. Tente novamente.';
    }
  }

  /**
   * Obter detalhes completos de um produto
   * Extraído de: sales-handler.js linhas 1028-1127
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
      const margin = productData.sellingPrice > 0 && productData.costPrice > 0 
        ? ((productData.sellingPrice - productData.costPrice) / productData.sellingPrice * 100)
        : 0;
      
      // Calcular lucro por unidade
      const profitPerUnit = productData.sellingPrice - productData.costPrice;
      
      let response = `🛍️ **${productData.name}**\n\n`;
      
      // Seção de Preços e Margem
      response += `💰 **Financeiro:**\n`;
      response += `• Preço de Venda: R$ ${productData.sellingPrice.toFixed(2)}\n`;
      if (productData.costPrice > 0) {
        response += `• Preço de Custo: R$ ${productData.costPrice.toFixed(2)}\n`;
        response += `• Lucro por Unidade: R$ ${profitPerUnit.toFixed(2)}\n`;
        response += `• Margem de Lucro: ${margin.toFixed(1)}%\n`;
      }
      response += `\n`;
      
      // Seção de Estoque e Vendas
      response += `📦 **Estoque e Vendas:**\n`;
      response += `• Disponível: ${available} unidades\n`;
      response += `• Total Vendido: ${salesData.totalSold || 0} unidades\n`;
      if (salesData.totalRevenue > 0) {
        response += `• Receita Total: R$ ${salesData.totalRevenue.toFixed(2)}\n`;
      }
      response += `\n`;
      
      // Seção de Informações do Produto
      response += `ℹ️ **Informações:**\n`;
      if (productData.category !== 'Sem categoria') {
        response += `• Categoria: ${productData.category}\n`;
      }
      if (productData.sku) {
        response += `• SKU/Código: ${productData.sku}\n`;
      }
      if (productData.brand) {
        response += `• Marca: ${productData.brand}\n`;
      }
      if (productData.supplier) {
        response += `• Fornecedor: ${productData.supplier}\n`;
      }
      if (productData.purchaseDate) {
        const date = new Date(productData.purchaseDate).toLocaleDateString('pt-BR');
        response += `• Cadastrado em: ${date}\n`;
      }
      
      if (productData.description) {
        response += `\n📝 **Descrição:**\n${productData.description}\n`;
      }
      
      // Status do produto
      response += `\n📊 **Status:**\n`;
      if (available === 0) {
        response += `🔴 **PRODUTO EM FALTA** - Considere repor\n`;
      } else if (available <= 2) {
        response += `🟡 **ESTOQUE BAIXO** - Recomendo repor em breve\n`;
      } else {
        response += `🟢 **ESTOQUE ADEQUADO**\n`;
      }
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao obter detalhes do produto:', error);
      return '❌ Erro ao carregar detalhes do produto.';
    }
  }

  /**
   * Extrair nome do produto de comando de criação
   */
  extractProductNameFromCreateCommand(descricao) {
    const text = descricao.toLowerCase().trim();
    
    // Padrões: "criar produto X", "criar X"
    const patterns = [
      /criar\s+produto\s+(.+)/,
      /criar\s+(.+)/
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const productName = match[1].trim();
        if (productName.length > 1) {
          return productName;
        }
      }
    }
    
    return null;
  }

  /**
   * Extrair nome do produto de consulta
   */
  extractProductNameFromQuery(descricao) {
    if (!descricao) return null;
    
    const text = descricao.toLowerCase();
    
    // Padrões para detectar produto em consultas
    const patterns = [
      /(?:preço|preco|valor)\s+(?:do|da|de)\s+(.+)/,
      /(?:quanto|qual)\s+(?:custa|vale)\s+(?:o|a)?\s*(.+)/,
      /(?:detalhes|informações|informacoes)\s+(?:do|da|de)\s+(.+)/,
      /(.+)\s+(?:preço|preco|valor|custa)/
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        let productName = match[1].trim();
        
        // Limpar palavras desnecessárias
        productName = productName.replace(/\b(do|da|de|o|a|um|uma)\b/gi, ' ');
        productName = productName.replace(/\s+/g, ' ').trim();
        
        if (productName.length > 2) {
          return productName;
        }
      }
    }
    
    return null;
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
   * Listar produtos por categoria
   */
  async listProductsByCategory(userId, category) {
    try {
      const products = await this.databaseService.getUserProducts(userId, 100);
      
      const filteredProducts = products.filter(p => 
        (p.category || p.product_category || '').toLowerCase().includes(category.toLowerCase())
      );
      
      if (filteredProducts.length === 0) {
        return `❌ **Nenhum produto encontrado na categoria "${category}"**\n\n` +
               `💡 *Categorias disponíveis:*\n` +
               [...new Set(products.map(p => p.category || p.product_category || 'Sem categoria'))]
                 .slice(0, 5).map(cat => `• ${cat}`).join('\n');
      }
      
      let response = `📦 **Produtos - Categoria: ${category}**\n\n`;
      
      filteredProducts.slice(0, 10).forEach((product, index) => {
        const name = product.name || product.product_name;
        const price = product.selling_price || product.price || 0;
        response += `${index + 1}. **${name}** - R$ ${price.toFixed(2)}\n`;
      });
      
      if (filteredProducts.length > 10) {
        response += `\n📋 *Mostrando 10 de ${filteredProducts.length} produtos.*`;
      }
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao listar produtos por categoria:', error);
      return '❌ Erro ao listar produtos. Tente novamente.';
    }
  }

  /**
   * Atualizar produto
   */
  async updateProduct(userId, productId, updates) {
    try {
      const updatedProduct = await this.databaseService.updateProduct(userId, productId, updates);
      
      logger.info('Produto atualizado', {
        userId,
        productId,
        updates: Object.keys(updates)
      });
      
      return updatedProduct;
      
    } catch (error) {
      console.error('❌ Erro ao atualizar produto:', error);
      throw error;
    }
  }

  /**
   * Obter métricas do catálogo
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

module.exports = ProductCatalogManager;