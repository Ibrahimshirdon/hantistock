import type { Request, Response } from "express";
import { AppError } from "../../shared/utils/AppError.js";
import * as supplierProductService from "./supplierProduct.service.js";
import * as supplierSubmissionService from "./supplierSubmission.service.js";

export async function create(req: Request, res: Response) {
  const result = await supplierProductService.createSupplierProduct(req.body, req.user!);
  res.status(201).json({ success: true, data: result });
}

export async function importBulk(req: Request, res: Response) {
  const { companyId, rows } = req.body;
  if (!companyId || typeof companyId !== "string") {
    throw new AppError(400, "companyId is required");
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppError(400, "rows must be a non-empty array");
  }
  if (rows.length > 500) {
    throw new AppError(400, "Maximum 500 rows per import");
  }
  const result = await supplierProductService.importSupplierProducts(companyId, rows, req.user!);
  res.json({ success: true, data: result });
}

export async function list(req: Request, res: Response) {
  const role = req.user!.role;
  const supplierId = role === "supplier" ? req.user!.uid : (req.query.supplierId as string | undefined);
  const products = await supplierProductService.listSupplierProducts({
    supplierId,
    companyId: req.query.companyId as string | undefined,
  });
  res.json({ success: true, data: products });
}

export async function getById(req: Request, res: Response) {
  const product = await supplierProductService.getSupplierProductById(req.params.id as string);
  res.json({ success: true, data: product });
}

export async function update(req: Request, res: Response) {
  const result = await supplierProductService.updateSupplierProduct(
    req.params.id as string,
    req.body,
    req.user!,
  );
  res.json({ success: true, data: result });
}

export async function remove(req: Request, res: Response) {
  const result = await supplierProductService.deleteSupplierProduct(req.params.id as string, req.user!);
  res.json({ success: true, data: result });
}

export async function submit(req: Request, res: Response) {
  const result = await supplierSubmissionService.createSubmission(
    req.params.id as string,
    req.body,
    req.user!,
  );
  res.status(201).json({ success: true, data: result });
}
