import { useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { ROLE_HOME_ROUTE, type UserRole } from "@/types/auth.types";

interface ProtectedRouteProps {
  allowedRoles: UserRole[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { t } = useTranslation("auth");
  const { firebaseUser, profile, loading, mfaSatisfied, profileLoadFailed, refreshProfile, logout } = useAuth();
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    try {
      await refreshProfile();
    } catch {
      // profileLoadFailed (from context) already reflects the outcome.
    } finally {
      setRetrying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  // A persisted Firebase session exists, but this app's own profile fetch
  // failed for a reason that says nothing about whether that session is
  // valid (network blip, backend still waking up) — offering a retry here
  // keeps the user signed in instead of showing the login form, which
  // would otherwise look exactly like (and require) logging back in.
  if (firebaseUser && !profile && profileLoadFailed) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-muted-foreground">{t("sessionRestore.message")}</p>
        <div className="flex gap-2">
          <Button onClick={handleRetry} disabled={retrying}>
            {retrying ? t("sessionRestore.retrying") : t("sessionRestore.retryButton")}
          </Button>
          <Button variant="outline" onClick={() => logout()}>
            {t("mfa.signOutInstead")}
          </Button>
        </div>
      </div>
    );
  }

  if (!firebaseUser || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (!mfaSatisfied) {
    return <Navigate to="/mfa-challenge" replace />;
  }

  if (!allowedRoles.includes(profile.role)) {
    return <Navigate to={ROLE_HOME_ROUTE[profile.role]} replace />;
  }

  return <Outlet />;
}
