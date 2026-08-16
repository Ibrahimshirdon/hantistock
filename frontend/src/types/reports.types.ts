export interface SalesReportRow {
  orderNumber: string;
  date: string;
  customerName: string;
  itemCount: number;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  // Net of any refund on this order — see refundedTotal.
  grandTotal: number;
  refundedTotal: number;
  paymentMethod: string;
}

export interface SalesReportSummary {
  orderCount: number;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  refundedTotal: number;
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

export interface InventoryReportSummary {
  totalProducts: number;
  totalInventoryValue: number;
  lowStockCount: number;
}
