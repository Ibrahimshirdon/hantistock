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

async function computeMfaSatisfied(user: FirebaseUser, profile: UserProfile | null) {
  if (!profile || profile.role !== "admin" || !profile.mfaEnabled) return true;
  const result = await user.getIdTokenResult();
  return Boolean(result.claims.mfaVerifiedAt);
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
    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const userProfile = await getMe();
    setProfile(userProfile);
    const satisfied = await computeMfaSatisfied(credential.user, userProfile);
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
