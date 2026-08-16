import { FieldValue } from "firebase-admin/firestore";
import { db } from "../../config/firebase.js";
import { AppError } from "../../shared/utils/AppError.js";
import { createExpense, deleteExpense } from "../finance/expense.service.js";
import type { AuthenticatedUser } from "../../shared/types/auth.types.js";
import type { StaffSalary, SalaryPayment } from "../../shared/types/hr.types.js";
import type { SetSalaryInput } from "./salary.types.js";

const collection = () => db.collection("salaries");
const paymentsCollection = () => db.collection("salaryPayments");

// "YYYY-MM" from the server clock — same UTC-based date-string convention
// attendance.service.ts's todayDateString() uses, never trusting anything
// client-supplied for "what period is this payment for."
function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

// Doc id == staffId, so this is a plain upsert: setting a new salary for a
// staff member who already has one just overwrites it (createdAt preserved).
export async function setSalary(input: SetSalaryInput, actor: AuthenticatedUser) {
  const userSnap = await db.collection("users").doc(input.staffId).get();
  if (!userSnap.exists) {
    throw new AppError(404, "Staff member not found");
  }
  const user = userSnap.data() as { displayName: string; role: string };

  const ref = collection().doc(input.staffId);
  const existing = await ref.get();
  await ref.set({
    staffId: input.staffId,
    staffName: user.displayName,
    role: user.role,
    monthlySalary: input.monthlySalary,
    effectiveDate: input.effectiveDate,
    notes: input.notes ?? null,
    updatedBy: actor.uid,
    createdAt: existing.exists ? existing.data()!.createdAt : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: input.staffId };
}

export async function listSalaries() {
  const period = currentPeriod();
  const [salariesSnap, paymentsSnap] = await Promise.all([
    collection().get(),
    paymentsCollection().where("period", "==", period).get(),
  ]);
  const paidStaffIds = new Set(paymentsSnap.docs.map((d) => (d.data() as SalaryPayment).staffId));

  const salaries = salariesSnap.docs.map((d) => ({
    ...(d.data() as StaffSalary),
    id: d.id,
    paidThisMonth: paidStaffIds.has(d.id),
  }));
  return salaries.sort((a, b) => a.staffName.localeCompare(b.staffName));
}

export async function deleteSalary(staffId: string) {
  const ref = collection().doc(staffId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new AppError(404, "Salary record not found");
  }
  await ref.delete();
  return { id: staffId };
}

// Marks the current calendar month paid for a staff member — creates a real
// Expense record (category "Salaries") so it flows through Net Profit,
// Expenses (30d), and every other Finance report with no special-casing,
// plus a SalaryPayment doc linking to that expense so unpaySalary can find
// and remove it again.
export async function paySalary(staffId: string, actor: AuthenticatedUser) {
  const salarySnap = await collection().doc(staffId).get();
  if (!salarySnap.exists) {
    throw new AppError(404, "Salary record not found");
  }
  const salary = salarySnap.data() as StaffSalary;

  const period = currentPeriod();
  const paymentRef = paymentsCollection().doc(`${staffId}_${period}`);
  if ((await paymentRef.get()).exists) {
    throw new AppError(400, `${salary.staffName}'s salary is already marked paid for ${period}`);
  }

  const { id: expenseId } = await createExpense(
    {
      category: "Salaries",
      amount: salary.monthlySalary,
      description: `Salary payment — ${salary.staffName} (${period})`,
      paidTo: salary.staffName,
      paymentMethod: "cash",
      date: new Date(),
    },
    actor,
  );

  await paymentRef.set({
    staffId,
    staffName: salary.staffName,
    period,
    amount: salary.monthlySalary,
    expenseId,
    paidBy: actor.uid,
    paidByName: actor.email,
    paidAt: FieldValue.serverTimestamp(),
  });

  return { staffId, period, expenseId };
}

// Reverses paySalary for the current period — removes both the payment
// record and the expense it created, so Finance totals go back to not
// counting this payment, same as if it had never been marked paid.
export async function unpaySalary(staffId: string) {
  const period = currentPeriod();
  const paymentRef = paymentsCollection().doc(`${staffId}_${period}`);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) {
    throw new AppError(404, "No payment recorded for this staff member this period");
  }
  const payment = paymentSnap.data() as SalaryPayment;

  await deleteExpense(payment.expenseId).catch(() => {
    // Expense may have already been deleted independently (e.g. from the
    // Expenses page directly) — the payment record is still stale either
    // way, so proceed to remove it regardless.
  });
  await paymentRef.delete();

  return { staffId, period };
}
