import { FieldValue } from "firebase-admin/firestore";
import { db } from "../../config/firebase.js";
import { notifyRole, createNotification } from "../../shared/utils/notifications.js";
import { recordAuditLog } from "../../shared/utils/auditLog.js";
import type { Product } from "../../shared/types/inventory.types.js";
import type { SupplierProduct } from "../../shared/types/supplier.types.js";
import type { UserRole } from "../../shared/types/auth.types.js";

interface LowStockTransition {
  productId: string;
  productName: string;
  wasLowStock: boolean;
  isLowStock: boolean;
  totalStock: number;
  reorderLevel: number;
  maxStockLevel?: number | null;
}

export function recommendedReorderQuantity(
  totalStock: number,
  reorderLevel: number,
  maxStockLevel?: number | null,
): number {
  const target = maxStockLevel ?? reorderLevel * 2;
  return Math.max(target - totalStock, reorderLevel);
}

// Auto-creates a pending stock request to the linked supplier when stock hits
// the reorder level. Skips silently if: no linked supplier, supplier has no
// stock, or a pending request already exists for the same supplier product.
async function autoCreateStockRequest(
  productId: string,
  productName: string,
  totalStock: number,
  reorderLevel: number,
  maxStockLevel?: number | null,
): Promise<void> {
  const productSnap = await db.collection("products").doc(productId).get();
  if (!productSnap.exists) return;
  const product = productSnap.data() as Product;
  const supplierProductId = product.supplierProductId;
  if (!supplierProductId) return;

  // Don't create a duplicate if there's already a pending request for this item
  const existingSnap = await db
    .collection("stockRequests")
    .where("supplierProductId", "==", supplierProductId)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!existingSnap.empty) return;

  const spSnap = await db.collection("supplierProducts").doc(supplierProductId).get();
  if (!spSnap.exists) return;
  const sp = spSnap.data() as SupplierProduct;
  if (sp.quantityInStock <= 0) return;

  const qty = Math.min(
    recommendedReorderQuantity(totalStock, reorderLevel, maxStockLevel),
    sp.quantityInStock,
  );
  if (qty <= 0) return;

  const ref = db.collection("stockRequests").doc();
  await ref.set({
    supplierProductId,
    productName: sp.name,
    companyName: sp.companyName,
    supplierId: sp.supplierId,
    quantity: qty,
    message: "Auto-generated: stock fell to reorder level.",
    status: "pending",
    requestedBy: "system",
    requestedByName: "System (Auto-reorder)",
    requestedByRole: "admin",
    resultingProductId: null,
    rejectionReason: null,
    createdAt: FieldValue.serverTimestamp(),
    respondedAt: null,
  });

  await Promise.all([
    createNotification({
      userId: sp.supplierId,
      title: "Stock requested (auto-reorder)",
      message: `${productName} reached its reorder level. System auto-requested ${qty} units of "${sp.name}" (${sp.companyName}).`,
      type: "system",
      relatedEntityId: ref.id,
    }),
    notifyRole(["admin", "manager"], {
      title: "Auto-reorder created",
      message: `${productName} hit reorder level — a stock request for ${qty} units was automatically sent to ${sp.companyName}.`,
      type: "system",
      relatedEntityId: ref.id,
    }),
    recordAuditLog({
      userId: "system",
      userName: "system@hantistock.pro",
      role: "admin" as UserRole,
      action: "STOCK_REQUEST_AUTO_CREATED",
      entityType: "stockRequest",
      entityId: ref.id,
      after: { supplierProductId, quantity: qty, trigger: "low_stock_auto_reorder" },
    }),
  ]);
}

// Fires only on the false -> true transition, never while a product stays
// low across multiple stock movements, to avoid notification spam.
export async function notifyIfNewlyLowStock(transitions: LowStockTransition[]) {
  const newlyLow = transitions.filter((t) => t.isLowStock && !t.wasLowStock);
  await Promise.all(
    newlyLow.map((t) => {
      const suggestedQty = recommendedReorderQuantity(t.totalStock, t.reorderLevel, t.maxStockLevel);
      return Promise.all([
        notifyRole(["admin", "manager", "staff"], {
          title: "Low stock alert",
          message: `${t.productName} is low on stock (${t.totalStock} left, reorder level ${t.reorderLevel}). Recommended reorder quantity: ${suggestedQty}.`,
          type: "system",
          relatedEntityId: t.productId,
        }),
        autoCreateStockRequest(t.productId, t.productName, t.totalStock, t.reorderLevel, t.maxStockLevel),
      ]);
    }),
  );
}
