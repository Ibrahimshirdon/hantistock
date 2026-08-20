import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Plus, Star, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { getProductByBarcode, listProducts } from "@/api/inventory.api";
import { listTaxRates, createSalesOrder, previewDiscount, listSalesOrders, type CreateSalesOrderInput } from "@/api/sales.api";
import { createDelivery } from "@/api/delivery.api";
import { listUsers, getUser } from "@/api/auth.api";
import { getApiErrorMessage } from "@/api/client";
import type { CustomerProfile } from "@/types/auth.types";
import type { Product } from "@/types/inventory.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShiftSummaryDialog } from "./ShiftSummaryDialog";

const POINTS_PER_DOLLAR = 100;

interface CartLine {
  productId: string;
  name: string;
  unitPrice: number;
  taxRate: number;
  categoryId: string;
  quantity: number;
}

const PAYMENT_METHOD_VALUES = ["cash", "wallet", "evc_plus", "sahal", "edahab", "loan"] as const;

export function POSPage() {
  const { t } = useTranslation(["sales", "common"]);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<CreateSalesOrderInput["paymentMethod"]>("cash");
  const [customerId, setCustomerId] = useState<string>("none");
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [activeTab, setActiveTab] = useState<"cart" | "history">("cart");
  const [scheduleDelivery, setScheduleDelivery] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [pickupLine1, setPickupLine1] = useState("");
  const [pickupCity, setPickupCity] = useState("");
  const [dropoffLine1, setDropoffLine1] = useState("");
  const [dropoffCity, setDropoffCity] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [mobileView, setMobileView] = useState<"products" | "cart">("products");

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["products", "availableForSale"],
    queryFn: () => listProducts({ availableForSale: true }),
  });
  const { data: taxRates } = useQuery({ queryKey: ["taxRates"], queryFn: listTaxRates });
  const { data: customers } = useQuery({
    queryKey: ["users", "customer"],
    queryFn: () => listUsers("customer"),
  });

  const taxRateById = useMemo(() => {
    const map = new Map<string, number>();
    taxRates?.forEach((t) => map.set(t.id, t.rate));
    return map;
  }, [taxRates]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        (p.barcode?.toLowerCase() ?? "").includes(term),
    );
  }, [products, search]);

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) {
        return prev.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unitPrice: product.sellingPrice,
          taxRate: product.taxRateId ? taxRateById.get(product.taxRateId) ?? 0 : 0,
          categoryId: product.categoryId,
          quantity: 1,
        },
      ];
    });
  }

  function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((line) => line.productId !== productId));
      return;
    }
    setCart((prev) => prev.map((line) => (line.productId === productId ? { ...line, quantity } : line)));
  }

  async function handleBarcodeSearch() {
    const term = search.trim();
    if (!term) return;
    // If the grid already shows exactly one match, add it directly (no API call needed)
    if (filteredProducts.length === 1) {
      addToCart(filteredProducts[0]!);
      setSearch("");
      return;
    }
    try {
      const product = await getProductByBarcode(term);
      addToCart(product);
      setSearch("");
      toast.success(t("posPage.toasts.barcodeAdded", { name: product.name }));
    } catch {
      toast.error(t("posPage.toasts.barcodeNotFound", { barcode: term }));
    }
  }

  async function onCameraScan(barcode: string) {
    const existing = products?.find((p) => p.barcode === barcode);
    if (existing) {
      addToCart(existing);
      toast.success(t("posPage.toasts.barcodeAdded", { name: existing.name }));
      return;
    }
    try {
      const product = await getProductByBarcode(barcode);
      addToCart(product);
      toast.success(t("posPage.toasts.barcodeAdded", { name: product.name }));
    } catch {
      toast.error(t("posPage.toasts.barcodeNotFound", { barcode }));
    }
  }

  // Keep a stable ref so the effect below never needs to re-register
  const onCameraScanRef = useRef(onCameraScan);
  onCameraScanRef.current = onCameraScan;

  // Global physical barcode scanner support.
  // USB/Bluetooth scanners act as keyboards: they type the barcode very fast
  // (<50 ms between characters) then send Enter. We buffer rapid keystrokes
  // and, on Enter, treat the buffer as a scanned barcode.
  useEffect(() => {
    let buffer = "";
    let timer: ReturnType<typeof setTimeout> | null = null;

    function onKeyDown(e: KeyboardEvent) {
      // If the user is actively typing in any text field, don't intercept —
      // the existing search-box Enter handler already covers that path.
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "Enter") {
        if (buffer.length >= 4) onCameraScanRef.current(buffer);
        buffer = "";
        if (timer) { clearTimeout(timer); timer = null; }
        return;
      }

      if (e.key.length === 1) {
        buffer += e.key;
        // Physical scanners send all characters in < 50 ms. Reset the buffer
        // if no new character arrives within 100 ms (human typing pace).
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { buffer = ""; timer = null; }, 100);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const { data: selectedCustomerFull } = useQuery({
    queryKey: ["user", customerId],
    queryFn: () => getUser(customerId),
    enabled: customerId !== "none",
  });
  const loyaltyBalance = (selectedCustomerFull?.profile as CustomerProfile | null)?.loyaltyPoints ?? 0;

  const { data: recentCustomerOrders } = useQuery({
    queryKey: ["salesOrders", "customer", customerId],
    queryFn: () => listSalesOrders({ customerId, status: "completed" }),
    enabled: customerId !== "none",
    select: (orders) =>
      [...orders]
        .sort((a, b) => b.createdAt._seconds - a.createdAt._seconds)
        .slice(0, 5),
  });

  const subtotal = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  const previewMutation = useMutation({
    mutationFn: () =>
      previewDiscount(
        discountCode,
        cart.map((line) => ({
          productId: line.productId,
          categoryId: line.categoryId,
          lineSubtotal: line.unitPrice * line.quantity,
        })),
      ),
    onSuccess: (result) => {
      setAppliedDiscount({ code: discountCode, amount: result.discountAmount });
      toast.success(t("posPage.toasts.discountApplied", { amount: result.discountAmount.toFixed(2) }));
    },
    onError: (error) => {
      setAppliedDiscount(null);
      toast.error(getApiErrorMessage(error));
    },
  });

  const discountTotal = appliedDiscount?.amount ?? 0;
  const taxTotal = cart.reduce((sum, line) => {
    const lineTotal = line.unitPrice * line.quantity;
    const discountShare = subtotal > 0 ? (lineTotal / subtotal) * discountTotal : 0;
    return sum + (lineTotal - discountShare) * line.taxRate;
  }, 0);
  const preLoyaltyTotal = subtotal - discountTotal + taxTotal;
  const loyaltyDiscount = Math.min(pointsToRedeem / POINTS_PER_DOLLAR, preLoyaltyTotal);
  const grandTotal = preLoyaltyTotal - loyaltyDiscount + (scheduleDelivery ? deliveryFee : 0);
  const maxRedeemablePoints = Math.min(loyaltyBalance, Math.floor(preLoyaltyTotal * POINTS_PER_DOLLAR));

  const checkoutMutation = useMutation({
    mutationFn: createSalesOrder,
    onSuccess: async (result) => {
      if (scheduleDelivery) {
        try {
          await createDelivery({
            salesOrderId: result.id,
            pickupAddress: { label: t("posPage.delivery.pickupLabel"), line1: pickupLine1, city: pickupCity },
            dropoffAddress: { label: t("posPage.delivery.dropoffLabel"), line1: dropoffLine1, city: dropoffCity },
            notes: deliveryNotes || undefined,
          });
          toast.success(t("posPage.toasts.saleAndDeliveryCreated"));
        } catch {
          toast.success(t("posPage.toasts.saleCompleted"));
          toast.error(t("posPage.toasts.deliveryFailed"));
        }
      } else {
        toast.success(t("posPage.toasts.saleCompleted"));
      }
      setCart([]);
      setDiscountCode("");
      setAppliedDiscount(null);
      setPointsToRedeem(0);
      setScheduleDelivery(false);
      setDeliveryFee(0);
      setPickupLine1("");
      setPickupCity("");
      setDropoffLine1("");
      setDropoffCity("");
      setDeliveryNotes("");
      navigate(`/app/sales/orders/${result.id}`);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  function handleCheckout() {
    if (cart.length === 0) {
      toast.error(t("posPage.toasts.cartEmpty"));
      return;
    }
    if (paymentMethod === "loan" && customerId === "none") {
      toast.error(t("posPage.toasts.loanRequiresCustomer"));
      return;
    }
    if (scheduleDelivery && (!pickupLine1 || !pickupCity || !dropoffLine1 || !dropoffCity)) {
      toast.error(t("posPage.toasts.deliveryAddressRequired"));
      return;
    }
    checkoutMutation.mutate({
      customerId: customerId === "none" ? undefined : customerId,
      items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      discountCode: appliedDiscount?.code,
      paymentMethod,
      pointsToRedeem: pointsToRedeem > 0 ? pointsToRedeem : undefined,
      fulfillmentType: scheduleDelivery ? "delivery" : undefined,
      deliveryFee: scheduleDelivery && deliveryFee > 0 ? deliveryFee : undefined,
    });
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-3 md:h-[calc(100vh-7rem)] md:grid md:grid-cols-[1fr_360px] md:gap-4">

      {/* Mobile-only tab switcher */}
      <div className="flex shrink-0 rounded-lg border bg-muted/40 p-0.5 md:hidden">
        <button
          className={["flex-1 rounded-sm py-1.5 text-xs font-medium transition-colors", mobileView === "products" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"].join(" ")}
          onClick={() => setMobileView("products")}
        >
          {t("posPage.tabProducts")}
        </button>
        <button
          className={["flex-1 rounded-sm py-1.5 text-xs font-medium transition-colors", mobileView === "cart" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"].join(" ")}
          onClick={() => setMobileView("cart")}
        >
          {t("posPage.tabCart")}
          {cart.length > 0 && (
            <span className="ms-1.5 inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {cart.length}
            </span>
          )}
        </button>
      </div>

      <div className={["min-h-0 flex-1 flex flex-col gap-4 overflow-hidden", mobileView === "cart" ? "hidden md:flex" : ""].join(" ")}>
        <div className="flex gap-2">
          <Input
            placeholder={t("posPage.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleBarcodeSearch();
            }}
          />
          <ShiftSummaryDialog />
        </div>
        <div className="grid grid-cols-2 gap-3 overflow-y-auto pe-1 sm:grid-cols-3 lg:grid-cols-4">
          {productsLoading && (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col overflow-hidden rounded-xl border bg-card">
                <div className="h-28 animate-pulse bg-muted" />
                <div className="flex min-h-15 flex-col gap-2 p-2.5">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))
          )}
          {!productsLoading && search.trim() && filteredProducts.length === 0 && (
            <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
              <p>{t("posPage.noResults")}</p>
              <p className="mt-1 text-xs">{t("posPage.noResultsHint")}</p>
            </div>
          )}
          {filteredProducts.map((product) => {
            const outOfStock = product.totalStock <= 0;
            const lowStock = !outOfStock && product.totalStock <= product.reorderLevel;
            const cartLine = cart.find((l) => l.productId === product.id);
            return (
              <div
                key={product.id}
                className={cn(
                  "group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-all duration-150",
                  outOfStock
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:border-primary/50 hover:shadow-md active:scale-[0.97]",
                  cartLine && "ring-2 ring-primary/70",
                )}
                onClick={() => !outOfStock && addToCart(product)}
              >
                {/* Image */}
                <div className="relative h-28 shrink-0 overflow-hidden bg-muted">
                  {product.images[0] ? (
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="size-full object-contain transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <span className="select-none text-5xl font-bold text-muted-foreground/15">
                        {product.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}

                  {/* Out of stock overlay */}
                  {outOfStock && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
                      <Badge variant="destructive" className="text-[10px] shadow-sm">
                        {t("common:status.outOfStock")}
                      </Badge>
                    </div>
                  )}

                  {/* Low stock */}
                  {lowStock && (
                    <div className="absolute bottom-1.5 inset-s-1.5">
                      <Badge variant="warning" className="h-4 px-1.5 text-[9px] shadow-sm">
                        {t("common:status.lowStock")}
                      </Badge>
                    </div>
                  )}

                  {/* In-cart quantity bubble */}
                  {cartLine && (
                    <div className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-md">
                      {cartLine.quantity}
                    </div>
                  )}

                  {/* Hover add overlay */}
                  {!outOfStock && (
                    <div className="absolute inset-0 flex items-center justify-center bg-primary/0 transition-colors duration-150 group-hover:bg-primary/8">
                      <Plus className="size-7 scale-75 text-primary opacity-0 transition-all duration-150 group-hover:scale-100 group-hover:opacity-100" />
                    </div>
                  )}
                </div>

                {/* Info — found it: an arbitrary text-[11px]/text-[10px]
                    pixel value doesn't scale with Chrome's "Font size"
                    setting, but the rem-based container around it does —
                    confirmed the name/price reappeared the moment that
                    setting was lowered to Small. Mixing a literal-px font
                    size with a rem-based layout is exactly the kind of
                    mismatch that setting can blow up into a full collapse.
                    Using Tailwind's standard text-xs (rem-based, like
                    everything else here) instead keeps it scaling in step
                    with its container at any font-size setting, and
                    min-height (not a hard height) means it still can't
                    clip even if something else scales unevenly again. */}
                <div className="flex min-h-15 shrink-0 flex-col justify-center gap-1 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className="min-w-0 flex-1 text-xs font-medium text-foreground"
                      title={product.name}
                    >
                      {product.name}
                    </p>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-primary">
                      ${product.sellingPrice.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-end text-xs tabular-nums text-muted-foreground">
                    {product.totalStock} {product.unit}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Card className={["min-h-0 flex-1 flex flex-col overflow-hidden", mobileView === "products" ? "hidden md:flex" : ""].join(" ")}>
        <CardContent className="flex h-full flex-col gap-3 p-4">

          {/* Customer selector + loyalty — always visible */}
          <div className="flex flex-col gap-1.5">
            <Select
              value={customerId}
              onValueChange={(v) => {
                setCustomerId(v);
                setPointsToRedeem(0);
                if (v === "none") setScheduleDelivery(false);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("posPage.walkInCustomer")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("posPage.walkInCustomer")}</SelectItem>
                {customers?.map((c) => (
                  <SelectItem key={c.uid} value={c.uid}>
                    {c.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {loyaltyBalance > 0 && (
              <div className="flex items-center justify-between rounded-md border border-dashed border-amber-400/60 bg-amber-50/50 px-3 py-2 dark:bg-amber-900/10">
                <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <Star className="size-3.5 fill-amber-500 text-amber-500" />
                  <span>{t("posPage.loyalty.balance", { pts: loyaltyBalance })}</span>
                </div>
                {maxRedeemablePoints >= POINTS_PER_DOLLAR && (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={maxRedeemablePoints}
                      step={POINTS_PER_DOLLAR}
                      value={pointsToRedeem || ""}
                      placeholder="0"
                      onChange={(e) => {
                        const raw = Math.floor(Number(e.target.value) / POINTS_PER_DOLLAR) * POINTS_PER_DOLLAR;
                        setPointsToRedeem(Math.min(Math.max(0, raw), maxRedeemablePoints));
                      }}
                      className="h-7 w-20 text-center text-xs"
                    />
                    <span className="text-xs text-muted-foreground">{t("posPage.loyalty.pts")}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setPointsToRedeem(maxRedeemablePoints)}
                    >
                      {t("posPage.loyalty.useMax")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cart / History tabs */}
          <div className="flex rounded-md border bg-muted/40 p-0.5">
            <button
              className={[
                "flex-1 rounded-sm py-1.5 text-xs font-medium transition-colors",
                activeTab === "cart"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
              onClick={() => setActiveTab("cart")}
            >
              {t("posPage.tabCart")}
              {cart.length > 0 && (
                <span className="ms-1.5 inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  {cart.length}
                </span>
              )}
            </button>
            <button
              className={[
                "flex-1 rounded-sm py-1.5 text-xs font-medium transition-colors",
                activeTab === "history"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
              onClick={() => setActiveTab("history")}
              disabled={customerId === "none"}
            >
              {t("posPage.tabHistory")}
              {recentCustomerOrders && recentCustomerOrders.length > 0 && (
                <span className="ms-1.5 inline-flex size-4 items-center justify-center rounded-full bg-muted text-[10px]">
                  {recentCustomerOrders.length}
                </span>
              )}
            </button>
          </div>

          {/* Cart tab */}
          {activeTab === "cart" && (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {cart.length === 0 && (
                  <p className="mt-8 text-center text-sm text-muted-foreground">{t("posPage.cartEmpty")}</p>
                )}
                {cart.map((line) => (
                  <div key={line.productId} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{line.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("posPage.eachPrice", { price: line.unitPrice.toFixed(2) })}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      value={line.quantity}
                      onChange={(e) => updateQuantity(line.productId, Number(e.target.value))}
                      className="w-16 text-center"
                    />
                    <span className="w-16 text-end text-sm font-medium">
                      ${(line.unitPrice * line.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 overflow-y-auto">
              <div className="flex gap-2">
                <Input
                  placeholder={t("posPage.discountCodePlaceholder")}
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                />
                <Button
                  variant="outline"
                  disabled={!discountCode || cart.length === 0 || previewMutation.isPending}
                  onClick={() => previewMutation.mutate()}
                >
                  {t("posPage.apply")}
                </Button>
              </div>

              <div className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("common:fields.subtotal")}</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("common:fields.discount")}</span>
                  <span>-${discountTotal.toFixed(2)}</span>
                </div>
                {loyaltyDiscount > 0 && (
                  <div className="flex justify-between text-amber-600 dark:text-amber-400">
                    <span className="flex items-center gap-1">
                      <Star className="size-3 fill-current" />
                      {t("posPage.loyalty.discount", { pts: pointsToRedeem })}
                    </span>
                    <span>-${loyaltyDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("common:fields.tax")}</span>
                  <span>${taxTotal.toFixed(2)}</span>
                </div>
                {scheduleDelivery && deliveryFee > 0 && (
                  <div className="flex justify-between text-blue-600 dark:text-blue-400">
                    <span className="flex items-center gap-1">
                      <Truck className="size-3" />
                      {t("posPage.delivery.feeLabel")}
                    </span>
                    <span>+${deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-semibold">
                  <span>{t("common:fields.total")}</span>
                  <span>${grandTotal.toFixed(2)}</span>
                </div>
              </div>

              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`posPage.paymentMethods.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Delivery toggle — only when a registered customer is selected */}
              {customerId !== "none" && (
                <div className="rounded-md border">
                  <button
                    type="button"
                    className={[
                      "flex w-full items-center justify-between px-3 py-2 text-sm font-medium transition-colors",
                      scheduleDelivery ? "rounded-t-md" : "rounded-md",
                    ].join(" ")}
                    onClick={() => setScheduleDelivery(!scheduleDelivery)}
                  >
                    <span className="flex items-center gap-2">
                      <Truck className="size-4 text-muted-foreground" />
                      {t("posPage.delivery.toggle")}
                    </span>
                    <span className={[
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      scheduleDelivery
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    ].join(" ")}>
                      {scheduleDelivery ? t("posPage.delivery.on") : t("posPage.delivery.off")}
                    </span>
                  </button>

                  {scheduleDelivery && (
                    <div className="flex flex-col gap-2 border-t p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("posPage.delivery.pickupSection")}
                      </p>
                      <Input
                        placeholder={t("posPage.delivery.addressLine")}
                        value={pickupLine1}
                        onChange={(e) => setPickupLine1(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <Input
                        placeholder={t("posPage.delivery.city")}
                        value={pickupCity}
                        onChange={(e) => setPickupCity(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("posPage.delivery.dropoffSection")}
                      </p>
                      <Input
                        placeholder={t("posPage.delivery.addressLine")}
                        value={dropoffLine1}
                        onChange={(e) => setDropoffLine1(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <Input
                        placeholder={t("posPage.delivery.city")}
                        value={dropoffCity}
                        onChange={(e) => setDropoffCity(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("posPage.delivery.feeSection")}
                      </p>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder={t("posPage.delivery.feePlaceholder")}
                        value={deliveryFee || ""}
                        onChange={(e) => setDeliveryFee(Math.max(0, Number(e.target.value)))}
                        className="h-8 text-xs"
                      />
                      <Input
                        placeholder={t("posPage.delivery.notes")}
                        value={deliveryNotes}
                        onChange={(e) => setDeliveryNotes(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                </div>
              )}

              </div>{/* end scrollable middle section */}

              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={cart.length === 0}
                  onClick={() => {
                    setCart([]);
                    setDiscountCode("");
                    setAppliedDiscount(null);
                    setPointsToRedeem(0);
                  }}
                >
                  {t("posPage.cancelSale")}
                </Button>
                <Button
                  size="default"
                  className="flex-1"
                  disabled={cart.length === 0 || checkoutMutation.isPending}
                  onClick={handleCheckout}
                >
                  {checkoutMutation.isPending
                    ? t("posPage.processing")
                    : t("posPage.charge", { total: grandTotal.toFixed(2) })}
                </Button>
              </div>
            </>
          )}

          {/* History tab */}
          {activeTab === "history" && (
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
              {customerId === "none" ? (
                <p className="mt-8 text-center text-sm text-muted-foreground">
                  {t("posPage.walkInCustomer")}
                </p>
              ) : !recentCustomerOrders || recentCustomerOrders.length === 0 ? (
                <p className="mt-8 text-center text-sm text-muted-foreground">
                  {t("posPage.recentOrders.title")}
                </p>
              ) : (
                recentCustomerOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-start justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{order.orderNumber}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        ${order.grandTotal.toFixed(2)}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">
                        {order.items.map((i) => `${i.productName} ×${i.quantity}`).join(", ")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 gap-1 px-2 text-xs"
                      onClick={() => {
                        order.items.forEach((item) => {
                          const product = products?.find((p) => p.id === item.productId);
                          if (!product || product.totalStock <= 0) return;
                          setCart((prev) => {
                            const existing = prev.find((l) => l.productId === item.productId);
                            if (existing) {
                              return prev.map((l) =>
                                l.productId === item.productId
                                  ? { ...l, quantity: l.quantity + item.quantity }
                                  : l,
                              );
                            }
                            return [
                              ...prev,
                              {
                                productId: item.productId,
                                name: item.productName,
                                unitPrice: item.unitPrice,
                                taxRate: item.taxRate,
                                categoryId: product.categoryId,
                                quantity: item.quantity,
                              },
                            ];
                          });
                        });
                        toast.success(t("posPage.recentOrders.added", { order: order.orderNumber }));
                        setActiveTab("cart");
                      }}
                    >
                      <Plus className="size-3" />
                      {t("posPage.recentOrders.reAdd")}
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
