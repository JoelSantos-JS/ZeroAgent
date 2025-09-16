const logger = require('../../../utils/logger');

/**
 * Motor de busca inteligente para produtos
 * Extraído do sales-handler.js para modularização
 */
class ProductSearchEngine {
  constructor(databaseService) {
    this.databaseService = databaseService;
    
    // Métricas de busca
    this.metrics = {
      totalSearches: 0,
      successfulMatches: 0,
      averageConfidence: 0
    };
  }

  /**
   * Busca inteligente de produto em múltiplas etapas
   * Extraído de: sales-handler.js linhas 1127-1188
   */
  async findProductIntelligent(products, searchName) {
    const search = searchName.toLowerCase().trim();
    this.metrics.totalSearches++;
    
    // Etapa 1: Busca exata
    let product = products.find(p => {
      const pName = (p.name || p.product_name || '').toLowerCase();
      return pName === search;
    });
    
    if (product) {
      console.log(`✅ Produto encontrado (busca exata): ${product.name || product.product_name}`);
      this.metrics.successfulMatches++;
      return product;
    }
    
    // Etapa 2: Busca por início do nome
    product = products.find(p => {
      const pName = (p.name || p.product_name || '').toLowerCase();
      return pName.startsWith(search) || search.startsWith(pName);
    });
    
    if (product) {
      console.log(`✅ Produto encontrado (início): ${product.name || product.product_name}`);
      this.metrics.successfulMatches++;
      return product;
    }
    
    // Etapa 3: Busca por palavras-chave com score
    const candidates = products.map(p => {
      const pName = (p.name || p.product_name || '').toLowerCase();
      const score = this.calculateSimilarityScore(pName, search);
      return { product: p, score, name: pName };
    }).filter(c => c.score > 0.6).sort((a, b) => b.score - a.score);
    
    if (candidates.length > 0) {
      console.log(`✅ Produto encontrado (similaridade): ${candidates[0].product.name || candidates[0].product.product_name} (score: ${candidates[0].score})`);
      this.metrics.successfulMatches++;
      this.updateAverageConfidence(candidates[0].score);
      return candidates[0].product;
    }
    
    // Etapa 4: Busca por palavras individuais
    const searchWords = search.split(' ').filter(w => w.length > 2);
    if (searchWords.length > 0) {
      product = products.find(p => {
        const pName = (p.name || p.product_name || '').toLowerCase();
        return searchWords.some(word => pName.includes(word));
      });
      
      if (product) {
        console.log(`✅ Produto encontrado (palavra-chave): ${product.name || product.product_name}`);
        this.metrics.successfulMatches++;
        return product;
      }
    }
    
    console.log(`❌ Produto não encontrado: ${searchName}`);
    return null;
  }
  
  /**
   * Calcular score de similaridade entre duas strings
   * Extraído de: sales-handler.js linhas 1188-1220
   */
  calculateSimilarityScore(str1, str2) {
    const words1 = str1.split(' ').filter(w => w.length > 1);
    const words2 = str2.split(' ').filter(w => w.length > 1);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    let matches = 0;
    let totalWords = Math.max(words1.length, words2.length);
    
    // Contar matches exatos
    words1.forEach(w1 => {
      if (words2.some(w2 => w2 === w1)) {
        matches += 1;
      } else if (words2.some(w2 => w2.includes(w1) || w1.includes(w2))) {
        matches += 0.7; // Match parcial
      }
    });
    
    // Bonus para strings que se contêm
    if (str1.includes(str2) || str2.includes(str1)) {
      matches += 0.5;
    }
    
    return Math.min(1, matches / totalWords);
  }
  
  /**
   * Encontrar sugestões de produtos similares
   * Extraído de: sales-handler.js linhas 1220-1247
   */
  findProductSuggestions(products, searchName) {
    const search = searchName.toLowerCase().trim();
    
    const suggestions = products.map(p => {
      const pName = (p.name || p.product_name || '').toLowerCase();
      const score = this.calculateSimilarityScore(pName, search);
      
      return {
        product: p,
        name: p.name || p.product_name,
        score,
        confidence: Math.round(score * 100)
      };
    })
    .filter(s => s.score > 0.3) // Mínimo 30% de similaridade
    .sort((a, b) => b.score - a.score)
    .slice(0, 3); // Top 3 sugestões
    
    console.log(`💡 Encontradas ${suggestions.length} sugestões para "${searchName}"`);
    return suggestions;
  }

  /**
   * Extrair nome do produto da descrição
   * Extraído de: sales-handler.js linhas 1247-1311
   */
  extractProductName(descricao) {
    if (!descricao) return null;
    
    console.log(`🔍 Extraindo produto de: "${descricao}"`);
    
    // Padrões melhorados para extrair nome completo do produto
    const patterns = [
      // "Venda do fone Lenovo GM pro por 67" -> "fone Lenovo GM pro"
      /(?:venda|vendi|vendeu|comprou)\s+(?:do|da|de|o|a)?\s*([^0-9]+?)\s+(?:por|de|em|R\$)\s*[0-9]/i,
      // "Registrar venda Lenovo 58 reais" -> "Lenovo"
      /(?:registrar\s+venda|venda)\s+([^0-9]+?)\s+[0-9]/i,
      // "Estoque do mouse gamer" -> "mouse gamer"
      /(?:estoque|tem|quantos)\s+(?:do|da|de|o|a)?\s*([a-záêçõ\s]+?)\s*$/i,
      // "mouse gamer disponível" -> "mouse gamer"
      /([a-záêçõ\s]+?)\s+(?:disponível|em estoque)/i
    ];
    
    for (const pattern of patterns) {
      const match = descricao.match(pattern);
      if (match && match[1]) {
        let productName = match[1].trim();
        
        // Limpar palavras desnecessárias
        productName = productName.replace(/\b(do|da|de|o|a|um|uma|cliente|para|pra)\b/gi, ' ');
        productName = productName.replace(/\s+/g, ' ').trim();
        
        if (productName.length > 2) {
          console.log(`✅ Produto extraído: "${productName}"`);
          return productName;
        }
      }
    }
    
    // Fallback: buscar por produtos comuns
    const text = descricao.toLowerCase();
    const commonProducts = [
      'fone', 'fones', 'headphone', 'earphone',
      'projetor', 'projetores',
      'camera', 'câmera', 'cameras',
      'mouse', 'teclado', 'keyboard',
      'celular', 'smartphone', 'telefone',
      'tablet', 'ipad',
      'notebook', 'laptop',
      'carregador', 'cabo',
      'caixa de som', 'speaker',
      'smartwatch', 'relógio'
    ];
    
    for (const product of commonProducts) {
      if (text.includes(product)) {
        console.log(`⚠️ Produto genérico encontrado: "${product}"`);
        return product.charAt(0).toUpperCase() + product.slice(1);
      }
    }
    
    console.log(`❌ Nenhum produto encontrado em: "${descricao}"`);
    return null;
  }

  /**
   * Extrair nome do comprador da descrição
   * Extraído de: sales-handler.js linhas 1311-1354
   */
  extractBuyerName(descricao) {
    if (!descricao) return null;
    
    console.log(`👤 Extraindo comprador de: "${descricao}"`);
    
    // Padrões para extrair nome do comprador
    const patterns = [
      // "Venda para o cliente Miguel" -> "Miguel"
      /(?:para|pra)\s+(?:o|a)?\s*cliente\s+([a-záêçõ\s]+?)(?:\s|$)/i,
      // "Cliente João comprou" -> "João"
      /cliente\s+([a-záêçõ\s]+?)\s+(?:comprou|levou)/i,
      // "Vendeu para Maria" -> "Maria"
      /(?:vendeu|vendi)\s+para\s+([a-záêçõ\s]+?)(?:\s|$)/i,
      // "João comprou" -> "João"
      /([a-záêçõ]+)\s+(?:comprou|levou|pegou)/i
    ];
    
    for (const pattern of patterns) {
      const match = descricao.match(pattern);
      if (match && match[1]) {
        let buyerName = match[1].trim();
        
        // Limpar palavras desnecessárias
        buyerName = buyerName.replace(/\b(do|da|de|o|a|um|uma|por|reais?)\b/gi, ' ');
        buyerName = buyerName.replace(/\s+/g, ' ').trim();
        
        if (buyerName.length > 1) {
          console.log(`✅ Comprador extraído: "${buyerName}"`);
          return buyerName;
        }
      }
    }
    
    console.log(`⚠️ Nenhum comprador encontrado em: "${descricao}"`);
    return null;
  }

  /**
   * Extrair nome do produto de comando de criação
   * Extraído de: sales-handler.js linhas 620-648
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
          console.log(`✅ Nome de produto extraído do comando: "${productName}"`);
          return productName;
        }
      }
    }
    
    console.log(`❌ Nome de produto não encontrado no comando: "${descricao}"`);
    return null;
  }

  /**
   * Buscar produtos por critérios avançados
   */
  async searchProductsAdvanced(userId, criteria) {
    try {
      const products = await this.databaseService.getUserProducts(userId, 100);
      
      let results = products;
      
      // Filtrar por nome se especificado
      if (criteria.name) {
        const foundProduct = await this.findProductIntelligent(products, criteria.name);
        results = foundProduct ? [foundProduct] : [];
      }
      
      // Filtrar por categoria se especificado
      if (criteria.category) {
        results = results.filter(p => 
          (p.category || '').toLowerCase().includes(criteria.category.toLowerCase())
        );
      }
      
      // Filtrar por faixa de preço se especificado
      if (criteria.minPrice !== undefined) {
        results = results.filter(p => (p.selling_price || p.price || 0) >= criteria.minPrice);
      }
      
      if (criteria.maxPrice !== undefined) {
        results = results.filter(p => (p.selling_price || p.price || 0) <= criteria.maxPrice);
      }
      
      return results;
      
    } catch (error) {
      console.error('❌ Erro na busca avançada:', error);
      return [];
    }
  }

  /**
   * Atualizar confiança média
   */
  updateAverageConfidence(confidence) {
    this.metrics.averageConfidence = (
      (this.metrics.averageConfidence * (this.metrics.successfulMatches - 1) + confidence) / 
      this.metrics.successfulMatches
    );
  }

  /**
   * Obter métricas de busca
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalSearches > 0 ? 
        (this.metrics.successfulMatches / this.metrics.totalSearches * 100).toFixed(1) + '%' : '0%'
    };
  }

  /**
   * Obter status do motor de busca
   */
  getStatus() {
    return {
      isActive: true,
      metrics: this.getMetrics()
    };
  }
}

module.exports = ProductSearchEngine;