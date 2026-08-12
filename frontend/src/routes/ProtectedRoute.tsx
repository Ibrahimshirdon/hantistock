import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ROLE_HOME_ROUTE, type UserRole } from "@/types/auth.types";

interface ProtectedRouteProps {
  allowedRoles: UserRole[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { firebaseUser, profile, loading, mfaSatisfied } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
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
