import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ScanLine, WifiOff, XCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { submitScan } from "@/api/sales.api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// A separate, minimal "Scanner Mode" page for mobile devices — NOT another
// POS. It only scans barcodes and reports each one to the backend; the
// existing desktop POS (POSPage.tsx) polls for and consumes those scans on
// its own, adding them to its existing cart through its existing
// onCameraScan pipeline. This page never touches cart state, stock, or
// checkout — it is purely a remote input device for the real POS.
const SCAN_COOLDOWN_MS = 2000;

type Status = "starting" | "scanning" | "cameraError";

export function MobileScannerPage() {
  const { t } = useTranslation(["sales"]);
  const { profile } = useAuth();
  const [status, setStatus] = useState<Status>("starting");
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [lastResult, setLastResult] = useState<{ success: boolean; text: string } | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const cooldownRef = useRef<{ barcode: string; until: number } | null>(null);

  const scanMutation = useMutation({
    mutationFn: submitScan,
    onSuccess: (result, barcode) => {
      if (result.found && result.productName) {
        setLastResult({ success: true, text: t("sales:mobileScannerPage.scanSuccess", { name: result.productName }) });
      } else {
        setLastResult({ success: false, text: t("sales:mobileScannerPage.scanNotFound", { barcode }) });
      }
    },
    onError: (_err, barcode) => {
      setLastResult({ success: false, text: t("sales:mobileScannerPage.scanNotFound", { barcode }) });
    },
  });
  const scanMutationRef = useRef(scanMutation);
  scanMutationRef.current = scanMutation;

  const videoCallbackRef = useCallback((el: HTMLVideoElement | null) => {
    setVideoEl(el);
  }, []);

  useEffect(() => {
    if (!videoEl) return;

    let cancelled = false;

    async function start() {
      setStatus("starting");

      try {
        const [{ BrowserMultiFormatReader }, { DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (cancelled) return;

        const hints = new Map<number, unknown>();
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);

        const controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: "environment",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          videoEl!,
          (result) => {
            if (cancelled || !result) return;
            const text = result.getText();

            // Debounce: ignore repeated decodes of the same barcode while the
            // camera keeps it in frame — only report it again once it's been
            // out of frame (or the cooldown expired) since the last report.
            const now = Date.now();
            const cooldown = cooldownRef.current;
            if (cooldown && cooldown.barcode === text && now < cooldown.until) return;
            cooldownRef.current = { barcode: text, until: now + SCAN_COOLDOWN_MS };

            scanMutationRef.current.mutate(text);
          },
        );

        if (cancelled) {
          controls.stop();
        } else {
          controlsRef.current = controls;
          setStatus("scanning");
        }
      } catch {
        if (!cancelled) setStatus("cameraError");
      }
    }

    start();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [videoEl]);

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <ScanLine className="size-5" />
          <span className="font-semibold">{t("sales:mobileScannerPage.title")}</span>
        </div>
        {status === "cameraError" ? (
          <Badge variant="destructive" className="gap-1">
            <WifiOff className="size-3" />
            {t("sales:mobileScannerPage.statusError")}
          </Badge>
        ) : status === "scanning" ? (
          <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
            <CheckCircle2 className="size-3" />
            {t("sales:mobileScannerPage.statusConnected")}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-white">
            {t("sales:mobileScannerPage.statusStarting")}
          </Badge>
        )}
      </div>

      <div className="relative flex-1 overflow-hidden bg-black">
        <video ref={videoCallbackRef} className="size-full object-cover" autoPlay muted playsInline />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="size-56 rounded-2xl border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
        </div>
        {status === "cameraError" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-6 text-center">
            <p className="text-sm text-destructive-foreground">{t("sales:mobileScannerPage.errorCamera")}</p>
          </div>
        )}
      </div>

      <div className="space-y-3 px-4 py-4">
        {profile && (
          <p className="text-center text-xs text-white/60">
            {t("sales:mobileScannerPage.signedInAs", { name: profile.displayName })}
          </p>
        )}

        <Card className="border-white/10 bg-white/5">
          <CardContent className="flex items-center gap-3 py-3">
            {lastResult ? (
              <>
                {lastResult.success ? (
                  <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="size-5 shrink-0 text-destructive" />
                )}
                <div>
                  <p className="text-xs text-white/60">{t("sales:mobileScannerPage.lastScanned")}</p>
                  <p className="text-sm font-medium">{lastResult.text}</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-white/60">{t("sales:mobileScannerPage.waitingForScan")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
