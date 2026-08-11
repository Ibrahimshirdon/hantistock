import { apiClient, type ApiSuccess } from "./client";
import type { UserProfile, UserRole } from "@/types/auth.types";

export interface RegisterCustomerInput {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
  username?: string;
}

export interface CreateUserByAdminInput {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
  username?: string;
  role: Exclude<UserRole, "customer">;
  employeeId?: string;
  department?: string;
  companyName?: string;
  vehicleType?: string;
  licensePlate?: string;
}

export async function registerCustomer(input: RegisterCustomerInput) {
  const { data } = await apiClient.post<ApiSuccess<{ uid: string }>>("/auth/register", input);
  return data.data;
}

export async function resolveLoginIdentifier(identifier: string) {
  const { data } = await apiClient.get<ApiSuccess<{ email: string }>>("/auth/resolve-login", {
    params: { identifier },
  });
  return data.data;
}

export async function getMe() {
  const { data } = await apiClient.get<ApiSuccess<UserProfile>>("/auth/me");
  return data.data;
}

export async function createUser(input: CreateUserByAdminInput) {
  const { data } = await apiClient.post<ApiSuccess<{ uid: string }>>("/auth/users", input);
  return data.data;
}

export interface CreateCustomerInput {
  displayName: string;
  email: string;
  password: string;
  phone?: string;
  username?: string;
}

export async function createCustomer(input: CreateCustomerInput) {
  const { data } = await apiClient.post<ApiSuccess<{ uid: string }>>("/auth/users", {
    ...input,
    role: "customer",
  });
  return data.data;
}

export async function listUsers(role?: UserRole) {
  const { data } = await apiClient.get<ApiSuccess<UserProfile[]>>("/auth/users", {
    params: role ? { role } : undefined,
  });
  return data.data;
}

export async function getUser(uid: string) {
  const { data } = await apiClient.get<ApiSuccess<UserProfile>>(`/auth/users/${uid}`);
  return data.data;
}

export async function setUserStatus(uid: string, status: "active" | "suspended") {
  await apiClient.patch(`/auth/users/${uid}/status`, { status });
}

export async function deleteUser(uid: string) {
  await apiClient.delete(`/auth/users/${uid}`);
}

export async function resetUserPassword(uid: string, newPassword: string) {
  await apiClient.post(`/auth/users/${uid}/reset-password`, { newPassword });
}

export interface UpdateMyProfileInput {
  displayName?: string;
  phone?: string;
  username?: string;
  email?: string;
}

export async function updateMyProfile(input: UpdateMyProfileInput) {
  const { data } = await apiClient.patch<ApiSuccess<{ uid: string }>>("/auth/me", input);
  return data.data;
}

export interface UpdateUserByAdminInput {
  displayName?: string;
  phone?: string;
  username?: string;
  employeeId?: string;
  department?: string;
  companyName?: string;
  vehicleType?: string;
  licensePlate?: string;
}

export async function updateUserByAdmin(uid: string, input: UpdateUserByAdminInput) {
  await apiClient.patch(`/auth/users/${uid}`, input);
}

export async function uploadMyPhoto(file: File) {
  const formData = new FormData();
  formData.append("photo", file);
  const { data } = await apiClient.post<ApiSuccess<{ photoURL: string }>>("/auth/me/photo", formData);
  return data.data;
}
