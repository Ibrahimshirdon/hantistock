import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startRegistration } from "@simplewebauthn/browser";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Fingerprint, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import {
  disableMfa,
  generateBackupCodes,
  getMfaStatus,
  getRegistrationOptions,
  removeDevice,
  verifyRegistration,
} from "@/api/mfa.api";
import { getApiErrorMessage } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function formatDate(value: unknown): string {
  if (!value || typeof value !== "object" || !("_seconds" in value)) return "—";
  return new Date((value as { _seconds: number })._seconds * 1000).toLocaleDateString();
}

export function TwoFactorAuthCard() {
  const { t } = useTranslation("account");
  const { firebaseUser, refreshProfile, completeMfaChallenge } = useAuth();
  const queryClient = useQueryClient();

  const [deviceName, setDeviceName] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisableForm, setShowDisableForm] = useState(false);

  const { data: status } = useQuery({
    queryKey: ["mfa-status"],
    queryFn: getMfaStatus,
  });

  async function afterMfaStateChange() {
    await completeMfaChallenge();
    await refreshProfile();
    await queryClient.invalidateQueries({ queryKey: ["mfa-status"] });
  }

  const enrollMutation = useMutation({
    mutationFn: async () => {
      const options = await getRegistrationOptions();
      const response = await startRegistration({ optionsJSON: options });
      await verifyRegistration(response, deviceName.trim() || undefined);
    },
    onSuccess: async () => {
      toast.success(t("twoFactor.toasts.deviceAdded"));
      setDeviceName("");
      await afterMfaStateChange();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const removeMutation = useMutation({
    mutationFn: (credentialId: string) => removeDevice(credentialId),
    onSuccess: async () => {
      toast.success(t("twoFactor.toasts.deviceRemoved"));
      await afterMfaStateChange();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const backupCodesMutation = useMutation({
    mutationFn: generateBackupCodes,
    onSuccess: async (result) => {
      setBackupCodes(result.codes);
      await queryClient.invalidateQueries({ queryKey: ["mfa-status"] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const disableMutation = useMutation({
    mutationFn: async () => {
      if (!firebaseUser?.email) throw new Error("Not signed in");
      const credential = EmailAuthProvider.credential(firebaseUser.email, disablePassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      await disableMfa();
    },
    onSuccess: async () => {
      toast.success(t("twoFactor.toasts.disabled"));
      setDisablePassword("");
      setShowDisableForm(false);
      await afterMfaStateChange();
    },
    onError: (error) => {
      const code = (error as { code?: string }).code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        toast.error(t("twoFactor.wrongPassword"));
      } else {
        toast.error(getApiErrorMessage(error));
      }
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" />
          {t("twoFactor.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {status?.enabled ? t("twoFactor.enabledDescription") : t("twoFactor.disabledDescription")}
        </p>

        {status && status.devices.length > 0 && (
          <div className="flex flex-col gap-2">
            {status.devices.map((device) => (
              <div
                key={device.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Fingerprint className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{device.deviceName}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("twoFactor.addedOn", { date: formatDate(device.createdAt) })}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(device.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <form
          className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            enrollMutation.mutate();
          }}
        >
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="deviceName">{t("twoFactor.deviceNameLabel")}</Label>
            <Input
              id="deviceName"
              placeholder={t("twoFactor.deviceNamePlaceholder")}
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-fit" disabled={enrollMutation.isPending}>
            <Fingerprint className="size-4" />
            {enrollMutation.isPending ? t("twoFactor.adding") : t("twoFactor.addDevice")}
          </Button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <div>
            <p className="text-sm font-medium">{t("twoFactor.backupCodes")}</p>
            <p className="text-xs text-muted-foreground">
              {status
                ? t("twoFactor.backupCodesRemaining", { count: status.backupCodesRemaining })
                : ""}
            </p>
          </div>
          <Button
            variant="outline"
            disabled={backupCodesMutation.isPending}
            onClick={() => backupCodesMutation.mutate()}
          >
            <KeyRound className="size-4" />
            {t("twoFactor.generateBackupCodes")}
          </Button>
        </div>

        {status?.enabled && (
          <div className="border-t pt-4">
            {!showDisableForm ? (
              <Button variant="outline" onClick={() => setShowDisableForm(true)}>
                {t("twoFactor.disable")}
              </Button>
            ) : (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (disablePassword) disableMutation.mutate();
                }}
              >
                <Label htmlFor="disablePassword">{t("twoFactor.confirmPasswordToDisable")}</Label>
                <Input
                  id="disablePassword"
                  type="password"
                  autoFocus
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={disableMutation.isPending || !disablePassword}
                  >
                    {disableMutation.isPending ? t("twoFactor.disabling") : t("twoFactor.confirmDisable")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setShowDisableForm(false);
                      setDisablePassword("");
                    }}
                  >
                    {t("twoFactor.cancel")}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={backupCodes !== null} onOpenChange={(open) => !open && setBackupCodes(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("twoFactor.backupCodesDialogTitle")}</DialogTitle>
            <DialogDescription>{t("twoFactor.backupCodesDialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-3 font-mono text-sm">
            {backupCodes?.map((code) => (
              <span key={code}>{code}</span>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                navigator.clipboard.writeText((backupCodes ?? []).join("\n"));
                toast.success(t("twoFactor.toasts.codesCopied"));
              }}
            >
              {t("twoFactor.copyCodes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
