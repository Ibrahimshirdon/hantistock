import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FirebaseError } from "firebase/app";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Eye, EyeOff, Lock, User } from "lucide-react";
import { resolveLoginIdentifier } from "@/api/auth.api";
import { getApiErrorMessage } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { getAuthErrorMessage } from "@/lib/firebaseErrors";
import { ROLE_HOME_ROUTE } from "@/types/auth.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FEATURES = [
  "Real-time inventory tracking & alerts",
  "Multi-role access control",
  "Sales, purchases & financial reports",
  "Supplier portal & stock management",
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation("auth");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const email = identifier.includes("@")
        ? identifier
        : (await resolveLoginIdentifier(identifier)).email;
      const profile = await login(email, password);
      navigate(ROLE_HOME_ROUTE[profile.role]);
    } catch (error) {
      toast.error(
        error instanceof FirebaseError ? getAuthErrorMessage(error) : getApiErrorMessage(error),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Branded left panel */}
      <div className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:w-5/12 xl:w-1/2">
        <div className="absolute -inset-s-32 -top-32 size-125 rounded-full bg-sidebar-accent/30 blur-3xl" />
        <div className="absolute -bottom-32 -inset-e-32 size-125 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative z-10 flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-sidebar-foreground/10 p-1.5 ring-1 ring-sidebar-foreground/20">
              <img src="/favicon.png" alt="" className="size-full object-contain" />
            </div>
            <span className="text-xl font-bold tracking-tight">Hantistock</span>
          </div>
          <div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight">
              Your complete<br />inventory solution
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-sidebar-foreground/70">
              Everything you need to manage inventory, sales, suppliers, and your team — all in one place.
            </p>
            <ul className="mt-8 flex flex-col gap-4">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sidebar-foreground/80">
                  <CheckCircle2 className="size-5 shrink-0 text-primary" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-sidebar-foreground/40">
            © {new Date().getFullYear()} Hantistock. All rights reserved.
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 flex-col items-center justify-center bg-background p-6">
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <img src="/favicon.png" alt="" className="size-9 object-contain" />
          <span className="text-xl font-bold tracking-tight">Hantistock</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight">{t("login.title")}</h2>
            <p className="mt-1.5 text-muted-foreground">{t("login.subtitle")}</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="identifier">{t("login.identifierLabel")}</Label>
              <div className="relative">
                <User className="absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="identifier"
                  className="ps-10"
                  required
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">{t("login.passwordLabel")}</Label>
              <div className="relative">
                <Lock className="absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="ps-10 pe-10"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className="absolute inset-e-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={submitting} className="mt-1 h-11 text-base font-semibold">
              {submitting ? t("login.submitting") : t("login.submit")}
            </Button>
          </form>

        </div>
      </div>
    </div>
  );
}
