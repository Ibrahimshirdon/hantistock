import { Router } from "express";
import { verifyToken } from "../../middleware/verifyToken.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import { createScanSchema } from "./posScan.types.js";
import * as posScanController from "./posScan.controller.js";

export const posScanRouter = Router();

// Same roles allowed to use the desktop POS itself.
posScanRouter.use(verifyToken, requireRole(["admin", "manager", "staff"]));
posScanRouter.post("/", validate(createScanSchema), posScanController.create);
posScanRouter.get("/pending", posScanController.listPending);
