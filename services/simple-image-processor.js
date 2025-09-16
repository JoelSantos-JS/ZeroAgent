const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Processador de imagens simples usando apenas JavaScript
 * Sem dependências externas - funciona em qualquer sistema
 */
class SimpleImageProcessor {
  constructor() {
    this.isInitialized = false;
    this.productHashes = new Map(); // Cache de hashes de produtos conhecidos
    this.colorPatterns = new Map(); // Padrões de cores por categoria
    
    // Configurações de análise
    this.config = {
      // Análise de arquivo
      minFileSize: 1000, // 1KB mínimo
      maxFileSize: 10 * 1024 * 1024, // 10MB máximo
      
      // Padrões de produtos
      patterns: {
        eletrônicos: {
          keywords: ['preto', 'tela', 'botão', 'led', 'digital'],
          fileSize: { min: 50000, max: 2000000 }, // 50KB - 2MB
          aspectRatio: { min: 0.5, max: 2.0 }
        },
        roupas: {
          keywords: ['tecido', 'cor', 'estampa', 'modelo'],
          fileSize: { min: 30000, max: 1500000 }, // 30KB - 1.5MB
          aspectRatio: { min: 0.6, max: 1.8 }
        },
        acessórios: {
          keywords: ['metal', 'brilho', 'pequeno', 'detalhe'],
          fileSize: { min: 20000, max: 800000 }, // 20KB - 800KB
          aspectRatio: { min: 0.8, max: 1.5 }
        }
      }
    };
  }

  /**
   * Inicializar o processador
   */
  async initialize() {
    try {
      console.log('🔧 Inicializando Simple Image Processor...');
      
      // Carregar hashes de produtos conhecidos
      await this.loadProductHashes();
      
      // Inicializar padrões de cores
      this.initializeColorPatterns();
      
      this.isInitialized = true;
      console.log('✅ Simple Image Processor inicializado!');
      
    } catch (error) {
      console.error('❌ Erro ao inicializar Simple Image Processor:', error);
      throw error;
    }
  }

  /**
   * Processar imagem com análise simples
   * @param {Buffer} imageBuffer - Buffer da imagem
   * @param {Object} context - Contexto adicional
   * @returns {Object} - Resultado da análise
   */
  async processImage(imageBuffer, context = {}) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      console.log('🔍 Analisando imagem com Simple Processor...');
      const startTime = Date.now();
      
      // Análises básicas
      const fileAnalysis = this.analyzeFile(imageBuffer);
      const hashAnalysis = this.analyzeHash(imageBuffer);
      const contextAnalysis = this.analyzeContext(context);
      const patternAnalysis = this.analyzePatterns(fileAnalysis, contextAnalysis);
      
      // Combinar resultados
      const result = this.combineAnalysis({
        file: fileAnalysis,
        hash: hashAnalysis,
        context: contextAnalysis,
        patterns: patternAnalysis
      });
      
      const processingTime = Date.now() - startTime;
      console.log(`⚡ Análise simples concluída em ${processingTime}ms`);
      
      return {
        success: true,
        productData: result,
        processingTime,
        method: 'simple_local',
        details: {
          fileSize: fileAnalysis.size,
          hash: hashAnalysis.hash.substring(0, 16),
          confidence: result.confianca
        }
      };
      
    } catch (error) {
      console.error('❌ Erro no processamento simples:', error);
      return {
        success: false,
        error: error.message,
        method: 'simple_local'
      };
    }
  }

  /**
   * Analisar características do arquivo
   * @param {Buffer} imageBuffer - Buffer da imagem
   * @returns {Object} - Análise do arquivo
   */
  analyzeFile(imageBuffer) {
    const size = imageBuffer.length;
    
    // Detectar formato básico pelos primeiros bytes
    let format = 'unknown';
    if (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) {
      format = 'jpeg';
    } else if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
      format = 'png';
    } else if (imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49) {
      format = 'gif';
    }
    
    // Estimar qualidade baseada no tamanho
    let quality = 'low';
    if (size > 500000) quality = 'high';      // > 500KB
    else if (size > 100000) quality = 'medium'; // > 100KB
    
    // Calcular entropia (complexidade da imagem)
    const entropy = this.calculateEntropy(imageBuffer);
    
    return {
      size,
      format,
      quality,
      entropy,
      isLargeFile: size > 200000,
      isHighQuality: quality === 'high',
      complexity: entropy > 7 ? 'high' : entropy > 5 ? 'medium' : 'low'
    };
  }

  /**
   * Analisar hash da imagem
   * @param {Buffer} imageBuffer - Buffer da imagem
   * @returns {Object} - Análise do hash
   */
  analyzeHash(imageBuffer) {
    // Gerar hash da imagem
    const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    
    // Verificar se é produto conhecido
    let knownProduct = null;
    let similarity = 0;
    
    for (const [productName, productHash] of this.productHashes) {
      const currentSimilarity = this.calculateHashSimilarity(hash, productHash);
      if (currentSimilarity > similarity) {
        similarity = currentSimilarity;
        knownProduct = productName;
      }
    }
    
    return {
      hash,
      knownProduct: similarity > 0.8 ? knownProduct : null,
      similarity,
      isKnownProduct: similarity > 0.8
    };
  }

  /**
   * Analisar contexto do usuário
   * @param {Object} context - Contexto
   * @returns {Object} - Análise do contexto
   */
  analyzeContext(context) {
    const userHistory = context.userContext?.recentTransactions || [];
    const frequentCategories = this.extractFrequentCategories(userHistory);
    
    // Análise temporal
    const currentHour = new Date().getHours();
    const isBusinessHours = currentHour >= 8 && currentHour <= 18;
    const isWeekend = [0, 6].includes(new Date().getDay());
    
    return {
      frequentCategories,
      isBusinessHours,
      isWeekend,
      hasHistory: userHistory.length > 0,
      primaryCategory: frequentCategories[0] || 'outros'
    };
  }

  /**
   * Analisar padrões baseados em heurísticas
   * @param {Object} fileAnalysis - Análise do arquivo
   * @param {Object} contextAnalysis - Análise do contexto
   * @returns {Object} - Análise de padrões
   */
  analyzePatterns(fileAnalysis, contextAnalysis) {
    const patterns = this.config.patterns;
    const scores = {};
    
    // Calcular score para cada categoria
    for (const [category, pattern] of Object.entries(patterns)) {
      let score = 0;
      
      // Score baseado no tamanho do arquivo
      if (fileAnalysis.size >= pattern.fileSize.min && 
          fileAnalysis.size <= pattern.fileSize.max) {
        score += 0.3;
      }
      
      // Score baseado na qualidade
      if (fileAnalysis.quality === 'high' && category === 'eletrônicos') {
        score += 0.2;
      }
      
      // Score baseado na complexidade
      if (fileAnalysis.complexity === 'high' && category === 'eletrônicos') {
        score += 0.2;
      }
      
      // Score baseado no histórico do usuário
      if (contextAnalysis.frequentCategories.includes(category)) {
        score += 0.4;
      }
      
      // Score baseado no horário
      if (contextAnalysis.isBusinessHours) {
        score += 0.1;
      }
      
      scores[category] = score;
    }
    
    // Encontrar categoria com maior score
    const bestCategory = Object.entries(scores)
      .sort(([,a], [,b]) => b - a)[0];
    
    return {
      scores,
      bestCategory: bestCategory[0],
      bestScore: bestCategory[1],
      confidence: bestCategory[1]
    };
  }

  /**
   * Combinar todas as análises
   * @param {Object} analyses - Resultados das análises
   * @returns {Object} - Resultado final
   */
  combineAnalysis({ file, hash, context, patterns }) {
    let produto_nome = 'Produto não identificado';
    let categoria = 'outros';
    let confianca = 0.3;
    let caracteristicas = [];
    
    // Prioridade 1: Produto conhecido por hash
    if (hash.isKnownProduct) {
      produto_nome = hash.knownProduct;
      confianca = hash.similarity;
      caracteristicas.push(`Produto conhecido: ${(hash.similarity * 100).toFixed(1)}%`);
      
      // Inferir categoria do produto conhecido
      if (produto_nome.toLowerCase().includes('fone') || 
          produto_nome.toLowerCase().includes('eletrônico')) {
        categoria = 'eletrônicos';
      }
    }
    
    // Prioridade 2: Análise de padrões
    if (patterns.confidence > 0.5) {
      categoria = patterns.bestCategory;
      confianca = Math.max(confianca, patterns.confidence);
      caracteristicas.push(`Padrão detectado: ${patterns.bestCategory}`);
      
      // Gerar nome baseado na categoria
      if (categoria === 'eletrônicos') {
        produto_nome = file.isHighQuality ? 'Dispositivo eletrônico' : 'Produto eletrônico';
      } else if (categoria === 'roupas') {
        produto_nome = 'Item de vestuário';
      } else if (categoria === 'acessórios') {
        produto_nome = 'Acessório';
      }
    }
    
    // Ajustes baseados no contexto
    if (context.hasHistory && context.primaryCategory !== 'outros') {
      if (categoria === 'outros') {
        categoria = context.primaryCategory;
        produto_nome = `Produto de ${context.primaryCategory}`;
      }
      confianca += 0.15;
    }
    
    // Ajustes baseados no arquivo
    if (file.isHighQuality) {
      confianca += 0.1;
      caracteristicas.push('Imagem de alta qualidade');
    }
    
    if (file.complexity === 'high') {
      caracteristicas.push('Imagem complexa');
    }
    
    // Ajustes temporais
    if (context.isBusinessHours) {
      confianca += 0.05;
    }
    
    // Limitar confiança
    confianca = Math.min(confianca, 0.85);
    
    return {
      tipo: 'venda',
      produto_nome,
      categoria,
      confianca,
      valor: null,
      fonte: 'simple_local',
      caracteristicas,
      detalhes: {
        tamanho_arquivo: file.size,
        formato: file.format,
        qualidade: file.quality,
        complexidade: file.complexity,
        categoria_inferida: patterns.bestCategory,
        score_categoria: patterns.bestScore
      }
    };
  }

  /**
   * Calcular entropia do buffer (complexidade)
   * @param {Buffer} buffer - Buffer da imagem
   * @returns {number} - Entropia
   */
  calculateEntropy(buffer) {
    const frequencies = new Array(256).fill(0);
    
    // Contar frequência de cada byte
    for (let i = 0; i < Math.min(buffer.length, 10000); i++) {
      frequencies[buffer[i]]++;
    }
    
    // Calcular entropia
    let entropy = 0;
    const total = Math.min(buffer.length, 10000);
    
    for (const freq of frequencies) {
      if (freq > 0) {
        const p = freq / total;
        entropy -= p * Math.log2(p);
      }
    }
    
    return entropy;
  }

  /**
   * Calcular similaridade entre hashes
   * @param {string} hash1 - Hash 1
   * @param {string} hash2 - Hash 2
   * @returns {number} - Similaridade (0-1)
   */
  calculateHashSimilarity(hash1, hash2) {
    if (hash1 === hash2) return 1.0;
    
    let matches = 0;
    const length = Math.min(hash1.length, hash2.length);
    
    for (let i = 0; i < length; i++) {
      if (hash1[i] === hash2[i]) matches++;
    }
    
    return matches / length;
  }

  /**
   * Extrair categorias frequentes
   * @param {Array} transactions - Transações
   * @returns {Array} - Categorias frequentes
   */
  extractFrequentCategories(transactions) {
    if (!transactions || transactions.length === 0) return [];
    
    const categoryCount = {};
    transactions.forEach(t => {
      const cat = t.category || t.categoria || 'outros';
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });
    
    return Object.entries(categoryCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([cat]) => cat);
  }

  /**
   * Carregar hashes de produtos conhecidos
   */
  async loadProductHashes() {
    try {
      const hashesFile = path.join(__dirname, '..', 'data', 'product-hashes.json');
      
      if (fs.existsSync(hashesFile)) {
        const data = JSON.parse(fs.readFileSync(hashesFile, 'utf8'));
        
        for (const [productName, hash] of Object.entries(data)) {
          this.productHashes.set(productName, hash);
        }
        
        console.log(`📋 ${this.productHashes.size} hashes de produtos carregados`);
      } else {
        console.log('📁 Arquivo de hashes não encontrado, criando estrutura...');
        
        // Criar diretório e arquivo
        const dataDir = path.join(__dirname, '..', 'data');
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        
        fs.writeFileSync(hashesFile, JSON.stringify({}, null, 2));
      }
      
    } catch (error) {
      console.warn('⚠️ Erro ao carregar hashes:', error.message);
    }
  }

  /**
   * Inicializar padrões de cores
   */
  initializeColorPatterns() {
    // Padrões básicos por categoria
    this.colorPatterns.set('eletrônicos', ['preto', 'cinza', 'prata', 'branco']);
    this.colorPatterns.set('roupas', ['azul', 'vermelho', 'verde', 'amarelo']);
    this.colorPatterns.set('acessórios', ['dourado', 'prateado', 'marrom']);
    
    console.log('🎨 Padrões de cores inicializados');
  }

  /**
   * Adicionar hash de produto conhecido
   * @param {string} productName - Nome do produto
   * @param {Buffer} imageBuffer - Buffer da imagem
   */
  async addProductHash(productName, imageBuffer) {
    try {
      const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
      this.productHashes.set(productName, hash);
      
      // Salvar no arquivo
      const hashesFile = path.join(__dirname, '..', 'data', 'product-hashes.json');
      const data = Object.fromEntries(this.productHashes);
      
      fs.writeFileSync(hashesFile, JSON.stringify(data, null, 2));
      
      console.log(`✅ Hash adicionado para: ${productName}`);
      
    } catch (error) {
      console.error('❌ Erro ao adicionar hash:', error);
    }
  }

  /**
   * Obter status do processador
   * @returns {Object} - Status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      knownProducts: this.productHashes.size,
      colorPatterns: this.colorPatterns.size,
      capabilities: {
        fileAnalysis: true,
        hashMatching: true,
        patternRecognition: true,
        contextAnalysis: true,
        noDependencies: true
      }
    };
  }
}

module.exports = SimpleImageProcessor;