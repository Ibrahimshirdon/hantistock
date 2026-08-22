import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle2, Printer, RotateCcw, ScanLine, WifiOff, XCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { submitScan, createSalesOrder, getSalesOrder, getReceiptForOrder } from "@/api/sales.api";
import { getApiErrorMessage } from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReceiptPaper } from "./SalesOrderDetailPage";

// A separate mobile "Scanner Mode" page — NOT the desktop POS rebuilt. Every
// scan still reports to the backend exactly as before, so the existing
// desktop POS keeps auto-adding scanned products to its own cart via its
// unchanged polling + onCameraScan pipeline (see POSPage.tsx). On top of
// that, this page ALSO keeps its own lightweight running cart so a cashier
// can scan a full basket and complete the sale from the phone alone, with no
// desktop involved — using the exact same checkout endpoint
// (createSalesOrder) the desktop POS already uses, so pricing, tax,
// inventory decrement, and receipt generation are all identical, unchanged
// backend logic. Stock still only ever moves at checkout, never at scan time.
const SCAN_COOLDOWN_MS = 2000;

type Status = "starting" | "scanning" | "cameraError";

interface MobileCartLine {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export function MobileScannerPage() {
  const { t } = useTranslation(["sales", "common"]);
  const { profile } = useAuth();
  const [status, setStatus] = useState<Status>("starting");
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [lastResult, setLastResult] = useState<{ success: boolean; text: string } | null>(null);
  const [cart, setCart] = useState<MobileCartLine[]>([]);
  const [completedOrderId, setCompletedOrderId] = useState<string | null>(null);
  const [scanCycle, setScanCycle] = useState(0);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const cooldownRef = useRef<{ barcode: string; until: number } | null>(null);
  // Lets the persistent decode callback (registered once per camera session)
  // check "should I still act on scans right now" without a stale closure.
  const acceptingScansRef = useRef(true);

  const scanMutation = useMutation({
    mutationFn: submitScan,
    onSuccess: (result, barcode) => {
      if (result.found && result.productName && result.unitPrice != null) {
        setLastResult({ success: true, text: t("sales:mobileScannerPage.scanSuccess", { name: result.productName }) });
        setCart((prev) => {
          const existing = prev.find((line) => line.productId === result.productId);
          if (existing) {
            return prev.map((line) =>
              line.productId === result.productId ? { ...line, quantity: line.quantity + 1 } : line,
            );
          }
          return [
            ...prev,
            { productId: result.productId!, name: result.productName!, unitPrice: result.unitPrice!, quantity: 1 },
          ];
        });
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

  const checkoutMutation = useMutation({
    mutationFn: () =>
      createSalesOrder({
        items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        paymentMethod: "cash",
      }),
    onSuccess: (result) => {
      setCompletedOrderId(result.id);
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err));
      // Checkout failed — let the cashier keep scanning / retry.
      acceptingScansRef.current = true;
      setScanCycle((c) => c + 1);
    },
  });

  const { data: completedOrder } = useQuery({
    queryKey: ["salesOrder", completedOrderId],
    queryFn: () => getSalesOrder(completedOrderId!),
    enabled: !!completedOrderId,
  });
  const { data: completedReceipt } = useQuery({
    queryKey: ["receipt", completedOrderId],
    queryFn: () => getReceiptForOrder(completedOrderId!),
    enabled: !!completedOrderId,
  });

  const videoCallbackRef = useCallback((el: HTMLVideoElement | null) => {
    setVideoEl(el);
  }, []);

  useEffect(() => {
    if (!videoEl || completedOrderId) return;

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
            if (cancelled || !result || !acceptingScansRef.current) return;
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
  }, [videoEl, scanCycle, completedOrderId]);

  function handleCompleteSale() {
    if (cart.length === 0 || checkoutMutation.isPending) return;
    acceptingScansRef.current = false;
    controlsRef.current?.stop();
    checkoutMutation.mutate();
  }

  function handleNewSale() {
    setCart([]);
    setCompletedOrderId(null);
    setLastResult(null);
    acceptingScansRef.current = true;
    setScanCycle((c) => c + 1);
  }

  function handlePrint() {
    window.print();
  }

  const cartTotal = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  if (completedOrderId) {
    return (
      <div className="min-h-screen bg-black text-white print:bg-white print:text-black">
        <div className="flex flex-col items-center gap-4 px-4 py-6 print:hidden">
          <CheckCircle2 className="size-10 text-emerald-500" />
          <p className="text-center text-lg font-semibold">
            {completedOrder
              ? t("sales:mobileScannerPage.saleCompleted", { orderNumber: completedOrder.orderNumber })
              : t("common:actions.loading")}
          </p>
          <div className="flex w-full max-w-xs gap-2">
            <Button variant="outline" className="flex-1 gap-1.5" onClick={handleNewSale}>
              <RotateCcw className="size-4" />
              {t("sales:mobileScannerPage.newSale")}
            </Button>
            <Button className="flex-1 gap-1.5" onClick={handlePrint} disabled={!completedOrder}>
              <Printer className="size-4" />
              {t("sales:salesOrderDetailPage.printReceipt")}
            </Button>
          </div>
        </div>
        {completedOrder && (
          <div className="flex justify-center px-4 pb-6 print:p-0">
            <ReceiptPaper order={completedOrder} receipt={completedReceipt} returns={undefined} t={t} />
          </div>
        )}
      </div>
    );
  }

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

        <Card className="border-white/10 bg-white/5">
          <CardContent className="py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">
              {t("sales:mobileScannerPage.cartTitle")}
            </p>
            {cart.length === 0 ? (
              <p className="text-sm text-white/60">{t("sales:mobileScannerPage.cartEmptyMobile")}</p>
            ) : (
              <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                {cart.map((line) => (
                  <div key={line.productId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">
                      {line.quantity}× {line.name}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      ${(line.unitPrice * line.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Button
          className="w-full gap-1.5"
          size="lg"
          disabled={cart.length === 0 || checkoutMutation.isPending}
          onClick={handleCompleteSale}
        >
          {checkoutMutation.isPending
            ? t("sales:mobileScannerPage.completing")
            : t("sales:mobileScannerPage.completeSale", { total: cartTotal.toFixed(2) })}
        </Button>
      </div>
    </div>
  );
}
