const cv = require('opencv4nodejs');
const path = require('path');
const fs = require('fs');

/**
 * Processador de imagens usando OpenCV
 * Sistema local de reconhecimento visual sem dependência de APIs externas
 */
class OpenCVProcessor {
  constructor() {
    this.isInitialized = false;
    this.templates = new Map(); // Cache de templates de produtos
    this.colorProfiles = new Map(); // Perfis de cores por categoria
    this.shapeDetectors = new Map(); // Detectores de formas
    
    // Configurações de detecção
    this.config = {
      // Detecção de contornos
      contour: {
        minArea: 1000,
        maxArea: 50000,
        approxEpsilon: 0.02
      },
      
      // Detecção de cores
      color: {
        hsvRanges: {
          red: [{ lower: [0, 50, 50], upper: [10, 255, 255] }],
          blue: [{ lower: [100, 50, 50], upper: [130, 255, 255] }],
          green: [{ lower: [40, 50, 50], upper: [80, 255, 255] }],
          black: [{ lower: [0, 0, 0], upper: [180, 255, 50] }],
          white: [{ lower: [0, 0, 200], upper: [180, 30, 255] }]
        }
      },
      
      // Detecção de características
      features: {
        cornerThreshold: 0.01,
        maxCorners: 100,
        qualityLevel: 0.3,
        minDistance: 7
      }
    };
  }

  /**
   * Inicializar o processador OpenCV
   */
  async initialize() {
    try {
      console.log('🔧 Inicializando OpenCV Processor...');
      
      // Verificar se OpenCV está disponível
      if (!cv.version) {
        throw new Error('OpenCV não está instalado');
      }
      
      console.log(`📋 OpenCV versão: ${cv.version}`);
      
      // Carregar templates de produtos conhecidos
      await this.loadProductTemplates();
      
      // Inicializar detectores de características
      this.initializeDetectors();
      
      this.isInitialized = true;
      console.log('✅ OpenCV Processor inicializado com sucesso!');
      
    } catch (error) {
      console.error('❌ Erro ao inicializar OpenCV:', error);
      throw error;
    }
  }

  /**
   * Processar imagem com OpenCV
   * @param {Buffer} imageBuffer - Buffer da imagem
   * @param {Object} context - Contexto adicional
   * @returns {Object} - Resultado da análise
   */
  async processImage(imageBuffer, context = {}) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      console.log('🔍 Analisando imagem com OpenCV...');
      const startTime = Date.now();
      
      // Converter buffer para matriz OpenCV
      const image = cv.imdecode(imageBuffer);
      
      if (image.empty) {
        throw new Error('Não foi possível decodificar a imagem');
      }
      
      // Análises paralelas
      const [colorAnalysis, shapeAnalysis, textureAnalysis, templateMatch] = await Promise.all([
        this.analyzeColors(image),
        this.analyzeShapes(image),
        this.analyzeTexture(image),
        this.matchTemplates(image)
      ]);
      
      // Combinar resultados
      const result = this.combineAnalysis({
        colors: colorAnalysis,
        shapes: shapeAnalysis,
        texture: textureAnalysis,
        templates: templateMatch,
        context
      });
      
      const processingTime = Date.now() - startTime;
      console.log(`⚡ Análise OpenCV concluída em ${processingTime}ms`);
      
      return {
        success: true,
        productData: result,
        processingTime,
        method: 'opencv_local',
        details: {
          imageSize: { width: image.cols, height: image.rows },
          channels: image.channels,
          colorAnalysis,
          shapeAnalysis,
          textureAnalysis
        }
      };
      
    } catch (error) {
      console.error('❌ Erro no processamento OpenCV:', error);
      return {
        success: false,
        error: error.message,
        method: 'opencv_local'
      };
    }
  }

  /**
   * Analisar cores dominantes na imagem
   * @param {Mat} image - Imagem OpenCV
   * @returns {Object} - Análise de cores
   */
  async analyzeColors(image) {
    try {
      // Converter para HSV para melhor análise de cores
      const hsv = image.cvtColor(cv.COLOR_BGR2HSV);
      
      const colorResults = {};
      let dominantColors = [];
      
      // Detectar cores específicas
      for (const [colorName, ranges] of Object.entries(this.config.color.hsvRanges)) {
        let totalPixels = 0;
        
        for (const range of ranges) {
          const mask = hsv.inRange(new cv.Vec3(...range.lower), new cv.Vec3(...range.upper));
          const pixels = cv.countNonZero(mask);
          totalPixels += pixels;
        }
        
        const percentage = (totalPixels / (image.rows * image.cols)) * 100;
        colorResults[colorName] = percentage;
        
        if (percentage > 5) { // Mais de 5% da imagem
          dominantColors.push({ color: colorName, percentage });
        }
      }
      
      // Ordenar cores por dominância
      dominantColors.sort((a, b) => b.percentage - a.percentage);
      
      return {
        dominantColors: dominantColors.slice(0, 3),
        colorDistribution: colorResults,
        primaryColor: dominantColors[0]?.color || 'unknown'
      };
      
    } catch (error) {
      console.error('❌ Erro na análise de cores:', error);
      return { dominantColors: [], colorDistribution: {}, primaryColor: 'unknown' };
    }
  }

  /**
   * Analisar formas e contornos
   * @param {Mat} image - Imagem OpenCV
   * @returns {Object} - Análise de formas
   */
  async analyzeShapes(image) {
    try {
      // Converter para escala de cinza
      const gray = image.cvtColor(cv.COLOR_BGR2GRAY);
      
      // Aplicar blur para reduzir ruído
      const blurred = gray.gaussianBlur(new cv.Size(5, 5), 0);
      
      // Detectar bordas
      const edges = blurred.canny(50, 150);
      
      // Encontrar contornos
      const contours = edges.findContours(cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      
      const shapes = [];
      let totalArea = 0;
      
      for (const contour of contours) {
        const area = contour.area;
        
        if (area > this.config.contour.minArea && area < this.config.contour.maxArea) {
          const perimeter = contour.arcLength(true);
          const approx = contour.approxPolyDP(this.config.contour.approxEpsilon * perimeter, true);
          
          // Classificar forma baseada no número de vértices
          let shapeType = 'unknown';
          const vertices = approx.rows;
          
          if (vertices === 3) shapeType = 'triangle';
          else if (vertices === 4) {
            const rect = contour.boundingRect();
            const aspectRatio = rect.width / rect.height;
            shapeType = Math.abs(aspectRatio - 1) < 0.2 ? 'square' : 'rectangle';
          }
          else if (vertices > 8) shapeType = 'circle';
          else shapeType = 'polygon';
          
          shapes.push({
            type: shapeType,
            area,
            perimeter,
            vertices,
            aspectRatio: contour.boundingRect().width / contour.boundingRect().height
          });
          
          totalArea += area;
        }
      }
      
      // Ordenar por área
      shapes.sort((a, b) => b.area - a.area);
      
      return {
        totalShapes: shapes.length,
        shapes: shapes.slice(0, 5), // Top 5 formas
        dominantShape: shapes[0]?.type || 'unknown',
        totalArea,
        complexity: shapes.length > 10 ? 'high' : shapes.length > 5 ? 'medium' : 'low'
      };
      
    } catch (error) {
      console.error('❌ Erro na análise de formas:', error);
      return { totalShapes: 0, shapes: [], dominantShape: 'unknown', totalArea: 0, complexity: 'low' };
    }
  }

  /**
   * Analisar textura da imagem
   * @param {Mat} image - Imagem OpenCV
   * @returns {Object} - Análise de textura
   */
  async analyzeTexture(image) {
    try {
      const gray = image.cvtColor(cv.COLOR_BGR2GRAY);
      
      // Calcular gradientes para detectar textura
      const gradX = gray.sobel(cv.CV_64F, 1, 0, 3);
      const gradY = gray.sobel(cv.CV_64F, 0, 1, 3);
      
      // Magnitude do gradiente
      const magnitude = gradX.pow(2).add(gradY.pow(2)).sqrt();
      
      // Estatísticas de textura
      const mean = magnitude.mean();
      const stddev = magnitude.stdDev();
      
      // Classificar textura
      let textureType = 'smooth';
      if (stddev.w > 30) textureType = 'rough';
      else if (stddev.w > 15) textureType = 'medium';
      
      // Detectar padrões repetitivos
      const corners = gray.goodFeaturesToTrack(
        this.config.features.maxCorners,
        this.config.features.qualityLevel,
        this.config.features.minDistance
      );
      
      return {
        textureType,
        roughness: stddev.w,
        uniformity: mean.w,
        cornerCount: corners.length,
        hasPattern: corners.length > 20
      };
      
    } catch (error) {
      console.error('❌ Erro na análise de textura:', error);
      return { textureType: 'unknown', roughness: 0, uniformity: 0, cornerCount: 0, hasPattern: false };
    }
  }

  /**
   * Comparar com templates de produtos conhecidos
   * @param {Mat} image - Imagem OpenCV
   * @returns {Object} - Resultado da comparação
   */
  async matchTemplates(image) {
    try {
      if (this.templates.size === 0) {
        return { matches: [], bestMatch: null, confidence: 0 };
      }
      
      const gray = image.cvtColor(cv.COLOR_BGR2GRAY);
      const matches = [];
      
      for (const [productName, template] of this.templates) {
        try {
          // Template matching
          const result = gray.matchTemplate(template, cv.TM_CCOEFF_NORMED);
          const minMax = result.minMaxLoc();
          
          if (minMax.maxVal > 0.3) { // Threshold de similaridade
            matches.push({
              product: productName,
              confidence: minMax.maxVal,
              location: minMax.maxLoc
            });
          }
        } catch (err) {
          // Ignorar erros de template específico
        }
      }
      
      // Ordenar por confiança
      matches.sort((a, b) => b.confidence - a.confidence);
      
      return {
        matches,
        bestMatch: matches[0] || null,
        confidence: matches[0]?.confidence || 0
      };
      
    } catch (error) {
      console.error('❌ Erro no template matching:', error);
      return { matches: [], bestMatch: null, confidence: 0 };
    }
  }

  /**
   * Combinar todas as análises para gerar resultado final
   * @param {Object} analyses - Resultados das análises
   * @returns {Object} - Resultado combinado
   */
  combineAnalysis({ colors, shapes, texture, templates, context }) {
    let produto_nome = 'Produto não identificado';
    let categoria = 'outros';
    let confianca = 0.3;
    let caracteristicas = [];
    
    // Análise baseada em template matching
    if (templates.bestMatch && templates.confidence > 0.5) {
      produto_nome = templates.bestMatch.product;
      confianca = templates.confidence;
      caracteristicas.push(`Template match: ${(templates.confidence * 100).toFixed(1)}%`);
    }
    
    // Análise baseada em cores
    if (colors.dominantColors.length > 0) {
      const primaryColor = colors.dominantColors[0];
      caracteristicas.push(`Cor dominante: ${primaryColor.color} (${primaryColor.percentage.toFixed(1)}%)`);
      
      // Inferir categoria por cor
      if (primaryColor.color === 'black' && shapes.dominantShape === 'rectangle') {
        categoria = 'eletrônicos';
        produto_nome = 'Dispositivo eletrônico';
        confianca = Math.max(confianca, 0.6);
      }
    }
    
    // Análise baseada em formas
    if (shapes.totalShapes > 0) {
      caracteristicas.push(`Forma principal: ${shapes.dominantShape}`);
      caracteristicas.push(`Complexidade: ${shapes.complexity}`);
      
      // Inferir categoria por forma
      if (shapes.dominantShape === 'rectangle' && shapes.complexity === 'medium') {
        if (categoria === 'outros') {
          categoria = 'eletrônicos';
          produto_nome = 'Produto retangular';
          confianca = Math.max(confianca, 0.5);
        }
      }
    }
    
    // Análise baseada em textura
    if (texture.textureType !== 'unknown') {
      caracteristicas.push(`Textura: ${texture.textureType}`);
      
      if (texture.hasPattern) {
        caracteristicas.push('Padrão detectado');
        confianca += 0.1;
      }
    }
    
    // Ajustar confiança baseada no contexto
    if (context.userContext?.recentTransactions) {
      const frequentCategories = this.extractFrequentCategories(context.userContext.recentTransactions);
      if (frequentCategories.includes(categoria)) {
        confianca += 0.15;
      }
    }
    
    // Limitar confiança máxima
    confianca = Math.min(confianca, 0.9);
    
    return {
      tipo: 'venda',
      produto_nome,
      categoria,
      confianca,
      valor: null,
      fonte: 'opencv_local',
      caracteristicas,
      detalhes_visuais: {
        cores: colors.dominantColors,
        formas: shapes.shapes.slice(0, 3),
        textura: texture.textureType,
        template_match: templates.bestMatch?.product || 'Nenhum'
      }
    };
  }

  /**
   * Carregar templates de produtos conhecidos
   */
  async loadProductTemplates() {
    try {
      const templatesDir = path.join(__dirname, '..', 'templates');
      
      if (!fs.existsSync(templatesDir)) {
        console.log('📁 Diretório de templates não encontrado, criando...');
        fs.mkdirSync(templatesDir, { recursive: true });
        return;
      }
      
      const files = fs.readdirSync(templatesDir);
      let loadedCount = 0;
      
      for (const file of files) {
        if (file.endsWith('.jpg') || file.endsWith('.png')) {
          try {
            const templatePath = path.join(templatesDir, file);
            const template = cv.imread(templatePath, cv.IMREAD_GRAYSCALE);
            const productName = path.parse(file).name;
            
            this.templates.set(productName, template);
            loadedCount++;
          } catch (err) {
            console.warn(`⚠️ Erro ao carregar template ${file}:`, err.message);
          }
        }
      }
      
      console.log(`📋 ${loadedCount} templates carregados`);
      
    } catch (error) {
      console.warn('⚠️ Erro ao carregar templates:', error.message);
    }
  }

  /**
   * Inicializar detectores de características
   */
  initializeDetectors() {
    try {
      // Detectores podem ser adicionados aqui
      console.log('🔧 Detectores de características inicializados');
    } catch (error) {
      console.warn('⚠️ Erro ao inicializar detectores:', error.message);
    }
  }

  /**
   * Extrair categorias frequentes do histórico
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
   * Adicionar template de produto
   * @param {string} productName - Nome do produto
   * @param {Buffer} imageBuffer - Imagem do produto
   */
  async addProductTemplate(productName, imageBuffer) {
    try {
      const image = cv.imdecode(imageBuffer);
      const gray = image.cvtColor(cv.COLOR_BGR2GRAY);
      
      this.templates.set(productName, gray);
      
      // Salvar template no disco
      const templatesDir = path.join(__dirname, '..', 'templates');
      if (!fs.existsSync(templatesDir)) {
        fs.mkdirSync(templatesDir, { recursive: true });
      }
      
      const templatePath = path.join(templatesDir, `${productName}.png`);
      cv.imwrite(templatePath, gray);
      
      console.log(`✅ Template adicionado: ${productName}`);
      
    } catch (error) {
      console.error('❌ Erro ao adicionar template:', error);
    }
  }

  /**
   * Obter status do processador
   * @returns {Object} - Status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      templatesLoaded: this.templates.size,
      version: cv.version || 'unknown',
      capabilities: {
        colorAnalysis: true,
        shapeDetection: true,
        textureAnalysis: true,
        templateMatching: true
      }
    };
  }
}

module.exports = OpenCVProcessor;