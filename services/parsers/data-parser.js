const moment = require('moment');

/**
 * Módulo de parsers para processar dados de entrada
 * Centraliza toda a lógica de extração e conversão de dados
 */

class DataParser {
  /**
   * Processar data de transação
   * @param {string} dateString - String da data
   * @returns {Date} - Data processada
   */
  static parseDate(dateString) {
    if (!dateString) {
      return new Date();
    }
    
    const today = new Date();
    
    switch (dateString.toLowerCase().trim()) {
      case 'hoje':
        return today;
      case 'ontem':
        return new Date(today.getTime() - 24 * 60 * 60 * 1000);
      case 'anteontem':
        return new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
      default:
        // Tentar parsear data específica
        const parsed = moment(dateString, ['DD/MM/YYYY', 'DD/MM', 'YYYY-MM-DD'], true);
        return parsed.isValid() ? parsed.toDate() : today;
    }
  }

  /**
   * Detectar se é compra parcelada
   * @param {Object} analysisResult - Resultado da análise
   * @returns {boolean} - True se for parcelada
   */
  static detectInstallment(analysisResult) {
    const { descricao, intencao } = analysisResult;
    const installmentKeywords = [
      'parcelado', 'parcela', 'parcelas', 'vezes', 'x',
      'dividido', 'prestação', 'prestações', 'mensalidade'
    ];
    
    const text = (descricao || '').toLowerCase();
    return installmentKeywords.some(keyword => text.includes(keyword)) ||
           intencao === 'registrar_parcelado';
  }

  /**
   * Extrair dados de parcelamento
   * @param {Object} analysisResult - Resultado da análise
   * @returns {Object} - Dados do parcelamento
   */
  static parseInstallmentData(analysisResult) {
    const { valor, categoria, descricao, data } = analysisResult;
    
    // Tentar extrair número de parcelas da descrição
    const text = (descricao || '').toLowerCase();
    
    // Padrões mais abrangentes para detectar parcelas
    const patterns = [
      /(\d+)\s*(?:x|vezes|parcelas?)/, // "3x", "5 vezes", "12 parcelas"
      /(?:em|de)\s*(\d+)\s*(?:x|vezes|parcelas?)/, // "em 3x", "de 5 vezes"
      /dividido?\s*(?:em|por)?\s*(\d+)/, // "dividido em 3", "dividido por 5"
      /parcelad[oa]\s*(?:em|de)?\s*(\d+)/ // "parcelado em 3", "parcelada de 5"
    ];
    
    let installments = null;
    
    // Tentar cada padrão até encontrar um match
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        installments = parseInt(match[1]);
        break;
      }
    }
    
    // Se não encontrou, não assumir valor padrão - retornar erro
    if (!installments) {
      throw new Error('Número de parcelas não especificado. Por favor, informe em quantas vezes foi parcelado.');
    }
    
    // Validar número de parcelas
    if (installments < 2 || installments > 60) {
      throw new Error('Número de parcelas deve estar entre 2 e 60.');
    }
    
    // Extrair valor da parcela se especificado
    const valorParcelaMatch = text.match(/parcela[s]?\s*de\s*r?\$?\s*(\d+(?:[.,]\d{2})?)/i);
    const installmentValue = valorParcelaMatch ? 
      parseFloat(valorParcelaMatch[1].replace(',', '.')) : 
      valor / installments;
    
    // Validar se o valor da parcela faz sentido
    const expectedValue = valor / installments;
    if (valorParcelaMatch && Math.abs(installmentValue - expectedValue) > expectedValue * 0.1) {
      console.warn('⚠️ Valor da parcela especificado difere do calculado');
    }
    
    // DEBUG: Log dos valores detectados
    console.log('🔍 DEBUG parseInstallmentData:', {
      texto: text,
      valorTotal: valor,
      numParcelas: installments,
      valorParcela: installmentValue,
      valorEsperado: expectedValue
    });
    
    const result = {
      totalAmount: valor,
      installmentAmount: installmentValue,
      totalInstallments: installments,
      currentInstallment: 1,
      category: categoria,
      description: descricao,
      transactionDate: this.parseDate(data)
    };
    
    console.log('🔍 DEBUG resultado parseInstallmentData:', result);
    return result;
  }

  /**
   * Extrair valor monetário de texto
   * @param {string} text - Texto contendo valor
   * @returns {number|null} - Valor extraído ou null
   */
  static extractMonetaryValue(text) {
    if (!text) return null;
    
    // Padrões para detectar valores monetários
    const patterns = [
      /r\$\s*(\d+(?:[.,]\d{2})?)/i, // "R$ 100" ou "R$ 100,50"
      /(\d+(?:[.,]\d{2})?)\s*reais?/i, // "100 reais" ou "100,50 reais"
      /(\d+(?:[.,]\d{2})?)\s*r\$/i, // "100 R$"
      /\b(\d+(?:[.,]\d{2})?)\b/ // Qualquer número
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const value = parseFloat(match[1].replace(',', '.'));
        if (!isNaN(value) && value > 0) {
          return value;
        }
      }
    }
    
    return null;
  }

  /**
   * Normalizar categoria
   * @param {string} categoria - Categoria original
   * @returns {string} - Categoria normalizada
   */
  static normalizeCategory(categoria) {
    if (!categoria) return 'outros';
    
    const categoryMap = {
      'comida': 'alimentacao',
      'food': 'alimentacao',
      'mercado': 'supermercado',
      'market': 'supermercado',
      'diversao': 'lazer',
      'entertainment': 'lazer',
      'medicina': 'saude',
      'health': 'saude',
      'transport': 'transporte',
      'clothes': 'roupas',
      'roupa': 'roupas',
      'home': 'casa',
      'house': 'casa',
      'tech': 'tecnologia',
      'technology': 'tecnologia',
      'education': 'educacao',
      'ensino': 'educacao',
      'service': 'servicos',
      'servico': 'servicos'
    };
    
    const normalized = categoria.toLowerCase().trim();
    return categoryMap[normalized] || normalized;
  }

  /**
   * Extrair informações de produto
   * @param {string} description - Descrição da transação
   * @returns {Object} - Informações do produto
   */
  static extractProductInfo(description) {
    if (!description) {
      return { hasProduct: false };
    }
    
    // Padrões para detectar produtos específicos
    const productPatterns = [
      /comprei\s+(.+?)(?:\s+por|\s+de|$)/i,
      /compra\s+(?:de\s+)?(.+?)(?:\s+por|\s+de|$)/i,
      /gastei\s+.+?\s+(?:com|em|no|na)\s+(.+?)(?:\s+por|\s+de|$)/i
    ];
    
    for (const pattern of productPatterns) {
      const match = description.match(pattern);
      if (match && match[1]) {
        const productName = match[1].trim();
        if (productName.length > 2) { // Evitar matches muito curtos
          return {
            hasProduct: true,
            name: productName,
            description: description
          };
        }
      }
    }
    
    return { hasProduct: false };
  }

  /**
   * Limpar e normalizar texto
   * @param {string} text - Texto a ser limpo
   * @returns {string} - Texto limpo
   */
  static cleanText(text) {
    if (!text) return '';
    
    return text
      .trim()
      .replace(/\s+/g, ' ') // Múltiplos espaços para um
      .replace(/[^\w\s.,!?-]/g, '') // Remove caracteres especiais
      .substring(0, 500); // Limita tamanho
  }

  /**
   * Extrair contexto temporal
   * @param {string} text - Texto da mensagem
   * @returns {Object} - Informações temporais
   */
  static extractTimeContext(text) {
    if (!text) {
      return { period: 'hoje', date: new Date() };
    }
    
    const timePatterns = {
      'hoje': /\b(hoje|agora|neste momento)\b/i,
      'ontem': /\b(ontem|yesterday)\b/i,
      'anteontem': /\b(anteontem|antes de ontem)\b/i,
      'semana': /\b(esta semana|nesta semana|semana passada)\b/i,
      'mes': /\b(este mês|neste mês|mês passado)\b/i
    };
    
    for (const [period, pattern] of Object.entries(timePatterns)) {
      if (pattern.test(text)) {
        return {
          period,
          date: this.parseDate(period)
        };
      }
    }
    
    return {
      period: 'hoje',
      date: new Date()
    };
  }
}

module.exports = DataParser;