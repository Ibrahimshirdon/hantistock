import type { NextFunction, Request, Response } from "express";
import { auth } from "../config/firebase.js";
import type { UserRole } from "../shared/types/auth.types.js";
import { AppError } from "../shared/utils/AppError.js";
import { time } from "../shared/utils/timing.js";

export async function verifyToken(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new AppError(401, "Missing or malformed Authorization header");
    }

    const idToken = header.slice("Bearer ".length);
    // verifyIdToken is normally local (checked against Google's public
    // certs, cached in-process) and fast — but that cache is empty on a
    // cold process start, when it instead has to fetch those certs over
    // the network first. Timing it here is what tells the two apart.
    const decoded = await time(`verifyIdToken ${req.method} ${req.path}`, () => auth.verifyIdToken(idToken));

    const role = decoded.role as UserRole | undefined;
    if (!role) {
      throw new AppError(403, "User has no assigned role");
    }

    req.user = {
      uid: decoded.uid,
      email: decoded.email ?? "",
      role,
      authTime: decoded.auth_time,
      mfaEnabled: decoded.mfaEnabled as boolean | undefined,
      mfaVerifiedAt: decoded.mfaVerifiedAt as number | undefined,
      mfaVerifiedAuthTime: decoded.mfaVerifiedAuthTime as number | undefined,
    };

    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError(401, "Invalid or expired token"));
  }
}
