import { FieldValue } from "firebase-admin/firestore";
import { db } from "../../config/firebase.js";
import { AppError } from "../../shared/utils/AppError.js";
import { recordAuditLog } from "../../shared/utils/auditLog.js";
import type { AuthenticatedUser } from "../../shared/types/auth.types.js";
import type { SupplierCompany, SupplierProduct } from "../../shared/types/supplier.types.js";
import type {
  CreateSupplierProductInput,
  SubmitToInventoryInput,
  UpdateSupplierProductInput,
} from "./supplierProduct.types.js";
import { receiveStock } from "../inventory/stock.service.js";

const collection = () => db.collection("supplierProducts");

export async function createSupplierProduct(input: CreateSupplierProductInput, actor: AuthenticatedUser) {
  const [companySnap, userSnap] = await Promise.all([
    db.collection("supplierCompanies").doc(input.companyId).get(),
    db.collection("users").doc(actor.uid).get(),
  ]);
  if (!companySnap.exists) {
    throw new AppError(404, "Company not found");
  }
  const company = companySnap.data() as SupplierCompany;
  if (company.supplierId !== actor.uid) {
    throw new AppError(403, "You can only add products under your own companies");
  }
  const supplierName = userSnap.exists
    ? (userSnap.data() as { displayName: string }).displayName
    : actor.email;

  const ref = collection().doc();
  await ref.set({
    supplierId: actor.uid,
    supplierName,
    companyId: input.companyId,
    companyName: company.name,
    companyManagerName: company.managerName,
    name: input.name,
    description: input.description ?? null,
    category: input.category,
    brand: input.brand ?? null,
    unitType: input.unitType,
    quantityInStock: input.quantityInStock,
    wholesalePrice: input.wholesalePrice,
    sellingPrice: input.sellingPrice,
    minimumStockLevel: input.minimumStockLevel,
    taxRateId: input.taxRateId ?? null,
    expiryDate: input.expiryDate ?? null,
    purchasePrice: input.purchasePrice,
    purchaseDate: input.purchaseDate ?? FieldValue.serverTimestamp(),
    batchNumber: input.batchNumber,
    warehouseLocation: input.warehouseLocation,
    linkedProductId: null,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
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

// Bulk counterpart to createSupplierProduct — same ownership check and same
// per-product Firestore shape, just written in a single batch instead of one
// request per row. Unlike the admin product import (product.service.ts),
// there's no SKU here to dedupe against — a SupplierProduct doesn't have one
// until/unless it's submitted into real inventory — so every valid row is
// created; only rows missing a required field are rejected.
export async function importSupplierProducts(
  companyId: string,
  rows: ImportSupplierProductRow[],
  actor: AuthenticatedUser,
): Promise<ImportSupplierProductResult> {
  const [companySnap, userSnap] = await Promise.all([
    db.collection("supplierCompanies").doc(companyId).get(),
    db.collection("users").doc(actor.uid).get(),
  ]);
  if (!companySnap.exists) {
    throw new AppError(404, "Company not found");
  }
  const company = companySnap.data() as SupplierCompany;
  if (company.supplierId !== actor.uid) {
    throw new AppError(403, "You can only add products under your own companies");
  }
  const supplierName = userSnap.exists
    ? (userSnap.data() as { displayName: string }).displayName
    : actor.email;

  const result: ImportSupplierProductResult = { created: 0, errors: [] };
  const batch = db.batch();

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-indexed + header row offset
    if (!row.name?.trim()) {
      result.errors.push({ row: rowNum, message: "Name is required" });
      return;
    }
    if (!row.category?.trim()) {
      result.errors.push({ row: rowNum, message: "Category is required" });
      return;
    }
    if (!row.unitType?.trim()) {
      result.errors.push({ row: rowNum, message: "Unit is required" });
      return;
    }
    if (!row.batchNumber?.trim()) {
      result.errors.push({ row: rowNum, message: "Batch number is required" });
      return;
    }
    if (!row.warehouseLocation?.trim()) {
      result.errors.push({ row: rowNum, message: "Warehouse location is required" });
      return;
    }

    const ref = collection().doc();
    batch.set(ref, {
      supplierId: actor.uid,
      supplierName,
      companyId,
      companyName: company.name,
      companyManagerName: company.managerName,
      name: row.name.trim(),
      description: null,
      category: row.category.trim(),
      brand: row.brand?.trim() || null,
      unitType: row.unitType.trim(),
      quantityInStock: Number(row.quantityInStock) || 0,
      wholesalePrice: Number(row.wholesalePrice) || 0,
      sellingPrice: Number(row.sellingPrice) || 0,
      minimumStockLevel: Number(row.minimumStockLevel) || 0,
      taxRateId: null,
      expiryDate: row.expiryDate ? new Date(row.expiryDate) : null,
      purchasePrice: Number(row.purchasePrice) || 0,
      purchaseDate: FieldValue.serverTimestamp(),
      batchNumber: row.batchNumber.trim(),
      warehouseLocation: row.warehouseLocation.trim(),
      linkedProductId: null,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    result.created++;
  });

  if (result.created > 0) await batch.commit();
  return result;
}

export async function listSupplierProducts(filters: { supplierId?: string; companyId?: string }) {
  let query: FirebaseFirestore.Query = collection();
  if (filters.supplierId) query = query.where("supplierId", "==", filters.supplierId);
  if (filters.companyId) query = query.where("companyId", "==", filters.companyId);
  const snap = await query.get();
  const products = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SupplierProduct);
  return products.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
}

export async function getSupplierProductById(id: string) {
  const snap = await collection().doc(id).get();
  if (!snap.exists) {
    throw new AppError(404, "Supplier product not found");
  }
  return { id: snap.id, ...snap.data() } as SupplierProduct;
}

async function getSupplierProductOr404(id: string) {
  const ref = collection().doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new AppError(404, "Supplier product not found");
  }
  return { ref, product: snap.data() as SupplierProduct };
}

export async function getOwnedSupplierProduct(id: string, actor: AuthenticatedUser) {
  const { ref, product } = await getSupplierProductOr404(id);
  if (product.supplierId !== actor.uid) {
    throw new AppError(403, "You can only manage your own products");
  }
  return { ref, product };
}

export async function updateSupplierProduct(
  id: string,
  input: UpdateSupplierProductInput,
  actor: AuthenticatedUser,
) {
  const { ref } = await getOwnedSupplierProduct(id, actor);
  await ref.update({ ...input, updatedAt: FieldValue.serverTimestamp() });
  return { id };
}

export async function deleteSupplierProduct(id: string, actor: AuthenticatedUser) {
  const { ref } = await getOwnedSupplierProduct(id, actor);
  await ref.delete();
  return { id };
}

// Core logic that actually bridges a supplier's product record into the
// real, sellable inventory system. Deliberately takes no ownership check —
// callers are already trusted by the time they reach here: either the
// supplier themselves (approving their own stock request) or an admin/
// manager approving a supplier's pending submission on the supplier's
// behalf. The first call creates the linked internal Product (and its
// Category, found-or-created by name); every call — first or repeat — then
// reuses the existing receiveStock transaction to actually move stock in,
// so it gets the exact same batch bookkeeping, low-stock alerting, and
// audit trail as any other receiving.
export async function applySupplierProductToInventory(
  id: string,
  input: SubmitToInventoryInput,
  actor: AuthenticatedUser,
) {
  const { ref, product } = await getSupplierProductOr404(id);

  if (input.quantity > product.quantityInStock) {
    throw new AppError(
      400,
      `Cannot submit ${input.quantity} — only ${product.quantityInStock} currently held for "${product.name}"`,
    );
  }

  let productId = product.linkedProductId;
  if (!productId) {
    const categorySnap = await db
      .collection("categories")
      .where("name", "==", product.category)
      .limit(1)
      .get();
    let categoryId: string;
    if (categorySnap.empty) {
      const categoryRef = db.collection("categories").doc();
      await categoryRef.set({
        name: product.category,
        description: null,
        parentCategoryId: null,
        imageUrl: null,
        isActive: true,
        createdAt: FieldValue.serverTimestamp(),
      });
      categoryId = categoryRef.id;
    } else {
      categoryId = categorySnap.docs[0]!.id;
    }

    const productRef = db.collection("products").doc();
    await productRef.set({
      sku: `SUP-${productRef.id.slice(0, 8).toUpperCase()}`,
      barcode: null,
      name: product.name,
      description: product.description,
      categoryId,
      categoryName: product.category,
      unit: product.unitType,
      costPrice: product.purchasePrice,
      sellingPrice: product.sellingPrice,
      taxRateId: product.taxRateId ?? null,
      images: [],
      // Deliberately NOT product.minimumStockLevel — that's the supplier's
      // own restock threshold for their own listing, unrelated to what the
      // admin wants as a reorder point for this product once it's in their
      // inventory. Defaulting to 10 (the admin can edit it afterward via
      // EditProductDialog) and isLowStock: false avoids the bug where a
      // brand-new product with a large first shipment got immediately
      // flagged "low stock" just because minimumStockLevel was > 0 —
      // receiveStock() below recomputes isLowStock correctly against the
      // real totalStock once stock actually lands.
      reorderLevel: 10,
      maxStockLevel: null,
      trackBatches: true,
      totalStock: 0,
      isLowStock: false,
      isActive: true,
      approvalStatus: "pending",
      supplierProductId: id,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    productId = productRef.id;
    await ref.update({ linkedProductId: productId });
  }

  const receiveResult = await receiveStock(
    {
      productId,
      batchNumber: product.batchNumber,
      quantity: input.quantity,
      costPrice: product.purchasePrice,
      expiryDate: product.expiryDate ? product.expiryDate.toDate() : undefined,
      damagedQuantity: 0,
      missingQuantity: 0,
      returnedQuantity: 0,
    },
    actor,
  );

  await ref.update({
    quantityInStock: product.quantityInStock - input.quantity,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await recordAuditLog({
    userId: actor.uid,
    userName: actor.email,
    role: actor.role,
    action: "SUPPLIER_PRODUCT_SUBMITTED_TO_INVENTORY",
    entityType: "supplierProduct",
    entityId: id,
    after: { productId, quantity: input.quantity },
  });

  return { productId, ...receiveResult };
}
