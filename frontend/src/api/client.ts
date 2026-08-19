import axios from "axios";
import { firebaseAuth } from "@/lib/firebase";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

apiClient.interceptors.request.use(async (config) => {
  (config as { _requestStartedAt?: number })._requestStartedAt = performance.now();
  const user = firebaseAuth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Every request's round-trip time, visible in the browser console — the
// same signal Render's server-side morgan timing gives for the backend
// half, so a slow request can be pinned to "network/server" vs "client"
// without reaching for a separate profiling tool.
function logDuration(config: { method?: string; url?: string; _requestStartedAt?: number }, status: string) {
  const startedAt = config._requestStartedAt;
  if (startedAt == null) return;
  const ms = Math.round(performance.now() - startedAt);
  console.info(`[api-timing] ${config.method?.toUpperCase()} ${config.url}: ${ms}ms (${status})`);
}

apiClient.interceptors.response.use(
  (response) => {
    logDuration(response.config, String(response.status));
    return response;
  },
  (error) => {
    if (axios.isAxiosError(error) && error.config) {
      logDuration(error.config, error.code === "ECONNABORTED" ? "timeout" : "error");
    }
    return Promise.reject(error);
  },
);

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
  // Covers deliberately-thrown errors with an actionable message (e.g. the
  // login flow's own timeout) that aren't an axios response error at all —
  // previously these always fell through to the generic message below.
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
