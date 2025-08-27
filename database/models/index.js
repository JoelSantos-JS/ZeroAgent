// Database Models Index
// Centraliza todos os modelos de dados

const UserModel = require('./user-model');
const RevenueModel = require('./revenue-model');
const ExpenseModel = require('./expense-model');
const ProductModel = require('./product-model');

module.exports = {
  UserModel,
  RevenueModel,
  ExpenseModel,
  ProductModel
};