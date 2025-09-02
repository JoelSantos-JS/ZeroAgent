// Database Models Index
// Centraliza todos os modelos de dados

const UserModel = require('./user-model');
const RevenueModel = require('./revenue-model');
const ExpenseModel = require('./expense-model');
const ProductModel = require('./product-model');
const GoalModel = require('./goal-model');

module.exports = {
  UserModel,
  RevenueModel,
  ExpenseModel,
  ProductModel,
  GoalModel
};