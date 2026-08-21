import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Barcode,
  Camera,
  CheckCircle2,
  DollarSign,
  Package,
  Tag,
  TrendingUp,
} from "lucide-react";
import {
  approveProduct,
  deleteProduct,
  getProduct,
  listBatchesForProduct,
  listCategories,
  listStockAdjustments,
  updateProduct,
  uploadProductImage,
} from "@/api/inventory.api";
import { listTaxRates } from "@/api/sales.api";
import { getApiErrorMessage } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { toDate } from "@/types/inventory.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdjustStockDialog } from "./AdjustStockDialog";
import { BarcodePrintDialog } from "./BarcodePrintDialog";
import { EditProductDialog } from "./EditProductDialog";

function formatDate(ts: Parameters<typeof toDate>[0]) {
  const date = toDate(ts);
  return date ? date.toLocaleDateString() : "—";
}

function isExpiringSoon(ts: Parameters<typeof toDate>[0]) {
  const date = toDate(ts);
  if (!date) return false;
  const days = (date.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return days <= 30;
}

interface StatTileProps {
  label: string;
  value: string;
  icon: React.ElementType;
  tone?: "default" | "primary" | "success" | "warning" | "destructive";
  sub?: string;
}

function StatTile({ label, value, icon: Icon, tone = "default", sub }: StatTileProps) {
  const iconCls = {
    default: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-600",
    warning: "bg-warning/10 text-warning",
    destructive: "bg-destructive/10 text-destructive",
  }[tone];
  const valueCls = {
    default: "",
    primary: "text-primary",
    success: "text-emerald-600",
    warning: "text-warning",
    destructive: "text-destructive",
  }[tone];
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${iconCls}`}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold tracking-tight ${valueCls}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function ProductDetailPage() {
  const { t } = useTranslation(["inventory", "common"]);
  const { id } = useParams<{ id: string }>();
  const productId = id!;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const { data: product } = useQuery({
    queryKey: ["product", productId],
    queryFn: () => getProduct(productId),
  });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: taxRates } = useQuery({ queryKey: ["taxRates"], queryFn: listTaxRates });
  const { data: batches } = useQuery({
    queryKey: ["batches", productId],
    queryFn: () => listBatchesForProduct(productId),
  });
  const { data: adjustments } = useQuery({
    queryKey: ["adjustments", productId],
    queryFn: () => listStockAdjustments(productId),
  });

  // After batches load, re-fetch product + adjustments to reflect any
  // totalStock changes and new adjustment records from the auto-expiry write-off.
  const autoExpireInvalidated = useRef(false);
  useEffect(() => {
    if (batches && !autoExpireInvalidated.current) {
      autoExpireInvalidated.current = true;
      if (batches.some((b) => b.status === "expired")) {
        queryClient.invalidateQueries({ queryKey: ["product", productId] });
        queryClient.invalidateQueries({ queryKey: ["adjustments", productId] });
      }
    }
  }, [batches, productId, queryClient]);

  const imageMutation = useMutation({
    mutationFn: (file: File) => uploadProductImage(productId, file),
    onSuccess: () => {
      toast.success(t("productDetailPage.toasts.imageUploaded"));
      queryClient.invalidateQueries({ queryKey: ["product", productId] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteProduct(productId),
    onSuccess: () => {
      toast.success(t("productDetailPage.toasts.deleted"));
      navigate("/app/inventory/products");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const approveMutation = useMutation({
    mutationFn: () => approveProduct(productId),
    onSuccess: () => {
      toast.success(t("productDetailPage.toasts.approved"));
      queryClient.invalidateQueries({ queryKey: ["product", productId] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  // Toggling isActive is the non-destructive alternative deleteStockWarning
  // below already tells admins to use instead — an inactive product just
  // stops showing up in POS/storefront listings (see product.service.ts's
  // availableForSale filter) without touching its stock or history.
  const toggleActiveMutation = useMutation({
    mutationFn: () => updateProduct(productId, { isActive: !product!.isActive }),
    onSuccess: () => {
      toast.success(
        product!.isActive
          ? t("productDetailPage.toasts.deactivated")
          : t("productDetailPage.toasts.activated"),
      );
      queryClient.invalidateQueries({ queryKey: ["product", productId] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  if (!product) {
    return <p className="text-muted-foreground">{t("common:actions.loading")}</p>;
  }

  const margin =
    product.sellingPrice > 0
      ? (((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100).toFixed(1)
      : "0";
  const profit = (product.sellingPrice - product.costPrice).toFixed(2);
  const taxRate = product.taxRateId
    ? taxRates?.find((rt) => rt.id === product.taxRateId)
    : null;

  const expiredBatches = batches?.filter((b) => b.status === "expired") ?? [];
  const hasExpired = expiredBatches.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Expired stock alert */}
      {hasExpired && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">
              {t("productDetailPage.expiredAlertTitle", { count: expiredBatches.length })}
            </p>
            <p className="text-muted-foreground">
              {t("productDetailPage.expiredAlertBody")}
            </p>
          </div>
        </div>
      )}

      {/* Hero card */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start">
            {/* Image with upload overlay */}
            <div className="relative shrink-0">
              <div className="flex size-36 items-center justify-center overflow-hidden rounded-2xl border bg-muted shadow-sm">
                {product.images[0] ? (
                  <img src={product.images[0]} alt={product.name} className="size-full object-cover" loading="lazy" />
                ) : (
                  <Package className="size-12 text-muted-foreground/40" />
                )}
              </div>
              <button
                className="absolute right-1 bottom-1 flex size-8 items-center justify-center rounded-full border bg-background shadow-sm transition-colors hover:bg-muted disabled:opacity-50"
                disabled={imageMutation.isPending}
                onClick={() => fileInputRef.current?.click()}
                title={t("productDetailPage.uploadImage")}
              >
                <Camera className="size-4 text-muted-foreground" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) imageMutation.mutate(file);
                }}
              />
            </div>

            {/* Product info */}
            <div className="flex flex-1 flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
                    <Badge variant={product.isActive ? "success" : "secondary"}>
                      {product.isActive ? t("common:status.active") : t("common:status.inactive")}
                    </Badge>
                    {product.isLowStock && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="size-3" />
                        {t("productDetailPage.lowStock")}
                      </Badge>
                    )}
                    {product.approvalStatus === "pending" && (
                      <Badge variant="warning">{t("productDetailPage.pendingApproval")}</Badge>
                    )}
                  </div>

                  {/* SKU / barcode / category row */}
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Tag className="size-3.5" />
                      {t("productDetailPage.skuLabel", { sku: product.sku })}
                    </span>
                    {product.barcode && (
                      <span className="flex items-center gap-1">
                        <Barcode className="size-3.5" />
                        {product.barcode}
                      </span>
                    )}
                    {product.categoryName && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {product.categoryName}
                      </span>
                    )}
                    {taxRate && (
                      <span className="text-xs">
                        {taxRate.name} ({(taxRate.rate * 100).toFixed(0)}% tax)
                      </span>
                    )}
                    {!taxRate && (
                      <span className="text-xs">{t("productDetailPage.noTax")}</span>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {product.approvalStatus === "pending" && profile?.role === "admin" && (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={approveMutation.isPending}
                      onClick={() => approveMutation.mutate()}
                    >
                      <CheckCircle2 className="size-4" />
                      {approveMutation.isPending
                        ? t("productDetailPage.approving")
                        : t("productDetailPage.approveProduct")}
                    </Button>
                  )}
                  {(profile?.role === "admin" || profile?.role === "manager") && (
                    <EditProductDialog
                      product={product}
                      categories={categories ?? []}
                      taxRates={taxRates ?? []}
                      showExpiryField={!batches?.some((b) => b.expiryDate)}
                    />
                  )}
                  {(profile?.role === "admin" || profile?.role === "manager") && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={toggleActiveMutation.isPending}
                      onClick={() => toggleActiveMutation.mutate()}
                    >
                      {toggleActiveMutation.isPending
                        ? t("common:actions.saving")
                        : product.isActive
                          ? t("productDetailPage.deactivateProduct")
                          : t("productDetailPage.activateProduct")}
                    </Button>
                  )}
                  {product.barcode && (
                    <BarcodePrintDialog product={product} />
                  )}
                  {profile?.role === "admin" && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmDeleteOpen(true)}
                    >
                      {t("productDetailPage.deleteProduct")}
                    </Button>
                  )}
                </div>
              </div>

              {/* Reorder / max stock note */}
              <p className="text-sm text-muted-foreground">
                {product.maxStockLevel != null &&
                  t("productDetailPage.maxStockLabel", { value: product.maxStockLevel })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label={t("editProductDialog.costPrice")}
          value={`$${product.costPrice.toFixed(2)}`}
          icon={DollarSign}
          tone="default"
        />
        <StatTile
          label={t("editProductDialog.sellingPrice")}
          value={`$${product.sellingPrice.toFixed(2)}`}
          icon={TrendingUp}
          tone="primary"
          sub={`+$${profit} per unit`}
        />
        <StatTile
          label={t("productDetailPage.profitMarginLabel")}
          value={`${margin}%`}
          icon={TrendingUp}
          tone={Number(margin) >= 20 ? "success" : Number(margin) >= 10 ? "warning" : "destructive"}
        />
        <StatTile
          label={t("productDetailPage.totalStockLabel")}
          value={`${product.totalStock} ${product.unit}`}
          icon={Package}
          tone={product.isLowStock ? "destructive" : "success"}
          sub={t("productDetailPage.reorderLevelLabel", { value: product.reorderLevel })}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="batches">
        <TabsList>
          <TabsTrigger value="batches">{t("productDetailPage.tabs.batches")}</TabsTrigger>
          <TabsTrigger value="adjustments">{t("productDetailPage.tabs.adjustments")}</TabsTrigger>
        </TabsList>

        <TabsContent value="batches" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("productDetailPage.tabs.batches")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("productDetailPage.batchNumber")}</TableHead>
                    <TableHead>{t("common:fields.quantity")}</TableHead>
                    <TableHead>{t("productDetailPage.expiryDate")}</TableHead>
                    <TableHead>{t("common:fields.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        {t("productDetailPage.noBatches")}
                      </TableCell>
                    </TableRow>
                  )}
                  {batches?.map((batch) => {
                    const effectiveExpiry = batch.expiryDate ?? product.expiryDate ?? null;
                    const isProductLevel = !batch.expiryDate && !!product.expiryDate;
                    return (
                      <TableRow key={batch.id} className={batch.status === "expired" ? "opacity-60" : ""}>
                        <TableCell className="font-medium">{batch.batchNumber}</TableCell>
                        <TableCell>{batch.quantity}</TableCell>
                        <TableCell>
                          <span className={isExpiringSoon(effectiveExpiry) && batch.status === "active" ? "text-destructive font-medium" : ""}>
                            {formatDate(effectiveExpiry)}
                          </span>
                          {isProductLevel && effectiveExpiry && (
                            <span className="ms-1.5 text-[10px] text-muted-foreground">(product)</span>
                          )}
                          {batch.status === "active" && isExpiringSoon(effectiveExpiry) && (
                            <Badge variant="destructive" className="ms-2 text-[10px]">
                              {t("productDetailPage.expiringSoon")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              batch.status === "active"
                                ? "success"
                                : batch.status === "expired"
                                ? "destructive"
                                : "secondary"
                            }
                            className="capitalize"
                          >
                            {batch.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="adjustments" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">{t("productDetailPage.tabs.adjustments")}</CardTitle>
              <AdjustStockDialog productId={productId} batches={batches ?? []} />
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common:fields.date")}</TableHead>
                    <TableHead>{t("productDetailPage.type")}</TableHead>
                    <TableHead>{t("productDetailPage.change")}</TableHead>
                    <TableHead>{t("productDetailPage.reason")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustments?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        {t("productDetailPage.noAdjustments")}
                      </TableCell>
                    </TableRow>
                  )}
                  {adjustments?.map((adjustment) => (
                    <TableRow key={adjustment.id}>
                      <TableCell className="text-muted-foreground">{formatDate(adjustment.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {adjustment.type}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={`font-semibold ${adjustment.quantityChange < 0 ? "text-destructive" : "text-emerald-600"}`}
                      >
                        {adjustment.quantityChange > 0 ? "+" : ""}
                        {adjustment.quantityChange}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{adjustment.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete confirmation dialog */}
      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="size-6 text-destructive" />
            </div>
            <DialogTitle className="text-center">{t("productDetailPage.deleteDialogTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-center text-sm text-muted-foreground">
            {t("productDetailPage.deleteConfirmText", { name: product.name })}
            {product.totalStock > 0 && (
              <span className="mt-2 block font-medium text-destructive">
                {t("productDetailPage.deleteStockWarning", {
                  qty: product.totalStock,
                  unit: product.unit,
                })}
              </span>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDeleteOpen(false)}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={deleteMutation.isPending || product.totalStock > 0}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? t("common:actions.deleting") : t("productDetailPage.deletePermanently")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
