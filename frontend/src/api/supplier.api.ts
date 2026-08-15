import { apiClient, type ApiSuccess } from "./client";
import type {
  SupplierCompany,
  SupplierProduct,
  StockRequest,
  SupplierSubmission,
} from "@/types/supplier.types";

// Companies
export interface CreateSupplierCompanyInput {
  name: string;
  description?: string;
  location: string;
  managerName: string;
  contactPhone: string;
  contactEmail: string;
  registrationDate?: string;
}

export async function createSupplierCompany(input: CreateSupplierCompanyInput) {
  const { data } = await apiClient.post<ApiSuccess<{ id: string }>>("/supplier/companies", input);
  return data.data;
}

export async function listSupplierCompanies() {
  const { data } = await apiClient.get<ApiSuccess<SupplierCompany[]>>("/supplier/companies");
  return data.data;
}

export async function updateSupplierCompany(
  id: string,
  input: Partial<Omit<CreateSupplierCompanyInput, "registrationDate">>,
) {
  const { data } = await apiClient.patch<ApiSuccess<{ id: string }>>(`/supplier/companies/${id}`, input);
  return data.data;
}

export async function deleteSupplierCompany(id: string) {
  await apiClient.delete(`/supplier/companies/${id}`);
}

// Products
export interface CreateSupplierProductInput {
  companyId: string;
  name: string;
  description?: string;
  category: string;
  brand?: string;
  unitType: string;
  quantityInStock: number;
  wholesalePrice: number;
  sellingPrice: number;
  minimumStockLevel?: number;
  taxRateId?: string | null;
  expiryDate?: string;
  purchasePrice: number;
  purchaseDate?: string;
  batchNumber: string;
  warehouseLocation: string;
}

export async function createSupplierProduct(input: CreateSupplierProductInput) {
  const { data } = await apiClient.post<ApiSuccess<{ id: string }>>("/supplier/products", input);
  return data.data;
}

export interface ImportSupplierProductRow {
  name: string;
  category: string;
  brand?: string;
  unitType: string;
  quantityInStock: number;
  wholesalePrice: number;
  sellingPrice: number;
  minimumStockLevel: number;
  purchasePrice: number;
  batchNumber: string;
  warehouseLocation: string;
  expiryDate?: string;
}

export interface ImportSupplierProductResult {
  created: number;
  errors: { row: number; message: string }[];
}

export async function importSupplierProducts(companyId: string, rows: ImportSupplierProductRow[]) {
  const { data } = await apiClient.post<ApiSuccess<ImportSupplierProductResult>>(
    "/supplier/products/import",
    { companyId, rows },
  );
  return data.data;
}

export async function listSupplierProducts(filters?: { companyId?: string }) {
  const { data } = await apiClient.get<ApiSuccess<SupplierProduct[]>>("/supplier/products", {
    params: filters,
  });
  return data.data;
}

export async function updateSupplierProduct(
  id: string,
  input: Partial<Omit<CreateSupplierProductInput, "companyId">> & { isActive?: boolean },
) {
  const { data } = await apiClient.patch<ApiSuccess<{ id: string }>>(`/supplier/products/${id}`, input);
  return data.data;
}

export async function deleteSupplierProduct(id: string) {
  await apiClient.delete(`/supplier/products/${id}`);
}

// Creates a pending submission awaiting admin/manager approval — no stock
// moves until it's approved (see the /supplier/submissions endpoints below).
export async function requestSupplierProductSubmission(id: string, input: { quantity: number }) {
  const { data } = await apiClient.post<ApiSuccess<{ id: string }>>(
    `/supplier/products/${id}/submit`,
    input,
  );
  return data.data;
}

// Submissions (supplier-initiated requests to push stock into inventory)
export async function listSupplierSubmissions() {
  const { data } = await apiClient.get<ApiSuccess<SupplierSubmission[]>>("/supplier/submissions");
  return data.data;
}

export async function approveSupplierSubmission(id: string) {
  const { data } = await apiClient.post<
    ApiSuccess<{ id: string; productId: string; batchId: string | null }>
  >(`/supplier/submissions/${id}/approve`);
  return data.data;
}

export async function rejectSupplierSubmission(id: string, input: { reason?: string }) {
  const { data } = await apiClient.post<ApiSuccess<{ id: string }>>(
    `/supplier/submissions/${id}/reject`,
    input,
  );
  return data.data;
}

// Stock requests
export interface CreateStockRequestInput {
  supplierProductId: string;
  quantity: number;
  message?: string;
}

export async function createStockRequest(input: CreateStockRequestInput) {
  const { data } = await apiClient.post<ApiSuccess<{ id: string }>>("/supplier/stock-requests", input);
  return data.data;
}

export async function listStockRequests() {
  const { data } = await apiClient.get<ApiSuccess<StockRequest[]>>("/supplier/stock-requests");
  return data.data;
}

export async function approveStockRequest(id: string) {
  const { data } = await apiClient.post<
    ApiSuccess<{ id: string; productId: string; batchId: string | null }>
  >(`/supplier/stock-requests/${id}/approve`);
  return data.data;
}

export async function rejectStockRequest(id: string, input: { reason?: string }) {
  const { data } = await apiClient.post<ApiSuccess<{ id: string }>>(
    `/supplier/stock-requests/${id}/reject`,
    input,
  );
  return data.data;
}
