import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { updateMyProfile, uploadMyPhoto } from "@/api/auth.api";
import { getApiErrorMessage } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import type { SupportedLanguage } from "@/i18n";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AccountSettingsPage() {
  const { profile, firebaseUser, refreshProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation("account");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [emailConfirmPassword, setEmailConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const emailChanged = email.trim().toLowerCase() !== (profile?.email ?? "").toLowerCase();

  const profileMutation = useMutation({
    mutationFn: async () => {
      if (emailChanged) {
        if (!firebaseUser?.email) throw new Error("Not signed in");
        const credential = EmailAuthProvider.credential(firebaseUser.email, emailConfirmPassword);
        await reauthenticateWithCredential(firebaseUser, credential);
      }
      return updateMyProfile({
        displayName,
        username: username || undefined,
        email: emailChanged ? email.trim() : undefined,
      });
    },
    onSuccess: async () => {
      toast.success(t("toasts.profileUpdated"));
      setEmailConfirmPassword("");
      if (emailChanged) await firebaseUser?.reload();
      await refreshProfile();
    },
    onError: (error) => {
      const code = (error as { code?: string }).code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        toast.error(t("toasts.emailChangeWrongPassword"));
      } else {
        toast.error(getApiErrorMessage(error));
      }
    },
  });

  const photoMutation = useMutation({
    mutationFn: (file: File) => uploadMyPhoto(file),
    onSuccess: async () => {
      toast.success(t("toasts.photoUpdated"));
      await refreshProfile();
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      if (!firebaseUser?.email) throw new Error("Not signed in");
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, newPassword);
    },
    onSuccess: () => {
      toast.success(t("toasts.passwordChanged"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error) => {
      const code = (error as { code?: string }).code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        toast.error(t("password.wrongCurrentError"));
      } else if (code === "auth/weak-password") {
        toast.error(t("password.weakError"));
      } else {
        toast.error(t("password.genericError"));
      }
    },
  });

  function handlePasswordSubmit() {
    if (newPassword.length < 6) {
      toast.error(t("password.minLengthError"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("password.mismatchError"));
      return;
    }
    passwordMutation.mutate();
  }

  if (!profile) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("photo.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar size="lg">
            <AvatarImage src={profile.photoURL} />
            <AvatarFallback>{initials(profile.displayName)}</AvatarFallback>
          </Avatar>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) photoMutation.mutate(file);
            }}
          />\
          
          <Button
            variant="outline"
            disabled={photoMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {photoMutation.isPending ? t("photo.uploading") : t("photo.change")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("profile.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{t("profile.email")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {emailChanged && <p className="text-xs text-muted-foreground">{t("profile.emailHint")}</p>}
          </div>
          {emailChanged && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="emailConfirmPassword">{t("profile.currentPasswordLabel")}</Label>
              <Input
                id="emailConfirmPassword"
                type="password"
                value={emailConfirmPassword}
                onChange={(e) => setEmailConfirmPassword(e.target.value)}
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="displayName">{t("profile.name")}</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username">{t("profile.username")}</Label>
            <Input
              id="username"
              placeholder={t("profile.usernamePlaceholder")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("profile.usernameHint")}</p>
          </div>
          <Button
            className="w-fit"
            disabled={
              profileMutation.isPending ||
              !displayName ||
              !email ||
              (emailChanged && !emailConfirmPassword)
            }
            onClick={() => profileMutation.mutate()}
          >
            {profileMutation.isPending ? t("profile.saving") : t("profile.save")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("password.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currentPassword">{t("password.current")}</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPassword">{t("password.new")}</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword">{t("password.confirm")}</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <Button
            className="w-fit"
            disabled={passwordMutation.isPending || !currentPassword || !newPassword}
            onClick={handlePasswordSubmit}
          >
            {passwordMutation.isPending ? t("password.submitting") : t("password.submit")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("appearance.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("appearance.currentlyUsing", { mode: theme === "dark" ? t("appearance.dark") : t("appearance.light") })}
          </p>
          <Button variant="outline" onClick={toggleTheme}>
            {theme === "dark" ? (
              <>
                <Sun /> {t("appearance.switchToLight")}
              </>
            ) : (
              <>
                <Moon /> {t("appearance.switchToDark")}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("language.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t("language.description")}</p>
          <Select value={language} onValueChange={(v) => setLanguage(v as SupportedLanguage)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t("language.english")}</SelectItem>
              <SelectItem value="so">{t("language.somali")}</SelectItem>
              <SelectItem value="ar">{t("language.arabic")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    </div>
  );
}
