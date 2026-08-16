interface FirestoreTimestampLike {
  _seconds: number;
  _nanoseconds: number;
}

export interface Expense {
  id: string;
  category: string;
  amount: number;
  description: string | null;
  paidTo: string | null;
  paymentMethod: string;
  date: FirestoreTimestampLike;
  recordedBy: string;
  attachmentUrl: string | null;
}

export interface OtherIncome {
  id: string;
  source: string;
  amount: number;
  date: FirestoreTimestampLike;
  recordedBy: string;
}

export interface FinancialSummary {
  salesRevenue: number;
  otherIncomeTotal: number;
  totalRevenue: number;
  costOfGoodsSold: number;
  totalExpenses: number;
  // Estimated from current staff salary rates pro-rated across the report's
  // date range — already folded into totalExpenses, surfaced separately so
  // the UI can label it as an estimate rather than a recorded transaction.
  estimatedSalaryExpense: number;
  grossProfit: number;
  netProfit: number;
  cashOnHand: number;
  outstandingLoans: number;
  orderCount: number;
  expensesByCategory: { category: string; amount: number }[];
}

export interface CashFlowPoint {
  date: string;
  cashIn: number;
  cashOut: number;
  net: number;
}
