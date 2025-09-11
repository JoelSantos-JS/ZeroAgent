const logger = require('../../utils/logger');

/**
 * Serviço especializado em busca e reconhecimento de produtos
 * Responsável por toda lógica de busca inteligente, sugestões e criação de produtos
 */
class ProductSearchService {
  constructor(databaseService) {
    this.databaseService = databaseService;
  }

  /**
   * Busca inteligente de produto em múltiplas etapas
   * @param {Array} products - Lista de produtos do usuário
   * @param {string} searchName - Nome do produto a buscar
   * @returns {Object|null} - Produto encontrado ou null
   */
  async findProductIntelligent(products, searchName) {
    const search = searchName.toLowerCase().trim();
    
    // Etapa 1: Busca exata
    let product = products.find(p => {
      const pName = (p.name || p.product_name || '').toLowerCase();
      return pName === search;
    });
    
    if (product) {
      logger.info(`✅ Produto encontrado (busca exata): ${product.name || product.product_name}`);
      return product;
    }
    
    // Etapa 2: Busca por início do nome
    product = products.find(p => {
      const pName = (p.name || p.product_name || '').toLowerCase();
      return pName.startsWith(search) || search.startsWith(pName);
    });
    
    if (product) {
      logger.info(`✅ Produto encontrado (início): ${product.name || product.product_name}`);
      return product;
    }
    
    // Etapa 3: Busca por palavras-chave com score
    const candidates = products.map(p => {
      const pName = (p.name || p.product_name || '').toLowerCase();
      const score = this.calculateSimilarityScore(pName, search);
      return { product: p, score, name: pName };
    }).filter(c => c.score > 0.6).sort((a, b) => b.score - a.score);
    
    if (candidates.length > 0) {
      logger.info(`✅ Produto encontrado (similaridade): ${candidates[0].product.name || candidates[0].product.product_name} (score: ${candidates[0].score})`);
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
        logger.info(`✅ Produto encontrado (palavra-chave): ${product.name || product.product_name}`);
        return product;
      }
    }
    
    logger.info(`❌ Produto não encontrado: ${searchName}`);
    return null;
  }
  
  /**
   * Calcular score de similaridade entre duas strings
   * @param {string} str1 - Primeira string
   * @param {string} str2 - Segunda string
   * @returns {number} - Score de 0 a 1
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
   * @param {Array} products - Lista de produtos
   * @param {string} searchName - Nome buscado
   * @returns {Array} - Lista de sugestões ordenadas por relevância
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
    
    logger.info(`💡 Encontradas ${suggestions.length} sugestões para "${searchName}"`);
    return suggestions;
  }

  /**
   * Extrair nome do produto da descrição
   * @param {string} descricao - Descrição da mensagem
   * @returns {string|null} - Nome do produto extraído
   */
  extractProductName(descricao) {
    if (!descricao) {
      return null;
    }

    const text = descricao.toLowerCase();
    
    // Padrões específicos para vendas
    const salePatterns = [
      /vendi\s+(?:o\s+|a\s+|um\s+|uma\s+)?(.+?)(?:\s+por|\s+de|\s+\d|$)/i,
      /venda\s+(?:do\s+|da\s+|de\s+)?(.+?)(?:\s+por|\s+de|\s+\d|$)/i,
      /cliente\s+comprou\s+(?:o\s+|a\s+|um\s+|uma\s+)?(.+?)(?:\s+por|\s+de|\s+\d|$)/i,
      /vendeu\s+(?:o\s+|a\s+|um\s+|uma\s+)?(.+?)(?:\s+por|\s+de|\s+\d|$)/i
    ];
    
    // Tentar padrões específicos primeiro
    for (const pattern of salePatterns) {
      const match = descricao.match(pattern);
      if (match && match[1]) {
        const productName = match[1].trim();
        if (productName.length > 1 && !productName.match(/^\d+$/)) {
          logger.info(`🔍 Produto extraído (padrão específico): "${productName}"`);
          return productName;
        }
      }
    }
    
    // Fallback: buscar por produtos comuns
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
        logger.info(`⚠️ Produto genérico encontrado: "${product}"`);
        return product.charAt(0).toUpperCase() + product.slice(1);
      }
    }
    
    logger.info(`❌ Nenhum produto encontrado em: "${descricao}"`);
    return null;
  }

  /**
   * Criar produto automaticamente
   * @param {string} userId - ID do usuário
   * @param {string} productName - Nome do produto
   * @returns {Promise<Object>} - Produto criado
   */
  async createProduct(userId, productName) {
    try {
      // Verificar se produto já existe
      const products = await this.databaseService.getUserProducts(userId, 100);
      const existingProduct = products.find(p => {
        const pName = (p.name || p.product_name || '').toLowerCase();
        return pName === productName.toLowerCase();
      });
      
      if (existingProduct) {
        throw new Error(`Produto "${productName}" já existe`);
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
      logger.info(`✅ Produto criado: ${productName}`);
      
      return createdProduct;
    } catch (error) {
      logger.error('❌ Erro ao criar produto:', error);
      throw error;
    }
  }

  /**
   * Extrair nome do produto de comando de criação
   * @param {string} descricao - Descrição do comando
   * @returns {string|null} - Nome do produto
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
}

module.exports = ProductSearchService;