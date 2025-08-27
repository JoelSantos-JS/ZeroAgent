// Product Model - Gerenciamento de produtos
const logger = require('../../utils/logger');

class ProductModel {
  constructor(databaseConnection) {
    this.db = databaseConnection;
  }

  // Criar produto
  async createProduct(userId, productName, productCategory, price, purchaseDate = null) {
    const date = purchaseDate || new Date();
    
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('products')
        .insert({
          user_id: userId,
          name: productName,
          category: productCategory,
          selling_price: price,
          purchase_date: date.toISOString()
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.db.query(
        'INSERT INTO products (user_id, product_name, product_category, price, purchase_date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [userId, productName, productCategory, price, date]
      );
      return result.rows[0];
    }
  }

  // Buscar produtos do usuário
  async getUserProducts(userId, limit = 50, offset = 0) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('products')
        .select('*')
        .eq('user_id', userId)
        .order('purchase_date', { ascending: false })
        .limit(limit)
        .range(offset, offset + limit - 1);
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.db.query(
        'SELECT * FROM products WHERE user_id = $1 ORDER BY purchase_date DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
      );
      return result.rows;
    }
  }

  // Buscar produtos por categoria
  async getUserProductsByCategory(userId, category, startDate = null, endDate = null) {
    let query = 'SELECT * FROM products WHERE user_id = $1 AND category = $2';
    const params = [userId, category];
    
    if (startDate) {
      query += ' AND purchase_date >= $3';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ` AND purchase_date <= $${params.length + 1}`;
      params.push(endDate);
    }
    
    query += ' ORDER BY purchase_date DESC';
    
    if (this.db.connectionType === 'supabase') {
      let supabaseQuery = this.db.supabase
        .from('products')
        .select('*')
        .eq('user_id', userId)
        .eq('category', category)
        .order('purchase_date', { ascending: false });
      
      if (startDate) {
        supabaseQuery = supabaseQuery.gte('purchase_date', startDate);
      }
      
      if (endDate) {
        supabaseQuery = supabaseQuery.lte('purchase_date', endDate);
      }
      
      const { data, error } = await supabaseQuery;
      if (error) throw error;
      return data;
    } else {
      const result = await this.db.query(query, params);
      return result.rows;
    }
  }

  // Atualizar produto
  async updateProduct(productId, userId, updates) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('products')
        .update(updates)
        .eq('id', productId)
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      const fields = Object.keys(updates);
      const values = Object.values(updates);
      const setClause = fields.map((field, index) => `${field} = $${index + 3}`).join(', ');
      
      const result = await this.db.query(
        `UPDATE products SET ${setClause} WHERE id = $1 AND user_id = $2 RETURNING *`,
        [productId, userId, ...values]
      );
      return result.rows[0];
    }
  }

  // Deletar produto
  async deleteProduct(productId, userId) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('products')
        .delete()
        .eq('id', productId)
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      const result = await this.db.query(
        'DELETE FROM products WHERE id = $1 AND user_id = $2 RETURNING *',
        [productId, userId]
      );
      return result.rows[0];
    }
  }

  // Buscar produto por ID
  async getProductById(productId, userId) {
    if (this.db.connectionType === 'supabase') {
      const { data, error } = await this.db.supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .eq('user_id', userId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } else {
      const result = await this.db.query(
        'SELECT * FROM products WHERE id = $1 AND user_id = $2',
        [productId, userId]
      );
      return result.rows[0];
    }
  }
}

module.exports = ProductModel;