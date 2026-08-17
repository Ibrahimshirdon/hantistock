import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { listSalesOrders } from "@/api/sales.api";
import { listUsers } from "@/api/auth.api";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SALESPERSON_ROLES = ["admin", "manager", "staff"] as const;

export function SalesOrdersPage() {
  const { t } = useTranslation(["sales", "common"]);
  const navigate = useNavigate();
  const [createdBy, setCreatedBy] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");

  // "refunded" isn't a real order status (see salesOrder.service.ts — a
  // refund never changes order.status), so it can't be sent to the backend
  // as-is: both the "Completed" and "Refunded" filters query completed
  // orders from the API, then split on refundedAmount client-side below.
  const backendStatus =
    statusFilter === "all" ? undefined : statusFilter === "refunded" ? "completed" : statusFilter;

  const { data: orders, isLoading } = useQuery({
    queryKey: ["salesOrders", createdBy, backendStatus],
    queryFn: () =>
      listSalesOrders({
        createdBy: createdBy === "all" ? undefined : createdBy,
        status: backendStatus,
      }),
  });
  const { data: users } = useQuery({ queryKey: ["users", "all"], queryFn: () => listUsers() });

  const salespeople = useMemo(
    () => users?.filter((u) => SALESPERSON_ROLES.includes(u.role as (typeof SALESPERSON_ROLES)[number])) ?? [],
    [users],
  );

  const filteredOrders = useMemo(() => {
    let list = orders ?? [];
    if (paymentFilter !== "all") list = list.filter((o) => o.paymentMethod === paymentFilter);
    // "Completed" means genuinely successful — a refunded order moves to
    // the "Refunded" filter instead, rather than appearing in both.
    if (statusFilter === "completed") list = list.filter((o) => (o.refundedAmount ?? 0) <= 0);
    if (statusFilter === "refunded") list = list.filter((o) => (o.refundedAmount ?? 0) > 0);
    return list;
  }, [orders, paymentFilter, statusFilter]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("salesOrdersPage.title")}</h1>
        <p className="text-muted-foreground">{t("salesOrdersPage.subtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>{t("salesOrdersPage.soldBy")}</Label>
          <Select value={createdBy} onValueChange={setCreatedBy}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("salesOrdersPage.everyone")}</SelectItem>
              {salespeople.map((person) => (
                <SelectItem key={person.uid} value={person.uid}>
                  {person.displayName} ({person.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("salesOrdersPage.statusFilter")}</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("salesOrdersPage.allStatuses")}</SelectItem>
              <SelectItem value="pending">{t("salesOrdersPage.statuses.pending")}</SelectItem>
              <SelectItem value="confirmed">{t("salesOrdersPage.statuses.confirmed")}</SelectItem>
              <SelectItem value="completed">{t("salesOrdersPage.statuses.completed")}</SelectItem>
              <SelectItem value="refunded">{t("salesOrdersPage.statuses.refunded")}</SelectItem>
              <SelectItem value="cancelled">{t("salesOrdersPage.statuses.cancelled")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("salesOrdersPage.paymentFilter")}</Label>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("salesOrdersPage.allPayments")}</SelectItem>
              <SelectItem value="cash">{t("posPage.paymentMethods.cash")}</SelectItem>
              <SelectItem value="wallet">{t("posPage.paymentMethods.wallet")}</SelectItem>
              <SelectItem value="evc_plus">{t("posPage.paymentMethods.evc_plus")}</SelectItem>
              <SelectItem value="sahal">{t("posPage.paymentMethods.sahal")}</SelectItem>
              <SelectItem value="edahab">{t("posPage.paymentMethods.edahab")}</SelectItem>
              <SelectItem value="loan">{t("posPage.paymentMethods.loan")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("salesOrdersPage.columns.orderNumber")}</TableHead>
            <TableHead>{t("salesOrdersPage.columns.customer")}</TableHead>
            <TableHead>{t("salesOrdersPage.soldBy")}</TableHead>
            <TableHead>{t("salesOrdersPage.columns.completedBy")}</TableHead>
            <TableHead>{t("salesOrdersPage.columns.items")}</TableHead>
            <TableHead>{t("common:fields.total")}</TableHead>
            <TableHead>{t("salesOrdersPage.columns.payment")}</TableHead>
            <TableHead>{t("common:fields.status")}</TableHead>
            <TableHead>{t("common:fields.date")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">
                {t("common:actions.loading")}
              </TableCell>
            </TableRow>
          )}
          {!isLoading && filteredOrders.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">
                {t("salesOrdersPage.empty")}
              </TableCell>
            </TableRow>
          )}
          {filteredOrders.map((order) => (
            <TableRow
              key={order.id}
              className="cursor-pointer"
              onClick={() => navigate(`/app/sales/orders/${order.id}`)}
            >
              <TableCell className="font-medium">{order.orderNumber}</TableCell>
              <TableCell>{order.customerName ?? t("salesOrdersPage.walkIn")}</TableCell>
              <TableCell>
                {order.createdByName}{" "}
                <span className="text-xs capitalize text-muted-foreground">({order.createdByRole})</span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {order.completedByName ?? "—"}
              </TableCell>
              <TableCell>{order.items.length}</TableCell>
              <TableCell>${order.grandTotal.toFixed(2)}</TableCell>
              <TableCell>{t(`posPage.paymentMethods.${order.paymentMethod}`)}</TableCell>
              <TableCell>
                {(() => {
                  const refunded = order.status === "completed" && (order.refundedAmount ?? 0) > 0;
                  const fullyRefunded = refunded && (order.refundedAmount ?? 0) >= order.grandTotal;
                  const label = refunded
                    ? fullyRefunded
                      ? t("salesOrdersPage.statuses.refunded")
                      : t("salesOrderDetailPage.partiallyRefunded")
                    : t(`salesOrdersPage.statuses.${order.status}`);
                  const variant = refunded
                    ? "destructive"
                    : order.status === "completed" ? "success"
                    : order.status === "confirmed" ? "secondary"
                    : order.status === "pending" ? "warning"
                    : "destructive";
                  return (
                    <Badge variant={variant} className="capitalize">
                      {label}
                    </Badge>
                  );
                })()}
              </TableCell>
              <TableCell>{new Date(order.createdAt._seconds * 1000).toLocaleString()}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
