



import { auth, db } from "../../config/firebase.js";
import { recordAuditLog } from "../../shared/utils/auditLog.js";
import type { AuthenticatedUser } from "../../shared/types/auth.types.js";

// Every top-level collection in the system except "users" and "staffProfiles"
// (which need the actor's own document preserved) — keep in sync with
// whatever collections future modules add.
const COLLECTIONS_TO_WIPE = [
  "activityLogs",
  "auditLogs",
  "batches",
  "categories",
  "counters",
  "customerProfiles",
  "deliveryIssues",
  "discounts",
  "driverProfiles",
  "expenses",
  "goodsReceipts",
  "invoices",
  "loans",
  "loanRepayments",
  "notifications",
  "otherIncome",
  "products",
  "receipts",
  "salesOrders",
  "stockAdjustments",
  "stockRequests",
  "supplierCompanies",
  "supplierProducts",
  "supplierProfiles",
  "supplierSubmissions",
  "taxRates",
  "walletTransactions",
];

const BATCH_SIZE = 450; // Firestore batch writes cap at 500 operations.

async function deleteDocs(docs: FirebaseFirestore.QueryDocumentSnapshot[]) {
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    docs.slice(i, i + BATCH_SIZE).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function wipeCollection(name: string, keepDocId?: string) {
  const snap = await db.collection(name).get();
  const docs = keepDocId ? snap.docs.filter((d) => d.id !== keepDocId) : snap.docs;
  await deleteDocs(docs);
}

// Deliveries have a "statusHistory" subcollection per document — deleting the
// parent doc does not delete its subcollections, so each one is cleared first.
async function wipeDeliveriesWithHistory() {
  const snap = await db.collection("deliveries").get();
  for (const doc of snap.docs) {
    const historySnap = await doc.ref.collection("statusHistory").get();
    await deleteDocs(historySnap.docs);
  }
  await deleteDocs(snap.docs);
}

async function deleteAllAuthUsersExcept(keepUid: string) {
  let pageToken: string | undefined;
  let deletedCount = 0;
  do {
    const page = await auth.listUsers(1000, pageToken);
    const uidsToDelete = page.users.map((u) => u.uid).filter((uid) => uid !== keepUid);
    if (uidsToDelete.length > 0) {
      const result = await auth.deleteUsers(uidsToDelete);
      deletedCount += result.successCount;
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return deletedCount;
}

export async function resetSystem(actor: AuthenticatedUser) {
  await wipeDeliveriesWithHistory();
  for (const name of COLLECTIONS_TO_WIPE) {
    await wipeCollection(name);
  }
  await wipeCollection("staffProfiles", actor.uid);
  await wipeCollection("users", actor.uid);

  const deletedAuthUsers = await deleteAllAuthUsersExcept(actor.uid);

  // Written after every other collection (including auditLogs) has been
  // wiped, so this is intentionally the first entry in the fresh log.
  await recordAuditLog({
    userId: actor.uid,
    userName: actor.email,
    role: actor.role,
    action: "SYSTEM_RESET",
    entityType: "system",
    entityId: "system",
    after: { deletedAuthUsers },
  });

  return { deletedAuthUsers };
}
