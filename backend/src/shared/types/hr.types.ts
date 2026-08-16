import type { Timestamp } from "firebase-admin/firestore";
import type { UserRole } from "./auth.types.js";

// One doc per staff member (doc id == staffId) — setting a new salary
// overwrites the previous one rather than keeping a history, matching how
// this app's other "current state" records (e.g. CustomerProfile) work.
export interface StaffSalary {
  id: string;
  staffId: string;
  staffName: string;
  role: UserRole;
  monthlySalary: number;
  effectiveDate: Timestamp;
  notes: string | null;
  updatedBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// One doc per staff member per calendar month (doc id == `${staffId}_${period}`,
// period == "YYYY-MM") — the actual record that a salary was paid out,
// distinct from StaffSalary (which is just the current rate, not a payment
// history). Marking a period paid also creates a real Expense doc so it
// flows through the existing Finance reporting with no special-casing;
// expenseId links back to it so unpaying can remove that expense too.
export interface SalaryPayment {
  id: string;
  staffId: string;
  staffName: string;
  period: string;
  amount: number;
  expenseId: string;
  paidBy: string;
  paidByName: string;
  paidAt: Timestamp;
}

// One doc per staff member (doc id == staffId) — enrolling a face again
// overwrites the previous descriptor rather than keeping a history, same
// upsert convention as StaffSalary.
export interface FaceEnrollment {
  staffId: string;
  staffName: string;
  descriptor: number[];
  photoUrl: string;
  enrolledBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// One doc per staff member per day (doc id == `${staffId}_${date}`) so
// recording attendance twice for the same day corrects the existing record
// instead of creating a duplicate.
export interface AttendanceRecord {
  id: string;
  staffId: string;
  staffName: string;
  date: string;
  status: "present" | "absent" | "late" | "half_day" | "leave";
  checkIn: string | null;
  checkOut: string | null;
  notes: string | null;
  // How this record was captured: an admin/manager typing it in directly,
  // a staff member tapping their own check-in/out button, or an
  // unattended face-recognition kiosk match. Optional because records
  // written before this field existed have none.
  method?: "manual" | "self" | "face";
  recordedBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
