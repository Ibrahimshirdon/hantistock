export type UserRole =
  | "admin"
  | "manager"
  | "staff"
  | "customer"
  | "supplier"
  | "driver";

export interface AuthenticatedUser {
  uid: string;
  email: string;
  role: UserRole;
  // Identifies THIS device's sign-in event — constant across silent token
  // refreshes, but different for every fresh credential sign-in (including
  // on a different device with the same account). This is what lets the MFA
  // check below be per-device instead of per-account: custom claims are
  // baked into every token any device mints for this user, so without
  // binding to authTime, one device completing the challenge would silently
  // satisfy it for every other device signed into the same account too.
  authTime: number;
  // Mirrors the mfaEnabled/mfaVerifiedAt/mfaVerifiedAuthTime custom claims
  // (see mfa.service.ts) — kept on the token itself so requireRole can gate
  // access without an extra Firestore read on every request.
  mfaEnabled?: boolean;
  mfaVerifiedAt?: number;
  mfaVerifiedAuthTime?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
