import { z } from "zod";

// Admin/manager create a product directly, but it must still be linked to an
// existing supplier company (chosen from the full cross-supplier list) —
// see product.service.ts's createProduct. That link is what lets the
// low-stock auto-reorder system (lowStockAlert.ts) treat a hand-created
// product exactly like a supplier-submitted one instead of silently never
// requesting restock for it.
export const createProductSchema = z.object({
  companyId: z.string().min(1),
  sku: z.string().min(1),
  barcode: z.string().optional(),
  name: z.string().min(2),
  description: z.string().optional(),
  category: z.string().min(1),
  unit: z.string().min(1),
  costPrice: z.coerce.number().nonnegative(),
  sellingPrice: z.coerce.number().positive(),
  taxRateId: z.string().nullable().optional(),
  reorderLevel: z.coerce.number().nonnegative().default(10),
  maxStockLevel: z.coerce.number().nonnegative().optional(),
  expiryDate: z.string().optional(),
  batchNumber: z.string().min(1),
  warehouseLocation: z.string().min(1),
  initialQuantity: z.coerce.number().nonnegative().default(0),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  sku: z.string().min(1).optional(),
  barcode: z.string().optional(),
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  categoryId: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  costPrice: z.coerce.number().nonnegative().optional(),
  sellingPrice: z.coerce.number().nonnegative().optional(),
  taxRateId: z.string().nullable().optional(),
  reorderLevel: z.coerce.number().nonnegative().optional(),
  maxStockLevel: z.coerce.number().nonnegative().optional(),
  trackBatches: z.coerce.boolean().optional(),
  isActive: z.boolean().optional(),
  expiryDate: z.string().nullable().optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
