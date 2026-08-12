import axios from "axios";
import { firebaseAuth } from "@/lib/firebase";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

apiClient.interceptors.request.use(async (config) => {
  const user = firebaseAuth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Backstop for a session whose second-factor grace period (see requireRole.ts
// on the backend) has quietly expired mid-session — proactive checks in
// AuthContext/ProtectedRoute normally send the user to the MFA challenge
// before this ever fires, but if any admin-gated call still comes back with
// this code, a hard redirect is simpler and more reliable here than wiring a
// router-aware event bus into a module outside the React tree.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      axios.isAxiosError<ApiErrorBody>(error) &&
      error.response?.data?.code === "MFA_REQUIRED" &&
      window.location.pathname !== "/mfa-challenge"
    ) {
      window.location.assign("/mfa-challenge");
    }
    return Promise.reject(error);
  },
);

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiErrorBody {
  success: false;
  message: string;
  code?: string;
}

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorBody>(error) && error.response?.data?.message) {
    return error.response.data.message;
  }
  return "Something went wrong. Please try again.";
}
