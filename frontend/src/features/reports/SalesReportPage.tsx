import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  DollarSign,
  Percent,
  Receipt,
  RotateCcw,
  ShoppingCart,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { downloadSalesReport, getSalesReport } from "@/api/reports.api";
import { getApiErrorMessage } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TONE_CLASSES = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  purple: "bg-purple/10 text-purple",
  destructive: "bg-destructive/10 text-destructive",
} as const;

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: keyof typeof TONE_CLASSES;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        {Icon && (
          <div className={`flex size-9 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`}>
            <Icon className="size-4.5" />
          </div>
        )}
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonth() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

type Preset = "daily" | "monthly" | "custom";

export function SalesReportPage() {
  const { t } = useTranslation(["reports", "common"]);
  const [preset, setPreset] = useState<Preset>("daily");
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());

  function applyPreset(next: Preset) {
    setPreset(next);
    if (next === "daily") {
      setDateFrom(today());
      setDateTo(today());
    } else if (next === "monthly") {
      setDateFrom(firstOfMonth());
      setDateTo(today());
    }
  }

  const { data: report, isLoading } = useQuery({
    queryKey: ["salesReport", dateFrom, dateTo],
    queryFn: () => getSalesReport(dateFrom, dateTo),
  });

  const downloadMutation = useMutation({
    mutationFn: (format: "pdf" | "excel") => downloadSalesReport(dateFrom, dateTo, format),
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("salesReportPage.title")}</h1>
        <p className="text-muted-foreground">{t("salesReportPage.subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex gap-2">
          {(["daily", "monthly", "custom"] as Preset[]).map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={preset === p ? "default" : "outline"}
              onClick={() => applyPreset(p)}
            >
              {p === "daily"
                ? t("salesReportPage.presets.today")
                : p === "monthly"
                  ? t("salesReportPage.presets.thisMonth")
                  : t("salesReportPage.presets.custom")}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateFrom">{t("salesReportPage.from")}</Label>
          <Input
            id="dateFrom"
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setPreset("custom");
              setDateFrom(e.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateTo">{t("salesReportPage.to")}</Label>
          <Input
            id="dateTo"
            type="date"
            value={dateTo}
            onChange={(e) => {
              setPreset("custom");
              setDateTo(e.target.value);
            }}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={downloadMutation.isPending}
            onClick={() => downloadMutation.mutate("pdf")}
          >
            {t("salesReportPage.exportPdf")}
          </Button>
          <Button
            variant="outline"
            disabled={downloadMutation.isPending}
            onClick={() => downloadMutation.mutate("excel")}
          >
            {t("salesReportPage.exportExcel")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label={t("salesReportPage.summary.orders")}
          value={String(report?.summary.orderCount ?? "—")}
          icon={ShoppingCart}
          tone="primary"
        />
        <StatCard
          label={t("common:fields.subtotal")}
          value={`$${(report?.summary.subtotal ?? 0).toFixed(2)}`}
          icon={DollarSign}
          tone="success"
        />
        <StatCard
          label={t("common:fields.discount")}
          value={`-$${(report?.summary.discountTotal ?? 0).toFixed(2)}`}
          icon={Percent}
          tone="warning"
        />
        <StatCard
          label={t("common:fields.tax")}
          value={`$${(report?.summary.taxTotal ?? 0).toFixed(2)}`}
          icon={Receipt}
          tone="purple"
        />
        {(report?.summary.refundedTotal ?? 0) > 0 && (
          <StatCard
            label={t("salesReportPage.summary.refunded")}
            value={`-$${(report?.summary.refundedTotal ?? 0).toFixed(2)}`}
            icon={RotateCcw}
            tone="destructive"
          />
        )}
        <StatCard
          label={t("common:fields.total")}
          value={`$${(report?.summary.grandTotal ?? 0).toFixed(2)}`}
          icon={TrendingUp}
          tone="primary"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("salesReportPage.table.orderNumber")}</TableHead>
            <TableHead>{t("common:fields.date")}</TableHead>
            <TableHead>{t("salesReportPage.table.customer")}</TableHead>
            <TableHead>{t("salesReportPage.table.items")}</TableHead>
            <TableHead>{t("salesReportPage.table.payment")}</TableHead>
            <TableHead className="text-end">{t("common:fields.total")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {t("common:actions.loading")}
              </TableCell>
            </TableRow>
          )}
          {!isLoading && report?.rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {t("salesReportPage.table.empty")}
              </TableCell>
            </TableRow>
          )}
          {report?.rows.map((row) => (
            <TableRow key={row.orderNumber}>
              <TableCell className="font-medium">{row.orderNumber}</TableCell>
              <TableCell className="text-sm">{row.date}</TableCell>
              <TableCell>{row.customerName}</TableCell>
              <TableCell>{row.itemCount}</TableCell>
              <TableCell className="capitalize">{row.paymentMethod.replace("_", " ")}</TableCell>
              <TableCell className="text-end">${row.grandTotal.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
