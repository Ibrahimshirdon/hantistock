import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";
import {
  getMe,
  registerCustomer as registerCustomerApi,
  type RegisterCustomerInput,
} from "@/api/auth.api";
import type { UserProfile } from "@/types/auth.types";

interface LoginResult {
  profile: UserProfile;
  mfaSatisfied: boolean;
}

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  // False only for an admin with 2FA enabled whose current session hasn't
  // completed a WebAuthn/backup-code challenge yet — every other role, and
  // an admin without 2FA enabled, is always true.
  mfaSatisfied: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  registerCustomer: (input: RegisterCustomerInput) => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  completeMfaChallenge: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Mirrors requireRole.ts's MFA_SESSION_TTL_MS on the backend — kept in sync
// manually since frontend and backend don't share a module. This is only a
// UX shortcut to route straight to the challenge screen instead of flashing
// the dashboard first; the backend's own check is what's actually enforced,
// so drift here would be a UX papercut, not a security hole.
const MFA_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// getIdTokenResult() is normally near-instant (served from the SDK's local
// cache), but nothing guarantees that — a slow/stuck token fetch here must
// never stall the login button forever. Falling back to "satisfied" on
// timeout is safe: it only ever produces a false positive that the backend's
// own requireRole check (the actual enforcement point) still catches.
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([promise, new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms))]);
}

// Distinct from withTimeout above: there's no safe fallback value for "did
// login succeed," so a login that's still hanging at the deadline has to
// fail loudly with a message the user can act on, instead of leaving the
// button on "Signing in..." forever.
const LOGIN_TIMEOUT_MS = 10_000;

class LoginTimeoutError extends Error {
  constructor() {
    super("Login is taking longer than expected. Check your connection and try again.");
    this.name = "LoginTimeoutError";
  }
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new LoginTimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// Per-step timing for the login flow, logged to the console so a slow
// login can be pinned to a specific step (Firebase sign-in vs. this app's
// own /auth/me) instead of just "login was slow" — the same diagnosis the
// backend's morgan logging and verifyIdToken/getMe timing give server-side.
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    console.info(`[login-timing] ${label}: ${Math.round(performance.now() - start)}ms`);
    return result;
  } catch (err) {
    console.info(`[login-timing] ${label} failed after ${Math.round(performance.now() - start)}ms`);
    throw err;
  }
}

async function computeMfaSatisfied(user: FirebaseUser, profile: UserProfile | null) {
  if (!profile || profile.role !== "admin" || !profile.mfaEnabled) return true;
  const result = await withTimeout(user.getIdTokenResult(), 8000);
  if (result === "timeout") return true;
  const verifiedAt = result.claims.mfaVerifiedAt;
  // mfaVerifiedAuthTime must match THIS device's auth_time — custom claims
  // are account-wide, so without this check, one device completing the
  // challenge would silently satisfy it for every other device signed into
  // the same account too. auth_time is typed as a string on the client SDK
  // but is a numeric JWT claim at runtime, hence the Number() coercion.
  const verifiedForThisDevice = result.claims.mfaVerifiedAuthTime === Number(result.claims.auth_time);
  return (
    typeof verifiedAt === "number" &&
    verifiedForThisDevice &&
    Date.now() - verifiedAt <= MFA_SESSION_TTL_MS
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaSatisfied, setMfaSatisfied] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const userProfile = await getMe();
          setProfile(userProfile);
          setMfaSatisfied(await computeMfaSatisfied(user, userProfile));
        } catch {
          setProfile(null);
          setMfaSatisfied(true);
        }
      } else {
        setProfile(null);
        setMfaSatisfied(true);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function login(email: string, password: string): Promise<LoginResult> {
    const start = performance.now();
    try {
      return await withDeadline(loginSteps(email, password), LOGIN_TIMEOUT_MS);
    } finally {
      console.info(`[login-timing] total: ${Math.round(performance.now() - start)}ms`);
    }
  }

  async function loginSteps(email: string, password: string): Promise<LoginResult> {
    const credential = await timed("signInWithEmailAndPassword", () =>
      signInWithEmailAndPassword(firebaseAuth, email, password),
    );
    // Redirecting needs the role (to know which home route to send them
    // to), so getMe() can't be skipped — but nothing else is awaited
    // before the caller (LoginPage) can navigate once this resolves.
    const userProfile = await timed("getMe", () => getMe());
    setProfile(userProfile);
    const satisfied = await timed("computeMfaSatisfied", () => computeMfaSatisfied(credential.user, userProfile));
    setMfaSatisfied(satisfied);
    return { profile: userProfile, mfaSatisfied: satisfied };
  }

  async function completeMfaChallenge() {
    await firebaseUser?.getIdToken(true);
    setMfaSatisfied(true);
  }

  async function registerCustomer(input: RegisterCustomerInput) {
    await registerCustomerApi(input);
    await signInWithEmailAndPassword(firebaseAuth, input.email, input.password);
    const userProfile = await getMe();
    setProfile(userProfile);
    return userProfile;
  }

  async function logout() {
    await signOut(firebaseAuth);
  }

  async function refreshProfile() {
    setProfile(await getMe());
  }

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        mfaSatisfied,
        login,
        registerCustomer,
        logout,
        refreshProfile,
        completeMfaChallenge,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- context + hook co-location is intentional
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
