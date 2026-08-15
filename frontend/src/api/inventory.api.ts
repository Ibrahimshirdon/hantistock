import { apiClient, type ApiSuccess } from "./client";
import type { Batch, Category, GoodsReceipt, Product, StockAdjustment, StocktakeItem, StocktakeSession } from "@/types/inventory.types";

// Categories
export async function listCategories() {
  const { data } = await apiClient.get<ApiSuccess<Category[]>>("/inventory/categories");
  return data.data;
}

export interface CategoryInput {
  name: string;
  description?: string;
  parentCategoryId?: string | null;
}

export async function createCategory(input: CategoryInput) {
  const { data } = await apiClient.post<ApiSuccess<{ id: string }>>("/inventory/categories", input);
  return data.data;
}

export async function updateCategory(id: string, input: Partial<CategoryInput> & { isActive?: boolean }) {
  const { data } = await apiClient.patch<ApiSuccess<{ id: string }>>(`/inventory/categories/${id}`, input);
  return data.data;
}

// Products
export interface ProductInput {
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  categoryId: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  taxRateId?: string | null;
  reorderLevel: number;
  maxStockLevel?: number;
  trackBatches: boolean;
  expiryDate?: string | null;
}

export interface CreateProductInput {
  companyId: string;
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  category: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  taxRateId?: string | null;
  reorderLevel: number;
  maxStockLevel?: number;
  expiryDate?: string;
  batchNumber: string;
  warehouseLocation: string;
  initialQuantity: number;
}

export async function createProduct(input: CreateProductInput) {
  const { data } = await apiClient.post<ApiSuccess<{ id: string }>>("/inventory/products", input);
  return data.data;
}

export async function listProducts(filters?: {
  categoryId?: string;
  lowStock?: boolean;
  availableForSale?: boolean;
}) {
  const { data } = await apiClient.get<ApiSuccess<Product[]>>("/inventory/products", {
    params: filters,
  });
  return data.data;
}

export async function getProduct(id: string) {
  const { data } = await apiClient.get<ApiSuccess<Product>>(`/inventory/products/${id}`);
  return data.data;
}

export async function getProductByBarcode(barcode: string) {
  const { data } = await apiClient.get<ApiSuccess<Product>>(
    `/inventory/products/barcode/${barcode}`,
  );
  return data.data;
}

export async function updateProduct(id: string, input: Partial<ProductInput> & { isActive?: boolean }) {
  const { data } = await apiClient.patch<ApiSuccess<{ id: string }>>(`/inventory/products/${id}`, input);
  return data.data;
}

export async function uploadProductImage(id: string, file: File) {
  const formData = new FormData();
  formData.append("image", file);
  const { data } = await apiClient.post<ApiSuccess<{ url: string }>>(
    `/inventory/products/${id}/image`,
    formData,
  );
  return data.data;
}

export async function deleteProduct(id: string) {
  await apiClient.delete(`/inventory/products/${id}`);
}

export async function approveProduct(id: string) {
  const { data } = await apiClient.post<ApiSuccess<{ id: string }>>(`/inventory/products/${id}/approve`);
  return data.data;
}

export interface ImportProductRow {
  name: string;
  sku: string;
  category: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  reorderLevel: number;
  barcode?: string;
}

export interface ImportProductResult {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export async function importProducts(rows: ImportProductRow[]) {
  const { data } = await apiClient.post<ApiSuccess<ImportProductResult>>(
    "/inventory/products/import",
    { rows },
  );
  return data.data;
}

// Stock
export async function listGoodsReceipts(filters?: { productId?: string }) {
  const { data } = await apiClient.get<ApiSuccess<GoodsReceipt[]>>("/inventory/stock/goods-receipts", {
    params: filters,
  });
  return data.data;
}

export async function listBatchesForProduct(productId: string) {
  const { data } = await apiClient.get<ApiSuccess<Batch[]>>(`/inventory/stock/batches/${productId}`);
  return data.data;
}

export async function listExpiringBatches(days = 30) {
  const { data } = await apiClient.get<ApiSuccess<Batch[]>>("/inventory/stock/batches/expiring", {
    params: { days },
  });
  return data.data;
}

// Stock adjustments
export interface StockAdjustmentInput {
  productId: string;
  batchId: string;
  type: "damage" | "correction" | "loss" | "recount";
  quantityChange: number;
  reason: string;
}

export async function listStockAdjustments(productId?: string) {
  const { data } = await apiClient.get<ApiSuccess<StockAdjustment[]>>("/inventory/stock-adjustments", {
    params: productId ? { productId } : undefined,
  });
  return data.data;
}

export async function createStockAdjustment(input: StockAdjustmentInput) {
  const { data } = await apiClient.post<ApiSuccess<{ id: string }>>(
    "/inventory/stock-adjustments",
    input,
  );
  return data.data;
}

// Stocktake sessions
export async function listStocktakeSessions() {
  const { data } = await apiClient.get<ApiSuccess<StocktakeSession[]>>("/inventory/stocktake-sessions");
  return data.data;
}

export async function createStocktakeSession(input: { notes?: string }) {
  const { data } = await apiClient.post<ApiSuccess<{ id: string }>>(
    "/inventory/stocktake-sessions",
    input,
  );
  return data.data;
}

export async function getStocktakeSession(id: string) {
  const { data } = await apiClient.get<ApiSuccess<StocktakeSession & { items: StocktakeItem[] }>>(
    `/inventory/stocktake-sessions/${id}`,
  );
  return data.data;
}

export async function commitStocktakeSession(id: string, counts: Record<string, number>) {
  const { data } = await apiClient.post<ApiSuccess<{ discrepancyCount: number }>>(
    `/inventory/stocktake-sessions/${id}/commit`,
    { counts },
  );
  return data.data;
}
