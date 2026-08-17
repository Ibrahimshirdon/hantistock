import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Boxes,
  CalendarDays,
  CalendarRange,
  Clock,
  DollarSign,
  PackageCheck,
  Receipt,
  ShoppingCart,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/context/AuthContext";
import { listExpiringBatches, listGoodsReceipts, listProducts } from "@/api/inventory.api";
import { toDate } from "@/types/inventory.types";
import { listReturnsForOrder, listSalesOrders } from "@/api/sales.api";
import { listCustomers } from "@/api/customers.api";
import {
  getBestCustomers,
  getInventoryInsights,
  getSalesForecast,
  getTopProducts,
} from "@/api/analytics.api";
import { getFinancialSummary } from "@/api/finance.api";
import { listDeliveries, listDeliveryIssues } from "@/api/delivery.api";
import { listUsers } from "@/api/auth.api";
import { listAuditLogs } from "@/api/security.api";
import { listSupplierSubmissions, listStockRequests } from "@/api/supplier.api";
import { describeAuditLog } from "./auditLogText";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function msAgo(days: number) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const TONE_CLASSES = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  purple: "bg-purple/10 text-purple",
} as const;

const DOT_CLASSES = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  info: "bg-primary",
} as const;

const CATEGORY_COLORS = [
  "var(--color-primary)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-purple)",
  "var(--color-destructive)",
];

// Real period-over-period change, not a fabricated number — null when there's
// no prior-period value to compare against (avoids a misleading "+Infinity%").
function trendPercent(current: number, previous: number): number | null {
  if (!previous) return null;
  return round2(((current - previous) / previous) * 100);
}

function TrendBadge({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return null;
  const isUp = value >= 0;
  const isGood = invert ? !isUp : isUp;
  const Icon = isUp ? ArrowUp : ArrowDown;
  return (
    <Badge variant={isGood ? "success" : "destructive"} className="gap-0.5">
      <Icon className="size-3" />
      {Math.abs(value).toFixed(1)}%
    </Badge>
  );
}

function EmptyState({ emoji, title, subtitle }: { emoji: string; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-6 text-center">
      <span className="text-2xl">{emoji}</span>
      <p className="text-sm font-medium">{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
  trend,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: keyof typeof TONE_CLASSES;
  trend?: { value: number | null; invert?: boolean };
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          {Icon && (
            <div className={`flex size-9 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}>
              <Icon className="size-4.5" />
            </div>
          )}
          {trend && <TrendBadge value={trend.value} invert={trend.invert} />}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <Skeleton className="size-9 rounded-lg" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-7 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </>
  );
}

function ChartSkeleton({ height = 288 }: { height?: number }) {
  return <Skeleton className="w-full rounded-lg" style={{ height }} />;
}

export function DashboardPage() {
  const { t } = useTranslation(["analytics", "common"]);
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const isStaff = profile?.role === "staff";
  const canSeeFinance = isAdmin || profile?.role === "manager";

  const { data: lowStockProducts } = useQuery({
    queryKey: ["products", "all", true],
    queryFn: () => listProducts({ lowStock: true }),
  });
  const { data: expiringBatches } = useQuery({
    queryKey: ["batches", "expiring"],
    queryFn: () => listExpiringBatches(30),
  });
  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ["inventoryInsights"],
    queryFn: getInventoryInsights,
  });
  // Polling rather than a websocket push - a deliberate, simpler stand-in
  // for "real-time" charts that keeps the dashboard reasonably fresh
  // without standing up separate realtime infrastructure.
  const { data: forecast, isLoading: forecastLoading } = useQuery({
    queryKey: ["salesForecast"],
    queryFn: () => getSalesForecast(30, 7),
    refetchInterval: 30_000,
  });
  const { data: topProducts } = useQuery({
    queryKey: ["topProducts"],
    queryFn: () => getTopProducts(30, 5),
  });
  const { data: bestCustomers } = useQuery({
    queryKey: ["bestCustomers"],
    queryFn: () => getBestCustomers(30, 5),
  });
  const { data: financialSummary, isLoading: financeLoading } = useQuery({
    queryKey: ["financialSummary", "dashboard"],
    queryFn: () => getFinancialSummary({ dateFrom: isoDaysAgo(30), dateTo: isoDaysAgo(0) }),
    enabled: canSeeFinance,
  });
  // Same existing summary endpoint, just called for the preceding 30-day
  // window too — gives a real period-over-period comparison for the trend
  // badges instead of a fabricated percentage.
  const { data: previousFinancialSummary } = useQuery({
    queryKey: ["financialSummary", "dashboard-previous"],
    queryFn: () => getFinancialSummary({ dateFrom: isoDaysAgo(60), dateTo: isoDaysAgo(30) }),
    enabled: canSeeFinance,
  });
  const { data: allProducts } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => listProducts(),
    enabled: canSeeFinance,
  });
  const { data: allOrders } = useQuery({
    queryKey: ["salesOrders", "all"],
    queryFn: () => listSalesOrders(),
    enabled: canSeeFinance,
  });
  const { data: allCustomers } = useQuery({
    queryKey: ["customers", "all"],
    queryFn: () => listCustomers(),
    enabled: canSeeFinance,
  });
  const { data: unassignedDeliveries } = useQuery({
    queryKey: ["deliveries", "unassigned"],
    queryFn: () => listDeliveries("unassigned"),
    enabled: canSeeFinance,
  });
  const { data: openDeliveryIssues } = useQuery({
    queryKey: ["deliveryIssues", "open"],
    queryFn: () => listDeliveryIssues("open"),
    enabled: canSeeFinance,
  });
  const { data: allUsers } = useQuery({
    queryKey: ["users", "all"],
    queryFn: () => listUsers(),
    enabled: isAdmin,
  });
  const { data: recentActivity } = useQuery({
    queryKey: ["auditLogs", "dashboard"],
    queryFn: () => listAuditLogs(),
    enabled: isAdmin,
  });
  const { data: supplierSubmissions } = useQuery({
    queryKey: ["supplierSubmissions", "dashboard"],
    queryFn: listSupplierSubmissions,
    enabled: isAdmin,
  });
  const { data: stockRequests } = useQuery({
    queryKey: ["stockRequests", "dashboard"],
    queryFn: listStockRequests,
    enabled: isAdmin,
  });
  const { data: mySales } = useQuery({
    queryKey: ["salesOrders", "mine", profile?.uid],
    queryFn: () => listSalesOrders({ createdBy: profile!.uid }),
    enabled: isStaff,
  });
  const { data: myReceipts } = useQuery({
    queryKey: ["goodsReceipts", "mine"],
    queryFn: () => listGoodsReceipts(),
    enabled: isStaff,
  });

  // eslint-disable-next-line react-hooks/purity, react-hooks/exhaustive-deps
  const nowMs = useMemo(() => Date.now(), [expiringBatches, stockRequests]);

  const salesLast24h = useMemo(
    () => (mySales ?? []).filter((o) => o.createdAt._seconds * 1000 >= msAgo(1)),
    [mySales],
  );
  const salesLast7d = useMemo(
    () => (mySales ?? []).filter((o) => o.createdAt._seconds * 1000 >= msAgo(7)),
    [mySales],
  );
  const salesLast30d = useMemo(
    () => (mySales ?? []).filter((o) => o.createdAt._seconds * 1000 >= msAgo(30)),
    [mySales],
  );
  const receivedLast30d = useMemo(
    () => (myReceipts ?? []).filter((r) => r.createdAt._seconds * 1000 >= msAgo(30)),
    [myReceipts],
  );
  const mySalesTrend = useMemo(() => {
    const byDate = new Map<string, number>();
    (mySales ?? [])
      .filter((o) => o.createdAt._seconds * 1000 >= msAgo(14))
      .forEach((o) => {
        const key = new Date(o.createdAt._seconds * 1000).toISOString().slice(0, 10);
        byDate.set(key, round2((byDate.get(key) ?? 0) + o.grandTotal));
      });
    const days: { date: string; total: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const key = isoDaysAgo(i);
      days.push({ date: key, total: byDate.get(key) ?? 0 });
    }
    return days;
  }, [mySales]);
  const recentMySales = (mySales ?? []).slice(0, 6);
  const recentMyReceipts = (myReceipts ?? []).slice(0, 6);

  const todayCompletedOrders = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const cutoff = todayStart.getTime();
    return (mySales ?? []).filter(
      (o) => o.status === "completed" && o.createdAt._seconds * 1000 >= cutoff,
    );
  }, [mySales]);

  const returnQueryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const o of todayCompletedOrders) ids.add(o.id);
    for (const o of recentMySales) if (o.status === "completed") ids.add(o.id);
    return [...ids];
  }, [todayCompletedOrders, recentMySales]);

  const { data: returnedOrderIds } = useQuery({
    queryKey: ["staffOrderReturns", returnQueryIds],
    queryFn: async () => {
      const results = await Promise.all(returnQueryIds.map((id) => listReturnsForOrder(id)));
      const set = new Set<string>();
      returnQueryIds.forEach((id, i) => {
        if ((results[i]?.length ?? 0) > 0) set.add(id);
      });
      return set;
    },
    enabled: isStaff && returnQueryIds.length > 0,
  });

  const todayStats = useMemo(() => {
    const refunded = todayCompletedOrders.filter((o) => returnedOrderIds?.has(o.id)).length;
    const successful = todayCompletedOrders.length - refunded;
    const totalRevenue = round2(todayCompletedOrders.reduce((s, o) => s + o.grandTotal, 0));
    return { total: todayCompletedOrders.length, successful, refunded, totalRevenue };
  }, [todayCompletedOrders, returnedOrderIds]);

  const pendingApprovalCount = useMemo(
    () => allProducts?.filter((p) => p.approvalStatus === "pending").length ?? 0,
    [allProducts],
  );
  const usersByRole = useMemo(() => {
    const counts: Record<string, number> = {};
    allUsers?.forEach((u) => {
      counts[u.role] = (counts[u.role] ?? 0) + 1;
    });
    return counts;
  }, [allUsers]);
  const userName = (id: string) => allUsers?.find((u) => u.uid === id)?.displayName ?? id;

  const recentOrders = useMemo(
    () => [...(allOrders ?? [])].sort((a, b) => b.createdAt._seconds - a.createdAt._seconds).slice(0, 6),
    [allOrders],
  );
  const customersWithDebt = useMemo(
    () => (allCustomers ?? []).filter((c) => c.outstandingLoanBalance > 0),
    [allCustomers],
  );
  const totalOutstandingDebt = round2(customersWithDebt.reduce((s, c) => s + c.outstandingLoanBalance, 0));

  const revenueTrend = trendPercent(financialSummary?.totalRevenue ?? 0, previousFinancialSummary?.totalRevenue ?? 0);
  const expensesTrend = trendPercent(
    financialSummary?.totalExpenses ?? 0,
    previousFinancialSummary?.totalExpenses ?? 0,
  );
  const netProfitTrend = trendPercent(financialSummary?.netProfit ?? 0, previousFinancialSummary?.netProfit ?? 0);
  const orderCountTrend = trendPercent(financialSummary?.orderCount ?? 0, previousFinancialSummary?.orderCount ?? 0);

  const categoryTotal = (insights?.valueByCategory ?? []).reduce((s, c) => s + c.value, 0);

  const chartData = [
    ...(forecast?.historical.map((h) => ({ date: h.date, actual: h.actual })) ?? []),
    ...(forecast?.forecast.map((f) => ({ date: f.date, predicted: f.predicted })) ?? []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {t("dashboardPage.welcome", { name: profile?.displayName })}
        </h1>
        <p className="text-muted-foreground">
          {t("dashboardPage.signedInAs", { role: profile?.role })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {insightsLoading ? (
          <StatGridSkeleton count={4} />
        ) : (
          <>
            <StatCard
              label={t("dashboardPage.stats.totalProducts")}
              value={String(insights?.totalProducts ?? "—")}
              icon={Boxes}
              tone="primary"
            />
            <StatCard
              label={t("dashboardPage.stats.inventoryValue")}
              value={`$${(insights?.totalInventoryValue ?? 0).toFixed(2)}`}
              icon={DollarSign}
              tone="success"
            />
            <StatCard
              label={t("dashboardPage.stats.lowStockItems")}
              value={String(insights?.lowStockCount ?? "—")}
              icon={AlertTriangle}
              tone="warning"
            />
            <StatCard
              label={t("dashboardPage.stats.expiringBatches30d")}
              value={String(insights?.expiringBatchesCount ?? "—")}
              icon={CalendarRange}
              tone="purple"
            />
          </>
        )}
      </div>

      {canSeeFinance && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {financeLoading ? (
            <StatGridSkeleton count={4} />
          ) : (
            <>
              <StatCard
                label={t("dashboardPage.stats.revenue30d")}
                value={`$${(financialSummary?.totalRevenue ?? 0).toFixed(2)}`}
                icon={DollarSign}
                tone="primary"
                trend={{ value: revenueTrend }}
              />
              <StatCard
                label={t("dashboardPage.stats.expenses30d")}
                value={`$${(financialSummary?.totalExpenses ?? 0).toFixed(2)}`}
                icon={Receipt}
                tone="warning"
                trend={{ value: expensesTrend, invert: true }}
              />
              <StatCard
                label={t("dashboardPage.stats.netProfit30d")}
                value={`$${(financialSummary?.netProfit ?? 0).toFixed(2)}`}
                icon={TrendingUp}
                tone="success"
                trend={{ value: netProfitTrend }}
              />
              <StatCard
                label={t("dashboardPage.stats.completedOrders30d")}
                value={String(financialSummary?.orderCount ?? "—")}
                icon={ShoppingCart}
                tone="purple"
                trend={{ value: orderCountTrend }}
              />
            </>
          )}
        </div>
      )}

      {isStaff && (
        <>
          <div>
            <h2 className="text-lg font-semibold">{t("dashboardPage.yourWork.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("dashboardPage.yourWork.subtitle")}</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label={t("dashboardPage.stats.todaySuccessful")}
              value={String(todayStats.successful)}
              icon={ShoppingCart}
              tone="success"
            />
            <StatCard
              label={t("dashboardPage.stats.todayRefunded")}
              value={String(todayStats.refunded)}
              icon={Receipt}
              tone="warning"
            />
            <StatCard
              label={t("dashboardPage.stats.todaySales")}
              value={`$${todayStats.totalRevenue.toFixed(2)} (${todayStats.total})`}
              icon={DollarSign}
              tone="primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              label={t("dashboardPage.stats.mySales24h")}
              value={t("dashboardPage.stats.amountWithCount", {
                amount: round2(salesLast24h.reduce((s, o) => s + o.grandTotal, 0)).toFixed(2),
                count: salesLast24h.length,
              })}
              icon={Clock}
              tone="primary"
            />
            <StatCard
              label={t("dashboardPage.stats.mySales7d")}
              value={t("dashboardPage.stats.amountWithCount", {
                amount: round2(salesLast7d.reduce((s, o) => s + o.grandTotal, 0)).toFixed(2),
                count: salesLast7d.length,
              })}
              icon={CalendarDays}
              tone="success"
            />
            <StatCard
              label={t("dashboardPage.stats.mySales30d")}
              value={t("dashboardPage.stats.amountWithCount", {
                amount: round2(salesLast30d.reduce((s, o) => s + o.grandTotal, 0)).toFixed(2),
                count: salesLast30d.length,
              })}
              icon={CalendarRange}
              tone="purple"
            />
            <StatCard
              label={t("dashboardPage.stats.stockReceived30d")}
              value={String(receivedLast30d.length)}
              icon={PackageCheck}
              tone="warning"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("dashboardPage.mySalesTrend.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mySalesTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="var(--color-primary)"
                      name={t("dashboardPage.mySalesTrend.legend")}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  {t("dashboardPage.myRecentSales.title")}
                  <Link to="/app/sales/orders" className="text-xs font-normal text-primary hover:underline">
                    {t("dashboardPage.viewAll")}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("dashboardPage.table.orderNumber")}</TableHead>
                      <TableHead>{t("dashboardPage.table.items")}</TableHead>
                      <TableHead className="text-end">{t("common:fields.total")}</TableHead>
                      <TableHead>{t("dashboardPage.table.saleStatus")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentMySales.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          {t("dashboardPage.myRecentSales.empty")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      recentMySales.map((order) => {
                        const isRefunded = order.status === "completed" && returnedOrderIds?.has(order.id);
                        const isSuccess = order.status === "completed" && !returnedOrderIds?.has(order.id);
                        return (
                          <TableRow key={order.id}>
                            <TableCell className="font-medium">{order.orderNumber}</TableCell>
                            <TableCell>{order.items.length}</TableCell>
                            <TableCell className="text-end">${order.grandTotal.toFixed(2)}</TableCell>
                            <TableCell>
                              {isRefunded ? (
                                <Badge variant="destructive">{t("dashboardPage.saleStatus.refunded")}</Badge>
                              ) : isSuccess ? (
                                <Badge className="bg-green-500/15 text-green-700 dark:text-green-400">
                                  {t("dashboardPage.saleStatus.success")}
                                </Badge>
                              ) : (
                                <Badge variant="secondary">
                                  {t(`dashboardPage.orderStatus.${order.status}`)}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("dashboardPage.stockReceived.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("dashboardPage.table.product")}</TableHead>
                      <TableHead>{t("dashboardPage.table.goodQty")}</TableHead>
                      <TableHead>{t("dashboardPage.table.issues")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentMyReceipts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          {t("dashboardPage.stockReceived.empty")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      recentMyReceipts.map((receipt) => (
                        <TableRow key={receipt.id}>
                          <TableCell className="font-medium">{receipt.productName}</TableCell>
                          <TableCell>{receipt.goodQuantity}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {receipt.damagedQuantity + receipt.missingQuantity > 0
                              ? t("dashboardPage.table.damagedMissing", {
                                  count: receipt.damagedQuantity + receipt.missingQuantity,
                                })
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {canSeeFinance && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboardPage.needsAttention.title")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span>{t("dashboardPage.needsAttention.pendingApproval")}</span>
              <div className="flex items-center gap-3">
                {pendingApprovalCount > 0 && <Badge variant="warning">{pendingApprovalCount}</Badge>}
                <Link to="/app/inventory/products" className="text-primary hover:underline">
                  {t("dashboardPage.needsAttention.review")}
                </Link>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>{t("dashboardPage.needsAttention.unassignedDeliveries")}</span>
              <div className="flex items-center gap-3">
                {(unassignedDeliveries?.length ?? 0) > 0 && (
                  <Badge variant="warning">{unassignedDeliveries?.length}</Badge>
                )}
                <Link to="/app/delivery" className="text-primary hover:underline">
                  {t("dashboardPage.needsAttention.dispatchBoard")}
                </Link>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>{t("dashboardPage.needsAttention.openDeliveryIssues")}</span>
              <div className="flex items-center gap-3">
                {(openDeliveryIssues?.length ?? 0) > 0 && (
                  <Badge variant="destructive">{openDeliveryIssues?.length}</Badge>
                )}
                <Link to="/app/delivery-issues" className="text-primary hover:underline">
                  {t("dashboardPage.needsAttention.review")}
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dashboardPage.salesTrendForecast.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {forecastLoading ? (
            <ChartSkeleton height={288} />
          ) : (
            <>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      stroke="var(--color-primary)"
                      name={t("dashboardPage.salesTrendForecast.actualSales")}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="predicted"
                      stroke="var(--color-warning)"
                      strokeDasharray="5 5"
                      name={t("dashboardPage.salesTrendForecast.forecast")}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("dashboardPage.salesTrendForecast.disclaimer")}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {canSeeFinance && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboardPage.recentOrders.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dashboardPage.table.orderNumber")}</TableHead>
                  <TableHead>{t("dashboardPage.table.customer")}</TableHead>
                  <TableHead>{t("dashboardPage.table.type")}</TableHead>
                  <TableHead>{t("common:fields.status")}</TableHead>
                  <TableHead>{t("dashboardPage.table.payment")}</TableHead>
                  <TableHead className="text-end">{t("common:fields.total")}</TableHead>
                  <TableHead>{t("common:fields.date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      {t("dashboardPage.recentOrders.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  recentOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.orderNumber}</TableCell>
                      <TableCell className="text-muted-foreground">{order.customerName ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{t(`dashboardPage.orderType.${order.type}`)}</Badge>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          // A refund never changes order.status (it stays
                          // "completed" — see salesOrder.service.ts), so this
                          // has to be overridden here or a refunded order
                          // would still read "Completed" next to its full
                          // original total.
                          const refunded = order.status === "completed" && (order.refundedAmount ?? 0) > 0;
                          const fullyRefunded = refunded && (order.refundedAmount ?? 0) >= order.grandTotal;
                          const label = refunded
                            ? fullyRefunded
                              ? t("common:status.refunded")
                              : t("common:status.partiallyRefunded")
                            : t(`common:status.${order.status}`);
                          const variant = refunded
                            ? "destructive"
                            : order.status === "completed"
                              ? "success"
                              : order.status === "pending"
                                ? "warning"
                                : "destructive";
                          return <Badge variant={variant}>{label}</Badge>;
                        })()}
                      </TableCell>
                      <TableCell className="text-muted-foreground capitalize">
                        {order.paymentMethod.replace("_", " ")}
                      </TableCell>
                      <TableCell className="text-end">${order.grandTotal.toFixed(2)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(order.createdAt._seconds * 1000).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboardPage.topProducts.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {!topProducts || topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("dashboardPage.myRecentSales.empty")}</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProducts} layout="vertical" margin={{ left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="productName"
                      width={110}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip />
                    <Bar
                      dataKey="quantitySold"
                      fill="var(--color-primary)"
                      name={t("dashboardPage.table.qtySold")}
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboardPage.bestCustomers.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dashboardPage.table.customer")}</TableHead>
                  <TableHead>{t("dashboardPage.table.orders")}</TableHead>
                  <TableHead className="text-end">{t("dashboardPage.table.totalSpent")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bestCustomers?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      {t("dashboardPage.bestCustomers.empty")}
                    </TableCell>
                  </TableRow>
                )}
                {bestCustomers?.map((c) => (
                  <TableRow key={c.customerId}>
                    <TableCell className="font-medium">{c.customerName}</TableCell>
                    <TableCell>{c.orderCount}</TableCell>
                    <TableCell className="text-end">${c.totalSpent.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("dashboardPage.inventoryByCategory.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6 sm:flex-row">
          <div className="h-64 w-full sm:w-1/2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip />
                <Pie
                  data={insights?.valueByCategory ?? []}
                  dataKey="value"
                  nameKey="category"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={2}
                >
                  {(insights?.valueByCategory ?? []).map((entry, index) => (
                    <Cell key={entry.category} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-1/2">
            {(insights?.valueByCategory ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("dashboardPage.inventoryByCategory.empty")}</p>
            ) : (
              insights?.valueByCategory.map((entry, index) => (
                <div key={entry.category} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                    />
                    {entry.category}
                  </span>
                  <span className="font-medium">
                    {categoryTotal > 0 ? round2((entry.value / categoryTotal) * 100) : 0}%
                  </span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              {t("dashboardPage.lowStockAlerts.title")}
              {lowStockProducts && lowStockProducts.length > 0 && (
                <Badge variant="warning">{lowStockProducts.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {!lowStockProducts || lowStockProducts.length === 0 ? (
              <EmptyState
                emoji={t("dashboardPage.lowStockAlerts.emptyEmoji")}
                title={t("dashboardPage.lowStockAlerts.emptyTitle")}
                subtitle={t("dashboardPage.lowStockAlerts.emptySubtitle")}
              />
            ) : (
              lowStockProducts.slice(0, 5).map((product) => {
                const isOut = product.totalStock === 0;
                return (
                  <div
                    key={product.id}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                      isOut ? "bg-destructive/10" : "bg-warning/10"
                    }`}
                  >
                    <Link
                      to={`/app/inventory/products/${product.id}`}
                      className={`font-medium hover:underline ${isOut ? "text-destructive" : "text-foreground"}`}
                    >
                      {product.name}
                    </Link>
                    <Badge variant={isOut ? "destructive" : "warning"}>
                      {isOut
                        ? t("dashboardPage.lowStockAlerts.outOfStock")
                        : t("dashboardPage.lowStockAlerts.left", { count: product.totalStock })}
                    </Badge>
                  </div>
                );
              })
            )}
            {customersWithDebt.length > 0 && (
              <div className="flex flex-col gap-0.5 rounded-lg bg-destructive/10 px-3 py-2">
                <span className="text-sm font-medium text-destructive">
                  {t("dashboardPage.lowStockAlerts.outstandingDebt", { amount: totalOutstandingDebt.toFixed(2) })}
                </span>
                <span className="text-xs text-destructive/80">
                  {t("dashboardPage.lowStockAlerts.unpaidCustomers", { count: customersWithDebt.length })}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              {t("dashboardPage.expiringBatches.title")}
              {expiringBatches && expiringBatches.length > 0 && (
                <Badge variant="warning">{expiringBatches.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {!expiringBatches || expiringBatches.length === 0 ? (
              <EmptyState
                emoji={t("dashboardPage.expiringBatches.emptyEmoji")}
                title={t("dashboardPage.expiringBatches.emptyTitle")}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("dashboardPage.expiringBatches.table.product")}</TableHead>
                    <TableHead>{t("dashboardPage.expiringBatches.table.batch")}</TableHead>
                    <TableHead>{t("dashboardPage.expiringBatches.table.expiresIn")}</TableHead>
                    <TableHead className="text-end">{t("dashboardPage.expiringBatches.table.qty")}</TableHead>
                    <TableHead>{t("common:fields.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiringBatches.slice(0, 5).map((batch) => {
                    const expiry = toDate(batch.expiryDate);
                    const daysLeft = expiry
                      ? Math.ceil((expiry.getTime() - nowMs) / (1000 * 60 * 60 * 24))
                      : 0;
                    const isCritical = daysLeft <= 7;
                    return (
                      <TableRow key={batch.id}>
                        <TableCell className="font-medium">{batch.productName ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{batch.batchNumber}</TableCell>
                        <TableCell>
                          {daysLeft <= 0
                            ? t("dashboardPage.expiringBatches.expired")
                            : t("dashboardPage.expiringBatches.daysLeft", { count: daysLeft })}
                        </TableCell>
                        <TableCell className="text-end">{batch.quantity}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-block size-2.5 rounded-full ${
                              isCritical ? "bg-destructive" : "bg-warning"
                            }`}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              {t("dashboardPage.supplierActivity.title")}
              <Link to="/app/suppliers/stock" className="text-xs font-normal text-primary hover:underline">
                {t("dashboardPage.viewAll")}
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Pending submissions */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("dashboardPage.supplierActivity.pendingSubmissions")}
              </p>
              {(() => {
                const pending = (supplierSubmissions ?? []).filter((s) => s.status === "pending");
                if (pending.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground">
                      {t("dashboardPage.supplierActivity.noPending")}
                    </p>
                  );
                }
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("dashboardPage.supplierActivity.columns.product")}</TableHead>
                        <TableHead>{t("dashboardPage.supplierActivity.columns.supplier")}</TableHead>
                        <TableHead>{t("dashboardPage.supplierActivity.columns.qty")}</TableHead>
                        <TableHead>{t("dashboardPage.supplierActivity.columns.submitted")}</TableHead>
                        <TableHead>{t("common:fields.status")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pending.slice(0, 6).map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.productName}</TableCell>
                          <TableCell className="text-muted-foreground">{s.companyName}</TableCell>
                          <TableCell>{s.quantity}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(s.createdAt._seconds * 1000).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="warning">{t("dashboardPage.supplierActivity.pending")}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()}
            </div>

            {/* Recent stock requests */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("dashboardPage.supplierActivity.recentStockRequests")}
              </p>
              {(() => {
                const cutoff = nowMs - 7 * 24 * 60 * 60 * 1000;
                const recent = (stockRequests ?? [])
                  .filter((r) => r.createdAt._seconds * 1000 >= cutoff)
                  .slice(0, 6);
                if (recent.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground">
                      {t("dashboardPage.supplierActivity.noRecentRequests")}
                    </p>
                  );
                }
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("dashboardPage.supplierActivity.columns.product")}</TableHead>
                        <TableHead>{t("dashboardPage.supplierActivity.columns.company")}</TableHead>
                        <TableHead>{t("dashboardPage.supplierActivity.columns.qty")}</TableHead>
                        <TableHead>{t("dashboardPage.supplierActivity.columns.requested")}</TableHead>
                        <TableHead>{t("common:fields.status")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recent.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.productName}</TableCell>
                          <TableCell className="text-muted-foreground">{r.companyName}</TableCell>
                          <TableCell>{r.quantity}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(r.createdAt._seconds * 1000).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                r.status === "approved"
                                  ? "success"
                                  : r.status === "rejected"
                                    ? "destructive"
                                    : "warning"
                              }
                            >
                              {t(`common:status.${r.status}`)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("dashboardPage.teamOverview.title")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{t("common:roles.staff")}</p>
                <p className="text-2xl font-semibold">{usersByRole.staff ?? 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("common:roles.driver")}</p>
                <p className="text-2xl font-semibold">{usersByRole.driver ?? 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("common:roles.supplier")}</p>
                <p className="text-2xl font-semibold">{usersByRole.supplier ?? 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("common:roles.customer")}</p>
                <p className="text-2xl font-semibold">{usersByRole.customer ?? 0}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                {t("dashboardPage.recentActivity.title")}
                <Link
                  to="/app/settings/audit-logs"
                  className="text-xs font-normal text-primary hover:underline"
                >
                  {t("dashboardPage.viewAll")}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {!recentActivity || recentActivity.length === 0 ? (
                <EmptyState
                  emoji={t("dashboardPage.recentActivity.emptyEmoji")}
                  title={t("dashboardPage.recentActivity.emptyTitle")}
                />
              ) : (
                recentActivity.slice(0, 8).map((log) => {
                  const { text, tone } = describeAuditLog(log, userName(log.userId), t);
                  return (
                    <div key={log.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2">
                        <span className={`size-2 shrink-0 rounded-full ${DOT_CLASSES[tone]}`} />
                        {text}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {new Date(log.createdAt._seconds * 1000).toLocaleString()}
                      </span>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
