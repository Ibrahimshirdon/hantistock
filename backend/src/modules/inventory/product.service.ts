import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "../../config/firebase.js";
import { AppError } from "../../shared/utils/AppError.js";
import { uploadBuffer } from "../../shared/utils/uploadFile.js";
import { recordAuditLog } from "../../shared/utils/auditLog.js";
import { createNotification } from "../../shared/utils/notifications.js";
import type { AuthenticatedUser } from "../../shared/types/auth.types.js";
import type { Product } from "../../shared/types/inventory.types.js";
import type { UpdateProductInput } from "./product.types.js";
import { notifyIfNewlyLowStock } from "./lowStockAlert.js";

const collection = () => db.collection("products");

async function getCategoryName(categoryId: string): Promise<string> {
  const snap = await db.collection("categories").doc(categoryId).get();
  if (!snap.exists) {
    throw new AppError(400, "Category not found");
  }
  return (snap.data() as { name: string }).name;
}

export async function listProducts(filters: {
  categoryId?: string;
  lowStockOnly?: boolean;
  availableForSale?: boolean;
}) {
  let query: FirebaseFirestore.Query = collection();
  if (filters.categoryId) {
    query = query.where("categoryId", "==", filters.categoryId);
  }
  if (filters.lowStockOnly) {
    query = query.where("isLowStock", "==", true);
  }
  const snap = await query.get();
  const products = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Product)
    .sort((a, b) => a.name.localeCompare(b.name));
  // A product with no price set yet (sellingPrice 0), or a supplier
  // submission still awaiting admin approval, shouldn't be purchasable —
  // POS/storefront listings filter both out via this flag.
  return filters.availableForSale
    ? products.filter((p) => p.sellingPrice > 0 && p.approvalStatus === "approved")
    : products;
}

export async function getProductById(id: string) {
  const snap = await collection().doc(id).get();
  if (!snap.exists) {
    throw new AppError(404, "Product not found");
  }
  return { id: snap.id, ...snap.data() } as Product;
}

export async function getProductByBarcode(barcode: string) {
  const snap = await collection().where("barcode", "==", barcode).limit(1).get();
  if (snap.empty) {
    throw new AppError(404, "No product matches this barcode");
  }
  const doc = snap.docs[0]!;
  return { id: doc.id, ...doc.data() } as Product;
}

export async function updateProduct(id: string, input: UpdateProductInput) {
  const ref = collection().doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new AppError(404, "Product not found");
  }
  const current = snap.data() as Product;

  const { expiryDate, ...rest } = input;
  const updates: Record<string, unknown> = { ...rest, updatedAt: FieldValue.serverTimestamp() };
  if (expiryDate !== undefined) {
    updates.expiryDate = expiryDate ? Timestamp.fromDate(new Date(expiryDate)) : null;
  }
  if (input.categoryId) {
    updates.categoryName = await getCategoryName(input.categoryId);
  }
  let newIsLowStock = current.isLowStock;
  if (input.reorderLevel !== undefined) {
    newIsLowStock = current.totalStock <= input.reorderLevel;
    updates.isLowStock = newIsLowStock;
  }

  await ref.update(updates);

  await notifyIfNewlyLowStock([
    {
      productId: id,
      productName: current.name,
      wasLowStock: current.isLowStock,
      isLowStock: newIsLowStock,
      totalStock: current.totalStock,
      reorderLevel: input.reorderLevel ?? current.reorderLevel,
      maxStockLevel: input.maxStockLevel ?? current.maxStockLevel,
    },
  ]);

  return { id };
}

export async function uploadProductImage(id: string, fileBuffer: Buffer) {
  const ref = collection().doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new AppError(404, "Product not found");
  }
  const url = await uploadBuffer(fileBuffer, { folder: "products", resourceType: "image" });
  // Every screen displays images[0] as the one current photo (no gallery UI
  // exists), so a re-upload must replace it, not accumulate via arrayUnion.
  await ref.update({ images: [url], updatedAt: FieldValue.serverTimestamp() });
  return { url };
}

// Final gate for supplier-sourced products: created with approvalStatus
// "pending" (invisible to POS/shop/availableForSale listings) until an admin
// reviews and approves them here. Hand-created (admin/staff) products skip
// this entirely since createProduct already marks them "approved".
export async function approveProduct(id: string, actor: AuthenticatedUser) {
  const ref = collection().doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new AppError(404, "Product not found");
  }
  const product = snap.data() as Product;
  if (product.approvalStatus === "approved") {
    throw new AppError(400, "Product is already approved");
  }

  await ref.update({ approvalStatus: "approved", updatedAt: FieldValue.serverTimestamp() });

  await recordAuditLog({
    userId: actor.uid,
    userName: actor.email,
    role: actor.role,
    action: "PRODUCT_APPROVED",
    entityType: "product",
    entityId: id,
    after: { name: product.name },
  });

  if (product.supplierProductId) {
    const supplierProductSnap = await db.collection("supplierProducts").doc(product.supplierProductId).get();
    if (supplierProductSnap.exists) {
      const supplierProduct = supplierProductSnap.data() as { supplierId: string };
      await createNotification({
        userId: supplierProduct.supplierId,
        title: "Product approved",
        message: `Your product "${product.name}" has been approved and is now live for sale.`,
        type: "system",
        relatedEntityId: id,
      });
    }
  }

  return { id };
}

export async function deleteProduct(id: string, actor: AuthenticatedUser) {
  const ref = collection().doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new AppError(404, "Product not found");
  }
  const product = snap.data() as Product;

  if (product.totalStock > 0) {
    throw new AppError(
      400,
      "Cannot delete a product that still has stock on hand — adjust stock to zero first or deactivate it instead",
    );
  }

  await ref.delete();

  await recordAuditLog({
    userId: actor.uid,
    userName: actor.email,
    role: actor.role,
    action: "PRODUCT_DELETED",
    entityType: "product",
    entityId: id,
    before: { sku: product.sku, name: product.name },
  });

  return { id };
}

export interface ImportRow {
  name: string;
  sku: string;
  category: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  reorderLevel: number;
  barcode?: string;
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export async function importProducts(rows: ImportRow[]): Promise<ImportResult> {
  const result: ImportResult = { created: 0, skipped: 0, errors: [] };

  // Fetch all categories once and index by exact name AND emoji-stripped name
  // This handles garbled category names (e.g. Excel corrupting emoji to ðŸ¥•)
  const stripLeadingEmoji = (s: string) =>
    s.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/gu, "").trim();

  const allCatsSnap = await db.collection("categories").get();
  const categoryMap = new Map<string, { id: string; name: string }>();
  allCatsSnap.docs.forEach((d) => {
    const data = d.data() as { name: string };
    const cat = { id: d.id, name: data.name };
    categoryMap.set(data.name.toLowerCase(), cat);
    const stripped = stripLeadingEmoji(data.name).toLowerCase();
    if (stripped && stripped !== data.name.toLowerCase()) {
      categoryMap.set(stripped, cat);
    }
  });

  // Check existing SKUs (Firestore IN query, chunked to 30)
  const skus = rows.map((r) => r.sku?.trim().toUpperCase()).filter(Boolean) as string[];
  const existingSkus = new Set<string>();
  for (let i = 0; i < skus.length; i += 30) {
    const chunk = skus.slice(i, i + 30);
    const snap = await db.collection("products").where("sku", "in", chunk).get();
    snap.docs.forEach((d) => existingSkus.add((d.data() as Product).sku.toUpperCase()));
  }

  const batch = db.batch();

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-indexed + header row offset
    const sku = row.sku?.trim().toUpperCase();
    const rawCat = row.category?.trim() ?? "";
    const category =
      categoryMap.get(rawCat.toLowerCase()) ??
      categoryMap.get(stripLeadingEmoji(rawCat).toLowerCase());

    if (!row.name?.trim()) {
      result.errors.push({ row: rowNum, message: "Name is required" });
      return;
    }
    if (!sku) {
      result.errors.push({ row: rowNum, message: "SKU is required" });
      return;
    }
    if (existingSkus.has(sku)) {
      result.skipped++;
      return;
    }
    if (!category) {
      result.errors.push({ row: rowNum, message: `Category "${row.category}" not found` });
      return;
    }

    const ref = db.collection("products").doc();
    batch.set(ref, {
      sku,
      barcode: row.barcode?.trim() || null,
      name: row.name.trim(),
      description: null,
      categoryId: category.id,
      categoryName: category.name,
      unit: row.unit?.trim() || "pcs",
      costPrice: Number(row.costPrice) || 0,
      sellingPrice: Number(row.sellingPrice) || 0,
      taxRateId: null,
      images: [],
      reorderLevel: Number(row.reorderLevel) || 5,
      maxStockLevel: null,
      trackBatches: false,
      totalStock: 0,
      isLowStock: false,
      isActive: true,
      approvalStatus: "approved",
      supplierProductId: null,
      expiryDate: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    result.created++;
  });

  if (result.created > 0) await batch.commit();
  return result;
}
