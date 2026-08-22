import type { Request, Response } from "express";
import * as posScanService from "./posScan.service.js";

export async function create(req: Request, res: Response) {
  const result = await posScanService.createScan(req.body.barcode, req.user!);
  res.status(201).json({ success: true, data: result });
}

export async function listPending(req: Request, res: Response) {
  const scans = await posScanService.consumePendingScans(req.user!);
  res.json({ success: true, data: scans });
}
