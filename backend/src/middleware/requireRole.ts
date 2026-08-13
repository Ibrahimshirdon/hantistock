import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "../shared/types/auth.types.js";
import { AppError } from "../shared/utils/AppError.js";

// How long a completed WebAuthn/backup-code challenge satisfies the admin
// second-factor requirement before the next admin-only request needs it
// re-verified. Deliberately not exported/shared with mfa.service.ts — that
// module only ever stamps "verified now", this is the sole place that
// interprets how long "now" stays valid.
const MFA_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "Not authenticated"));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError(403, "Insufficient permissions for this action"));
    }
    // Admins who have enrolled a second factor must have completed it
    // recently on THIS device's sign-in — a stolen/guessed password alone
    // can never satisfy this, since mfaVerifiedAt only comes from a verified
    // WebAuthn assertion or backup code (see mfa.service.ts). Custom claims
    // are account-wide, not per-device — every device signed into this
    // account mints tokens carrying the SAME mfaVerifiedAt/mfaVerifiedAuthTime
    // claims, so without the authTime match below, one device completing
    // the challenge would silently satisfy it for every other device on the
    // same account too.
    if (req.user.role === "admin" && req.user.mfaEnabled) {
      const verifiedAt = req.user.mfaVerifiedAt;
      const verifiedForThisDevice = req.user.mfaVerifiedAuthTime === req.user.authTime;
      if (!verifiedAt || !verifiedForThisDevice || Date.now() - verifiedAt > MFA_SESSION_TTL_MS) {
        return next(new AppError(401, "Second-factor verification required", "MFA_REQUIRED"));
      }
    }
    next();
  };
}
