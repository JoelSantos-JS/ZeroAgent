// Processors Index
// Centraliza todos os processadores de transações

const IncomeProcessor = require('./income-processor');
const ExpenseProcessor = require('./expense-processor');
const QueryProcessor = require('./query-processor');
const InvestmentProcessor = require('./investment-processor');

module.exports = {
  IncomeProcessor,
  ExpenseProcessor,
  QueryProcessor,
  InvestmentProcessor
};