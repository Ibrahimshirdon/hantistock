import { Router } from "express";
import { verifyToken } from "../../middleware/verifyToken.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import { upload } from "../../middleware/upload.js";
import { createProductSchema, updateProductSchema } from "./product.types.js";
import * as productController from "./product.controller.js";

export const productRouter = Router();

productRouter.use(verifyToken);
productRouter.get("/", productController.list);
productRouter.get("/barcode/:barcode", productController.getByBarcode);
productRouter.get("/:id", productController.getById);
productRouter.post(
  "/",
  requireRole(["admin", "manager"]),
  validate(createProductSchema),
  productController.create,
);
productRouter.patch(
  "/:id",
  requireRole(["admin", "manager"]),
  validate(updateProductSchema),
  productController.update,
);
productRouter.post(
  "/:id/image",
  requireRole(["admin", "manager"]),
  upload.single("image"),
  productController.uploadImage,
);
productRouter.post(
  "/import",
  requireRole(["admin", "manager"]),
  productController.importBulk,
);
productRouter.delete("/:id", requireRole(["admin"]), productController.remove);
productRouter.post("/:id/approve", requireRole(["admin"]), productController.approve);
