/**
 * Módulo de validadores para transações financeiras
 * Centraliza todas as validações de dados de entrada
 */

class TransactionValidator {
  /**
   * Validar dados básicos de transação
   * @param {Object} data - Dados da transação
   * @returns {Object} - Resultado da validação
   */
  static validateBasicTransaction(data) {
    const errors = [];
    
    // Validar valor
    if (!data.valor) {
      errors.push('Valor é obrigatório');
    } else if (typeof data.valor !== 'number' || data.valor <= 0) {
      errors.push('Valor deve ser um número maior que zero');
    } else if (data.valor > 1000000) {
      errors.push('Valor muito alto. Máximo permitido: R$ 1.000.000');
    }
    
    // Validar categoria
    if (!data.categoria) {
      errors.push('Categoria é obrigatória');
    } else if (typeof data.categoria !== 'string' || data.categoria.trim().length === 0) {
      errors.push('Categoria deve ser um texto válido');
    }
    
    // Validar descrição
    if (!data.descricao) {
      errors.push('Descrição é obrigatória');
    } else if (typeof data.descricao !== 'string' || data.descricao.trim().length === 0) {
      errors.push('Descrição deve ser um texto válido');
    } else if (data.descricao.length > 500) {
      errors.push('Descrição muito longa. Máximo: 500 caracteres');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validar dados de parcelamento
   * @param {Object} installmentData - Dados do parcelamento
   * @returns {Object} - Resultado da validação
   */
  static validateInstallmentData(installmentData) {
    const errors = [];
    
    // Validar valor total
    if (!installmentData.totalAmount || installmentData.totalAmount <= 0) {
      errors.push('Valor total deve ser maior que zero');
    }
    
    // Validar número de parcelas
    if (!installmentData.totalInstallments || installmentData.totalInstallments < 2) {
      errors.push('Número de parcelas deve ser pelo menos 2');
    } else if (installmentData.totalInstallments > 60) {
      errors.push('Número máximo de parcelas: 60');
    }
    
    // Validar parcela atual
    if (!installmentData.currentInstallment || installmentData.currentInstallment < 1) {
      errors.push('Parcela atual deve ser pelo menos 1');
    } else if (installmentData.currentInstallment > installmentData.totalInstallments) {
      errors.push('Parcela atual não pode ser maior que o total de parcelas');
    }
    
    // Validar valor da parcela
    if (!installmentData.installmentAmount || installmentData.installmentAmount <= 0) {
      errors.push('Valor da parcela deve ser maior que zero');
    } else {
      // Verificar se o valor da parcela faz sentido
      const expectedAmount = installmentData.totalAmount / installmentData.totalInstallments;
      const tolerance = expectedAmount * 0.1; // 10% de tolerância
      
      if (Math.abs(installmentData.installmentAmount - expectedAmount) > tolerance) {
        errors.push('Valor da parcela não confere com o total dividido pelo número de parcelas');
      }
    }
    
    // Validar valor mínimo da parcela
    if (installmentData.installmentAmount && installmentData.installmentAmount < 5) {
      errors.push('Valor mínimo da parcela: R$ 5,00');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validar categoria específica
   * @param {string} categoria - Categoria a ser validada
   * @param {string} type - Tipo da transação (expense, income, investment)
   * @returns {Object} - Resultado da validação
   */
  static validateCategory(categoria, type) {
    const validCategories = {
      expense: [
        'alimentacao', 'transporte', 'supermercado', 'lazer', 'saude',
        'casa', 'roupas', 'educacao', 'tecnologia', 'servicos', 'outros'
      ],
      income: [
        'salario', 'freelance', 'vendas', 'bonus', 'investimento',
        'jogos', 'presente', 'outros'
      ],
      investment: [
        'acoes', 'fundos', 'renda_fixa', 'criptomoedas', 'imoveis',
        'tesouro', 'cdb', 'outros'
      ]
    };
    
    const errors = [];
    
    if (!validCategories[type]) {
      errors.push('Tipo de transação inválido');
    } else if (!validCategories[type].includes(categoria.toLowerCase())) {
      errors.push(`Categoria '${categoria}' não é válida para ${type}`);
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      validCategories: validCategories[type] || []
    };
  }

  /**
   * Validar formato de email
   * @param {string} email - Email a ser validado
   * @returns {Object} - Resultado da validação
   */
  static validateEmail(email) {
    const errors = [];
    
    if (!email) {
      errors.push('Email é obrigatório');
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push('Formato de email inválido');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validar senha
   * @param {string} password - Senha a ser validada
   * @returns {Object} - Resultado da validação
   */
  static validatePassword(password) {
    const errors = [];
    
    if (!password) {
      errors.push('Senha é obrigatória');
    } else {
      if (password.length < 6) {
        errors.push('Senha deve ter pelo menos 6 caracteres');
      }
      if (password.length > 50) {
        errors.push('Senha muito longa. Máximo: 50 caracteres');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validar data de transação
   * @param {string|Date} date - Data a ser validada
   * @returns {Object} - Resultado da validação
   */
  static validateTransactionDate(date) {
    const errors = [];
    
    if (!date) {
      // Data é opcional, usar hoje como padrão
      return { isValid: true, errors: [], parsedDate: new Date() };
    }
    
    let parsedDate;
    
    if (date instanceof Date) {
      parsedDate = date;
    } else {
      const moment = require('moment');
      parsedDate = moment(date, ['DD/MM/YYYY', 'DD/MM', 'YYYY-MM-DD'], true);
      
      if (!parsedDate.isValid()) {
        errors.push('Formato de data inválido. Use DD/MM/YYYY');
        return { isValid: false, errors };
      }
      
      parsedDate = parsedDate.toDate();
    }
    
    // Validar se a data não é muito no futuro (máximo 1 ano)
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    
    if (parsedDate > oneYearFromNow) {
      errors.push('Data não pode ser mais de 1 ano no futuro');
    }
    
    // Validar se a data não é muito no passado (máximo 10 anos)
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    
    if (parsedDate < tenYearsAgo) {
      errors.push('Data não pode ser mais de 10 anos no passado');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      parsedDate
    };
  }
}

module.exports = TransactionValidator;