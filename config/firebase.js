const admin = require('firebase-admin');
require('dotenv').config();

// Configuração do Firebase Admin SDK
const serviceAccount = {
  type: "service_account",
  project_id: "aliinsights",
  private_key_id: "e89097a872d6e3b78b49ee4afc8d6025d6c4b8c1",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDlS9ZGgM248D4H\nFJ/6Fp+mAchBeXnKpg7gX5EYTsOyBcMNZuVJYSXfxB7rNRtiCsutuZrSC3w+Gexn\nqZhhyidRni8tNL5lFH2qv6pYVfmjDmh+6dw6KiXAGn3WyHROMmJYN/ibXm2bIDjU\nKhiit5nDIkYRs47ksMXy3DU1rjK6x/AraERYWI4zbH1qcpwplS16C+iIoRiMnl0Z\nBZ9zSUKyTENZDtmV5fgFA/u9qTGwMIf68HkTB/ctCmMQTzml6MisZmWRVo8LgsCW\nYcjP+Vc0sMX/hdM4cAeBdss9BqS9u9mu8joFV510u/ss9HcU9k18upKWN1J2t1ZU\n9v4xlrOfAgMBAAECggEAW5aGsOOrCKeBhy+AVRMrUtJcbHa6pKzevVW+7ZAsj9PI\nXPaQOFbDG5XJadbtKKS6RZqhEiw/RMjzClcORGVMfkfqfSqXsGVWatkjECTLUYuk\nRqlf66XBLXIHeL7Z4hAzAxzcQycdLbzZpjloXLpsgyqSBWkM9yD6+G5oHJiHr94C\nJ5exSs+u0BoesgNuU/j839YWaXFv5bcZIL0N+AWVDdBf49kCkyxmUA/HAlCOMNT3\nG4PW0JM/4+DSS9lwj/7TpGZQyL+SmnTYw5HlsOeGfW/yDNpfrGypF5ntn8VqNnt0\n1q0m7JbQzJbF9U+YSgpDzfcPEwmoEzYZZIDyfef2IQKBgQD/jHuoUH0nT8UXLXko\nOkJynOCY/yEomdODkrBabq0nC/8Gy0iNZ/aUi0wOzQpmgIobQC+5QhTdLKCe4s5i\nIND2oTGCXRQ1gnYr1clYjOfYIRmpf/RSa5tztrbtfUVY/VKbIheVTHYFh0wEp7q8\nAbtf8t8VHvIL/IUq6t8y1JsIPwKBgQDls3ymuXN135dadmXUYpH4SP4Cl7IuM9hN\ng8nlhsIhKUwepDCf8Ciw6LfzBZTvns+XdzPKcn6nYEnJN6Rnzj+1kuGiPnDgbBVE\nlOoLhEKykf1SHGQ0aQ7J+h7irQgzl7ZnzaNDA5GoZtzJnhWOSgEH0EAyqFJfqlpW\nYRFxVeh8oQKBgQChGYv/ILa1aKlkIiul+4xWOqWwbe4WbVsVMA1zBSCtY/ei7dZQ\nJsEhBeutzP8IfXITGdS8IneKsw6S+4KGBBAX2qieeVU7IoKiwcSLyVCDROKro1l/\n+Axo1z/c2cM1BYXk/IoHectRUujOanri+OiJ5U9TPk3y1n+Q/b41iigt+wKBgCUD\nBtLWjwQvQvQQn9fZCiw3lrZUOyG2uOPEmIOjcyRkwx8s1ajvyZ634OwHujfiHxEI\n5A96422U1k7V6GfRk/Jt+G1sIkQHJmYmmI/Cf/zGCUtxx7OqOffRlahwuSGXEI0p\nVWU27gF0kZ7rGg4TXpcjtzRyatN/X48LlQPuE8gBAoGBAJJhousLpmlddstNOSHC\nN/BsyZdUm3gUS7fCYoeB1niEFP0KrO26HOBrtOo5OKsFWHkuqqnvCYwOHVBOFHd/\n9b/NJc9YNCsm43tT5hQQ3Oa47AIHqoBhvpSojYL2StlZTP82i/on0pU66BxtuzMf\njKXlWPG3RCI0GL6CR9yBPa7T\n-----END PRIVATE KEY-----\n",
  client_email: "firebase-adminsdk-fbsvc@aliinsights.iam.gserviceaccount.com",
  client_id: "115830106891341125864",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40aliinsights.iam.gserviceaccount.com",
  universe_domain: "googleapis.com"
};

// Configuração do Firebase Client (para frontend)
const firebaseConfig = {
  apiKey: "AIzaSyArzg3zwPRGPAzqatLrX_UHUzhdLeRrp0E",
  authDomain: "aliinsights.firebaseapp.com",
  projectId: "aliinsights",
  storageBucket: "aliinsights.firebasestorage.app",
  messagingSenderId: "48131222137",
  appId: "1:48131222137:web:7fc2ec9861093a7e20c2a8"
};

class FirebaseService {
  constructor() {
    this.admin = null;
    this.isInitialized = false;
  }

  // Inicializar Firebase Admin SDK
  async initialize() {
    try {
      if (!this.isInitialized) {
        // Inicializar Firebase Admin
        this.admin = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id
        });
        
        this.isInitialized = true;
        console.log('🔥 Firebase Admin SDK inicializado com sucesso');
      }
      
      return this.admin;
    } catch (error) {
      console.error('❌ Erro ao inicializar Firebase:', error);
      throw error;
    }
  }

  // Verificar token de autenticação
  async verifyToken(idToken) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      return {
        success: true,
        user: {
          uid: decodedToken.uid,
          email: decodedToken.email,
          name: decodedToken.name || decodedToken.email,
          emailVerified: decodedToken.email_verified
        }
      };
    } catch (error) {
      console.error('❌ Erro ao verificar token:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Obter usuário por UID
  async getUserByUid(uid) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      const userRecord = await admin.auth().getUser(uid);
      return {
        success: true,
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          name: userRecord.displayName || userRecord.email,
          emailVerified: userRecord.emailVerified,
          createdAt: userRecord.metadata.creationTime,
          lastSignIn: userRecord.metadata.lastSignInTime
        }
      };
    } catch (error) {
      console.error('❌ Erro ao obter usuário:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Criar token customizado
  async createCustomToken(uid, additionalClaims = {}) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      const customToken = await admin.auth().createCustomToken(uid, additionalClaims);
      return {
        success: true,
        token: customToken
      };
    } catch (error) {
      console.error('❌ Erro ao criar token customizado:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Obter configuração do cliente Firebase
  getClientConfig() {
    return firebaseConfig;
  }

  // Middleware para verificar autenticação
  authMiddleware() {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'Token de autenticação não fornecido',
            code: 'AUTH_TOKEN_MISSING'
          });
        }
        
        const idToken = authHeader.split('Bearer ')[1];
        const verificationResult = await this.verifyToken(idToken);
        
        if (!verificationResult.success) {
          return res.status(401).json({
            error: 'Token de autenticação inválido',
            code: 'AUTH_TOKEN_INVALID',
            details: verificationResult.error
          });
        }
        
        // Adicionar informações do usuário à requisição
        req.user = verificationResult.user;
        next();
        
      } catch (error) {
        console.error('❌ Erro no middleware de autenticação:', error);
        return res.status(500).json({
          error: 'Erro interno de autenticação',
          code: 'AUTH_INTERNAL_ERROR'
        });
      }
    };
  }

  // Middleware opcional (permite acesso sem autenticação)
  optionalAuthMiddleware() {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const idToken = authHeader.split('Bearer ')[1];
          const verificationResult = await this.verifyToken(idToken);
          
          if (verificationResult.success) {
            req.user = verificationResult.user;
          }
        }
        
        next();
        
      } catch (error) {
        console.error('❌ Erro no middleware de autenticação opcional:', error);
        next(); // Continua mesmo com erro
      }
    };
  }
}

const firebaseService = new FirebaseService();

module.exports = firebaseService;
module.exports.FirebaseService = FirebaseService;
module.exports.firebaseConfig = firebaseConfig;