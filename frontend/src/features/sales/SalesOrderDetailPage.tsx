import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { TFunction } from "i18next";
import { AlertTriangle, CheckCircle2, MapPin, Printer, Truck, XCircle } from "lucide-react";
import {
  approveOrder,
  cancelOrder,
  completeOrder,
  getInvoiceForOrder,
  getReceiptForOrder,
  getSalesOrder,
  listReturnsForOrder,
} from "@/api/sales.api";
import { getDeliveryByOrder } from "@/api/delivery.api";
import { getApiErrorMessage } from "@/api/client";
import type { Receipt, SalesOrder, SalesReturn } from "@/types/sales.types";
import type { Delivery as DeliveryType } from "@/types/delivery.types";
import { ReturnOrderDialog } from "./ReturnOrderDialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function SalesOrderDetailPage() {
  const { t } = useTranslation(["sales", "common"]);
  const { id } = useParams<{ id: string }>();
  const orderId = id!;
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);

  function handlePrint() {
    setReceiptOpen(false);
    setTimeout(() => window.print(), 120);
  }

  const { data: order } = useQuery({
    queryKey: ["salesOrder", orderId],
    queryFn: () => getSalesOrder(orderId),
  });
  const { data: invoice } = useQuery({
    queryKey: ["invoice", orderId],
    queryFn: () => getInvoiceForOrder(orderId),
  });
  const { data: receipt } = useQuery({
    queryKey: ["receipt", orderId],
    queryFn: () => getReceiptForOrder(orderId),
  });
  const { data: returns } = useQuery({
    queryKey: ["returns", orderId],
    queryFn: () => listReturnsForOrder(orderId),
    enabled: order?.status === "completed",
  });

  const { data: delivery } = useQuery({
    queryKey: ["delivery", "by-order", orderId],
    queryFn: async () => {
      try {
        return await getDeliveryByOrder(orderId);
      } catch {
        return null;
      }
    },
    retry: false,
  });

  const alreadyReturnedQty = useMemo(() => {
    const map = new Map<string, number>();
    for (const ret of returns ?? []) {
      for (const item of ret.items) {
        map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity);
      }
    }
    return map;
  }, [returns]);

  // Receipts/invoices are write-once snapshots from checkout — a later
  // return never touches them, so the refunded total is derived here from
  // the same returns data the Returns card below already renders, rather
  // than needing a backend field.
  const totalRefunded = useMemo(
    () => (returns ?? []).reduce((sum, ret) => sum + ret.refundTotal, 0),
    [returns],
  );
  const netPaid = (receipt?.amountPaid ?? 0) - totalRefunded;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["salesOrder", orderId] });
    queryClient.invalidateQueries({ queryKey: ["salesOrders"] });
  }

  const approveMutation = useMutation({
    mutationFn: () => approveOrder(orderId),
    onSuccess: () => { toast.success(t("salesOrderDetailPage.toasts.approved")); invalidate(); },
    onError: (e) => toast.error(getApiErrorMessage(e)),
  });

  const completeMutation = useMutation({
    mutationFn: () => completeOrder(orderId),
    onSuccess: () => { toast.success(t("salesOrderDetailPage.toasts.completed")); invalidate(); },
    onError: (e) => toast.error(getApiErrorMessage(e)),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelOrder(orderId),
    onSuccess: () => { toast.success(t("salesOrderDetailPage.toasts.cancelled")); setCancelOpen(false); invalidate(); },
    onError: (e) => toast.error(getApiErrorMessage(e)),
  });

  if (!order) {
    return <p className="text-muted-foreground">{t("common:actions.loading")}</p>;
  }

  // A refund never changes order.status (it stays "completed" — see
  // salesReturn.service.ts), so the header badge has to be overridden here
  // or a fully-refunded order would still read "Completed".
  const isRefunded = order.status === "completed" && totalRefunded > 0;
  const isFullyRefunded = isRefunded && netPaid <= 0;

  const statusVariant =
    isRefunded ? "destructive"
    : order.status === "completed" ? "success"
    : order.status === "confirmed" ? "secondary"
    : order.status === "pending" ? "warning"
    : "destructive";

  const statusLabel = isRefunded
    ? isFullyRefunded
      ? t("salesOrderDetailPage.fullyRefunded")
      : t("salesOrderDetailPage.partiallyRefunded")
    : t(`salesOrderDetailPage.statuses.${order.status}`);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">
            {t("salesOrderDetailPage.orderHeading", { orderNumber: order.orderNumber })}
          </h1>
          <p className="text-muted-foreground">
            {order.customerName ?? t("posPage.walkInCustomer")} ·{" "}
            {new Date(order.createdAt._seconds * 1000).toLocaleString()}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("salesOrderDetailPage.soldBy", { name: order.createdByName })}{" "}
            <span className="capitalize">({order.createdByRole})</span>
            {order.completedByName && (
              <> · {t("salesOrderDetailPage.completedBy", { name: order.completedByName })}</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {order.fulfillmentType && <Badge variant="secondary">{order.fulfillmentType}</Badge>}
          <Badge variant={statusVariant} className="capitalize">
            {statusLabel}
          </Badge>

          {/* Action buttons — only for online orders that aren't done */}
          {order.type === "online" && (order.status === "pending" || order.status === "confirmed") && (
            <>
              {order.status === "pending" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={approveMutation.isPending}
                  onClick={() => approveMutation.mutate()}
                >
                  <CheckCircle2 className="size-4" />
                  {approveMutation.isPending
                    ? t("salesOrderDetailPage.approving")
                    : t("salesOrderDetailPage.approveOrder")}
                </Button>
              )}
              <Button
                size="sm"
                className="gap-1.5"
                disabled={completeMutation.isPending}
                onClick={() => completeMutation.mutate()}
              >
                <CheckCircle2 className="size-4" />
                {completeMutation.isPending
                  ? t("salesOrderDetailPage.completing")
                  : t("salesOrderDetailPage.completeOrder")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5"
                onClick={() => setCancelOpen(true)}
              >
                <XCircle className="size-4" />
                {t("salesOrderDetailPage.cancelOrder")}
              </Button>
            </>
          )}

          {order.status === "completed" && (
            <ReturnOrderDialog order={order} alreadyReturnedQty={alreadyReturnedQty} />
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setReceiptOpen(true)}>
            <Printer className="size-4" />
            {t("salesOrderDetailPage.printReceipt")}
          </Button>
        </div>
      </div>

      {/* Receipt preview dialog */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        {/* [&>button]:hidden suppresses the default absolute close-X that DialogContent injects */}
        <DialogContent className="max-w-xs gap-0 p-0 overflow-hidden [&>button]:hidden">
          <DialogHeader className="flex flex-row items-center justify-between border-b p-3">
            <DialogTitle className="text-sm">
              {t("salesOrderDetailPage.receiptPreviewTitle")}
            </DialogTitle>
            <Button size="sm" className="gap-1.5 shrink-0" onClick={handlePrint}>
              <Printer className="size-3.5" />
              {t("salesOrderDetailPage.printReceipt")}
            </Button>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto bg-gray-100 p-4 print:p-0">
            <ReceiptPaper order={order} receipt={receipt} returns={returns} t={t} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation dialog */}
      <Dialog open={cancelOpen} onOpenChange={(o) => !cancelMutation.isPending && setCancelOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="size-6 text-destructive" />
            </div>
            <DialogTitle className="text-center">
              {t("salesOrderDetailPage.cancelDialog.title")}
            </DialogTitle>
            <p className="text-center text-sm text-muted-foreground">
              {t("salesOrderDetailPage.cancelDialog.description", {
                orderNumber: order.orderNumber,
              })}
            </p>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={cancelMutation.isPending}
              onClick={() => setCancelOpen(false)}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              {cancelMutation.isPending
                ? t("salesOrderDetailPage.cancelling")
                : t("salesOrderDetailPage.cancelDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>{t("salesOrderDetailPage.items")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("salesOrderDetailPage.columns.product")}</TableHead>
                <TableHead>{t("salesOrderDetailPage.columns.qty")}</TableHead>
                <TableHead>{t("salesOrderDetailPage.columns.unitPrice")}</TableHead>
                <TableHead>{t("common:fields.discount")}</TableHead>
                <TableHead>{t("salesOrderDetailPage.columns.taxRate")}</TableHead>
                <TableHead className="text-end">{t("salesOrderDetailPage.columns.lineTotal")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{item.productName}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>${item.unitPrice.toFixed(2)}</TableCell>
                  <TableCell>${item.discountAmount.toFixed(2)}</TableCell>
                  <TableCell>{(item.taxRate * 100).toFixed(0)}%</TableCell>
                  <TableCell className="text-end">${item.lineTotal.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="ms-auto mt-4 flex w-64 flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("common:fields.subtotal")}</span>
              <span>${order.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("common:fields.discount")}</span>
              <span>-${order.discountTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("common:fields.tax")}</span>
              <span>${order.taxTotal.toFixed(2)}</span>
            </div>
            {order.fulfillmentType === "delivery" && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("salesOrderDetailPage.deliveryFee")}</span>
                <span>${order.deliveryFee.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold">
              <span>{t("salesOrderDetailPage.grandTotal")}</span>
              <span>${order.grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 print:hidden">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              {t("salesOrderDetailPage.invoiceHeading", { invoiceNumber: invoice?.invoiceNumber })}
              {invoice?.status && (
                <Badge variant={invoice.status === "paid" ? "success" : "warning"}>{invoice.status}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t("salesOrderDetailPage.invoiceStatusLine", {
              status: invoice?.status,
              total: invoice?.grandTotal.toFixed(2),
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              {t("salesOrderDetailPage.receiptHeading", { receiptNumber: receipt?.receiptNumber })}
              {totalRefunded > 0 && (
                <Badge variant="destructive">
                  {netPaid <= 0
                    ? t("salesOrderDetailPage.fullyRefunded")
                    : t("salesOrderDetailPage.partiallyRefunded")}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
            <p>
              {t("salesOrderDetailPage.receiptPaidLine", {
                amount: receipt?.amountPaid.toFixed(2),
                method: receipt ? t(`posPage.paymentMethods.${receipt.paymentMethod}`) : "",
              })}
            </p>
            {totalRefunded > 0 && (
              <>
                <p className="text-destructive">
                  {t("salesOrderDetailPage.receiptRefundedLine", { amount: totalRefunded.toFixed(2) })}
                </p>
                <p className="font-medium text-foreground">
                  {t("salesOrderDetailPage.receiptNetPaidLine", { amount: netPaid.toFixed(2) })}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {delivery && <DeliveryCard delivery={delivery} t={t} />}

      {returns && returns.length > 0 && (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="text-base">{t("salesOrderDetailPage.returnsHeading")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-4 pt-0">
            {returns.map((ret) => (
              <div key={ret.id} className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {new Date(ret.createdAt._seconds * 1000).toLocaleString()}
                  </span>
                  <span className="font-semibold text-destructive">
                    -{`$${ret.refundTotal.toFixed(2)}`}
                    <span className="ms-1.5 text-xs font-normal text-muted-foreground capitalize">
                      ({ret.refundMethod})
                    </span>
                  </span>
                </div>
                <p className="text-muted-foreground">{ret.reason}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("salesOrderDetailPage.returnProcessedBy", { name: ret.processedByName })}
                </p>
                <ul className="mt-2 flex flex-col gap-0.5">
                  {ret.items.map((item, i) => (
                    <li key={i} className="flex justify-between text-xs">
                      <span>{item.productName} × {item.quantity}</span>
                      <span>${item.lineRefund.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Print-only receipt — hidden on screen, shown when window.print() fires */}
      <div className="hidden print:block">
        <ReceiptPaper order={order} receipt={receipt} returns={returns} t={t} />
      </div>
    </div>
  );
}

function fmtTs(ts: { _seconds: number } | null | undefined) {
  if (!ts) return "—";
  return new Date(ts._seconds * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const DELIVERY_STATUS_VARIANT: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  unassigned: "warning",
  assigned: "secondary",
  picked_up: "secondary",
  in_transit: "secondary",
  delivered: "success",
  failed: "destructive",
};

function DeliveryCard({
  delivery,
  t,
}: {
  delivery: DeliveryType;
  t: TFunction<["sales", "common"]>;
}) {
  return (
    <Card className="print:hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Truck className="size-4 text-muted-foreground" />
            {t("salesOrderDetailPage.deliveryCard.heading")}
          </span>
          <Badge variant={DELIVERY_STATUS_VARIANT[delivery.status] ?? "secondary"}>
            {t(`salesOrderDetailPage.deliveryCard.statuses.${delivery.status}`)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Addresses */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("salesOrderDetailPage.deliveryCard.pickup")}
            </p>
            <div className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              <div className="text-xs">
                <p className="font-medium">{delivery.pickupAddress.line1}</p>
                <p className="text-muted-foreground">{delivery.pickupAddress.city}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("salesOrderDetailPage.deliveryCard.dropoff")}
            </p>
            <div className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              <div className="text-xs">
                <p className="font-medium">{delivery.dropoffAddress.line1}</p>
                <p className="text-muted-foreground">{delivery.dropoffAddress.city}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("salesOrderDetailPage.deliveryCard.timeline")}
          </p>
          {[
            { label: t("salesOrderDetailPage.deliveryCard.assigned"), ts: delivery.assignedAt },
            { label: t("salesOrderDetailPage.deliveryCard.pickedUp"), ts: delivery.pickedUpAt },
            { label: t("salesOrderDetailPage.deliveryCard.delivered"), ts: delivery.deliveredAt },
          ].map(({ label, ts }) => (
            <div key={label} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium tabular-nums">{fmtTs(ts)}</span>
            </div>
          ))}
        </div>

        {/* Notes */}
        {delivery.notes && (
          <div className="rounded-lg bg-muted/50 p-2.5 text-xs">
            <p className="mb-0.5 font-semibold text-muted-foreground">
              {t("salesOrderDetailPage.deliveryCard.notes")}
            </p>
            <p>{delivery.notes}</p>
          </div>
        )}

        {/* Proof of delivery */}
        {delivery.proofOfDeliveryUrl && (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("salesOrderDetailPage.deliveryCard.proofOfDelivery")}
            </p>
            <a href={delivery.proofOfDeliveryUrl} target="_blank" rel="noreferrer" className="block">
              <img
                src={delivery.proofOfDeliveryUrl}
                alt="Proof of delivery"
                className="w-full rounded-lg border object-contain"
                style={{ maxHeight: "480px", background: "rgba(0,0,0,0.04)" }}
              />
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Styled like an actual paper receipt (narrow, dashed dividers, monospace) —
// kept visible on screen as a preview of exactly what `window.print()` will
// produce, since it's the only thing left unhidden by print:hidden above
// (and by DashboardLayout's own print:hidden sidebar/header).
function ReceiptPaper({
  order,
  receipt,
  returns,
  t,
}: {
  order: SalesOrder;
  receipt: Receipt | undefined;
  returns: SalesReturn[] | undefined;
  t: TFunction<["sales", "common"]>;
}) {
  const totalRefunded = (returns ?? []).reduce((sum, ret) => sum + ret.refundTotal, 0);
  const netPaid = (receipt?.amountPaid ?? 0) - totalRefunded;
  // Receipt always renders as white paper — never inherits dark theme tokens.
  return (
    <div className="receipt-torn-edge relative mx-auto w-full max-w-xs p-5 pb-6 font-mono text-xs shadow-lg print:max-w-full print:p-0 print:pb-3 print:shadow-none"
      style={{ background: "#ffffff", color: "#111827" }}
    >
      {order.paymentStatus === "paid" && (
        <div className="-rotate-12 absolute top-4 right-4 rounded border-2 px-2 py-0.5 text-[10px] font-bold tracking-widest print:top-1 print:right-1"
          style={{ borderColor: "#16a34a", color: "#16a34a" }}
        >
          {t("salesOrderDetailPage.receiptPaper.paidStamp")}
        </div>
      )}
      <div className="flex flex-col items-center gap-1 pb-3 text-center">
        <img src="/favicon.png" alt="" className="size-12 object-contain" />
        <p className="text-sm font-bold tracking-[0.2em] uppercase">Hantistock</p>
      </div>
      <div className="border-t-2" style={{ borderColor: "#111827" }} />
      <div className="flex flex-col gap-0.5 py-3">
        <div className="flex justify-between">
          <span style={{ color: "#6b7280" }}>{t("salesOrderDetailPage.receiptPaper.orderNo")}</span>
          <span>{order.orderNumber}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "#6b7280" }}>{t("common:fields.date")}</span>
          <span>{new Date(order.createdAt._seconds * 1000).toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "#6b7280" }}>{t("salesOrderDetailPage.receiptPaper.cashier")}</span>
          <span>{order.createdByName}</span>
        </div>
        {order.customerName && (
          <div className="flex justify-between">
            <span style={{ color: "#6b7280" }}>
              {t("salesOrderDetailPage.receiptPaper.customer")}
            </span>
            <span>{order.customerName}</span>
          </div>
        )}
      </div>
      <div className="border-t border-dashed" style={{ borderColor: "#d1d5db" }} />
      <div className="flex flex-col gap-2 py-3">
        {order.items.map((item, i) => (
          <div key={i}>
            <div className="flex justify-between font-medium">
              <span>{item.productName}</span>
              <span>${item.lineTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between" style={{ color: "#6b7280" }}>
              <span>
                {item.quantity} × ${item.unitPrice.toFixed(2)}
              </span>
              {item.discountAmount > 0 && <span>-${item.discountAmount.toFixed(2)}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-dashed" style={{ borderColor: "#d1d5db" }} />
      <div className="flex flex-col gap-0.5 py-3">
        <div className="flex justify-between">
          <span style={{ color: "#6b7280" }}>{t("common:fields.subtotal")}</span>
          <span>${order.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "#6b7280" }}>{t("common:fields.discount")}</span>
          <span>-${order.discountTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "#6b7280" }}>{t("common:fields.tax")}</span>
          <span>${order.taxTotal.toFixed(2)}</span>
        </div>
        {order.fulfillmentType === "delivery" && (
          <div className="flex justify-between">
            <span style={{ color: "#6b7280" }}>{t("salesOrderDetailPage.deliveryFee")}</span>
            <span>${order.deliveryFee.toFixed(2)}</span>
          </div>
        )}
      </div>
      <div className="border-t-2" style={{ borderColor: "#111827" }} />
      <div className="flex justify-between py-3 text-base font-bold tracking-wide">
        <span>{t("salesOrderDetailPage.receiptPaper.total")}</span>
        <span>${order.grandTotal.toFixed(2)}</span>
      </div>
      <div className="border-t-2" style={{ borderColor: "#111827" }} />
      <div className="flex flex-col gap-0.5 py-3">
        <div className="flex justify-between">
          <span style={{ color: "#6b7280" }}>{t("salesOrderDetailPage.receiptPaper.payment")}</span>
          <span>{t(`posPage.paymentMethods.${order.paymentMethod}`)}</span>
        </div>
        {receipt && (
          <div className="flex justify-between">
            <span style={{ color: "#6b7280" }}>{t("salesOrderDetailPage.receiptPaper.paid")}</span>
            <span>${receipt.amountPaid.toFixed(2)}</span>
          </div>
        )}
        {receipt && receipt.changeGiven > 0 && (
          <div className="flex justify-between">
            <span style={{ color: "#6b7280" }}>{t("salesOrderDetailPage.receiptPaper.change")}</span>
            <span>${receipt.changeGiven.toFixed(2)}</span>
          </div>
        )}
      </div>
      {totalRefunded > 0 && (
        <>
          <div className="border-t border-dashed" style={{ borderColor: "#d1d5db" }} />
          <div className="flex flex-col gap-0.5 py-3">
            <div className="flex justify-between font-medium" style={{ color: "#b91c1c" }}>
              <span>{t("salesOrderDetailPage.receiptPaper.refunded")}</span>
              <span>-${totalRefunded.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>{t("salesOrderDetailPage.receiptPaper.netPaid")}</span>
              <span>${netPaid.toFixed(2)}</span>
            </div>
          </div>
        </>
      )}
      <div className="border-t border-dashed" style={{ borderColor: "#d1d5db" }} />
      <div className="flex flex-col items-center gap-0.5 pt-3 text-center" style={{ color: "#6b7280" }}>
        <p>{t("salesOrderDetailPage.receiptPaper.thankYou")}</p>
        {receipt && <p>{receipt.receiptNumber}</p>}
      </div>
    </div>
  );
}
