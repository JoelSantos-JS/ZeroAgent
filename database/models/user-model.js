// User Model - Gerenciamento de usuários
const logger = require('../../utils/logger');

class UserModel {
  constructor(databaseConnection) {
    this.db = databaseConnection;
  }

  // Criar usuário
  async createUser(whatsappNumber, name = null, firebaseUid = null, email = null) {
    if (this.db.connectionType === 'supabase') {
      // Gerar email padrão baseado no número do WhatsApp se não fornecido
      const defaultEmail = email || `${whatsappNumber}@whatsapp.local`;
      
      const { data, error } = await this.db.supabase
        .from('users')
        .insert([{ 
          firebase_uid: firebaseUid,
          whatsapp_number: whatsappNumber, 
          name: name || 'Usuário WhatsApp',
          email: defaultEmail 
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.db.query(
        'INSERT INTO users (whatsapp_number, name) VALUES ($1, $2) RETURNING *',
        [whatsappNumber, name]
      );
      return result.rows[0];
    }
  }

  // Buscar usuário por WhatsApp
  async getUserByWhatsApp(whatsappNumber) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('users')
        .select('*')
        .eq('whatsapp_number', whatsappNumber)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } else {
      const result = await this.db.query(
        'SELECT * FROM users WHERE whatsapp_number = $1',
        [whatsappNumber]
      );
      return result.rows[0];
    }
  }

  // Buscar usuário por Firebase UID
  async getUserByFirebaseUid(firebaseUid) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('users')
        .select('*')
        .eq('firebase_uid', firebaseUid)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } else {
      const result = await this.db.query(
        'SELECT * FROM users WHERE firebase_uid = $1',
        [firebaseUid]
      );
      return result.rows[0];
    }
  }

  // Buscar usuário por ID
  async getUserById(userId) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } else {
      const result = await this.db.query(
        'SELECT * FROM users WHERE id = $1',
        [userId]
      );
      return result.rows[0];
    }
  }

  // Atualizar usuário
  async updateUser(userId, updates) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      const fields = Object.keys(updates);
      const values = Object.values(updates);
      const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
      
      const result = await this.db.query(
        `UPDATE users SET ${setClause} WHERE id = $1 RETURNING *`,
        [userId, ...values]
      );
      return result.rows[0];
    }
  }
}

module.exports = UserModel;