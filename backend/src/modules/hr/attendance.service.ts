import { FieldValue } from "firebase-admin/firestore";
import { db } from "../../config/firebase.js";
import { AppError } from "../../shared/utils/AppError.js";
import { recordAuditLog } from "../../shared/utils/auditLog.js";
import type { AuthenticatedUser } from "../../shared/types/auth.types.js";
import type { AttendanceRecord } from "../../shared/types/hr.types.js";
import type { UserDoc } from "../../shared/types/user.types.js";
import type { RecordAttendanceInput, SetAttendanceMethodInput } from "./attendance.types.js";

const collection = () => db.collection("attendanceRecords");

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function nowTimeString() {
  return new Date().toTimeString().slice(0, 5);
}

// Both times are "HH:MM" from the same calendar day (self-service records
// never span midnight — see recordSelfAttendance), so a straight minutes
// difference is enough; no need to reach for a full date library.
function minutesBetween(startHHMM: string, endHHMM: string): number {
  const [startHour, startMinute] = startHHMM.split(":").map(Number);
  const [endHour, endMinute] = endHHMM.split(":").map(Number);
  return endHour! * 60 + endMinute! - (startHour! * 60 + startMinute!);
}

// Minimum time a check-in must stand before a check-out is accepted, for
// self-service attendance regardless of method (face kiosk or the manual
// "check in/out" button). Exists to close the "mark in, immediately mark
// out" abuse case — someone could otherwise register a full attendance day
// in a few seconds without actually being present for it.
const MIN_SELF_SERVICE_SHIFT_MINUTES = 120;

// Doc id == `${staffId}_${date}` — recording attendance again for the same
// staff member on the same day corrects the existing record (upsert)
// instead of creating a duplicate row for that day.
//
// Shared by two self-service entry points — a staff member hitting their
// own "check in/out" button, and a face-recognition kiosk match (see
// faceAttendance.service.ts) — so everything about *who*, *when*, and
// *what* is server-enforced rather than trusted from the request body:
// date is always today (no backdating), status is always "present" (you
// can't mark yourself absent/on leave — that's still an admin/manager
// call), and checkIn/checkOut are stamped from the server clock. The first
// call of the day for a given staffId records check-in; a second call the
// same day (a record already exists) records check-out instead, without
// needing an explicit "which action" field.
export async function recordSelfAttendance(
  staffId: string,
  recordedBy: string,
  method: "self" | "face",
) {
  const date = todayDateString();

  const userSnap = await db.collection("users").doc(staffId).get();
  if (!userSnap.exists) {
    throw new AppError(404, "Staff member not found");
  }
  const user = userSnap.data() as { displayName: string };

  const docId = `${staffId}_${date}`;
  const ref = collection().doc(docId);
  const existing = await ref.get();
  const existingData = existing.data();

  const now = nowTimeString();

  // Applies to every self-service checkout, regardless of which method
  // recorded the check-in vs. the check-out — face+face, manual+manual, or
  // a mix of the two all go through the same 2-hour minimum.
  if (existing.exists && !existingData!.checkOut) {
    const existingCheckIn = existingData!.checkIn as string;
    const elapsed = minutesBetween(existingCheckIn, now);
    if (elapsed < MIN_SELF_SERVICE_SHIFT_MINUTES) {
      throw new AppError(
        400,
        `You checked in at ${existingCheckIn}. Check-out is only available at least 2 hours after check-in.`,
      );
    }
  }

  const checkIn = existing.exists ? (existingData!.checkIn as string | null) : now;
  const checkOut = existing.exists ? now : null;
  const notes = existing.exists ? (existingData!.notes as string | null) : null;
  const checkedOut = existing.exists;

  await ref.set({
    staffId,
    staffName: user.displayName,
    date,
    status: "present",
    checkIn,
    checkOut,
    notes,
    // The check-out leg of a self-service pair keeps the method the
    // check-in leg was recorded with, so a face check-in followed by a
    // face check-out doesn't flip to "self" on the second call.
    method: existing.exists ? ((existingData!.method as string | undefined) ?? method) : method,
    recordedBy,
    createdAt: existing.exists ? existingData!.createdAt : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: docId, staffName: user.displayName, checkedOut };
}

export async function recordAttendance(input: RecordAttendanceInput, actor: AuthenticatedUser) {
  if (actor.role === "staff") {
    const selfSnap = await db.collection("users").doc(actor.uid).get();
    const self = selfSnap.data() as UserDoc | undefined;
    if (self?.attendanceMethod === "face") {
      throw new AppError(
        403,
        "Your account is restricted to face check-in. Use the Face Check-In kiosk instead.",
      );
    }
    return recordSelfAttendance(actor.uid, actor.uid, "self");
  }

  const userSnap = await db.collection("users").doc(input.staffId).get();
  if (!userSnap.exists) {
    throw new AppError(404, "Staff member not found");
  }
  const user = userSnap.data() as { displayName: string };

  const docId = `${input.staffId}_${input.date}`;
  const ref = collection().doc(docId);
  const existing = await ref.get();

  await ref.set({
    staffId: input.staffId,
    staffName: user.displayName,
    date: input.date,
    status: input.status,
    checkIn: input.checkIn ?? null,
    checkOut: input.checkOut ?? null,
    notes: input.notes ?? null,
    method: "manual",
    recordedBy: actor.uid,
    createdAt: existing.exists ? existing.data()!.createdAt : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { id: docId };
}

// Mirrors the rest of the app's "single equality filter via Firestore, the
// rest filtered in memory" convention (avoids composite-index requirements
// from combining an equality filter with a range filter on a different
// field — see security.service.ts's listAuditLogs for the same pattern).
export async function listAttendance(filters: {
  staffId?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  let query: FirebaseFirestore.Query = collection();
  if (filters.staffId) {
    query = query.where("staffId", "==", filters.staffId);
  } else if (filters.date) {
    query = query.where("date", "==", filters.date);
  }
  const snap = await query.get();
  let records = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AttendanceRecord);

  if (filters.staffId && filters.date) records = records.filter((r) => r.date === filters.date);
  if (filters.dateFrom) records = records.filter((r) => r.date >= filters.dateFrom!);
  if (filters.dateTo) records = records.filter((r) => r.date <= filters.dateTo!);

  return records.sort((a, b) => b.date.localeCompare(a.date));
}

// Admin/manager-set restriction on which check-in path a given staff
// member may use. "both" clears the restriction (stored as field deletion,
// not the literal string) rather than being a third stored state — see
// UserDoc.attendanceMethod, where undefined already means unrestricted.
export async function setAttendanceMethod(
  staffId: string,
  input: SetAttendanceMethodInput,
  actor: AuthenticatedUser,
) {
  const ref = db.collection("users").doc(staffId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new AppError(404, "Staff member not found");
  }
  const before = snap.data() as UserDoc;

  await ref.update({
    attendanceMethod: input.method === "both" ? FieldValue.delete() : input.method,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await recordAuditLog({
    userId: actor.uid,
    userName: actor.email,
    role: actor.role,
    action: "ATTENDANCE_METHOD_CHANGED",
    entityType: "user",
    entityId: staffId,
    before: { attendanceMethod: before.attendanceMethod ?? "both" },
    after: { attendanceMethod: input.method },
  });

  return { staffId, method: input.method };
}

export async function deleteAttendance(id: string) {
  const ref = collection().doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new AppError(404, "Attendance record not found");
  }
  await ref.delete();
  return { id };
}
