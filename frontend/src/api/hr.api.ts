import { apiClient, type ApiSuccess } from "./client";
import type { AttendanceRecord, FaceEnrollment, StaffSalary } from "@/types/hr.types";

// Salaries
export interface SetSalaryInput {
  staffId: string;
  monthlySalary: number;
  effectiveDate: string;
  notes?: string;
}

export async function listSalaries() {
  const { data } = await apiClient.get<ApiSuccess<StaffSalary[]>>("/hr/salaries");
  return data.data;
}

export async function setSalary(input: SetSalaryInput) {
  const { data } = await apiClient.post<ApiSuccess<{ id: string }>>("/hr/salaries", input);
  return data.data;
}

export async function deleteSalary(staffId: string) {
  await apiClient.delete(`/hr/salaries/${staffId}`);
}

export async function paySalary(staffId: string) {
  const { data } = await apiClient.post<ApiSuccess<{ period: string; expenseId: string }>>(
    `/hr/salaries/${staffId}/pay`,
  );
  return data.data;
}

export async function unpaySalary(staffId: string) {
  await apiClient.post(`/hr/salaries/${staffId}/unpay`);
}

// Attendance
export interface RecordAttendanceInput {
  staffId: string;
  date: string;
  status: "present" | "absent" | "late" | "half_day" | "leave";
  checkIn?: string;
  checkOut?: string;
  notes?: string;
}

export async function listAttendance(filters?: {
  staffId?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { data } = await apiClient.get<ApiSuccess<AttendanceRecord[]>>("/hr/attendance", {
    params: filters,
  });
  return data.data;
}

export async function recordAttendance(input: RecordAttendanceInput) {
  const { data } = await apiClient.post<ApiSuccess<{ id: string }>>("/hr/attendance", input);
  return data.data;
}

export async function deleteAttendance(id: string) {
  await apiClient.delete(`/hr/attendance/${id}`);
}

export async function setAttendanceMethod(staffId: string, method: "face" | "manual" | "both") {
  const { data } = await apiClient.patch<ApiSuccess<{ staffId: string; method: string }>>(
    `/hr/attendance/${staffId}/method`,
    { method },
  );
  return data.data;
}

// Face attendance
export async function listFaceEnrollments() {
  const { data } = await apiClient.get<ApiSuccess<FaceEnrollment[]>>("/hr/face-attendance");
  return data.data;
}

export async function enrollFace(staffId: string, descriptor: number[], photo: Blob) {
  const formData = new FormData();
  formData.append("staffId", staffId);
  formData.append("descriptor", JSON.stringify(descriptor));
  formData.append("photo", photo, "face.jpg");
  const { data } = await apiClient.post<ApiSuccess<{ staffId: string; photoUrl: string }>>(
    "/hr/face-attendance/enroll",
    formData,
  );
  return data.data;
}

export async function deleteFaceEnrollment(staffId: string) {
  await apiClient.delete(`/hr/face-attendance/${staffId}`);
}

export interface FaceCheckInResult {
  matched: boolean;
  staffId?: string;
  staffName?: string;
  checkedOut?: boolean;
  reason?: "not_enrolled" | "no_match" | "method_not_allowed";
}

export async function faceCheckIn(descriptor: number[]) {
  const { data } = await apiClient.post<ApiSuccess<FaceCheckInResult>>(
    "/hr/face-attendance/checkin",
    { descriptor },
  );
  return data.data;
}
