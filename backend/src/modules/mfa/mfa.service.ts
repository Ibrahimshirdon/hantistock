import { createHash, randomBytes } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers";
import { auth, db } from "../../config/firebase.js";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/utils/AppError.js";
import { recordAuditLog } from "../../shared/utils/auditLog.js";
import type { AuthenticatedUser, UserRole } from "../../shared/types/auth.types.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const BACKUP_CODE_COUNT = 8;

interface StoredCredential {
  uid: string;
  publicKey: string;
  counter: number;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
  deviceName: string;
  createdAt: unknown;
  lastUsedAt: unknown;
}

interface StoredBackupCodes {
  codes: { hash: string; usedAt: Timestamp | null }[];
}

function credentialsCollection() {
  return db.collection("webauthnCredentials");
}
function challengeDoc(uid: string) {
  return db.collection("mfaChallenges").doc(uid);
}
function backupCodesDoc(uid: string) {
  return db.collection("backupCodes").doc(uid);
}

async function getUserCredentials(uid: string) {
  const snap = await credentialsCollection().where("uid", "==", uid).get();
  return snap.docs.map((d) => ({ ...(d.data() as StoredCredential), id: d.id }));
}

// Custom claims are replaced wholesale by setCustomUserClaims, not merged —
// every call must re-include role or requireRole breaks for this user.
async function setMfaClaims(uid: string, role: UserRole, opts: { enabled: boolean; verifiedNow?: boolean }) {
  await auth.setCustomUserClaims(uid, {
    role,
    mfaEnabled: opts.enabled,
    ...(opts.verifiedNow ? { mfaVerifiedAt: Date.now() } : {}),
  });
}

function hashBackupCode(code: string): string {
  return createHash("sha256").update(code.toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex");
}

function generateBackupCode(): string {
  const raw = randomBytes(5).toString("hex").toUpperCase(); // 10 hex chars
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export async function getStatus(uid: string) {
  const [credentials, backupSnap] = await Promise.all([
    getUserCredentials(uid),
    backupCodesDoc(uid).get(),
  ]);
  const backupData = backupSnap.exists ? (backupSnap.data() as StoredBackupCodes) : null;
  const backupCodesRemaining = backupData ? backupData.codes.filter((c) => !c.usedAt).length : 0;

  return {
    enabled: credentials.length > 0,
    devices: credentials.map((c) => ({
      id: c.id,
      deviceName: c.deviceName,
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt,
    })),
    backupCodesRemaining,
  };
}

export async function generateRegistrationOptionsForUser(user: AuthenticatedUser) {
  const existing = await getUserCredentials(user.uid);
  const options = await generateRegistrationOptions({
    rpName: env.webauthn.rpName,
    rpID: env.webauthn.rpId,
    userName: user.email,
    userID: isoUint8Array.fromUTF8String(user.uid),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports as never })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });

  await challengeDoc(user.uid).set({
    challenge: options.challenge,
    type: "registration",
    expiresAt: Timestamp.fromMillis(Date.now() + CHALLENGE_TTL_MS),
  });

  return options;
}

async function consumeChallenge(uid: string, expectedType: "registration" | "authentication") {
  const snap = await challengeDoc(uid).get();
  if (!snap.exists) {
    throw new AppError(400, "No pending challenge — please start again");
  }
  const data = snap.data() as { challenge: string; type: string; expiresAt: Timestamp };
  await challengeDoc(uid).delete();
  if (data.type !== expectedType || data.expiresAt.toMillis() < Date.now()) {
    throw new AppError(400, "Challenge expired — please try again");
  }
  return data.challenge;
}

export async function verifyRegistration(
  user: AuthenticatedUser,
  response: RegistrationResponseJSON,
  deviceName: string | undefined,
) {
  const expectedChallenge = await consumeChallenge(user.uid, "registration");

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: env.corsOrigins,
    expectedRPID: env.webauthn.rpId,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new AppError(400, "Could not verify this device. Please try again.");
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  await credentialsCollection().doc(credential.id).set({
    uid: user.uid,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    deviceName: deviceName?.trim() || "Unnamed device",
    createdAt: FieldValue.serverTimestamp(),
    lastUsedAt: null,
  });

  await db.collection("users").doc(user.uid).update({
    mfaEnabled: true,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await setMfaClaims(user.uid, user.role, { enabled: true, verifiedNow: true });

  await recordAuditLog({
    userId: user.uid,
    userName: user.email,
    role: user.role,
    action: "MFA_DEVICE_ENROLLED",
    entityType: "user",
    entityId: user.uid,
    after: { deviceName: deviceName?.trim() || "Unnamed device" },
  });
}

export async function generateAuthenticationOptionsForUser(uid: string) {
  const credentials = await getUserCredentials(uid);
  if (credentials.length === 0) {
    throw new AppError(400, "No security devices registered for this account");
  }

  const options = await generateAuthenticationOptions({
    rpID: env.webauthn.rpId,
    allowCredentials: credentials.map((c) => ({ id: c.id, transports: c.transports as never })),
    userVerification: "required",
  });

  await challengeDoc(uid).set({
    challenge: options.challenge,
    type: "authentication",
    expiresAt: Timestamp.fromMillis(Date.now() + CHALLENGE_TTL_MS),
  });

  return options;
}

export async function verifyAuthentication(user: AuthenticatedUser, response: AuthenticationResponseJSON) {
  const expectedChallenge = await consumeChallenge(user.uid, "authentication");

  const credRef = credentialsCollection().doc(response.id);
  const credSnap = await credRef.get();
  if (!credSnap.exists || (credSnap.data() as StoredCredential).uid !== user.uid) {
    throw new AppError(400, "Unrecognized security device");
  }
  const stored = credSnap.data() as StoredCredential;

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: env.corsOrigins,
    expectedRPID: env.webauthn.rpId,
    credential: {
      id: credSnap.id,
      publicKey: isoBase64URL.toBuffer(stored.publicKey),
      counter: stored.counter,
      transports: stored.transports as never,
    },
  });
  if (!verification.verified) {
    throw new AppError(400, "Could not verify this device");
  }

  await credRef.update({
    counter: verification.authenticationInfo.newCounter,
    lastUsedAt: FieldValue.serverTimestamp(),
  });
  await setMfaClaims(user.uid, user.role, { enabled: true, verifiedNow: true });
}

export async function generateBackupCodes(user: AuthenticatedUser) {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
  await backupCodesDoc(user.uid).set({
    codes: codes.map((code) => ({ hash: hashBackupCode(code), usedAt: null })),
    createdAt: FieldValue.serverTimestamp(),
  });

  await recordAuditLog({
    userId: user.uid,
    userName: user.email,
    role: user.role,
    action: "MFA_BACKUP_CODES_GENERATED",
    entityType: "user",
    entityId: user.uid,
  });

  return { codes };
}

export async function verifyBackupCode(user: AuthenticatedUser, code: string) {
  const ref = backupCodesDoc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new AppError(400, "No backup codes have been generated for this account");
  }
  const data = snap.data() as StoredBackupCodes;
  const hash = hashBackupCode(code);
  const index = data.codes.findIndex((c) => c.hash === hash && !c.usedAt);
  if (index === -1) {
    throw new AppError(400, "Invalid or already-used backup code");
  }

  data.codes[index]!.usedAt = Timestamp.now();
  await ref.update({ codes: data.codes });
  await setMfaClaims(user.uid, user.role, { enabled: true, verifiedNow: true });

  await recordAuditLog({
    userId: user.uid,
    userName: user.email,
    role: user.role,
    action: "MFA_BACKUP_CODE_USED",
    entityType: "user",
    entityId: user.uid,
  });
}

export async function removeDevice(user: AuthenticatedUser, credentialId: string) {
  const ref = credentialsCollection().doc(credentialId);
  const snap = await ref.get();
  if (!snap.exists || (snap.data() as StoredCredential).uid !== user.uid) {
    throw new AppError(404, "Device not found");
  }
  await ref.delete();

  const remaining = await getUserCredentials(user.uid);
  if (remaining.length === 0) {
    await db.collection("users").doc(user.uid).update({
      mfaEnabled: false,
      updatedAt: FieldValue.serverTimestamp(),
    });
    await setMfaClaims(user.uid, user.role, { enabled: false });
  }

  await recordAuditLog({
    userId: user.uid,
    userName: user.email,
    role: user.role,
    action: "MFA_DEVICE_REMOVED",
    entityType: "user",
    entityId: user.uid,
  });
}

export async function disableMfa(user: AuthenticatedUser) {
  const credentials = await getUserCredentials(user.uid);
  const batch = db.batch();
  credentials.forEach((c) => batch.delete(credentialsCollection().doc(c.id)));
  batch.delete(backupCodesDoc(user.uid));
  batch.update(db.collection("users").doc(user.uid), {
    mfaEnabled: false,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  await setMfaClaims(user.uid, user.role, { enabled: false });

  await recordAuditLog({
    userId: user.uid,
    userName: user.email,
    role: user.role,
    action: "MFA_DISABLED",
    entityType: "user",
    entityId: user.uid,
  });
}
