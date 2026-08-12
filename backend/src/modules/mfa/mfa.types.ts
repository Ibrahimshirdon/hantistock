import { z } from "zod";

// WebAuthn responses are large, nested browser-generated objects; we don't
// hand-validate every field since @simplewebauthn's verify functions reject
// anything malformed — this just confirms the shape is a plausible response.
const webauthnResponseSchema = z.object({ id: z.string() }).passthrough();

export const registerVerifySchema = z.object({
  response: webauthnResponseSchema,
  deviceName: z.string().max(60).optional(),
});
export type RegisterVerifyInput = z.infer<typeof registerVerifySchema>;

export const loginVerifySchema = z.object({
  response: webauthnResponseSchema,
});
export type LoginVerifyInput = z.infer<typeof loginVerifySchema>;

export const backupCodeVerifySchema = z.object({
  code: z.string().min(6),
});
export type BackupCodeVerifyInput = z.infer<typeof backupCodeVerifySchema>;
