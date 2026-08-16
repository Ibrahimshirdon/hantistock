import { Router } from "express";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import { setSalarySchema } from "./salary.types.js";
import * as salaryController from "./salary.controller.js";

export const salaryRouter = Router();

salaryRouter.get("/", requireRole(["admin", "manager"]), salaryController.list);
salaryRouter.post(
  "/",
  requireRole(["admin", "manager"]),
  validate(setSalarySchema),
  salaryController.set,
);
salaryRouter.delete("/:staffId", requireRole(["admin"]), salaryController.remove);
salaryRouter.post("/:staffId/pay", requireRole(["admin", "manager"]), salaryController.pay);
salaryRouter.post("/:staffId/unpay", requireRole(["admin", "manager"]), salaryController.unpay);
