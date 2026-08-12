import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { apiClient, type ApiSuccess } from "./client";

export interface MfaDevice {
  id: string;
  deviceName: string;
  createdAt: unknown;
  lastUsedAt: unknown;
}

export interface MfaStatus {
  enabled: boolean;
  devices: MfaDevice[];
  backupCodesRemaining: number;
}

export async function getMfaStatus() {
  const { data } = await apiClient.get<ApiSuccess<MfaStatus>>("/mfa/status");
  return data.data;
}

export async function getRegistrationOptions() {
  const { data } = await apiClient.get<ApiSuccess<PublicKeyCredentialCreationOptionsJSON>>(
    "/mfa/register/options",
  );
  return data.data;
}

export async function verifyRegistration(response: RegistrationResponseJSON, deviceName?: string) {
  await apiClient.post("/mfa/register/verify", { response, deviceName });
}

export async function getLoginOptions() {
  const { data } = await apiClient.get<ApiSuccess<PublicKeyCredentialRequestOptionsJSON>>(
    "/mfa/login/options",
  );
  return data.data;
}

export async function verifyLogin(response: AuthenticationResponseJSON) {
  await apiClient.post("/mfa/login/verify", { response });
}

export async function verifyBackupCode(code: string) {
  await apiClient.post("/mfa/backup-codes/verify", { code });
}

export async function generateBackupCodes() {
  const { data } = await apiClient.post<ApiSuccess<{ codes: string[] }>>("/mfa/backup-codes/generate");
  return data.data;
}

export async function removeDevice(credentialId: string) {
  await apiClient.delete(`/mfa/devices/${credentialId}`);
}

export async function disableMfa() {
  await apiClient.post("/mfa/disable");
}
