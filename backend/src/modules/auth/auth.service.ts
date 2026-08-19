import { FieldValue } from "firebase-admin/firestore";
import { auth, db } from "../../config/firebase.js";
import { AppError } from "../../shared/utils/AppError.js";
import { recordAuditLog } from "../../shared/utils/auditLog.js";
import { uploadBuffer } from "../../shared/utils/uploadFile.js";
import { createNotification } from "../../shared/utils/notifications.js";
import { time } from "../../shared/utils/timing.js";
import type { AuthenticatedUser, UserRole } from "../../shared/types/auth.types.js";
import type { UserDoc } from "../../shared/types/user.types.js";
import type {
  CreateUserByAdminInput,
  RegisterCustomerInput,
  ResetUserPasswordInput,
  UpdateMyProfileInput,
  UpdateUserByAdminInput,
} from "./auth.types.js";

function normalizeUsername(username: string) {
  return username.toLowerCase();
}

const PROFILE_COLLECTION: Record<UserRole, string> = {
  admin: "staffProfiles",
  manager: "staffProfiles",
  staff: "staffProfiles",
  supplier: "supplierProfiles",
  driver: "driverProfiles",
  customer: "customerProfiles",
};

async function assertEmailAvailable(email: string) {
  const existing = await auth.getUserByEmail(email).catch(() => null);
  if (existing) {
    throw new AppError(409, "An account with this email already exists");
  }
}

// Firestore has no native unique-constraint enforcement, so this is a
// query-then-write check — same race-tolerant pattern already accepted for
// email above (Firebase Auth itself enforces email uniqueness; nothing
// equivalent exists for username, since Firebase Auth doesn't know about it).
async function assertUsernameAvailable(username: string, excludeUid?: string) {
  const snap = await db.collection("users").where("username", "==", normalizeUsername(username)).get();
  const taken = snap.docs.some((d) => d.id !== excludeUid);
  if (taken) {
    throw new AppError(409, "That username is already taken");
  }
}

async function createFirebaseUser(
  email: string,
  password: string,
  displayName: string,
  role: UserRole,
) {
  const userRecord = await auth.createUser({ email, password, displayName });
  await auth.setCustomUserClaims(userRecord.uid, { role });
  return userRecord;
}

function buildUserDoc(
  uid: string,
  email: string,
  displayName: string,
  phone: string | undefined,
  role: UserRole,
  username?: string,
) {
  return {
    uid,
    email,
    username: username ? normalizeUsername(username) : null,
    displayName,
    phone: phone ?? null,
    role,
    status: "active" as const,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function buildProfileDoc(role: UserRole, uid: string, input: CreateUserByAdminInput) {
  switch (role) {
    case "admin":
    case "manager":
    case "staff":
      return {
        uid,
        employeeId: input.employeeId ?? null,
        department: input.department ?? null,
      };
    case "supplier":
      return {
        uid,
        companyName: input.companyName ?? "",
        taxId: null,
        categoriesSupplied: [],
        bankDetails: null,
        rating: null,
      };
    case "driver":
      return {
        uid,
        vehicleType: input.vehicleType ?? "",
        licensePlate: input.licensePlate ?? "",
        status: "offline" as const,
      };
    case "customer":
      return {
        uid,
        walletBalance: 0,
        loyaltyPoints: 0,
        addresses: [],
        defaultAddressIndex: 0,
        creditLimit: 0,
        outstandingLoanBalance: 0,
      };
    default:
      throw new AppError(400, "Unsupported role for admin-created account");
  }
}

export async function registerCustomer(input: RegisterCustomerInput) {
  await assertEmailAvailable(input.email);
  if (input.username) {
    await assertUsernameAvailable(input.username);
  }

  const userRecord = await createFirebaseUser(
    input.email,
    input.password,
    input.displayName,
    "customer",
  );

  const batch = db.batch();
  batch.set(
    db.collection("users").doc(userRecord.uid),
    buildUserDoc(userRecord.uid, input.email, input.displayName, input.phone, "customer", input.username),
  );
  batch.set(db.collection("customerProfiles").doc(userRecord.uid), {
    uid: userRecord.uid,
    walletBalance: 0,
    loyaltyPoints: 0,
    addresses: [],
    defaultAddressIndex: 0,
    creditLimit: 0,
    outstandingLoanBalance: 0,
  });
  await batch.commit();

  return { uid: userRecord.uid };
}

export async function createUserByAdmin(input: CreateUserByAdminInput, actor: AuthenticatedUser) {
  await assertEmailAvailable(input.email);
  if (input.username) {
    await assertUsernameAvailable(input.username);
  }

  const userRecord = await createFirebaseUser(
    input.email,
    input.password,
    input.displayName,
    input.role,
  );

  const batch = db.batch();
  batch.set(
    db.collection("users").doc(userRecord.uid),
    buildUserDoc(userRecord.uid, input.email, input.displayName, input.phone, input.role, input.username),
  );
  batch.set(
    db.collection(PROFILE_COLLECTION[input.role]).doc(userRecord.uid),
    buildProfileDoc(input.role, userRecord.uid, input),
  );
  await batch.commit();

  await recordAuditLog({
    userId: actor.uid,
    userName: actor.email,
    role: actor.role,
    action: "USER_CREATED",
    entityType: "user",
    entityId: userRecord.uid,
    after: { email: input.email, role: input.role },
  });

  return { uid: userRecord.uid };
}

export async function getMe(uid: string) {
  const userSnap = await time("getMe: users read", () => db.collection("users").doc(uid).get());
  if (!userSnap.exists) {
    throw new AppError(404, "User profile not found");
  }
  const user = userSnap.data() as UserDoc;

  // Depends on user.role from the read above, so it can't run in parallel
  // with it — this is the second of getMe's two sequential Firestore reads.
  const profileSnap = await time("getMe: role-profile read", () =>
    db.collection(PROFILE_COLLECTION[user.role]).doc(uid).get(),
  );

  return { ...user, profile: profileSnap.exists ? profileSnap.data() : null };
}

export async function listUsers(filters: { role?: UserRole }) {
  let query = db.collection("users").orderBy("createdAt", "desc") as FirebaseFirestore.Query;
  if (filters.role) {
    query = query.where("role", "==", filters.role);
  }
  const snap = await query.limit(100).get();
  return snap.docs.map((d) => d.data());
}

export async function setUserStatus(
  uid: string,
  status: "active" | "suspended",
  actor: AuthenticatedUser,
) {
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new AppError(404, "User not found");
  }
  const before = snap.data() as UserDoc;

  await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
  await auth.updateUser(uid, { disabled: status === "suspended" });

  await recordAuditLog({
    userId: actor.uid,
    userName: actor.email,
    role: actor.role,
    action: "USER_STATUS_CHANGED",
    entityType: "user",
    entityId: uid,
    before: { status: before.status },
    after: { status },
  });
}

// Self-service profile edits (name/phone), available to every role — distinct
// from the admin-only user-management functions above.
export async function updateMyProfile(uid: string, input: UpdateMyProfileInput) {
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new AppError(404, "User profile not found");
  }
  const current = snap.data() as UserDoc;

  const updates: Record<string, unknown> = { ...input, updatedAt: FieldValue.serverTimestamp() };
  if (input.username) {
    await assertUsernameAvailable(input.username, uid);
    updates.username = normalizeUsername(input.username);
  }
  if (input.email && input.email !== current.email) {
    await assertEmailAvailable(input.email);
    await auth.updateUser(uid, { email: input.email });
  } else {
    delete updates.email;
  }

  await ref.update(updates);
  if (input.displayName) {
    await auth.updateUser(uid, { displayName: input.displayName });
  }

  return { uid };
}

export async function uploadMyPhoto(uid: string, fileBuffer: Buffer) {
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new AppError(404, "User profile not found");
  }

  const url = await uploadBuffer(fileBuffer, { folder: "profile-photos", resourceType: "image" });
  await ref.update({ photoURL: url, updatedAt: FieldValue.serverTimestamp() });
  await auth.updateUser(uid, { photoURL: url });

  return { photoURL: url };
}

export async function updateUserByAdmin(
  uid: string,
  input: UpdateUserByAdminInput,
  actor: AuthenticatedUser,
) {
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError(404, "User not found");
  const user = snap.data() as UserDoc;

  const userUpdates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (input.displayName !== undefined) userUpdates.displayName = input.displayName;
  if (input.phone !== undefined) userUpdates.phone = input.phone;
  if (input.username !== undefined) {
    await assertUsernameAvailable(input.username, uid);
    userUpdates.username = normalizeUsername(input.username);
  }
  await ref.update(userUpdates);
  if (input.displayName) await auth.updateUser(uid, { displayName: input.displayName });

  const profileRef = db.collection(PROFILE_COLLECTION[user.role]).doc(uid);
  const profileUpdates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  let hasProfileUpdates = false;

  if (user.role === "admin" || user.role === "manager" || user.role === "staff") {
    if (input.employeeId !== undefined) { profileUpdates.employeeId = input.employeeId; hasProfileUpdates = true; }
    if (input.department !== undefined) { profileUpdates.department = input.department; hasProfileUpdates = true; }
  }
  if (user.role === "supplier" && input.companyName !== undefined) {
    profileUpdates.companyName = input.companyName;
    hasProfileUpdates = true;
  }
  if (user.role === "driver") {
    if (input.vehicleType !== undefined) { profileUpdates.vehicleType = input.vehicleType; hasProfileUpdates = true; }
    if (input.licensePlate !== undefined) { profileUpdates.licensePlate = input.licensePlate; hasProfileUpdates = true; }
  }
  if (hasProfileUpdates) await profileRef.update(profileUpdates);

  await recordAuditLog({
    userId: actor.uid,
    userName: actor.email,
    role: actor.role,
    action: "USER_UPDATED",
    entityType: "user",
    entityId: uid,
    after: input,
  });

  return { uid };
}

export async function deleteUser(uid: string, actor: AuthenticatedUser) {
  if (uid === actor.uid) {
    throw new AppError(400, "You cannot delete your own account");
  }

  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new AppError(404, "User not found");
  }
  const user = snap.data() as UserDoc;

  await auth.deleteUser(uid).catch((err) => {
    // Firebase Auth record may already be gone (e.g. deleted outside this
    // app) — don't block cleaning up the Firestore side in that case.
    if (err?.code !== "auth/user-not-found") throw err;
  });

  const batch = db.batch();
  batch.delete(ref);
  batch.delete(db.collection(PROFILE_COLLECTION[user.role]).doc(uid));
  await batch.commit();

  await recordAuditLog({
    userId: actor.uid,
    userName: actor.email,
    role: actor.role,
    action: "USER_DELETED",
    entityType: "user",
    entityId: uid,
    before: { email: user.email, role: user.role },
  });

  return { uid };
}

export async function resetUserPassword(
  uid: string,
  input: ResetUserPasswordInput,
  actor: AuthenticatedUser,
) {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) {
    throw new AppError(404, "User not found");
  }

  await auth.updateUser(uid, { password: input.newPassword });

  await recordAuditLog({
    userId: actor.uid,
    userName: actor.email,
    role: actor.role,
    action: "USER_PASSWORD_RESET",
    entityType: "user",
    entityId: uid,
  });

  await createNotification({
    userId: uid,
    title: "Password reset",
    message: "An administrator reset your password. If this wasn't expected, contact support.",
    type: "system",
  });

  return { uid };
}

// Public (unauthenticated) lookup so the login form can accept either an
// email or a username — Firebase's own sign-in always needs a real email, so
// a username has to be resolved to one client-side before that call happens.
export async function resolveLoginIdentifier(identifier: string) {
  if (identifier.includes("@")) {
    return { email: identifier };
  }

  const snap = await time("resolveLoginIdentifier: username query", () =>
    db.collection("users").where("username", "==", normalizeUsername(identifier)).limit(1).get(),
  );
  if (snap.empty) {
    throw new AppError(404, "No account found with that username");
  }

  const user = snap.docs[0]!.data() as UserDoc;
  return { email: user.email };
}
