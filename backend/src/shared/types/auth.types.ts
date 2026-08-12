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
  // Mirrors the mfaEnabled/mfaVerifiedAt custom claims (see mfa.service.ts) —
  // kept on the token itself so requireRole can gate access without an extra
  // Firestore read on every request.
  mfaEnabled?: boolean;
  mfaVerifiedAt?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
