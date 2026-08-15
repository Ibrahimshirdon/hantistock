import { Router } from "express";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import {
  createSupplierProductSchema,
  submitToInventorySchema,
  updateSupplierProductSchema,
} from "./supplierProduct.types.js";
import * as supplierProductController from "./supplierProduct.controller.js";

export const supplierProductRouter = Router();

supplierProductRouter.get(
  "/",
  requireRole(["admin", "manager", "supplier"]),
  supplierProductController.list,
);
supplierProductRouter.get(
  "/:id",
  requireRole(["admin", "manager", "supplier"]),
  supplierProductController.getById,
);
supplierProductRouter.post(
  "/",
  requireRole(["supplier"]),
  validate(createSupplierProductSchema),
  supplierProductController.create,
);
supplierProductRouter.post(
  "/import",
  requireRole(["supplier"]),
  supplierProductController.importBulk,
);
supplierProductRouter.patch(
  "/:id",
  requireRole(["supplier"]),
  validate(updateSupplierProductSchema),
  supplierProductController.update,
);
supplierProductRouter.delete("/:id", requireRole(["supplier"]), supplierProductController.remove);
supplierProductRouter.post(
  "/:id/submit",
  requireRole(["supplier"]),
  validate(submitToInventorySchema),
  supplierProductController.submit,
);
