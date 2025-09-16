const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * Serviço de Comparação de Imagens
 * Responsável por comparar a foto enviada com produtos cadastrados no banco
 */
class ImageComparisonService {
  constructor(databaseService, geminiService) {
    this.databaseService = databaseService;
    this.geminiService = geminiService;
    this.name = 'ImageComparisonService';
    
    // Configurações de comparação
    this.config = {
      minSimilarityScore: 0.7, // Similaridade mínima para considerar match
      maxProductsToCompare: 50, // Máximo de produtos para comparar
      confidenceThreshold: 0.6, // Confiança mínima para auto-seleção
      maxResults: 5 // Máximo de resultados retornados
    };
    
    // Cache de comparações recentes
    this.comparisonCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutos
  }

  /**
   * Comparar imagem enviada com produtos do banco
   * @param {Buffer} imageBuffer - Buffer da imagem enviada
   * @param {string} userId - ID do usuário
   * @returns {Promise<Object>} - Resultado da comparação
   */
  async compareWithProducts(imageBuffer, userId) {
    try {
      console.log('🔍 Iniciando comparação visual com produtos do banco...');
      
      // Gerar hash da imagem para cache e comparação
      const imageHash = this.generateImageHash(imageBuffer);
      
      // Verificar cache
      const cachedResult = this.getCachedComparison(imageHash);
      if (cachedResult) {
        console.log('📋 Resultado encontrado no cache');
        return cachedResult;
      }
      
      // Buscar produtos do usuário que têm imagens
      const userProducts = await this.getUserProductsWithImages(userId);
      
      if (userProducts.length === 0) {
        return {
          success: false,
          reason: 'no_products_with_images',
          message: 'Nenhum produto com imagem cadastrado encontrado.',
          suggestion: 'Cadastre produtos com imagens de referência primeiro.'
        };
      }
      
      console.log(`📦 Comparando com ${userProducts.length} produtos cadastrados...`);
      
      // Realizar comparação com Gemini Vision
      const comparisonResults = await this.performGeminiComparison(
        imageBuffer, 
        userProducts, 
        imageHash
      );
      
      // Processar e ranquear resultados
      const rankedResults = this.rankComparisonResults(comparisonResults);
      
      // Salvar comparações no banco
      await this.saveComparisonResults(imageHash, rankedResults);
      
      // Preparar resposta final
      const finalResult = this.prepareFinalResult(rankedResults, imageHash);
      
      // Adicionar ao cache
      this.cacheComparison(imageHash, finalResult);
      
      console.log('✅ Comparação concluída:', {
        totalProducts: userProducts.length,
        matches: rankedResults.length,
        bestMatch: rankedResults[0]?.product?.name || 'Nenhum'
      });
      
      return finalResult;
      
    } catch (error) {
      console.error('❌ Erro na comparação de imagens:', error);
      logger.error('Erro no ImageComparisonService', {
        userId,
        error: error.message
      });
      
      return {
        success: false,
        reason: 'comparison_error',
        message: 'Erro ao comparar com produtos cadastrados.',
        error: error.message
      };
    }
  }

  /**
   * Buscar produtos do usuário que possuem imagens
   * @param {string} userId - ID do usuário
   * @returns {Promise<Array>} - Lista de produtos com imagens
   */
  async getUserProductsWithImages(userId) {
    try {
      // Buscar produtos com imagens via Supabase (novo campo images JSONB)
      const { data: products, error } = await this.databaseService.supabase
        .from('products')
        .select('*')
        .eq('user_id', userId)
        .not('images', 'eq', '[]')
        .limit(this.config.maxProductsToCompare);
      
      if (error) {
        throw new Error(`Erro ao buscar produtos: ${error.message}`);
      }
      
      // Processar produtos para extrair URLs das imagens
      const processedProducts = (products || []).map(product => {
        // Extrair imagens do campo JSONB
        const images = product.images || [];
        const mainImage = images.find(img => img.type === 'main') || images[0];
        
        return {
          ...product,
          // Manter compatibilidade com image_url
          image_url: mainImage?.url || product.image_url,
          // Adicionar todas as imagens disponíveis
          all_images: images,
          main_image: mainImage,
          total_images: images.length
        };
      }).filter(product => product.image_url); // Apenas produtos com pelo menos uma imagem
      
      console.log(`📦 Encontrados ${processedProducts.length} produtos com imagens`);
      return processedProducts;
      
    } catch (error) {
      console.error('❌ Erro ao buscar produtos com imagens:', error);
      return [];
    }
  }

  /**
   * Realizar comparação usando Gemini Vision
   * @param {Buffer} imageBuffer - Imagem enviada
   * @param {Array} products - Produtos para comparar
   * @param {string} imageHash - Hash da imagem
   * @returns {Promise<Array>} - Resultados da comparação
   */
  async performGeminiComparison(imageBuffer, products, imageHash) {
    try {
      const results = [];
      
      // Converter imagem para base64
      const base64Image = imageBuffer.toString('base64');
      
      // Criar prompt para comparação
      const comparisonPrompt = this.buildComparisonPrompt(products);
      
      // Preparar dados da imagem para Gemini
      const imagePart = {
        inlineData: {
          data: base64Image,
          mimeType: this.detectMimeType(imageBuffer)
        }
      };
      
      // Processar com Gemini Vision com retry para sobrecarga
      let response;
      let attempts = 0;
      const maxAttempts = 3;
      const baseDelay = 2000; // 2 segundos
      
      while (attempts < maxAttempts) {
        try {
          response = await this.geminiService.visionModel.generateContent([
            comparisonPrompt, 
            imagePart
          ]);
          break; // Sucesso, sair do loop
        } catch (error) {
          attempts++;
          
          if (error.message.includes('overloaded') || error.message.includes('503')) {
            if (attempts < maxAttempts) {
              const delay = baseDelay * Math.pow(2, attempts - 1); // Backoff exponencial
              console.log(`⏳ API sobrecarregada, tentativa ${attempts}/${maxAttempts}. Aguardando ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          }
          
          throw error; // Re-throw se não for erro de sobrecarga ou esgotou tentativas
        }
      }
      
      const responseText = response.response.text();
      console.log('🧠 Resposta da comparação:', responseText.substring(0, 200) + '...');
      
      // Parsear resposta
      const comparisonData = this.parseComparisonResponse(responseText, products);
      
      return comparisonData;
      
    } catch (error) {
      console.error('❌ Erro na comparação com Gemini:', error);
      return [];
    }
  }

  /**
   * Construir prompt para comparação de produtos
   * @param {Array} products - Lista de produtos
   * @returns {string} - Prompt formatado
   */
  buildComparisonPrompt(products) {
    const productList = products.map((product, index) => {
      const imageInfo = product.total_images > 1 
        ? ` (${product.total_images} imagens cadastradas)`
        : '';
      
      const priceInfo = product.selling_price 
        ? ` - R$ ${product.selling_price.toFixed(2)}`
        : '';
        
      return `${index + 1}. ${product.name || product.product_name} - ${product.category || product.product_category || 'Sem categoria'}${priceInfo}${imageInfo}`;
    }).join('\n');
    
    return `
Você é um especialista em comparação visual de produtos para um sistema de vendas.

Analise a imagem fornecida pelo usuário e compare com os seguintes produtos cadastrados no banco de dados:

${productList}

Cada produto listado possui imagens de referência cadastradas. Compare a imagem enviada com essas referências visuais.

Retorne APENAS um JSON válido com os produtos que mais se parecem com a imagem, ordenados por similaridade:

{
  "matches": [
    {
      "product_index": 1,
      "similarity_score": 0.95,
      "confidence": 0.90,
      "reason": "Formato, cor e características idênticas ao produto cadastrado",
      "visual_features": ["cor azul", "formato retangular", "marca visível"]
    },
    {
      "product_index": 3,
      "similarity_score": 0.75,
      "confidence": 0.70,
      "reason": "Formato similar, cor ligeiramente diferente",
      "visual_features": ["formato similar", "tamanho compatível"]
    }
  ],
  "best_match_index": 1,
  "overall_confidence": 0.90,
  "analysis_notes": "Produto claramente identificado com alta confiança"
}

CRITÉRIOS DE COMPARAÇÃO:
- Similarity_score: 0.0 a 1.0 (quão similar é visualmente ao produto cadastrado)
- Confidence: 0.0 a 1.0 (quão confiante você está na identificação)
- Considere: formato, cor, tamanho, marca, características únicas
- Inclua apenas matches com similarity_score >= 0.6
- Máximo 5 matches
- Se nenhum produto for similar, retorne: {"matches": [], "best_match_index": null, "overall_confidence": 0.0}

FOCO: Identifique produtos ESPECÍFICOS do banco, não apenas categorias gerais.
`;
  }

  /**
   * Parsear resposta da comparação
   * @param {string} responseText - Resposta do Gemini
   * @param {Array} products - Lista de produtos
   * @returns {Array} - Resultados parseados
   */
  parseComparisonResponse(responseText, products) {
    try {
      // Limpar resposta
      let cleanResponse = responseText.trim();
      cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      // Parsear JSON
      const parsed = JSON.parse(cleanResponse);
      
      if (!parsed.matches || !Array.isArray(parsed.matches)) {
        throw new Error('Formato de resposta inválido');
      }
      
      // Mapear resultados com dados dos produtos
      const results = parsed.matches.map(match => {
        const productIndex = match.product_index - 1; // Converter para índice 0-based
        const product = products[productIndex];
        
        if (!product) {
          console.warn(`Produto não encontrado no índice ${productIndex}`);
          return null;
        }
        
        return {
          product: product,
          similarity_score: Math.min(Math.max(match.similarity_score || 0, 0), 1),
          confidence: Math.min(Math.max(match.confidence || 0, 0), 1),
          reason: match.reason || 'Similaridade visual detectada',
          visual_features: match.visual_features || [],
          overall_confidence: parsed.overall_confidence || 0,
          analysis_notes: parsed.analysis_notes || ''
        };
      }).filter(result => result !== null);
      
      return results;
      
    } catch (error) {
      console.error('❌ Erro ao parsear resposta da comparação:', error);
      return [];
    }
  }

  /**
   * Ranquear resultados da comparação
   * @param {Array} results - Resultados brutos
   * @returns {Array} - Resultados ranqueados
   */
  rankComparisonResults(results) {
    return results
      .filter(result => result.similarity_score >= this.config.minSimilarityScore)
      .sort((a, b) => {
        // Ordenar por score de similaridade e confiança
        const scoreA = (a.similarity_score * 0.7) + (a.confidence * 0.3);
        const scoreB = (b.similarity_score * 0.7) + (b.confidence * 0.3);
        return scoreB - scoreA;
      })
      .slice(0, this.config.maxResults);
  }

  /**
   * Salvar resultados da comparação no banco
   * @param {string} imageHash - Hash da imagem
   * @param {Array} results - Resultados da comparação
   */
  async saveComparisonResults(imageHash, results) {
    try {
      // Temporariamente desabilitado até que as tabelas sejam criadas no Supabase
      console.log(`📊 ${results.length} comparações processadas (salvamento temporariamente desabilitado)`);
      
      // TODO: Reativar quando as tabelas estiverem criadas no Supabase
      /*
      const comparisons = results.map(result => ({
        source_image_hash: imageHash,
        target_product_id: result.product.id,
        similarity_score: result.similarity_score,
        comparison_method: 'gemini_vision',
        processing_time_ms: Date.now()
      }));
      
      if (comparisons.length > 0) {
        const { error } = await this.databaseService.supabase
          .from('image_comparisons')
          .upsert(comparisons, { onConflict: 'source_image_hash,target_product_id' });
        
        if (error) {
          console.error('❌ Erro ao salvar comparações:', error);
        } else {
          console.log(`💾 ${comparisons.length} comparações salvas no banco`);
        }
      }
      */
      
    } catch (error) {
      console.error('❌ Erro ao salvar comparações:', error);
    }
  }

  /**
   * Preparar resultado final
   * @param {Array} rankedResults - Resultados ranqueados
   * @param {string} imageHash - Hash da imagem
   * @returns {Object} - Resultado final
   */
  prepareFinalResult(rankedResults, imageHash) {
    if (rankedResults.length === 0) {
      return {
        success: false,
        reason: 'no_matches',
        message: 'Nenhum produto similar encontrado.',
        suggestion: 'Tente uma foto mais clara ou cadastre este produto.'
      };
    }
    
    const bestMatch = rankedResults[0];
    const hasHighConfidence = bestMatch.similarity_score >= this.config.confidenceThreshold;
    
    return {
      success: true,
      imageHash: imageHash,
      bestMatch: {
        product: bestMatch.product,
        similarity: bestMatch.similarity_score,
        confidence: bestMatch.confidence,
        reason: bestMatch.reason
      },
      alternativeMatches: rankedResults.slice(1),
      autoSelect: hasHighConfidence,
      totalMatches: rankedResults.length,
      message: hasHighConfidence 
        ? `Produto identificado: ${bestMatch.product.name || bestMatch.product.product_name}`
        : `Possível produto: ${bestMatch.product.name || bestMatch.product.product_name}. Confirme se está correto.`
    };
  }

  /**
   * Gerar hash da imagem
   * @param {Buffer} imageBuffer - Buffer da imagem
   * @returns {string} - Hash MD5
   */
  generateImageHash(imageBuffer) {
    return crypto.createHash('md5').update(imageBuffer).digest('hex');
  }

  /**
   * Detectar tipo MIME da imagem
   * @param {Buffer} imageBuffer - Buffer da imagem
   * @returns {string} - Tipo MIME
   */
  detectMimeType(imageBuffer) {
    const signatures = {
      'image/jpeg': [0xFF, 0xD8, 0xFF],
      'image/png': [0x89, 0x50, 0x4E, 0x47],
      'image/gif': [0x47, 0x49, 0x46],
      'image/webp': [0x52, 0x49, 0x46, 0x46]
    };
    
    for (const [mimeType, signature] of Object.entries(signatures)) {
      if (signature.every((byte, index) => imageBuffer[index] === byte)) {
        return mimeType;
      }
    }
    
    return 'image/jpeg';
  }

  /**
   * Cache de comparação
   * @param {string} imageHash - Hash da imagem
   * @param {Object} result - Resultado da comparação
   */
  cacheComparison(imageHash, result) {
    this.comparisonCache.set(imageHash, {
      result,
      timestamp: Date.now()
    });
    
    // Limpar cache antigo
    setTimeout(() => {
      this.comparisonCache.delete(imageHash);
    }, this.cacheTimeout);
  }

  /**
   * Obter comparação do cache
   * @param {string} imageHash - Hash da imagem
   * @returns {Object|null} - Resultado do cache ou null
   */
  getCachedComparison(imageHash) {
    const cached = this.comparisonCache.get(imageHash);
    
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.result;
    }
    
    return null;
  }

  /**
   * Obter estatísticas do serviço
   * @returns {Object} - Estatísticas
   */
  getStats() {
    return {
      cacheSize: this.comparisonCache.size,
      config: this.config,
      isReady: true
    };
  }
}

module.exports = ImageComparisonService;