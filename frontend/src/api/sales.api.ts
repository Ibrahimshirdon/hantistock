import { apiClient, type ApiSuccess } from "./client";
import type { Discount, Invoice, Receipt, SalesOrder, SalesReturn, TaxRate } from "@/types/sales.types";

// Tax rates
export interface TaxRateInput {
  name: string;
  rate: number;
  isDefault?: boolean;
}

export async function listTaxRates() {
  const { data } = await apiClient.get<ApiSuccess<TaxRate[]>>("/sales/tax-rates");
  return data.data;
}

export async function createTaxRate(input: TaxRateInput) {
  const { data } = await apiClient.post<ApiSuccess<{ id: string }>>("/sales/tax-rates", input);
  return data.data;
}

export async function updateTaxRate(id: string, input: Partial<TaxRateInput>) {
  const { data } = await apiClient.patch<ApiSuccess<{ id: string }>>(`/sales/tax-rates/${id}`, input);
  return data.data;
}

export async function deleteTaxRate(id: string) {
  const { data } = await apiClient.delete<ApiSuccess<{ id: string }>>(`/sales/tax-rates/${id}`);
  return data.data;
}

// Discounts
export interface DiscountInput {
  code: string;
  type: "percentage" | "fixed";
  value: number;
  appliesTo: "all" | "category" | "product";
  targetIds?: string[];
  minPurchaseAmount?: number;
  validFrom: string;
  validTo: string;
  usageLimit?: number;
}

export async function listDiscounts() {
  const { data } = await apiClient.get<ApiSuccess<Discount[]>>("/sales/discounts");
  return data.data;
}

export async function createDiscount(input: DiscountInput) {
  const { data } = await apiClient.post<ApiSuccess<{ id: string }>>("/sales/discounts", input);
  return data.data;
}

export async function updateDiscount(id: string, input: { isActive?: boolean }) {
  const { data } = await apiClient.patch<ApiSuccess<{ id: string }>>(`/sales/discounts/${id}`, input);
  return data.data;
}

export interface DiscountPreviewItem {
  productId: string;
  categoryId: string;
  lineSubtotal: number;
}

export async function previewDiscount(code: string, items: DiscountPreviewItem[]) {
  const { data } = await apiClient.post<ApiSuccess<{ discountId: string; discountAmount: number }>>(
    "/sales/discounts/preview",
    { code, items },
  );
  return data.data;
}

// Sales orders
export interface CreateSalesOrderInput {
  customerId?: string;
  items: { productId: string; quantity: number }[];
  discountCode?: string;
  paymentMethod: "cash" | "wallet" | "evc_plus" | "sahal" | "edahab" | "loan";
  pointsToRedeem?: number;
  fulfillmentType?: "pickup" | "delivery";
  deliveryFee?: number;
}

export async function createSalesOrder(input: CreateSalesOrderInput) {
  const { data } = await apiClient.post<ApiSuccess<{ id: string; invoiceId: string; receiptId: string }>>(
    "/sales/orders",
    input,
  );
  return data.data;
}

export async function listSalesOrders(filters?: { status?: string; createdBy?: string; customerId?: string }) {
  const { data } = await apiClient.get<ApiSuccess<SalesOrder[]>>("/sales/orders", { params: filters });
  return data.data;
}

export async function getSalesOrder(id: string) {
  const { data } = await apiClient.get<ApiSuccess<SalesOrder>>(`/sales/orders/${id}`);
  return data.data;
}

export async function getInvoiceForOrder(orderId: string) {
  const { data } = await apiClient.get<ApiSuccess<Invoice>>(`/sales/orders/${orderId}/invoice`);
  return data.data;
}

export async function getReceiptForOrder(orderId: string) {
  const { data } = await apiClient.get<ApiSuccess<Receipt>>(`/sales/orders/${orderId}/receipt`);
  return data.data;
}

export async function approveOrder(id: string) {
  await apiClient.patch(`/sales/orders/${id}/approve`);
}

export async function completeOrder(id: string) {
  await apiClient.patch(`/sales/orders/${id}/complete`);
}

export async function cancelOrder(id: string) {
  await apiClient.patch(`/sales/orders/${id}/cancel`);
}

// Returns
export interface CreateReturnInput {
  reason: string;
  items: { productId: string; batchId: string | null; quantity: number }[];
}

export async function createReturn(orderId: string, input: CreateReturnInput) {
  const { data } = await apiClient.post<ApiSuccess<{ id: string; refundTotal: number; refundMethod: string }>>(
    `/sales/orders/${orderId}/returns`,
    input,
  );
  return data.data;
}

export async function listReturnsForOrder(orderId: string) {
  const { data } = await apiClient.get<ApiSuccess<SalesReturn[]>>(`/sales/orders/${orderId}/returns`);
  return data.data;
}

// Mobile POS scanning
export interface ScanResult {
  productId: string | null;
  productName: string | null;
  found: boolean;
}

export interface PendingScan {
  barcode: string;
  productId: string;
  productName: string;
}

export async function submitScan(barcode: string) {
  const { data } = await apiClient.post<ApiSuccess<ScanResult>>("/sales/scan", { barcode });
  return data.data;
}

export async function listPendingScans() {
  const { data } = await apiClient.get<ApiSuccess<PendingScan[]>>("/sales/scan/pending");
  return data.data;
}
