import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../../middleware/verifyToken.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import { AppError } from "../../shared/utils/AppError.js";
import { backupCodeVerifySchema, loginVerifySchema, registerVerifySchema } from "./mfa.types.js";
import * as mfaController from "./mfa.controller.js";

export const mfaRouter = Router();

// These three complete the second-factor challenge itself, so they must stay
// reachable by an admin who hasn't satisfied it yet — requireRole(["admin"])
// would otherwise deadlock them (no way to ever produce the fresh session
// that requireRole demands). Scoped to admin manually instead.
function requireAdminRoleOnly(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    return next(new AppError(403, "Insufficient permissions for this action"));
  }
  next();
}

mfaRouter.get("/login/options", verifyToken, requireAdminRoleOnly, mfaController.loginOptions);
mfaRouter.post(
  "/login/verify",
  verifyToken,
  requireAdminRoleOnly,
  validate(loginVerifySchema),
  mfaController.loginVerify,
);
mfaRouter.post(
  "/backup-codes/verify",
  verifyToken,
  requireAdminRoleOnly,
  validate(backupCodeVerifySchema),
  mfaController.verifyBackupCode,
);

// Everything below is account management, so it goes through the full
// requireRole gate — including the freshly-completed-challenge requirement
// once mfaEnabled is already true. First-time enrollment isn't blocked by
// that requirement since mfaEnabled is still false at that point.
mfaRouter.get("/status", verifyToken, requireRole(["admin"]), mfaController.status);
mfaRouter.get(
  "/register/options",
  verifyToken,
  requireRole(["admin"]),
  mfaController.registerOptions,
);
mfaRouter.post(
  "/register/verify",
  verifyToken,
  requireRole(["admin"]),
  validate(registerVerifySchema),
  mfaController.registerVerify,
);
mfaRouter.post(
  "/backup-codes/generate",
  verifyToken,
  requireRole(["admin"]),
  mfaController.generateBackupCodes,
);
mfaRouter.delete(
  "/devices/:credentialId",
  verifyToken,
  requireRole(["admin"]),
  mfaController.removeDevice,
);
mfaRouter.post("/disable", verifyToken, requireRole(["admin"]), mfaController.disable);
