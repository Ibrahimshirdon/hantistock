import type { Request, Response } from "express";
import * as mfaService from "./mfa.service.js";

export async function status(req: Request, res: Response) {
  const result = await mfaService.getStatus(req.user!.uid);
  res.json({ success: true, data: result });
}

export async function registerOptions(req: Request, res: Response) {
  const options = await mfaService.generateRegistrationOptionsForUser(req.user!);
  res.json({ success: true, data: options });
}

export async function registerVerify(req: Request, res: Response) {
  await mfaService.verifyRegistration(req.user!, req.body.response, req.body.deviceName);
  res.json({ success: true, data: { verified: true } });
}

export async function loginOptions(req: Request, res: Response) {
  const options = await mfaService.generateAuthenticationOptionsForUser(req.user!.uid);
  res.json({ success: true, data: options });
}

export async function loginVerify(req: Request, res: Response) {
  await mfaService.verifyAuthentication(req.user!, req.body.response);
  res.json({ success: true, data: { verified: true } });
}

export async function generateBackupCodes(req: Request, res: Response) {
  const result = await mfaService.generateBackupCodes(req.user!);
  res.json({ success: true, data: result });
}

export async function verifyBackupCode(req: Request, res: Response) {
  await mfaService.verifyBackupCode(req.user!, req.body.code);
  res.json({ success: true, data: { verified: true } });
}

export async function removeDevice(req: Request, res: Response) {
  await mfaService.removeDevice(req.user!, req.params.credentialId as string);
  res.json({ success: true, data: { removed: true } });
}

export async function disable(req: Request, res: Response) {
  await mfaService.disableMfa(req.user!);
  res.json({ success: true, data: { disabled: true } });
}
