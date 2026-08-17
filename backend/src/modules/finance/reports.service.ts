import { db } from "../../config/firebase.js";
import type { SalesOrder, SalesReturn } from "../../shared/types/sales.types.js";
import type { Product } from "../../shared/types/inventory.types.js";
import type { Expense, OtherIncome } from "../../shared/types/finance.types.js";
import type { Loan } from "../../shared/types/loan.types.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function dateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

interface DateRange {
  dateFrom: Date;
  dateTo: Date;
}

// Filters by a single equality field (status) only, then narrows by date
// range in memory, rather than combining an equality + range filter in one
// Firestore query — avoids needing yet another composite index for what's
// fundamentally a reporting query over a bounded, thesis-scale dataset.
async function getCompletedSalesInRange({ dateFrom, dateTo }: DateRange): Promise<SalesOrder[]> {
  const snap = await db.collection("salesOrders").where("status", "==", "completed").get();
  const from = dateFrom.getTime();
  const to = dateTo.getTime();
  return snap.docs
    // Order documents don't store their own id field (see salesOrder.service.ts's
    // orderData) — it only exists as Firestore doc metadata, so it must be
    // attached explicitly or o.id below silently comes back undefined.
    .map((d) => ({ id: d.id, ...d.data() }) as SalesOrder)
    .filter((o) => {
      const ms = o.createdAt.toMillis();
      return ms >= from && ms <= to;
    });
}

async function getExpensesInRange({ dateFrom, dateTo }: DateRange): Promise<Expense[]> {
  const snap = await db
    .collection("expenses")
    .where("date", ">=", dateFrom)
    .where("date", "<=", dateTo)
    .get();
  return snap.docs.map((d) => d.data() as Expense);
}

async function getOtherIncomeInRange({ dateFrom, dateTo }: DateRange): Promise<OtherIncome[]> {
  const snap = await db
    .collection("otherIncome")
    .where("date", ">=", dateFrom)
    .where("date", "<=", dateTo)
    .get();
  return snap.docs.map((d) => d.data() as OtherIncome);
}

// Refunded items go back on the shelf (see salesReturn.service.ts restoring
// batch/product stock), so counting their cost as "goods sold" overstates
// COGS by the same amount a refund overstates revenue — this nets both
// against the same per-order refund data for a consistent picture.
async function getReturnsForOrders(orderIds: string[]): Promise<SalesReturn[]> {
  if (orderIds.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < orderIds.length; i += 30) chunks.push(orderIds.slice(i, i + 30));
  const snaps = await Promise.all(
    chunks.map((chunk) => db.collection("salesReturns").where("orderId", "in", chunk).get()),
  );
  return snaps.flatMap((snap) => snap.docs.map((d) => d.data() as SalesReturn));
}

async function getCostOfGoodsSold(
  orders: SalesOrder[],
  returnedQtyByProduct: Map<string, number>,
): Promise<number> {
  const productIds = new Set<string>();
  orders.forEach((o) => o.items.forEach((item) => productIds.add(item.productId)));
  if (productIds.size === 0) return 0;

  const snaps = await Promise.all(
    [...productIds].map((id) => db.collection("products").doc(id).get()),
  );
  const costById = new Map<string, number>();
  snaps.forEach((snap) => {
    if (snap.exists) costById.set(snap.id, (snap.data() as Product).costPrice);
  });

  const soldQtyByProduct = new Map<string, number>();
  orders.forEach((o) => {
    o.items.forEach((item) => {
      soldQtyByProduct.set(item.productId, (soldQtyByProduct.get(item.productId) ?? 0) + item.quantity);
    });
  });

  let cogs = 0;
  soldQtyByProduct.forEach((soldQty, productId) => {
    const netQty = Math.max(0, soldQty - (returnedQtyByProduct.get(productId) ?? 0));
    cogs += netQty * (costById.get(productId) ?? 0);
  });
  return cogs;
}

// Total money currently owed to the business across every outstanding
// customer loan — a point-in-time balance (how much credit is out there
// right now), not a period flow, so unlike the rest of this summary it
// deliberately ignores the date range: a loan issued two months ago that's
// still unpaid is just as relevant to "how much do we have out on credit"
// as one issued yesterday.
async function getOutstandingLoansTotal(): Promise<number> {
  const snap = await db.collection("loans").where("status", "==", "outstanding").get();
  const total = snap.docs.reduce((sum, d) => sum + (d.data() as Loan).balanceRemaining, 0);
  return round2(total);
}

export async function getFinancialSummary(range: DateRange) {
  const [sales, expenses, otherIncome, outstandingLoans] = await Promise.all([
    getCompletedSalesInRange(range),
    getExpensesInRange(range),
    getOtherIncomeInRange(range),
    getOutstandingLoansTotal(),
  ]);
  const returns = await getReturnsForOrders(sales.map((o) => o.id));

  const refundTotalByOrder = new Map<string, number>();
  const returnedQtyByProduct = new Map<string, number>();
  returns.forEach((ret) => {
    refundTotalByOrder.set(ret.orderId, (refundTotalByOrder.get(ret.orderId) ?? 0) + ret.refundTotal);
    ret.items.forEach((item) => {
      returnedQtyByProduct.set(
        item.productId,
        (returnedQtyByProduct.get(item.productId) ?? 0) + item.quantity,
      );
    });
  });

  const cogs = await getCostOfGoodsSold(sales, returnedQtyByProduct);

  // Net of refunds — a returned order shouldn't keep counting its full
  // original amount toward revenue once money has actually gone back out.
  const salesRevenue = round2(
    sales.reduce(
      (sum, o) => sum + Math.max(0, o.grandTotal - (refundTotalByOrder.get(o.id) ?? 0)),
      0,
    ),
  );
  const otherIncomeTotal = round2(otherIncome.reduce((sum, i) => sum + i.amount, 0));
  const totalRevenue = round2(salesRevenue + otherIncomeTotal);
  const totalExpenses = round2(expenses.reduce((sum, e) => sum + e.amount, 0));
  const grossProfit = round2(salesRevenue - cogs);
  const netProfit = round2(totalRevenue - cogs - totalExpenses);
  // Cash actually collected minus cash actually paid out over the range —
  // same "cashIn - cashOut" the Cash Flow chart plots per day, just
  // totaled across the whole period. Deliberately excludes COGS: cost of
  // goods sold is an accounting valuation of inventory already on hand,
  // not itself a cash movement recorded in this range.
  const cashOnHand = round2(totalRevenue - totalExpenses);

  const expensesByCategory = new Map<string, number>();
  expenses.forEach((e) => {
    expensesByCategory.set(e.category, round2((expensesByCategory.get(e.category) ?? 0) + e.amount));
  });

  return {
    salesRevenue,
    otherIncomeTotal,
    totalRevenue,
    costOfGoodsSold: round2(cogs),
    totalExpenses,
    grossProfit,
    netProfit,
    cashOnHand,
    outstandingLoans,
    // A refunded order isn't a successful sale anymore — same "Completed"
    // definition used on the Sales Orders list (refundedAmount <= 0), so
    // this tile doesn't count a fully or partially refunded order toward
    // the same total as one nobody asked money back on.
    orderCount: sales.filter((o) => (refundTotalByOrder.get(o.id) ?? 0) <= 0).length,
    expensesByCategory: Array.from(expensesByCategory, ([category, amount]) => ({ category, amount })),
  };
}

export async function getCashFlow(range: DateRange) {
  const [sales, expenses, otherIncome] = await Promise.all([
    getCompletedSalesInRange(range),
    getExpensesInRange(range),
    getOtherIncomeInRange(range),
  ]);

  const byDate = new Map<string, { cashIn: number; cashOut: number }>();
  function bucket(key: string) {
    if (!byDate.has(key)) byDate.set(key, { cashIn: 0, cashOut: 0 });
    return byDate.get(key)!;
  }

  sales.forEach((o) => {
    bucket(dateKey(o.createdAt.toMillis())).cashIn += o.grandTotal;
  });
  otherIncome.forEach((i) => {
    bucket(dateKey(i.date.toMillis())).cashIn += i.amount;
  });
  expenses.forEach((e) => {
    bucket(dateKey(e.date.toMillis())).cashOut += e.amount;
  });

  return Array.from(byDate, ([date, { cashIn, cashOut }]) => ({
    date,
    cashIn: round2(cashIn),
    cashOut: round2(cashOut),
    net: round2(cashIn - cashOut),
  })).sort((a, b) => a.date.localeCompare(b.date));
}
