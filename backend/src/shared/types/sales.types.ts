import type { Timestamp } from "firebase-admin/firestore";
import type { Address } from "./user.types.js";

export interface TaxRate {
  id: string;
  name: string;
  rate: number;
  isDefault: boolean;
}

export interface Discount {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  value: number;
  appliesTo: "all" | "category" | "product";
  targetIds: string[];
  minPurchaseAmount: number | null;
  validFrom: Timestamp;
  validTo: Timestamp;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
}

export interface SalesOrderItem {
  productId: string;
  productName: string;
  batchId: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxRate: number;
  lineTotal: number;
}

export interface SalesOrder {
  id: string;
  orderNumber: string;
  type: "pos" | "online";
  customerId: string | null;
  customerName: string | null;
  items: SalesOrderItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  // Only ever set for online (customer) orders — pos orders are always
  // fulfilled in-store, no pickup/delivery choice applies to them.
  fulfillmentType: "pickup" | "delivery" | null;
  deliveryFee: number;
  deliveryAddress: Address | null;
  grandTotal: number;
  paymentStatus: "paid" | "partial" | "unpaid";
  paymentMethod: "cash" | "wallet" | "evc_plus" | "sahal" | "edahab" | "loan";
  // "pending" only ever applies to online orders with fulfillmentType
  // "delivery" — they sit pending until the assigned driver actually marks
  // the delivery "delivered". Every other order (pos, online pickup) goes
  // straight to "completed" at creation, same as before this field existed.
  status: "pending" | "confirmed" | "completed" | "cancelled";
  createdBy: string;
  createdByName: string;
  createdByRole: string;
  // Who actually fulfilled the order — the driver for a delivery order,
  // or the same as createdBy/createdAt for anything completed immediately.
  // Exists so the orders table can show who delivered it, not just who the
  // customer was that placed it.
  completedBy: string | null;
  completedByName: string | null;
  completedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  // Not a stored field — attached by listSalesOrders() from the salesReturns
  // collection so callers can tell a refunded order apart from a genuinely
  // completed one without a separate returns query per order.
  refundedAmount?: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  salesOrderId: string;
  customerId: string | null;
  itemsSnapshot: SalesOrderItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  status: "paid" | "unpaid";
  createdAt: Timestamp;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  salesOrderId: string;
  amountPaid: number;
  paymentMethod: string;
  changeGiven: number;
  issuedBy: string;
  createdAt: Timestamp;
}

export interface SalesReturnItem {
  productId: string;
  productName: string;
  batchId: string | null;
  quantity: number;
  unitPrice: number;
  lineRefund: number;
}

export interface SalesReturn {
  id: string;
  orderId: string;
  orderNumber: string;
  customerId: string | null;
  customerName: string | null;
  paymentMethod: string;
  items: SalesReturnItem[];
  refundTotal: number;
  refundMethod: "wallet" | "cash";
  reason: string;
  processedBy: string;
  processedByName: string;
  createdAt: Timestamp;
}
