import { FieldValue } from "firebase-admin/firestore";
import { db } from "../../config/firebase.js";
import { AppError } from "../../shared/utils/AppError.js";
import { createNotification } from "../../shared/utils/notifications.js";
import { counterRef, formatSequence, readCounterValue } from "../../shared/utils/counters.js";
import type { AuthenticatedUser } from "../../shared/types/auth.types.js";
import type { Batch, Product } from "../../shared/types/inventory.types.js";
import type { Address, CustomerProfile } from "../../shared/types/user.types.js";
import type { Discount, SalesOrder, SalesOrderItem, SalesReturn, TaxRate } from "../../shared/types/sales.types.js";
import { computeDiscountAmount, isDiscountCurrentlyValid } from "./discount.service.js";
import type { CreateSalesOrderInput } from "./salesOrder.types.js";
import { notifyIfNewlyLowStock } from "../inventory/lowStockAlert.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface BatchDeduction {
  batchRef: FirebaseFirestore.DocumentReference;
  newQuantity: number;
  willBeDepleted: boolean;
}

function planFifoDeduction(batches: Batch[], quantityNeeded: number, batchRefs: FirebaseFirestore.DocumentReference[]) {
  const sorted = batches
    .map((batch, index) => ({ batch, ref: batchRefs[index]! }))
    .sort((a, b) => {
      const aTime = a.batch.expiryDate?.toMillis() ?? Infinity;
      const bTime = b.batch.expiryDate?.toMillis() ?? Infinity;
      if (aTime !== bTime) return aTime - bTime;
      return a.batch.receivedDate.toMillis() - b.batch.receivedDate.toMillis();
    });

  const deductions: BatchDeduction[] = [];
  let remaining = quantityNeeded;
  for (const { batch, ref } of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    if (take <= 0) continue;
    remaining -= take;
    deductions.push({ batchRef: ref, newQuantity: batch.quantity - take, willBeDepleted: batch.quantity - take === 0 });
  }

  if (remaining > 0) {
    return null;
  }
  return deductions;
}

export async function createSalesOrder(
  input: CreateSalesOrderInput,
  actor: AuthenticatedUser,
  orderType: "pos" | "online" = "pos",
  fulfillment: { fulfillmentType?: "pickup" | "delivery"; deliveryFee?: number; deliveryAddress?: Address } = {},
) {
  // All online (customer portal) orders start as "pending" — they require
  // explicit approval by staff/manager/admin before being processed. POS
  // sales are fulfilled in-person immediately and go straight to "completed".
  const isOnlineOrder = orderType === "online";

  const orderRef = db.collection("salesOrders").doc();
  const invoiceRef = db.collection("invoices").doc();
  const receiptRef = db.collection("receipts").doc();

  const actorSnap = await db.collection("users").doc(actor.uid).get();
  const createdByName = actorSnap.exists
    ? (actorSnap.data() as { displayName: string }).displayName
    : actor.email;

  // Consolidate duplicate product lines up front. Without this, two FIFO
  // depletion plans for the same product could both read the same
  // pre-transaction batch quantity and overwrite each other's deduction on
  // write (last write wins), silently under-depleting stock.
  const mergedQuantities = new Map<string, number>();
  for (const item of input.items) {
    mergedQuantities.set(item.productId, (mergedQuantities.get(item.productId) ?? 0) + item.quantity);
  }
  const orderItems = Array.from(mergedQuantities, ([productId, quantity]) => ({ productId, quantity }));

  const lowStockTransitions: Parameters<typeof notifyIfNewlyLowStock>[0] = [];

  await db.runTransaction(async (tx) => {
    // ---------- READ PHASE ----------
    const productRefs = orderItems.map((item) => db.collection("products").doc(item.productId));
    const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));
    const products = productSnaps.map((snap, i) => {
      if (!snap.exists) throw new AppError(404, `Product ${orderItems[i]!.productId} not found`);
      return snap.data() as Product;
    });

    const batchQueries = orderItems.map((item) =>
      db
        .collection("batches")
        .where("productId", "==", item.productId)
        .where("status", "==", "active"),
    );
    const batchSnaps = await Promise.all(batchQueries.map((q) => tx.get(q)));

    const taxRateIds = [...new Set(products.map((p) => p.taxRateId).filter((id): id is string => !!id))];
    const taxRateSnaps = await Promise.all(
      taxRateIds.map((id) => tx.get(db.collection("taxRates").doc(id))),
    );
    const taxRateById = new Map<string, number>();
    taxRateIds.forEach((id, i) => {
      const snap = taxRateSnaps[i]!;
      taxRateById.set(id, snap.exists ? (snap.data() as TaxRate).rate : 0);
    });

    let discountSnapDoc: { id: string; data: Discount } | null = null;
    if (input.discountCode) {
      const discountSnap = await tx.get(
        db.collection("discounts").where("code", "==", input.discountCode.toUpperCase()).limit(1),
      );
      if (discountSnap.empty) throw new AppError(404, "Invalid discount code");
      const doc = discountSnap.docs[0]!;
      discountSnapDoc = { id: doc.id, data: doc.data() as Discount };
    }

    let customerProfileRef: FirebaseFirestore.DocumentReference | null = null;
    let customerProfile: CustomerProfile | null = null;
    let customerName: string | null = null;
    if (input.customerId) {
      const [profileSnap, userSnap] = await Promise.all([
        tx.get(db.collection("customerProfiles").doc(input.customerId)),
        tx.get(db.collection("users").doc(input.customerId)),
      ]);
      if (!profileSnap.exists || !userSnap.exists) {
        throw new AppError(404, "Customer not found");
      }
      customerProfileRef = profileSnap.ref;
      customerProfile = profileSnap.data() as CustomerProfile;
      customerName = (userSnap.data() as { displayName: string }).displayName;
    }

    if (input.paymentMethod === "wallet" && !input.customerId) {
      throw new AppError(400, "Wallet payment requires a customer");
    }
    if (input.paymentMethod === "loan" && !input.customerId) {
      throw new AppError(400, "Loan payment requires a customer");
    }

    const orderNumberCurrent = await readCounterValue(tx, "orderNumber");
    const invoiceNumberCurrent = await readCounterValue(tx, "invoiceNumber");
    const receiptNumberCurrent = await readCounterValue(tx, "receiptNumber");

    // ---------- COMPUTE PHASE ----------
    const batchDeductionsPerItem: (BatchDeduction[] | null)[] = [];
    const items: SalesOrderItem[] = orderItems.map((item, i) => {
      const product = products[i]!;
      if (!product.isActive) {
        throw new AppError(400, `Product ${product.name} is not active`);
      }
      const batches = batchSnaps[i]!.docs.map((d) => d.data() as Batch);
      const batchRefs = batchSnaps[i]!.docs.map((d) => d.ref);
      const deductions = planFifoDeduction(batches, item.quantity, batchRefs);
      if (!deductions) {
        throw new AppError(
          400,
          `Insufficient stock for ${product.name}: requested ${item.quantity}, available ${batches.reduce((s, b) => s + b.quantity, 0)}`,
        );
      }
      batchDeductionsPerItem.push(deductions);

      const taxRate = product.taxRateId ? taxRateById.get(product.taxRateId) ?? 0 : 0;
      const lineTotal = round2(item.quantity * product.sellingPrice);
      return {
        productId: item.productId,
        productName: product.name,
        batchId: null,
        quantity: item.quantity,
        unitPrice: product.sellingPrice,
        discountAmount: 0,
        taxRate,
        lineTotal,
      };
    });

    const subtotal = round2(items.reduce((sum, item) => sum + item.lineTotal, 0));

    let discountTotal = 0;
    if (discountSnapDoc) {
      if (!isDiscountCurrentlyValid(discountSnapDoc.data)) {
        throw new AppError(400, "This discount code is not currently valid");
      }
      discountTotal = round2(
        computeDiscountAmount(
          discountSnapDoc.data,
          items.map((item, i) => ({
            productId: item.productId,
            categoryId: products[i]!.categoryId,
            lineSubtotal: item.lineTotal,
          })),
        ),
      );
      if (discountTotal === 0) {
        throw new AppError(400, "Order does not meet the requirements for this discount code");
      }
    }

    let taxTotal = 0;
    for (const item of items) {
      const discountShare = subtotal > 0 ? (item.lineTotal / subtotal) * discountTotal : 0;
      item.discountAmount = round2(discountShare);
      const taxableAmount = item.lineTotal - discountShare;
      taxTotal += taxableAmount * item.taxRate;
    }
    taxTotal = round2(taxTotal);

    const deliveryFee = fulfillment.deliveryFee ?? 0;
    const preLoyaltyTotal = round2(subtotal - discountTotal + taxTotal + deliveryFee);

    // Loyalty redemption: 100 points = $1.00
    const pointsToRedeem = input.pointsToRedeem ?? 0;
    let loyaltyDiscountAmount = 0;
    if (pointsToRedeem > 0) {
      if (!customerProfile) throw new AppError(400, "Select a customer to redeem loyalty points");
      if (customerProfile.loyaltyPoints < pointsToRedeem) {
        throw new AppError(400, `Insufficient loyalty points — available ${customerProfile.loyaltyPoints}`);
      }
      loyaltyDiscountAmount = round2(Math.min(pointsToRedeem / 100, preLoyaltyTotal));
    }
    const grandTotal = round2(preLoyaltyTotal - loyaltyDiscountAmount);

    if (input.paymentMethod === "wallet") {
      if (!customerProfile || customerProfile.walletBalance < grandTotal) {
        throw new AppError(400, "Insufficient wallet balance");
      }
    }

    // Choosing "loan" doesn't put the whole order on credit — any existing
    // wallet balance is applied first, and only the shortfall (if any) is
    // actually borrowed. If the wallet alone covers it, no Loan doc is
    // created at all; this mirrors the user's own framing: "deducted from
    // his wallet whatever balance is there, [and] if there [is] no more
    // balance remain[ing], the loan [covers] there[st]."
    let loanWalletContribution = 0;
    let loanPortion = 0;
    if (input.paymentMethod === "loan") {
      if (!customerProfile) {
        throw new AppError(400, "Loan payment requires a customer");
      }
      loanWalletContribution = round2(Math.min(customerProfile.walletBalance ?? 0, grandTotal));
      loanPortion = round2(grandTotal - loanWalletContribution);
      const availableCredit = round2(
        (customerProfile.creditLimit ?? 0) - (customerProfile.outstandingLoanBalance ?? 0),
      );
      if (loanPortion > availableCredit) {
        throw new AppError(
          400,
          `Insufficient credit limit — available $${availableCredit.toFixed(2)}, ` +
            `$${loanPortion.toFixed(2)} would need to be borrowed after applying your ` +
            `$${loanWalletContribution.toFixed(2)} wallet balance`,
        );
      }
    }

    const orderNumber = formatSequence(orderNumberCurrent + 1, "SO");
    const invoiceNumber = formatSequence(invoiceNumberCurrent + 1, "INV");
    const receiptNumber = formatSequence(receiptNumberCurrent + 1, "RCT");

    // ---------- WRITE PHASE ----------
    batchDeductionsPerItem.forEach((deductions) => {
      deductions!.forEach((deduction) => {
        tx.update(deduction.batchRef, {
          quantity: deduction.newQuantity,
          status: deduction.willBeDepleted ? "depleted" : "active",
        });
      });
    });

    orderItems.forEach((item, i) => {
      const product = products[i]!;
      const newTotalStock = product.totalStock - item.quantity;
      const newIsLowStock = newTotalStock <= product.reorderLevel;
      tx.update(productRefs[i]!, {
        totalStock: newTotalStock,
        isLowStock: newIsLowStock,
        updatedAt: FieldValue.serverTimestamp(),
      });
      lowStockTransitions.push({
        productId: item.productId,
        productName: product.name,
        wasLowStock: product.isLowStock,
        isLowStock: newIsLowStock,
        totalStock: newTotalStock,
        reorderLevel: product.reorderLevel,
        maxStockLevel: product.maxStockLevel,
      });
    });

    if (discountSnapDoc) {
      tx.update(db.collection("discounts").doc(discountSnapDoc.id), {
        usedCount: FieldValue.increment(1),
      });
    }

    if (pointsToRedeem > 0 && customerProfileRef) {
      tx.update(customerProfileRef, { loyaltyPoints: FieldValue.increment(-pointsToRedeem) });
    }

    let walletTransactionRef: FirebaseFirestore.DocumentReference | null = null;
    if (input.paymentMethod === "wallet" && customerProfileRef && customerProfile) {
      const newBalance = round2(customerProfile.walletBalance - grandTotal);
      tx.update(customerProfileRef, { walletBalance: newBalance });
      walletTransactionRef = db.collection("walletTransactions").doc();
      tx.set(walletTransactionRef, {
        customerId: input.customerId,
        type: "debit",
        amount: grandTotal,
        reason: "purchase",
        relatedOrderId: orderRef.id,
        balanceAfter: newBalance,
        performedBy: null,
        performedByName: null,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    let loanRef: FirebaseFirestore.DocumentReference | null = null;
    if (input.paymentMethod === "loan" && customerProfileRef && customerProfile) {
      const profileUpdates: Record<string, number> = {};
      if (loanWalletContribution > 0) {
        profileUpdates.walletBalance = round2(customerProfile.walletBalance - loanWalletContribution);
      }
      if (loanPortion > 0) {
        profileUpdates.outstandingLoanBalance = round2(
          (customerProfile.outstandingLoanBalance ?? 0) + loanPortion,
        );
      }
      if (Object.keys(profileUpdates).length > 0) {
        tx.update(customerProfileRef, profileUpdates);
      }

      if (loanWalletContribution > 0) {
        tx.set(db.collection("walletTransactions").doc(), {
          customerId: input.customerId,
          type: "debit",
          amount: loanWalletContribution,
          reason: "purchase",
          relatedOrderId: orderRef.id,
          balanceAfter: profileUpdates.walletBalance ?? customerProfile.walletBalance,
          performedBy: null,
          performedByName: null,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      if (loanPortion > 0) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        loanRef = db.collection("loans").doc();
        tx.set(loanRef, {
          customerId: input.customerId,
          customerName,
          salesOrderId: orderRef.id,
          orderNumber,
          principalAmount: loanPortion,
          amountRepaid: 0,
          balanceRemaining: loanPortion,
          status: "outstanding",
          dueDate,
          overdueNotifiedAt: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    tx.set(counterRef("orderNumber"), { name: "orderNumber", lastValue: orderNumberCurrent + 1 });
    tx.set(counterRef("invoiceNumber"), { name: "invoiceNumber", lastValue: invoiceNumberCurrent + 1 });
    tx.set(counterRef("receiptNumber"), { name: "receiptNumber", lastValue: receiptNumberCurrent + 1 });

    const orderData = {
      orderNumber,
      type: orderType,
      customerId: input.customerId ?? null,
      customerName,
      items,
      subtotal,
      discountTotal,
      loyaltyDiscountTotal: loyaltyDiscountAmount,
      pointsRedeemed: pointsToRedeem,
      taxTotal,
      fulfillmentType: fulfillment.fulfillmentType ?? null,
      deliveryFee,
      deliveryAddress: fulfillment.deliveryAddress ?? null,
      grandTotal,
      paymentStatus: "paid" as const,
      paymentMethod: input.paymentMethod,
      status: isOnlineOrder ? ("pending" as const) : ("completed" as const),
      createdBy: actor.uid,
      createdByName,
      createdByRole: actor.role,
      completedBy: isOnlineOrder ? null : actor.uid,
      completedByName: isOnlineOrder ? null : createdByName,
      completedAt: isOnlineOrder ? null : FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(orderRef, orderData);

    tx.set(invoiceRef, {
      invoiceNumber,
      salesOrderId: orderRef.id,
      customerId: input.customerId ?? null,
      itemsSnapshot: items,
      subtotal,
      discountTotal,
      taxTotal,
      grandTotal,
      status: "paid",
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.set(receiptRef, {
      receiptNumber,
      salesOrderId: orderRef.id,
      amountPaid: grandTotal,
      paymentMethod: input.paymentMethod,
      changeGiven: 0,
      issuedBy: actor.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  await notifyIfNewlyLowStock(lowStockTransitions);

  // Award loyalty points for POS purchases made by a registered customer
  if (!isOnlineOrder && input.customerId) {
    await awardLoyaltyPointsForOrder(input.customerId, orderRef.id);
  }

  return { id: orderRef.id, invoiceId: invoiceRef.id, receiptId: receiptRef.id };
}

// Refund state is never written back onto the order document (see
// salesReturn.service.ts), so a refunded order would otherwise still show
// as a plain "completed" order here — this attaches the refunded total so
// the list page can tell a genuinely successful sale apart from one that
// was later refunded, without a migration of historical order docs.
async function getRefundedTotalsByOrder(orderIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (orderIds.length === 0) return map;
  const chunks: string[][] = [];
  for (let i = 0; i < orderIds.length; i += 30) chunks.push(orderIds.slice(i, i + 30));
  const snaps = await Promise.all(
    chunks.map((chunk) => db.collection("salesReturns").where("orderId", "in", chunk).get()),
  );
  snaps.forEach((snap) =>
    snap.docs.forEach((d) => {
      const ret = d.data() as SalesReturn;
      map.set(ret.orderId, (map.get(ret.orderId) ?? 0) + ret.refundTotal);
    }),
  );
  return map;
}

export async function listSalesOrders(filters: {
  customerId?: string;
  status?: string;
  createdBy?: string;
}) {
  let query: FirebaseFirestore.Query = db.collection("salesOrders");
  if (filters.customerId) query = query.where("customerId", "==", filters.customerId);
  if (filters.status) query = query.where("status", "==", filters.status);
  if (filters.createdBy) query = query.where("createdBy", "==", filters.createdBy);
  const snap = await query.get();
  const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SalesOrder);

  const completedIds = orders.filter((o) => o.status === "completed").map((o) => o.id);
  const refundedTotals = await getRefundedTotalsByOrder(completedIds);
  const withRefunds = orders.map((o) => ({ ...o, refundedAmount: refundedTotals.get(o.id) ?? 0 }));

  return withRefunds.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
}

export async function getSalesOrderById(id: string) {
  const snap = await db.collection("salesOrders").doc(id).get();
  if (!snap.exists) {
    throw new AppError(404, "Sales order not found");
  }
  return { id: snap.id, ...snap.data() } as SalesOrder;
}

// Called when a delivery actually gets marked "delivered" — flips the
// pending/confirmed online-delivery order over to completed, attributing
// it to whoever delivered it (the driver).
export async function markOrderCompleted(id: string, actor: AuthenticatedUser) {
  const ref = db.collection("salesOrders").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new AppError(404, "Sales order not found");
  }
  const order = snap.data() as SalesOrder;
  if (order.status !== "pending" && order.status !== "confirmed") {
    return;
  }

  const actorSnap = await db.collection("users").doc(actor.uid).get();
  const completedByName = actorSnap.exists
    ? (actorSnap.data() as { displayName: string }).displayName
    : actor.email;

  await ref.update({
    status: "completed",
    completedBy: actor.uid,
    completedByName,
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (order.customerId) {
    await awardLoyaltyPointsForOrder(order.customerId, id);
  }
}

export async function getInvoiceForOrder(orderId: string) {
  const snap = await db.collection("invoices").where("salesOrderId", "==", orderId).limit(1).get();
  if (snap.empty) {
    throw new AppError(404, "Invoice not found");
  }
  const doc = snap.docs[0]!;
  return { id: doc.id, ...doc.data() };
}

export async function getReceiptForOrder(orderId: string) {
  const snap = await db.collection("receipts").where("salesOrderId", "==", orderId).limit(1).get();
  if (snap.empty) {
    throw new AppError(404, "Receipt not found");
  }
  const doc = snap.docs[0]!;
  return { id: doc.id, ...doc.data() };
}

async function getActorName(uid: string, fallback: string): Promise<string> {
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? (snap.data() as { displayName: string }).displayName : fallback;
}

export async function approveOrder(id: string, _actor: AuthenticatedUser) {
  const ref = db.collection("salesOrders").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError(404, "Sales order not found");
  const order = snap.data() as SalesOrder;
  if (order.status !== "pending") throw new AppError(400, "Only pending orders can be approved");

  await ref.update({ status: "confirmed", updatedAt: FieldValue.serverTimestamp() });

  if (order.customerId) {
    await createNotification({
      userId: order.customerId,
      title: "Order Approved",
      message: `Your order ${order.orderNumber} has been approved and is now being processed.`,
      type: "order",
      relatedEntityId: id,
    });
  }
}

async function awardLoyaltyPointsForOrder(customerId: string, orderId: string): Promise<void> {
  const orderSnap = await db.collection("salesOrders").doc(orderId).get();
  if (!orderSnap.exists) return;
  const order = orderSnap.data() as SalesOrder;
  const points = Math.floor(order.grandTotal);
  if (points <= 0) return;

  const profileRef = db.collection("customerProfiles").doc(customerId);
  const profileSnap = await profileRef.get();
  if (!profileSnap.exists) return;

  await profileRef.update({ loyaltyPoints: FieldValue.increment(points) });
  await createNotification({
    userId: customerId,
    title: "Loyalty points earned",
    message: `You earned ${points} loyalty points on order ${order.orderNumber}. Keep shopping to unlock more rewards!`,
    type: "system",
    relatedEntityId: orderId,
  });
}

export async function completeOrder(id: string, actor: AuthenticatedUser) {
  const ref = db.collection("salesOrders").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError(404, "Sales order not found");
  const order = snap.data() as SalesOrder;
  if (order.status === "completed") return;
  if (order.status === "cancelled") throw new AppError(400, "Cannot complete a cancelled order");

  const completedByName = await getActorName(actor.uid, actor.email);
  await ref.update({
    status: "completed",
    completedBy: actor.uid,
    completedByName,
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (order.customerId) {
    await createNotification({
      userId: order.customerId,
      title: "Order Completed",
      message: `Your order ${order.orderNumber} has been fulfilled. Thank you for your purchase!`,
      type: "order",
      relatedEntityId: id,
    });
    await awardLoyaltyPointsForOrder(order.customerId, id);
  }
}

export async function cancelOrder(id: string, _actor: AuthenticatedUser) {
  const ref = db.collection("salesOrders").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError(404, "Sales order not found");
  const order = snap.data() as SalesOrder;
  if (order.status === "completed") throw new AppError(400, "Cannot cancel a completed order");
  if (order.status === "cancelled") return;

  await ref.update({ status: "cancelled", updatedAt: FieldValue.serverTimestamp() });

  if (order.customerId) {
    await createNotification({
      userId: order.customerId,
      title: "Order Cancelled",
      message: `Your order ${order.orderNumber} has been cancelled. Please contact us if you have questions.`,
      type: "order",
      relatedEntityId: id,
    });
  }
}
