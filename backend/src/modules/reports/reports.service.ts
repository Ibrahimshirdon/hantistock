import { db } from "../../config/firebase.js";
import type { SalesOrder, SalesReturn } from "../../shared/types/sales.types.js";
import type { Product } from "../../shared/types/inventory.types.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface DateRange {
  dateFrom: Date;
  dateTo: Date;
}

// Same established pattern: filter by the single equality field Firestore
// auto-indexes, narrow to the date window in memory.
async function getCompletedSalesInRange({ dateFrom, dateTo }: DateRange): Promise<SalesOrder[]> {
  const snap = await db.collection("salesOrders").where("status", "==", "completed").get();
  const from = dateFrom.getTime();
  const to = dateTo.getTime();
  return snap.docs
    // Order documents don't store their own id field — it only exists as
    // Firestore doc metadata, so it must be attached explicitly or
    // matching against salesReturns.orderId below silently finds nothing.
    .map((d) => ({ id: d.id, ...d.data() }) as SalesOrder)
    .filter((o) => {
      const ms = o.createdAt.toMillis();
      return ms >= from && ms <= to;
    })
    .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
}

// Same reasoning as the Dashboard's financial summary (reports.service.ts in
// the finance module): a refunded order shouldn't keep reporting its full
// original total as if the money were still in hand.
async function getRefundTotalByOrder(orderIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (orderIds.length === 0) return map;
  const chunks: string[][] = [];
  for (let i = 0; i < orderIds.length; i += 30) chunks.push(orderIds.slice(i, i + 30));
  const snaps = await Promise.all(
    chunks.map((chunk) => db.collection("salesReturns").where("orderId", "in", chunk).get()),
  );
  snaps.forEach((snap) => {
    snap.docs.forEach((d) => {
      const ret = d.data() as SalesReturn;
      map.set(ret.orderId, (map.get(ret.orderId) ?? 0) + ret.refundTotal);
    });
  });
  return map;
}

export interface SalesReportRow {
  orderNumber: string;
  date: string;
  customerName: string;
  itemCount: number;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  refundedTotal: number;
  paymentMethod: string;
}

export async function getSalesReport(range: DateRange) {
  const orders = await getCompletedSalesInRange(range);
  const refundTotalByOrder = await getRefundTotalByOrder(orders.map((o) => o.id));

  const rows: SalesReportRow[] = orders.map((o) => {
    const refundedTotal = refundTotalByOrder.get(o.id) ?? 0;
    return {
      orderNumber: o.orderNumber,
      date: new Date(o.createdAt.toMillis()).toLocaleString(),
      customerName: o.customerName ?? "Walk-in",
      itemCount: o.items.length,
      subtotal: o.subtotal,
      discountTotal: o.discountTotal,
      taxTotal: o.taxTotal,
      // Net of any refund — see getRefundTotalByOrder above.
      grandTotal: round2(Math.max(0, o.grandTotal - refundedTotal)),
      refundedTotal: round2(refundedTotal),
      paymentMethod: o.paymentMethod,
    };
  });

  const summary = {
    orderCount: orders.length,
    subtotal: round2(rows.reduce((s, r) => s + r.subtotal, 0)),
    discountTotal: round2(rows.reduce((s, r) => s + r.discountTotal, 0)),
    taxTotal: round2(rows.reduce((s, r) => s + r.taxTotal, 0)),
    grandTotal: round2(rows.reduce((s, r) => s + r.grandTotal, 0)),
    refundedTotal: round2(rows.reduce((s, r) => s + r.refundedTotal, 0)),
  };

  return { summary, rows };
}

export interface InventoryReportRow {
  sku: string;
  name: string;
  categoryName: string;
  unit: string;
  totalStock: number;
  reorderLevel: number;
  costPrice: number;
  sellingPrice: number;
  stockValue: number;
  isLowStock: boolean;
  stockStatus: "low" | "warning" | "good";
}

// Fixed absolute thresholds for this report's at-a-glance Status column —
// deliberately separate from Product.isLowStock, which stays relative to
// each product's own admin-set reorderLevel and continues to drive
// low-stock notifications/requisitions elsewhere unchanged.
function classifyStockStatus(totalStock: number): "low" | "warning" | "good" {
  if (totalStock <= 10) return "low";
  if (totalStock <= 50) return "warning";
  return "good";
}

export async function getInventoryReport() {
  const snap = await db.collection("products").where("isActive", "==", true).get();
  const products = snap.docs.map((d) => d.data() as Product).sort((a, b) => a.name.localeCompare(b.name));

  const rows: InventoryReportRow[] = products.map((p) => ({
    sku: p.sku,
    name: p.name,
    categoryName: p.categoryName,
    unit: p.unit,
    totalStock: p.totalStock,
    reorderLevel: p.reorderLevel,
    costPrice: p.costPrice,
    sellingPrice: p.sellingPrice,
    stockValue: round2(p.totalStock * p.costPrice),
    isLowStock: p.isLowStock,
    stockStatus: classifyStockStatus(p.totalStock),
  }));

  const summary = {
    totalProducts: rows.length,
    totalInventoryValue: round2(rows.reduce((s, r) => s + r.stockValue, 0)),
    lowStockCount: rows.filter((r) => r.isLowStock).length,
  };

  return { summary, rows };
}
