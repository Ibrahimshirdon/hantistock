import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Copy, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Desktop-only entry point for the mobile scanner. /scan is a deliberately
// separate page with no in-app navigation to it (per the original spec —
// it must never appear inside the desktop POS itself), so this just surfaces
// the link for a cashier to open on their own phone. Hidden on small screens
// via the caller's responsive classes, since a phone already viewing this
// button is already on the POS, not the place to advertise the scanner.
export function MobileScannerLinkDialog() {
  const { t } = useTranslation(["sales", "common"]);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const scanUrl = `${window.location.origin}/scan`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(scanUrl);
      setCopied(true);
      toast.success(t("sales:mobileScannerLink.copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("sales:mobileScannerLink.copyFailed"));
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Smartphone className="me-1.5 size-4" />
        {t("sales:mobileScannerLink.button")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("sales:mobileScannerLink.title")}</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">{t("sales:mobileScannerLink.instructions")}</p>

          <div className="flex gap-2">
            <Input readOnly value={scanUrl} onFocus={(e) => e.currentTarget.select()} />
            <Button variant="outline" size="icon" onClick={handleCopy} title={t("sales:mobileScannerLink.copy")}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
