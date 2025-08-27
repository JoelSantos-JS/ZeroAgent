const firebaseService = require('../config/firebase');
const databaseService = require('../config/database');
const logger = require('../utils/logger');

class AuthService {
  constructor() {
    this.firebaseService = firebaseService;
  }

  // Inicializar serviço de autenticação
  async initialize() {
    try {
      await this.firebaseService.initialize();
      console.log('🔐 Serviço de autenticação inicializado');
    } catch (error) {
      console.error('❌ Erro ao inicializar serviço de autenticação:', error);
      throw error;
    }
  }

  // Autenticar usuário e sincronizar com banco local
  async authenticateUser(idToken) {
    try {
      // Verificar token Firebase
      const verificationResult = await this.firebaseService.verifyToken(idToken);
      
      if (!verificationResult.success) {
        return {
          success: false,
          error: 'Token inválido',
          code: 'INVALID_TOKEN'
        };
      }

      const firebaseUser = verificationResult.user;
      
      // Buscar ou criar usuário no banco local
      let localUser = await databaseService.getUserByFirebaseUid(firebaseUser.uid);
      
      if (!localUser) {
        // Criar usuário no banco local
        console.log(`👤 Criando usuário local para Firebase UID: ${firebaseUser.uid}`);
        localUser = await databaseService.createUser(
          null, // whatsapp_number será null inicialmente
          firebaseUser.name,
          firebaseUser.uid,
          firebaseUser.email
        );
        
        logger.info('Usuário criado via Firebase Auth', {
          firebaseUid: firebaseUser.uid,
          localUserId: localUser.id,
          email: firebaseUser.email
        });
      } else {
        // Atualizar informações se necessário
        if (localUser.name !== firebaseUser.name || localUser.email !== firebaseUser.email) {
          // Aqui você pode implementar atualização do usuário se necessário
          logger.info('Usuário existente autenticado', {
            firebaseUid: firebaseUser.uid,
            localUserId: localUser.id
          });
        }
      }

      return {
        success: true,
        user: {
          id: localUser.id,
          firebaseUid: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.name,
          whatsappNumber: localUser.whatsapp_number,
          emailVerified: firebaseUser.emailVerified
        }
      };
      
    } catch (error) {
      console.error('❌ Erro na autenticação:', error);
      logger.error('Erro na autenticação', {
        error: error.message
      });
      
      return {
        success: false,
        error: 'Erro interno de autenticação',
        code: 'AUTH_ERROR'
      };
    }
  }

  // Vincular número do WhatsApp ao usuário autenticado
  async linkWhatsAppNumber(firebaseUid, whatsappNumber) {
    try {
      // Buscar usuário pelo Firebase UID
      const user = await databaseService.getUserByFirebaseUid(firebaseUid);
      
      if (!user) {
        return {
          success: false,
          error: 'Usuário não encontrado',
          code: 'USER_NOT_FOUND'
        };
      }

      // Verificar se o número já está vinculado a outro usuário
      const existingUser = await databaseService.getUserByWhatsApp(whatsappNumber);
      
      if (existingUser && existingUser.firebase_uid !== firebaseUid) {
        return {
          success: false,
          error: 'Número do WhatsApp já vinculado a outro usuário',
          code: 'WHATSAPP_ALREADY_LINKED'
        };
      }

      // Atualizar número do WhatsApp
      if (databaseService.connectionType === 'supabase') {
        const { data, error } = await databaseService.supabase
          .from('users')
          .update({ whatsapp_number: whatsappNumber })
          .eq('firebase_uid', firebaseUid)
          .select()
          .single();
        
        if (error) throw error;
        
        logger.info('Número WhatsApp vinculado', {
          firebaseUid,
          whatsappNumber,
          userId: user.id
        });
        
        return {
          success: true,
          user: data
        };
      }
      
    } catch (error) {
      console.error('❌ Erro ao vincular WhatsApp:', error);
      logger.error('Erro ao vincular WhatsApp', {
        firebaseUid,
        whatsappNumber,
        error: error.message
      });
      
      return {
        success: false,
        error: 'Erro ao vincular número do WhatsApp',
        code: 'LINK_ERROR'
      };
    }
  }

  // Obter usuário por Firebase UID
  async getUserByFirebaseUid(firebaseUid) {
    try {
      const user = await databaseService.getUserByFirebaseUid(firebaseUid);
      
      if (!user) {
        return {
          success: false,
          error: 'Usuário não encontrado',
          code: 'USER_NOT_FOUND'
        };
      }

      return {
        success: true,
        user: {
          id: user.id,
          firebaseUid: user.firebase_uid,
          email: user.email,
          name: user.name,
          whatsappNumber: user.whatsapp_number,
          createdAt: user.created_at,
          isActive: user.is_active
        }
      };
      
    } catch (error) {
      console.error('❌ Erro ao buscar usuário:', error);
      return {
        success: false,
        error: 'Erro ao buscar usuário',
        code: 'FETCH_ERROR'
      };
    }
  }

  // Middleware de autenticação para rotas
  requireAuth() {
    return this.firebaseService.authMiddleware();
  }

  // Middleware de autenticação opcional
  optionalAuth() {
    return this.firebaseService.optionalAuthMiddleware();
  }

  // Obter configuração do Firebase para o frontend
  getFirebaseConfig() {
    return this.firebaseService.getClientConfig();
  }

  // Verificar se usuário tem WhatsApp vinculado
  async hasWhatsAppLinked(firebaseUid) {
    try {
      const user = await databaseService.getUserByFirebaseUid(firebaseUid);
      return {
        success: true,
        hasWhatsApp: !!(user && user.whatsapp_number),
        whatsappNumber: user?.whatsapp_number || null
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

const authService = new AuthService();

module.exports = authService;
module.exports.AuthService = AuthService;