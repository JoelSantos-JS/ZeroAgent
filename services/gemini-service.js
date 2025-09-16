const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');
const { FINANCIAL_ANALYST_PROMPT, CATEGORIES, RESPONSE_TEMPLATES } = require('../prompts/financial-analyst-prompt');
const ImageProcessor = require('./image-processor');
require('dotenv').config();

class GeminiService {
  constructor() {
    this.genAI = null;
    this.model = null;
    this.visionModel = null;
    this.imageProcessor = null;
    this.isInitialized = false;
    this.offlineMode = false;
    this.currentKeyIndex = 0;
    
    // Configurar chaves API (pode ser uma ou múltiplas)
    this.apiKeys = [];
    if (process.env.GEMINI_API_KEY) {
      this.apiKeys.push(process.env.GEMINI_API_KEY);
    }
    
    // Configurações de áudio
    this.audioConfig = {
      supportedFormats: {
        'audio/mp3': { extension: 'mp3', maxSize: 40 * 1024 * 1024 },
        'audio/wav': { extension: 'wav', maxSize: 40 * 1024 * 1024 },
        'audio/flac': { extension: 'flac', maxSize: 40 * 1024 * 1024 },
        'audio/ogg': { extension: 'ogg', maxSize: 40 * 1024 * 1024 },
        'audio/m4a': { extension: 'm4a', maxSize: 40 * 1024 * 1024 }
      },
      limits: {
        maxFileSize: 40 * 1024 * 1024, // 40MB
        maxDuration: 9.5 * 60 * 60,    // 9.5 horas em segundos
        tokensPerSecond: 32,           // 32 tokens por segundo
        maxTotalDuration: 9.5 * 60 * 60 // Duração máxima total por prompt
      },
      optimization: {
        recommendedSpeed: 1.5,         // Velocidade recomendada para economia
        recommendedBitrate: '128k',    // Bitrate recomendado
        recommendedSampleRate: 16000,  // Sample rate para voz
        recommendedFormat: 'mp3'       // Formato recomendado
      }
    };
    
    if (this.apiKeys.length === 0) {
      console.warn('⚠️ GEMINI_API_KEY não encontrada nas variáveis de ambiente');
    }
  }

  // Inicializar o serviço Gemini
  async initialize() {
    try {
      console.log('🤖 Inicializando Gemini AI...');
      
      // Recarregar variáveis de ambiente
      require('dotenv').config();
      
      // Reconfigurar chaves API
      this.apiKeys = [];
      if (process.env.GEMINI_API_KEY) {
        this.apiKeys.push(process.env.GEMINI_API_KEY);
        console.log('🔑 Chave API Gemini encontrada!');
      }
      
      if (this.apiKeys.length === 0) {
        console.warn('⚠️ Nenhuma chave API encontrada, usando modo offline');
        this.offlineMode = true;
        this.isInitialized = true;
        logger.info('Gemini AI inicializado em modo offline (sem chave API)');
        return;
      }
      
      // Tentar inicializar com as chaves disponíveis
      for (let i = 0; i < this.apiKeys.length; i++) {
        try {
          console.log(`🔑 Tentando chave API ${i + 1}/${this.apiKeys.length}...`);
          
          this.genAI = new GoogleGenerativeAI(this.apiKeys[i]);
          this.model = this.genAI.getGenerativeModel({ 
            model: 'gemini-1.5-flash',
            generationConfig: {
              temperature: 0.7,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 1024
            }
          });
          
          // Inicializar modelo de visão
          this.visionModel = this.genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            generationConfig: {
              temperature: 0.3,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 1024
            }
          });
          
          // Inicializar processador de imagem
          this.imageProcessor = new ImageProcessor(null, this);
          await this.imageProcessor.initialize();
          
          // Testar conexão
          await this.testConnection();
          
          this.currentKeyIndex = i;
          this.offlineMode = false;
          this.isInitialized = true;
          
          console.log(`✅ Gemini AI inicializado com chave ${i + 1}!`);
          logger.info(`Gemini AI inicializado com chave ${i + 1}`);
          return;
          
        } catch (error) {
          console.log(`❌ Chave ${i + 1} falhou: ${error.message}`);
          if (i === this.apiKeys.length - 1) {
            console.warn('⚠️ Todas as chaves falharam, usando modo offline');
            this.offlineMode = true;
            this.isInitialized = true;
            logger.info('Gemini AI inicializado em modo offline (fallback)');
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Erro ao inicializar Gemini AI:', error);
      this.offlineMode = true;
      this.isInitialized = true;
      logger.info('Gemini AI inicializado em modo offline (erro)');
    }
  }

  // Testar conexão com a API
  async testConnection() {
    try {
      const prompt = 'Teste de conexão. Responda apenas: OK';
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      if (text.toLowerCase().includes('ok')) {
        console.log('✅ Conexão com Gemini AI testada com sucesso');
      } else {
        console.log('⚠️ Resposta inesperada do Gemini:', text);
      }
    } catch (error) {
      throw new Error('Falha no teste de conexão com Gemini: ' + error.message);
    }
  }

  /**
   * Processar imagem de produto para reconhecimento
   * @param {Buffer} imageBuffer - Buffer da imagem
   * @param {Object} userContext - Contexto do usuário
   * @returns {Promise<Object>} - Resultado do reconhecimento
   */
  async processProductImage(imageBuffer, userContext = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (this.offlineMode) {
      return this.getOfflineImageAnalysis(imageBuffer);
    }
    
    try {
      console.log('📸 Processando imagem de produto com Gemini Vision...');
      
      // Usar o image processor para análise
       const result = await this.imageProcessor.processImage(imageBuffer, {
         userContext,
         userId: userContext.userId,
         databaseService: userContext.databaseService
       });
      
      if (result.success) {
        logger.info('Imagem processada com sucesso', {
          produto: result.productData.produto_nome,
          confianca: result.productData.confianca,
          processingTime: result.processingTime
        });
        
        return result.productData;
      } else {
        throw new Error(result.error || 'Falha no processamento da imagem');
      }
      
    } catch (error) {
      console.error('❌ Erro ao processar imagem:', error);
      logger.error('Erro no processamento de imagem', {
        error: error.message,
        userId: userContext.userId
      });
      
      // Tentar próxima chave API se disponível
      if (error.message.includes('API') && this.apiKeys.length > 1) {
        const switched = await this.tryNextApiKey();
        if (switched) {
          return this.processProductImage(imageBuffer, userContext);
        }
      }
      
      // Fallback para análise offline
      return this.getOfflineImageAnalysis(imageBuffer);
    }
  }

  /**
   * Análise offline de imagem (fallback)
   * @param {Buffer} imageBuffer - Buffer da imagem
   * @returns {Object} - Resultado básico da análise
   */
  getOfflineImageAnalysis(imageBuffer) {
    console.log('🔄 Processando imagem em modo offline...');
    
    return {
      tipo: 'produto',
      valor: 0,
      categoria: 'outros',
      descricao: 'Produto identificado por imagem (modo offline)',
      data: 'hoje',
      intencao: 'registrar_produto',
      confianca: 0.3,
      analise: 'Análise básica - modo offline',
      dica: 'Para melhor reconhecimento, conecte-se à internet',
      produto_nome: 'Produto não identificado',
      produto_categoria: 'outros',
      produto_preco_estimado: null,
      fonte: 'offline_analysis'
    };
  }

  // Processar mensagem financeira
  async processFinancialMessage(message, userContext = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Verificar se está em modo offline
      if (this.offlineMode) {
        console.log('🔄 Processando mensagem em modo offline:', message);
        const parsedResponse = this.getEnhancedOfflineAnalysis(message, userContext);
        
        logger.info('Mensagem processada em modo offline', {
          originalMessage: message,
          parsedResponse
        });
        
        return parsedResponse;
      }

      // Tentar usar Gemini AI online com fallback inteligente
      try {
        console.log('🧠 Processando mensagem com Gemini AI:', message);
        
        const prompt = this.buildFinancialPrompt(message, userContext);
        
        // Timeout para evitar espera excessiva
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 10000)
        );
        
        const result = await Promise.race([
          this.model.generateContent(prompt),
          timeoutPromise
        ]);
        
        const response = result.response;
        const text = response.text();
        
        // Parse da resposta JSON
        const parsedResponse = this.parseFinancialResponse(text);
        
        logger.info('Mensagem processada pelo Gemini', {
          originalMessage: message,
          parsedResponse
        });
        
        return parsedResponse;
        
      } catch (error) {
        console.warn('⚠️ Gemini falhou, usando modo offline:', error.message);
        
        // Verificar se é erro de quota e tentar próxima chave
        if (error.message.includes('quota') || error.message.includes('429')) {
          await this.tryNextApiKey();
        }
        
        // Fallback para modo offline com análise melhorada
        const parsedResponse = this.getEnhancedOfflineAnalysis(message, userContext);
        
        logger.info('Fallback para modo offline', {
          originalMessage: message,
          error: error.message,
          fallbackUsed: true
        });
        
        return parsedResponse;
      }
      
    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error);
      logger.error('Erro no processamento', { message, error: error.message });
      throw error;
    }
  }

  // Tentar próxima chave API em caso de falha
  async tryNextApiKey() {
    if (!this.apiKeys || this.apiKeys.length <= 1) {
      console.log('⚠️ Não há chaves API alternativas disponíveis');
      this.offlineMode = true;
      return;
    }

    const nextIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    
    try {
      console.log(`🔄 Tentando chave API alternativa ${nextIndex + 1}...`);
      
      this.genAI = new GoogleGenerativeAI(this.apiKeys[nextIndex]);
      this.model = this.genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024
        }
      });
      
      await this.testConnection();
      
      this.currentKeyIndex = nextIndex;
      this.offlineMode = false;
      
      console.log(`✅ Chave API ${nextIndex + 1} ativada com sucesso!`);
      
    } catch (error) {
      console.log(`❌ Chave ${nextIndex + 1} também falhou: ${error.message}`);
      this.offlineMode = true;
    }
  }

  // Análise offline melhorada com contexto
  getEnhancedOfflineAnalysis(message, userContext = {}) {
    const analysis = this.getOfflineAnalysis(message);
    
    // Melhorar análise com contexto do usuário
    if (userContext.recentTransactions) {
      const recentCategories = userContext.recentTransactions.map(t => t.categoria);
      const mostUsedCategory = this.getMostFrequentCategory(recentCategories);
      
      if (analysis.categoria === 'outros' && mostUsedCategory) {
        analysis.categoria = mostUsedCategory;
        analysis.confianca += 0.1;
        analysis.analise += ` (Baseado no histórico recente: ${mostUsedCategory})`;
      }
    }
    
    // Adicionar dicas contextuais
    if (analysis.tipo === 'despesa_variavel' && analysis.valor > 100) {
      analysis.dica = 'Gasto alto detectado! Considere revisar seu orçamento para esta categoria.';
    } else if (analysis.tipo === 'receita') {
      analysis.dica = 'Ótimo! Lembre-se de separar uma parte para investimentos.';
    }
    
    return analysis;
  }

  // Encontrar categoria mais frequente
  getMostFrequentCategory(categories) {
    if (!categories || categories.length === 0) return null;
    
    const frequency = {};
    categories.forEach(cat => {
      frequency[cat] = (frequency[cat] || 0) + 1;
    });
    
    return Object.keys(frequency).reduce((a, b) => 
      frequency[a] > frequency[b] ? a : b
    );
  }

  // Análise offline baseada em palavras-chave
  getOfflineAnalysis(message) {
    const messageLower = message.toLowerCase();
    
    const analysis = {
      tipo: 'outros',
      valor: 0,
      categoria: 'outros',
      descricao: message,
      data: 'hoje',
      intencao: 'registrar',
      confianca: 0.7,
      analise: 'Análise baseada em palavras-chave',
      dica: 'Continue registrando suas transações para melhor controle financeiro',
      produto_nome: null
    };

    // =====================================
    // DETECTAR CONTEXTO: PESSOAL vs EMPRESARIAL
    // =====================================
    const isBusinessContext = this.detectBusinessContext(messageLower);
    const isPersonalContext = this.detectPersonalContext(messageLower);

    // Extrair valor
    const valorMatch = message.match(/\d+[.,]?\d*/g);
    if (valorMatch) {
      analysis.valor = parseFloat(valorMatch[0].replace(',', '.'));
    }

    // Primeiro verificar se é consulta (prioridade alta)
     if (messageLower.includes('quanto') || messageLower.includes('quais') || messageLower.includes('relatório') || 
         messageLower.includes('consulta') || messageLower.includes('gastos') || messageLower.includes('receitas') ||
         messageLower.includes('saldo') || messageLower.includes('extrato') || messageLower.includes('resumo') ||
         messageLower.includes('meus gastos') || messageLower.includes('minhas receitas') || messageLower.includes('balanço') ||
         messageLower.includes('total') || messageLower.includes('gastei este mês') || messageLower.includes('gastei hoje') ||
         // Palavras contextuais que indicam consulta
         messageLower.includes('mostre') || messageLower.includes('detalhe') || messageLower.includes('cada') ||
         messageLower.includes('lista') || messageLower.includes('veja') || messageLower.includes('exiba') ||
         messageLower.includes('me fale') || messageLower.includes('conte') || messageLower.includes('explique') ||
         messageLower.includes('me diga') || messageLower.includes('mostra') || messageLower.includes('apresente') ||
         messageLower.includes('discrimine') || messageLower.includes('especifique') || messageLower.includes('detalha')) {
       analysis.tipo = 'consulta';
       analysis.intencao = 'consultar_gastos';
       analysis.categoria = 'consulta';
       analysis.confianca = 0.95;
       analysis.dica = 'Vou buscar seus dados financeiros para você!';
     }
     // Identificar receitas (com contexto pessoal/empresarial)
     else if (messageLower.includes('recebi') || messageLower.includes('ganhei') || messageLower.includes('salário') || 
              messageLower.includes('renda') || messageLower.includes('bonus') || messageLower.includes('bônus') ||
              messageLower.includes('freelance') || messageLower.includes('vendi') || messageLower.includes('venda') ||
              messageLower.includes('lucro') || messageLower.includes('rendimento') || messageLower.includes('entrada') ||
              messageLower.includes('recebimento') || messageLower.includes('pagamento recebido') || 
              messageLower.includes('dinheiro que recebi') || messageLower.includes('dinheiro que ganhei')) {
       
       // Determinar se é receita pessoal ou empresarial
       if (isBusinessContext || (messageLower.includes('vendi') || messageLower.includes('venda') || messageLower.includes('vendas'))) {
         analysis.tipo = 'receita'; // Empresarial
         
         // Categorias empresariais
         if (messageLower.includes('vendi') || messageLower.includes('venda') || messageLower.includes('vendas')) {
           analysis.categoria = 'vendas';
         } else if (messageLower.includes('comissão') || messageLower.includes('comissao')) {
           analysis.categoria = 'comissao';
         } else {
           analysis.categoria = 'outros';
         }
       } else {
         analysis.tipo = 'receita_pessoal'; // Pessoal
         
         // Categorias pessoais (usando padrão do sistema pessoal)
         if (messageLower.includes('salário') || messageLower.includes('salario')) {
           analysis.categoria = 'salary';
         } else if (messageLower.includes('freelance') || messageLower.includes('freela')) {
           analysis.categoria = 'freelance';
         } else if (messageLower.includes('bonus') || messageLower.includes('bônus')) {
           analysis.categoria = 'bonus';
         } else if (messageLower.includes('investimento') || messageLower.includes('rendimento') || messageLower.includes('dividendo')) {
           analysis.categoria = 'investment';
         } else if (messageLower.includes('aluguel')) {
           analysis.categoria = 'rental';
         } else {
           analysis.categoria = 'other';
         }
       }
       
       analysis.intencao = 'registrar_receita';
       analysis.confianca = 0.9;
     }
     // Identificar despesas (com contexto pessoal/empresarial)
     else if (messageLower.includes('aluguel') || messageLower.includes('financiamento') || messageLower.includes('prestação') ||
              messageLower.includes('seguro') || messageLower.includes('comida') || messageLower.includes('restaurante') ||
              messageLower.includes('supermercado') || messageLower.includes('uber') || messageLower.includes('gasolina') ||
              messageLower.includes('transporte') || messageLower.includes('cinema') || messageLower.includes('lazer') ||
              messageLower.includes('diversão') || messageLower.includes('marketing') || messageLower.includes('fornecedor')) {
       
       // Determinar se é despesa pessoal ou empresarial
       if (isBusinessContext) {
         // Despesas empresariais
         if (messageLower.includes('aluguel') && (messageLower.includes('loja') || messageLower.includes('escritório') || messageLower.includes('comercial'))) {
           analysis.tipo = 'despesa_fixa';
           analysis.categoria = 'aluguel';
         } else if (messageLower.includes('marketing') || messageLower.includes('publicidade')) {
           analysis.tipo = 'despesa_variavel';
           analysis.categoria = 'marketing';
         } else if (messageLower.includes('fornecedor')) {
           analysis.tipo = 'despesa_variavel';
           analysis.categoria = 'fornecedores';
         } else {
           analysis.tipo = 'despesa_variavel';
           analysis.categoria = 'outros';
         }
       } else {
         // Despesas pessoais (padrão para a maioria dos casos)
         analysis.tipo = 'gasto_pessoal';
         
         // Categorias pessoais
         if (messageLower.includes('aluguel') || messageLower.includes('financiamento') || messageLower.includes('prestação')) {
           analysis.categoria = 'housing';
         } else if (messageLower.includes('comida') || messageLower.includes('restaurante') || messageLower.includes('supermercado') ||
                   messageLower.includes('mercado') || messageLower.includes('lanche') || messageLower.includes('feira')) {
           analysis.categoria = 'food';
         } else if (messageLower.includes('uber') || messageLower.includes('taxi') || messageLower.includes('gasolina') ||
                   messageLower.includes('transporte') || messageLower.includes('ônibus') || messageLower.includes('metro')) {
           analysis.categoria = 'transportation';
         } else if (messageLower.includes('cinema') || messageLower.includes('lazer') || messageLower.includes('diversão') ||
                   messageLower.includes('teatro') || messageLower.includes('show')) {
           analysis.categoria = 'entertainment';
         } else if (messageLower.includes('roupa') || messageLower.includes('sapato') || messageLower.includes('vestuário')) {
           analysis.categoria = 'clothing';
         } else if (messageLower.includes('médico') || messageLower.includes('farmácia') || messageLower.includes('hospital')) {
           analysis.categoria = 'healthcare';
         } else {
           analysis.categoria = 'other';
         }
       }
       
       analysis.intencao = 'registrar_despesa';
     }
     // Identificar investimentos
     else if (messageLower.includes('investi') || messageLower.includes('aplicação') || messageLower.includes('poupança')) {
       analysis.tipo = 'investimento';
       analysis.categoria = 'aplicacao';
       analysis.intencao = 'registrar_investimento';
     }
     // Identificar despesas genéricas (com contexto)
     else if (messageLower.includes('gastei') || messageLower.includes('comprei') || messageLower.includes('paguei') ||
              messageLower.includes('gasto') || messageLower.includes('despesa') || messageLower.includes('saiu')) {
       
       // Determinar contexto para despesas genéricas
       if (isBusinessContext) {
         analysis.tipo = 'despesa_variavel'; // Empresarial
         analysis.categoria = 'outros';
       } else {
         analysis.tipo = 'gasto_pessoal'; // Pessoal (padrão)
         analysis.categoria = 'other';
       }
       
       analysis.intencao = 'registrar_despesa';
       analysis.confianca = 0.8;
     }
     
     // Garantir que categoria nunca seja undefined
     if (!analysis.categoria || analysis.categoria === 'undefined') {
       analysis.categoria = 'outros';
     }

    return analysis;
  }

  /**
   * Detectar se o contexto é empresarial
   */
  detectBusinessContext(messageLower) {
    const businessKeywords = [
      // Vendas e produtos
      'vendi', 'venda', 'vendas', 'produto', 'cliente', 'comprador',
      // Fornecedores e negócios
      'fornecedor', 'supplier', 'empresa', 'negócio', 'negocio',
      // Marketing e operações
      'marketing', 'publicidade', 'propaganda', 'anúncio', 'anuncio',
      // Locais comerciais
      'loja', 'escritório', 'escritorio', 'comercial', 'empresarial',
      // Termos específicos de negócio
      'lucro', 'receita da empresa', 'despesa da empresa', 'cnpj',
      'nota fiscal', 'faturamento', 'comissão', 'comissao'
    ];
    
    return businessKeywords.some(keyword => messageLower.includes(keyword));
  }

  /**
   * Detectar se o contexto é pessoal
   */
  detectPersonalContext(messageLower) {
    const personalKeywords = [
      // Vida pessoal
      'casa', 'família', 'familia', 'pessoal', 'meu', 'minha',
      // Alimentação pessoal
      'supermercado', 'mercado', 'feira', 'padaria', 'açougue', 'acougue',
      'restaurante', 'lanche', 'jantar', 'almoço', 'almoco', 'café', 'cafe',
      // Transporte pessoal
      'uber', 'taxi', '99', 'ônibus', 'onibus', 'metro', 'metrô',
      'gasolina do carro', 'combustível do carro', 'combustivel do carro',
      // Moradia pessoal
      'aluguel de casa', 'aluguel da casa', 'conta de luz', 'conta de água', 'conta de agua',
      'internet de casa', 'telefone pessoal',
      // Saúde e cuidados
      'médico', 'medico', 'farmácia', 'farmacia', 'remédio', 'remedio',
      'dentista', 'hospital', 'plano de saúde', 'plano de saude',
      // Lazer pessoal
      'cinema', 'teatro', 'show', 'festa', 'viagem pessoal',
      // Roupas e cuidados
      'roupa', 'sapato', 'cabelo', 'salão', 'salao', 'barbeiro'
    ];
    
    return personalKeywords.some(keyword => messageLower.includes(keyword));
  }

  // Construir prompt para análise financeira
  buildFinancialPrompt(message, userContext) {
    const contextInfo = userContext.recentTransactions ? 
      `\nHistórico recente do usuário: ${JSON.stringify(userContext.recentTransactions)}` : '';
    
    const currentDateTime = new Date().toLocaleString('pt-BR');
    
    return `${FINANCIAL_ANALYST_PROMPT}

=== ANÁLISE DE MENSAGEM ===

Data/Hora atual: ${currentDateTime}
Mensagem do usuário: "${message}"${contextInfo}

Como analista financeiro, analise esta mensagem e extraia as seguintes informações:

1. TIPO: "receita", "despesa_fixa", "despesa_variavel", "investimento", "consulta" ou "outros"
2. VALOR: valor numérico (apenas números, sem símbolos)
3. CATEGORIA: use as categorias predefinidas do sistema:
   - RECEITAS: ${CATEGORIES.RECEITAS.join(', ')}
   - DESPESAS_FIXAS: ${CATEGORIES.DESPESAS_FIXAS.join(', ')}
   - DESPESAS_VARIAVEIS: ${CATEGORIES.DESPESAS_VARIAVEIS.join(', ')}
   - INVESTIMENTOS: ${CATEGORIES.INVESTIMENTOS.join(', ')}
   - EMERGENCIA: ${CATEGORIES.EMERGENCIA.join(', ')}
4. DESCRIÇÃO: descrição detalhada da transação
5. DATA: data da transação (formato ISO ou "hoje", "ontem", etc.)
6. INTENÇÃO: o que o usuário quer fazer
7. ANÁLISE: breve análise do impacto financeiro
8. DICA: sugestão personalizada baseada no contexto

Regras importantes:
- Use sempre as categorias predefinidas do sistema
- Para receitas empresariais (vendas, comissões), use TIPO "receita"
- Para receitas pessoais (salário, freelance), use TIPO "receita_pessoal"
- Para gastos empresariais fixos (aluguel comercial, seguro empresarial), use TIPO "despesa_fixa"
- Para gastos empresariais variáveis (marketing, fornecedores), use TIPO "despesa_variavel"
- Para gastos pessoais (alimentação, moradia, transporte pessoal), use TIPO "gasto_pessoal"
- Para investimentos, use TIPO "investimento"
- Para consultas, use TIPO "consulta"
- VALOR deve ser apenas o número (ex: 50.00, não "R$ 50")
- Forneça análise e dicas como um consultor financeiro experiente

**IMPORTANTE**: Diferencie entre gastos empresariais e pessoais:
- Empresariais: relacionados ao negócio, vendas, produtos, fornecedores
- Pessoais: relacionados à vida pessoal, família, casa, alimentação pessoal

Exemplos:
**Empresariais:**
- "Vendi um produto por 200 reais" → TIPO: receita, CATEGORIA: vendas
- "Paguei o aluguel da loja de 1200 reais" → TIPO: despesa_fixa, CATEGORIA: aluguel
- "Gastei 300 reais em marketing" → TIPO: despesa_variavel, CATEGORIA: marketing

**Pessoais:**
- "Recebi meu salário de 5000 reais" → TIPO: receita_pessoal, CATEGORIA: salary
- "Paguei o aluguel de casa de 800 reais" → TIPO: gasto_pessoal, CATEGORIA: housing
- "Gastei 80 reais no supermercado" → TIPO: gasto_pessoal, CATEGORIA: food
- "Paguei 50 reais de uber" → TIPO: gasto_pessoal, CATEGORIA: transportation

**Outros:**
- "Investi 500 reais na poupança" → TIPO: investimento, CATEGORIA: aplicacao
- "Quanto gastei este mês?" → TIPO: consulta, INTENÇÃO: consultar_gastos_mes

Responda APENAS com um JSON válido no seguinte formato:
{
  "tipo": "receita|receita_pessoal|despesa_fixa|despesa_variavel|gasto_pessoal|investimento|consulta|outros",
  "valor": 0.00,
  "categoria": "categoria_do_sistema",
  "descricao": "descrição detalhada",
  "data": "data_identificada",
  "intencao": "acao_solicitada",
  "confianca": 0.95,
  "analise": "breve análise do impacto",
  "dica": "sugestão personalizada",
  "produto_nome": "nome_do_produto_se_aplicavel",
  "metodo_pagamento": "cash|debit_card|credit_card|pix|bank_transfer",
  "fonte": "fonte_da_receita_se_aplicavel"
}
`;
  }

  // Parsear resposta do Gemini
  parseFinancialResponse(text) {
    try {
      // Limpar texto e extrair JSON
      let cleanText = text.trim();
      
      // Remover markdown se presente
      cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      // Tentar parsear JSON
      const parsed = JSON.parse(cleanText);
      
      // Validar estrutura
      const validated = {
        tipo: parsed.tipo || 'outros',
        valor: parseFloat(parsed.valor) || 0,
        categoria: parsed.categoria || 'outros',
        descricao: parsed.descricao || '',
        data: parsed.data || 'hoje',
        intencao: parsed.intencao || 'registrar',
        confianca: parseFloat(parsed.confianca) || 0.5,
        analise: parsed.analise || '',
        dica: parsed.dica || '',
        produto_nome: parsed.produto_nome || null
      };
      
      return validated;
      
    } catch (error) {
      console.error('❌ Erro ao parsear resposta do Gemini:', error);
      console.log('Texto recebido:', text);
      
      // Fallback: tentar extrair informações básicas
      return this.fallbackParsing(text);
    }
  }

  // Parsing de fallback quando JSON falha
  fallbackParsing(text) {
    console.log('🔄 Usando parsing de fallback...');
    
    const fallback = {
      tipo: 'outros',
      valor: 0,
      categoria: 'outros',
      descricao: text,
      data: 'hoje',
      intencao: 'registrar',
      confianca: 0.3,
      produto_nome: null
    };
    
    // Tentar extrair valor
    const valorMatch = text.match(/\d+[.,]?\d*/g);
    if (valorMatch) {
      fallback.valor = parseFloat(valorMatch[0].replace(',', '.'));
    }
    
    // Tentar identificar tipo
    if (text.toLowerCase().includes('recebi') || text.toLowerCase().includes('salário') || text.toLowerCase().includes('renda')) {
      fallback.tipo = 'receita';
    } else if (text.toLowerCase().includes('aluguel') || text.toLowerCase().includes('financiamento') || text.toLowerCase().includes('seguro')) {
      fallback.tipo = 'despesa_fixa';
    } else if (text.toLowerCase().includes('gastei') || text.toLowerCase().includes('comprei') || text.toLowerCase().includes('paguei')) {
      fallback.tipo = 'despesa_variavel';
    } else if (text.toLowerCase().includes('investi') || text.toLowerCase().includes('aplicação') || text.toLowerCase().includes('investimento')) {
      fallback.tipo = 'investimento';
    } else if (text.toLowerCase().includes('quanto') || text.toLowerCase().includes('mostre') || text.toLowerCase().includes('relatório')) {
      fallback.tipo = 'consulta';
    }
    
    // Tentar identificar categoria usando as categorias do sistema
    const categorias = {
      // Receitas
      'salario': ['salário', 'salario', 'ordenado'],
      'freelance': ['freelance', 'freela', 'trabalho extra'],
      'vendas': ['venda', 'vendas', 'comissão'],
      
      // Despesas Fixas
      'aluguel': ['aluguel', 'aluguer', 'rent'],
      'financiamento': ['financiamento', 'prestação', 'parcela'],
      'seguro': ['seguro', 'seguros'],
      'assinatura': ['assinatura', 'mensalidade', 'netflix', 'spotify'],
      
      // Despesas Variáveis
      'alimentacao': ['comida', 'restaurante', 'lanche', 'alimentação', 'supermercado', 'mercado'],
      'transporte': ['uber', 'taxi', 'ônibus', 'gasolina', 'combustível', 'transporte'],
      'lazer': ['cinema', 'teatro', 'lazer', 'diversão', 'festa'],
      'roupas': ['roupa', 'roupas', 'vestuário', 'calça', 'camisa'],
      'casa': ['casa', 'móveis', 'decoração', 'limpeza'],
      
      // Investimentos
      'aplicacao': ['aplicação', 'poupança', 'cdb', 'tesouro'],
      'acoes': ['ações', 'ação', 'bolsa', 'stocks'],
      'fundos': ['fundo', 'fundos', 'fii'],
      
      // Emergência
      'medico': ['médico', 'hospital', 'farmácia', 'saúde'],
      'reparo': ['reparo', 'conserto', 'manutenção']
    };
    
    for (const [categoria, palavras] of Object.entries(categorias)) {
      if (palavras.some(palavra => text.toLowerCase().includes(palavra))) {
        fallback.categoria = categoria;
        break;
      }
    }
    
    return fallback;
  }

  // Gerar resposta personalizada
  async generatePersonalizedResponse(transactionData, userHistory = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const prompt = this.buildResponsePrompt(transactionData, userHistory);
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      logger.info('Resposta personalizada gerada', {
        transactionData,
        response: text
      });
      
      return text.trim();
      
    } catch (error) {
      console.error('❌ Erro ao gerar resposta personalizada:', error);
      logger.error('Erro na geração de resposta', { error: error.message });
      
      // Resposta de fallback
      return this.generateFallbackResponse(transactionData);
    }
  }

  // Construir prompt para resposta personalizada
  buildResponsePrompt(transactionData, userHistory) {
    const historyInfo = userHistory.monthlyTotal ? 
      `Total gasto este mês: R$ ${userHistory.monthlyTotal}` : '';
    
    const categoryInfo = userHistory.categoryTotal ? 
      `Total na categoria ${transactionData.categoria}: R$ ${userHistory.categoryTotal}` : '';
    
    return `
Você é o Zero, um assistente financeiro amigável e prestativo. Gere uma resposta personalizada para o usuário baseada na transação registrada.

Dados da transação:
- Tipo: ${transactionData.tipo}
- Valor: R$ ${transactionData.valor}
- Categoria: ${transactionData.categoria}
- Descrição: ${transactionData.descricao}

Contexto do usuário:
${historyInfo}
${categoryInfo}

Regras para a resposta:
1. Seja amigável e positivo
2. Confirme o registro da transação
3. Se relevante, mencione o contexto (total mensal, categoria, etc.)
4. Mantenha a resposta concisa (máximo 2 frases)
5. Use emojis apropriados
6. Se for uma consulta, forneça a informação solicitada

Exemplos:
- "✅ Seu gasto de R$ 50,00 no supermercado foi registrado! Você já gastou R$ 300 este mês."
- "🛒 Produto registrado: celular por R$ 800,00. Boa compra!"
- "📊 Este mês você gastou R$ 450 em alimentação."

Gere uma resposta personalizada:
`;
  }

  // Resposta de fallback
  generateFallbackResponse(transactionData) {
    const { tipo, valor, categoria } = transactionData;
    
    switch (tipo) {
      case 'gasto':
        return `✅ Seu gasto de R$ ${valor.toFixed(2)} em ${categoria} foi registrado com sucesso!`;
      case 'produto':
        return `🛒 Produto registrado: ${transactionData.produto_nome || 'item'} por R$ ${valor.toFixed(2)}!`;
      case 'consulta':
        return `📊 Consultando suas informações financeiras...`;
      default:
        return `✅ Informação registrada com sucesso!`;
    }
  }

  // Processar consulta financeira
  async processFinancialQuery(queryType, userId, params = {}) {
    try {
      const prompt = this.buildQueryPrompt(queryType, params);
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      return text.trim();
      
    } catch (error) {
      console.error('❌ Erro ao processar consulta:', error);
      return 'Desculpe, não consegui processar sua consulta no momento.';
    }
  }

  // Construir prompt para consultas
  buildQueryPrompt(queryType, params) {
    return `
Você é o Zero, um assistente financeiro. O usuário fez uma consulta sobre suas finanças.

Tipo de consulta: ${queryType}
Parâmetros: ${JSON.stringify(params)}

Gere uma resposta clara e útil baseada nos dados fornecidos.
Use emojis apropriados e mantenha um tom amigável.
`;
  }

  // Verificar se o serviço está pronto
  isReady() {
    return this.isInitialized && this.model !== null;
  }

  // Obter status do serviço
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      offlineMode: this.offlineMode,
      hasApiKey: this.apiKeys.length > 0,
      currentKeyIndex: this.currentKeyIndex,
      audioConfig: this.audioConfig
    };
  }

  // Validar formato de áudio
  validateAudioFormat(mimeType) {
    return this.audioConfig.supportedFormats.hasOwnProperty(mimeType);
  }

  // Validar tamanho de arquivo de áudio
  validateAudioSize(fileSize, mimeType = null) {
    const maxSize = mimeType && this.audioConfig.supportedFormats[mimeType] 
      ? this.audioConfig.supportedFormats[mimeType].maxSize 
      : this.audioConfig.limits.maxFileSize;
    
    return fileSize <= maxSize;
  }

  // Calcular tokens estimados para áudio
  calculateAudioTokens(durationInSeconds) {
    return Math.ceil(durationInSeconds * this.audioConfig.limits.tokensPerSecond);
  }

  // Estimar custo de processamento de áudio
  estimateAudioCost(durationInSeconds, model = 'flash') {
    const tokens = this.calculateAudioTokens(durationInSeconds);
    
    // Custos por 1M tokens (em USD)
    const costs = {
      'flash': 0.30,      // Gemini 2.5 Flash para áudio
      'pro': 1.00         // Gemini 2.5 Pro para áudio
    };
    
    const costPerToken = (costs[model] || costs.flash) / 1000000;
    return {
      tokens,
      estimatedCost: (tokens * costPerToken).toFixed(6),
      costInUSD: `$${(tokens * costPerToken).toFixed(6)}`
    };
  }

  // Obter configurações de otimização recomendadas
  getOptimizationConfig(preset = 'balanced') {
    const presets = {
      aggressive: {
        speed: 1.8,
        bitrate: '96k',
        sampleRate: 16000,
        format: 'mp3'
      },
      balanced: {
        speed: this.audioConfig.optimization.recommendedSpeed,
        bitrate: this.audioConfig.optimization.recommendedBitrate,
        sampleRate: this.audioConfig.optimization.recommendedSampleRate,
        format: this.audioConfig.optimization.recommendedFormat
      },
      conservative: {
        speed: 1.2,
        bitrate: '192k',
        sampleRate: 22050,
        format: 'mp3'
      },
      quality: {
        speed: 1.0,
        bitrate: '256k',
        sampleRate: 44100,
        format: 'flac'
      }
    };
    
    return presets[preset] || presets.balanced;
  }

  // Validar duração total de áudio
  validateTotalDuration(durationInSeconds) {
    return durationInSeconds <= this.audioConfig.limits.maxTotalDuration;
  }

  // Obter informações sobre formato de áudio
  getAudioFormatInfo(mimeType) {
    return this.audioConfig.supportedFormats[mimeType] || null;
  }

  // Gerar relatório de configuração de áudio
  getAudioConfigReport() {
    return {
      supportedFormats: Object.keys(this.audioConfig.supportedFormats),
      limits: this.audioConfig.limits,
      optimization: this.audioConfig.optimization,
      presets: ['aggressive', 'balanced', 'conservative', 'quality']
    };
  }

  /**
   * Forçar reinicialização e sair do modo offline
   */
  async forceReinitialize() {
    console.log('🔄 Forçando reinicialização do Gemini...');
    this.isInitialized = false;
    this.offlineMode = false;
    this.genAI = null;
    this.model = null;
    this.visionModel = null;
    this.imageProcessor = null;
    
    await this.initialize();
    
    if (!this.offlineMode) {
      console.log('✅ Gemini reinicializado com sucesso!');
    } else {
      console.log('⚠️ Ainda em modo offline após reinicialização');
    }
    
    return !this.offlineMode;
  }
}

// Instância singleton
const geminiService = new GeminiService();

module.exports = geminiService;
module.exports.GeminiService = GeminiService;