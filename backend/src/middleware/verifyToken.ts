import type { NextFunction, Request, Response } from "express";
import { auth } from "../config/firebase.js";
import type { UserRole } from "../shared/types/auth.types.js";
import { AppError } from "../shared/utils/AppError.js";

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
    const decoded = await auth.verifyIdToken(idToken);

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
