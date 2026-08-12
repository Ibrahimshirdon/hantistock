import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { startAuthentication } from "@simplewebauthn/browser";
import { Fingerprint, KeyRound } from "lucide-react";
import { getLoginOptions, verifyBackupCode, verifyLogin } from "@/api/mfa.api";
import { getApiErrorMessage } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { ROLE_HOME_ROUTE } from "@/types/auth.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MfaChallengePage() {
  const { profile, mfaSatisfied, completeMfaChallenge, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation("auth");
  const [webauthnPending, setWebauthnPending] = useState(false);
  const [webauthnFailed, setWebauthnFailed] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const [backupPending, setBackupPending] = useState(false);

  useEffect(() => {
    if (!profile) {
      navigate("/login", { replace: true });
      return;
    }
    if (mfaSatisfied) {
      navigate(ROLE_HOME_ROUTE[profile.role], { replace: true });
    }
    // Only re-run on the identity of the profile/satisfied signal, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid, mfaSatisfied]);

  async function handleWebauthn() {
    setWebauthnPending(true);
    setWebauthnFailed(false);
    try {
      const options = await getLoginOptions();
      const response = await startAuthentication({ optionsJSON: options });
      await verifyLogin(response);
      await completeMfaChallenge();
      if (profile) navigate(ROLE_HOME_ROUTE[profile.role], { replace: true });
    } catch (error) {
      setWebauthnFailed(true);
      toast.error(getApiErrorMessage(error));
    } finally {
      setWebauthnPending(false);
    }
  }

  useEffect(() => {
    if (profile && !mfaSatisfied) {
      // Deferred a tick so the resulting setState (webauthnPending) lands
      // outside this effect's synchronous execution, not as a mount-time
      // cascading render.
      queueMicrotask(() => handleWebauthn());
    }
    // Fire once on mount to auto-prompt — re-triggering belongs to the retry button, not this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleBackupCodeSubmit() {
    setBackupPending(true);
    try {
      await verifyBackupCode(backupCode.trim());
      await completeMfaChallenge();
      if (profile) navigate(ROLE_HOME_ROUTE[profile.role], { replace: true });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBackupPending(false);
    }
  }

  if (!profile) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10">
            <Fingerprint className="size-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t("mfa.title")}</h1>
          <p className="mt-1.5 text-muted-foreground">{t("mfa.subtitle")}</p>
        </div>

        <div className="flex flex-col gap-4">
          <Button
            className="h-11 text-base font-semibold"
            disabled={webauthnPending}
            onClick={handleWebauthn}
          >
            {webauthnPending ? t("mfa.verifying") : t("mfa.retryButton")}
          </Button>

          {webauthnFailed && (
            <p className="text-center text-sm text-muted-foreground">{t("mfa.webauthnFailedHint")}</p>
          )}

          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("mfa.or")}</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="backupCode">{t("mfa.backupCodeLabel")}</Label>
            <div className="relative">
              <KeyRound className="absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="backupCode"
                className="ps-10"
                placeholder="XXXXX-XXXXX"
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value)}
              />
            </div>
          </div>
          <Button
            variant="outline"
            disabled={backupPending || !backupCode.trim()}
            onClick={handleBackupCodeSubmit}
          >
            {backupPending ? t("mfa.verifying") : t("mfa.useBackupCode")}
          </Button>

          <button
            type="button"
            className="mt-2 text-center text-sm text-muted-foreground hover:text-foreground"
            onClick={() => logout()}
          >
            {t("mfa.signOutInstead")}
          </button>
        </div>
      </div>
    </div>
  );
}
