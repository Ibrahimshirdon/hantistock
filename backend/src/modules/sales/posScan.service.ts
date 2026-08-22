import { FieldValue } from "firebase-admin/firestore";
import { db } from "../../config/firebase.js";
import { getProductByBarcode } from "../inventory/product.service.js";
import type { AuthenticatedUser } from "../../shared/types/auth.types.js";

const collection = () => db.collection("posScans");

// A mobile scan is only ever an intent to add a product to whichever
// desktop POS cart belongs to the SAME logged-in staff account — pairing
// is just "same account, two devices," nothing more. It never touches
// stock or creates any sales record; stock only ever moves at actual
// checkout (salesOrder.service.ts's createSalesOrder), completely
// unchanged by this feature.
//
// A "not found" scan is answered directly from this response and never
// persisted — the phone already has its answer, and the desktop has
// nothing useful to do with a barcode that didn't resolve to a product.
export async function createScan(barcode: string, actor: AuthenticatedUser) {
  let product;
  try {
    product = await getProductByBarcode(barcode);
  } catch {
    return { productId: null, productName: null, unitPrice: null, found: false };
  }

  await collection().add({
    staffId: actor.uid,
    barcode,
    productId: product.id,
    productName: product.name,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { productId: product.id, productName: product.name, unitPrice: product.sellingPrice, found: true };
}

// Polled by the desktop POS every couple of seconds while it's open (see
// POSPage.tsx). Every doc returned here is immediately deleted in the same
// batch, so the collection only ever holds scans not yet delivered to a
// desktop tab — nothing to prune later, and the same scan can never be
// delivered twice from a single poll's perspective. Single equality filter
// on staffId only (no composite index needed), matching this codebase's
// established "one Firestore filter, rest in memory if any" convention.
export async function consumePendingScans(actor: AuthenticatedUser) {
  const snap = await collection().where("staffId", "==", actor.uid).get();
  if (snap.empty) return [];

  const batch = db.batch();
  const scans = snap.docs.map((doc) => {
    batch.delete(doc.ref);
    const data = doc.data();
    return {
      barcode: data.barcode as string,
      productId: data.productId as string,
      productName: data.productName as string,
    };
  });
  await batch.commit();
  return scans;
}
