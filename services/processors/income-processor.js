// Income Processor - Processamento de receitas
const databaseService = require('../../config/database');
const logger = require('../../utils/logger');
const moment = require('moment');

class IncomeProcessor {
  constructor() {
    this.name = 'IncomeProcessor';
  }

  // Processar transação de receita
  async processIncomeTransaction(userId, analysisResult) {
    try {
      const { valor, categoria, descricao, data, analise, dica } = analysisResult;
      
      // Processar data
      const transactionDate = this.parseDate(data);
      
      // Registrar receita no banco usando tabela revenues
      const transaction = await databaseService.createRevenue(
        userId,
        valor,
        categoria,
        descricao,
        transactionDate,
        'other'  // Source da receita
      );
      
      console.log('💰 Receita registrada:', transaction);
      
      // Gerar resposta mais humana e natural
      const categoriaFormatada = categoria ? categoria.charAt(0).toUpperCase() + categoria.slice(1) : 'Outros';
      
      // Mensagens mais naturais baseadas na categoria
      const mensagensCategoria = {
        'salario': 'Salário recebido! 💼',
        'freelance': 'Trabalho freelance registrado! 💻',
        'vendas': 'Venda realizada com sucesso! 💰',
        'bonus': 'Bônus recebido! 🎉',
        'investimento': 'Retorno de investimento! 📈',
        'outros': 'Receita registrada com sucesso! ✅'
      };
      
      const mensagemInicial = mensagensCategoria[categoria] || mensagensCategoria['outros'];
      
      let response = `${mensagemInicial}\n\n`;
      response += `💰 **R$ ${valor.toFixed(2)}** em ${categoriaFormatada}\n`;
      
      // Dicas personalizadas para receitas
      const dicasPersonalizadas = {
        'salario': 'Que tal separar uma parte para investimentos? 💡',
        'freelance': 'Considere guardar 20% para impostos! 📊',
        'vendas': 'Ótimo! Continue focando nas vendas! 🚀',
        'bonus': 'Uma boa oportunidade para investir ou quitar dívidas! 💪',
        'investimento': 'Seus investimentos estão dando retorno! Continue assim! 📈'
      };
      
      const dicaFinal = dica || dicasPersonalizadas[categoria] || 'Continue registrando suas receitas para ter controle total das finanças! 📈';
      response += `💡 ${dicaFinal}`;
      
      logger.info('Receita registrada', {
        userId,
        transactionId: transaction.id,
        value: valor,
        category: categoria
      });
      
      return response;
      
    } catch (error) {
      console.error('❌ Erro ao processar receita:', error);
      logger.error('Erro ao processar receita', {
        userId,
        analysisResult,
        error: error.message
      });
      
      return `❌ Erro ao registrar receita de R$ ${analysisResult.valor}. Tente novamente.`;
    }
  }

  // Processar data
  parseDate(dateString) {
    if (!dateString || dateString === 'hoje') {
      return new Date();
    }
    
    // Tentar parsear diferentes formatos
    const formats = [
      'DD/MM/YYYY',
      'DD-MM-YYYY',
      'YYYY-MM-DD',
      'DD/MM',
      'DD-MM'
    ];
    
    for (const format of formats) {
      const parsed = moment(dateString, format, true);
      if (parsed.isValid()) {
        return parsed.toDate();
      }
    }
    
    // Se não conseguir parsear, usar data atual
    return new Date();
  }

  // Validar dados de receita
  validateIncomeData(analysisResult) {
    const { valor, categoria } = analysisResult;
    
    if (!valor || valor <= 0) {
      throw new Error('Valor da receita deve ser maior que zero');
    }
    
    if (!categoria) {
      throw new Error('Categoria da receita é obrigatória');
    }
    
    return true;
  }

  // Categorias válidas para receitas
  getValidIncomeCategories() {
    return [
      'salario',
      'freelance',
      'vendas',
      'bonus',
      'investimento',
      'aluguel_recebido',
      'dividendos',
      'outros'
    ];
  }
}

module.exports = IncomeProcessor;