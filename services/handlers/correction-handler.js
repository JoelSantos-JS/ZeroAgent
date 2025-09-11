const BaseHandler = require('./base-handler');
const ResponseFormatter = require('../formatters/response-formatter');
const TransactionValidator = require('../validators/transaction-validator');

/**
 * Handler para correções de transações
 * Mantém contexto conversacional para permitir correções fluidas
 */
class CorrectionHandler extends BaseHandler {
  constructor(databaseService, userService) {
    super(databaseService, userService);
    
    // Mapa de correções pendentes por usuário
    this.pendingCorrections = new Map();
    
    // Timeout para limpar correções antigas (5 minutos)
    this.correctionTimeout = 5 * 60 * 1000;
    
    // Mapeamento expandido de categorias
    this.categoryMappings = {
      // Casa e Utilitários
      'utilitarios': 'casa',
      'utilidades': 'casa',
      'casa': 'casa',
      'domestico': 'casa',
      'lar': 'casa',
      'residencia': 'casa',
      'moradia': 'casa',
      
      // Alimentação
      'comida': 'alimentacao',
      'food': 'alimentacao',
      'restaurante': 'alimentacao',
      'lanche': 'alimentacao',
      'mercado': 'supermercado',
      'supermercado': 'supermercado',
      'grocery': 'supermercado',
      
      // Transporte
      'transporte': 'transporte',
      'uber': 'transporte',
      'taxi': 'transporte',
      'onibus': 'transporte',
      'metro': 'transporte',
      'gasolina': 'transporte',
      'combustivel': 'transporte',
      
      // Lazer
      'lazer': 'lazer',
      'diversao': 'lazer',
      'entretenimento': 'lazer',
      'cinema': 'lazer',
      'show': 'lazer',
      'festa': 'lazer',
      
      // Roupas
      'roupas': 'roupas',
      'roupa': 'roupas',
      'vestuario': 'roupas',
      'calcado': 'roupas',
      'sapato': 'roupas',
      
      // Saúde
      'saude': 'saude',
      'medico': 'saude',
      'farmacia': 'saude',
      'remedio': 'saude',
      'hospital': 'saude',
      
      // Educação
      'educacao': 'educacao',
      'escola': 'educacao',
      'curso': 'educacao',
      'livro': 'educacao',
      'material': 'educacao',
      
      // Tecnologia
      'tecnologia': 'tecnologia',
      'tech': 'tecnologia',
      'celular': 'tecnologia',
      'computador': 'tecnologia',
      'software': 'tecnologia',
      
      // Serviços
      'servicos': 'servicos',
      'servico': 'servicos',
      'manutencao': 'servicos',
      'reparo': 'servicos',
      'consultoria': 'servicos',
      
      // Outros
      'outros': 'outros',
      'diverso': 'outros',
      'variado': 'outros'
    };
  }

  /**
   * Registrar correção pendente
   * @param {string} userId - ID do usuário
   * @param {Object} transactionData - Dados da transação original
   * @param {string} correctionType - Tipo de correção (categoria, valor, etc.)
   */
  setPendingCorrection(userId, transactionData, correctionType = 'categoria') {
    const correction = {
      transactionData,
      correctionType,
      timestamp: Date.now(),
      timeout: setTimeout(() => {
        this.pendingCorrections.delete(userId);
      }, this.correctionTimeout)
    };
    
    // Limpar timeout anterior se existir
    const existing = this.pendingCorrections.get(userId);
    if (existing?.timeout) {
      clearTimeout(existing.timeout);
    }
    
    this.pendingCorrections.set(userId, correction);
    
    console.log(`🔄 Correção pendente registrada para usuário ${userId}:`, {
      type: correctionType,
      originalData: transactionData
    });
  }

  /**
   * Obter correção pendente
   * @param {string} userId - ID do usuário
   * @returns {Object|null} - Dados da correção pendente
   */
  getPendingCorrection(userId) {
    return this.pendingCorrections.get(userId) || null;
  }

  /**
   * Limpar correção pendente
   * @param {string} userId - ID do usuário
   */
  clearPendingCorrection(userId) {
    const correction = this.pendingCorrections.get(userId);
    if (correction?.timeout) {
      clearTimeout(correction.timeout);
    }
    this.pendingCorrections.delete(userId);
  }

  /**
   * Mapear categoria baseada no input do usuário
   * @param {string} input - Input do usuário
   * @returns {string} - Categoria mapeada
   */
  mapCategory(input) {
    const normalized = input.toLowerCase().trim();
    
    // Buscar mapeamento direto
    if (this.categoryMappings[normalized]) {
      return this.categoryMappings[normalized];
    }
    
    // Buscar por palavras-chave
    for (const [key, category] of Object.entries(this.categoryMappings)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return category;
      }
    }
    
    // Retornar 'outros' se não encontrar
    return 'outros';
  }

  /**
   * Processar correção de categoria
   * @param {string} userId - ID do usuário
   * @param {string} newCategory - Nova categoria
   * @returns {Promise<string>} - Resposta formatada
   */
  async processCategoryCorrection(userId, newCategory) {
    try {
      const pending = this.getPendingCorrection(userId);
      if (!pending) {
        return '❌ Não há correção pendente. Por favor, registre uma nova transação.';
      }

      const { transactionData } = pending;
      const mappedCategory = this.mapCategory(newCategory);
      
      console.log(`🔄 Processando correção de categoria:`, {
        userId,
        original: transactionData.categoria,
        input: newCategory,
        mapped: mappedCategory
      });

      // Atualizar transação no banco de dados
      const updatedTransaction = await this.databaseService.updateTransaction(
        transactionData.id,
        { category: mappedCategory }
      );

      if (!updatedTransaction) {
        return '❌ Erro ao atualizar a transação. Tente novamente.';
      }

      // Limpar correção pendente
      this.clearPendingCorrection(userId);

      // Formatar resposta de sucesso
      return this.formatCorrectionSuccess(
        transactionData.categoria,
        mappedCategory,
        transactionData.valor,
        newCategory
      );

    } catch (error) {
      console.error('❌ Erro ao processar correção de categoria:', error);
      this.clearPendingCorrection(userId);
      return '❌ Erro interno. Tente registrar a transação novamente.';
    }
  }

  /**
   * Formatar resposta de correção bem-sucedida
   * @param {string} oldCategory - Categoria anterior
   * @param {string} newCategory - Nova categoria
   * @param {number} amount - Valor da transação
   * @param {string} userInput - Input original do usuário
   * @returns {string} - Resposta formatada
   */
  formatCorrectionSuccess(oldCategory, newCategory, amount, userInput) {
    const oldFormatted = ResponseFormatter.formatCategory(oldCategory);
    const newFormatted = ResponseFormatter.formatCategory(newCategory);
    const amountFormatted = ResponseFormatter.formatCurrency(amount);
    
    return `✅ **Categoria corrigida com sucesso!**\n\n` +
           `📝 **Antes:** ${oldFormatted}\n` +
           `🎯 **Agora:** ${newFormatted}\n` +
           `💰 **Valor:** ${amountFormatted}\n\n` +
           `🤖 **Zero** entendeu: "${userInput}" = ${newFormatted}`;
  }

  /**
   * Detectar se mensagem é uma correção
   * @param {Object} analysisResult - Resultado da análise do Gemini
   * @param {string} userId - ID do usuário
   * @returns {boolean} - True se for correção
   */
  isCorrection(analysisResult, userId) {
    const { descricao, valor, intencao } = analysisResult;
    const hasPendingCorrection = this.pendingCorrections.has(userId);
    
    // Se não há correção pendente, não é correção
    if (!hasPendingCorrection) {
      return false;
    }
    
    // Palavras-chave explícitas de correção
    const explicitCorrectionKeywords = [
      'foi', 'era', 'na verdade', 'correto', 'certo', 'errado',
      'mudança', 'mudar', 'alterar', 'corrigir', 'correção',
      'não é', 'nao é', 'não era', 'nao era'
    ];
    
    const text = descricao?.toLowerCase() || '';
    const hasExplicitKeyword = explicitCorrectionKeywords.some(keyword => text.includes(keyword));
    
    // Verificar se é uma categoria simples (uma palavra só) com valor baixo
    const isSingleWord = text.trim().split(' ').length === 1;
    const hasLowValue = valor === 0 || !valor;
    const isCategory = this.mapCategory(text) !== null;
    
    // É correção se:
    // 1. Tem palavra-chave explícita de correção OU
    // 2. É uma única palavra que mapeia para categoria E tem valor baixo/zero
    return hasExplicitKeyword || (isSingleWord && isCategory && hasLowValue);
  }

  /**
   * Processar mensagem de correção
   * @param {string} userId - ID do usuário
   * @param {Object} analysisResult - Resultado da análise
   * @returns {Promise<string>} - Resposta formatada
   */
  async process(userId, analysisResult) {
    try {
      if (!this.isCorrection(analysisResult, userId)) {
        return null; // Não é correção, deixar outros handlers processarem
      }

      const { descricao } = analysisResult;
      
      // Extrair categoria da descrição
      const categoryMatch = this.extractCategoryFromText(descricao);
      
      if (categoryMatch) {
        return await this.processCategoryCorrection(userId, categoryMatch);
      }
      
      // Se não conseguir extrair categoria, pedir esclarecimento
      return '🤔 **Não entendi a correção.**\n\n' +
             '💡 *Tente ser mais específico, por exemplo:*\n' +
             '• "Foi alimentação"\n' +
             '• "Era transporte"\n' +
             '• "Categoria casa"';
             
    } catch (error) {
      console.error('❌ Erro no CorrectionHandler:', error);
      return '❌ Erro ao processar correção. Tente novamente.';
    }
  }

  /**
   * Extrair categoria do texto
   * @param {string} text - Texto da mensagem
   * @returns {string|null} - Categoria extraída
   */
  extractCategoryFromText(text) {
    const normalized = text.toLowerCase();
    
    // Padrões de extração
    const patterns = [
      /foi\s+([a-záêçõ]+)/i,
      /era\s+([a-záêçõ]+)/i,
      /categoria\s+([a-záêçõ]+)/i,
      /é\s+([a-záêçõ]+)/i,
      /^([a-záêçõ]+)$/i // Palavra única
    ];
    
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    // Buscar por categorias conhecidas no texto
    for (const category of Object.keys(this.categoryMappings)) {
      if (normalized.includes(category)) {
        return category;
      }
    }
    
    return null;
  }

  /**
   * Limpar correções expiradas
   */
  cleanExpiredCorrections() {
    const now = Date.now();
    for (const [userId, correction] of this.pendingCorrections.entries()) {
      if (now - correction.timestamp > this.correctionTimeout) {
        this.clearPendingCorrection(userId);
      }
    }
  }

  /**
   * Obter estatísticas de correções
   * @returns {Object} - Estatísticas
   */
  getStats() {
    return {
      pendingCorrections: this.pendingCorrections.size,
      categoryMappings: Object.keys(this.categoryMappings).length
    };
  }
}

module.exports = CorrectionHandler;