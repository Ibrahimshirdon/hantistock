import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Banknote, CheckCircle2 } from "lucide-react";
import { listUsers } from "@/api/auth.api";
import { deleteSalary, listSalaries, paySalary, setSalary, unpaySalary } from "@/api/hr.api";
import { getApiErrorMessage } from "@/api/client";
import type { UserProfile } from "@/types/auth.types";
import type { StaffSalary } from "@/types/hr.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const ELIGIBLE_ROLES = ["staff", "manager", "driver"];

interface SalaryForm {
  monthlySalary: number;
  effectiveDate: string;
  notes: string;
}

const EMPTY_FORM: SalaryForm = {
  monthlySalary: 0,
  effectiveDate: new Date().toISOString().slice(0, 10),
  notes: "",
};

export function StaffSalariesPage() {
  const { t } = useTranslation(["hr", "common"]);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<SalaryForm>(EMPTY_FORM);

  const { data: users, isLoading } = useQuery({
    queryKey: ["users", "all"],
    queryFn: () => listUsers(),
  });
  const { data: salaries } = useQuery({
    queryKey: ["salaries"],
    queryFn: () => listSalaries(),
  });

  const eligibleStaff = useMemo(
    () => (users ?? []).filter((u) => ELIGIBLE_ROLES.includes(u.role)),
    [users],
  );
  const salaryByStaffId = useMemo(() => {
    const map = new Map<string, StaffSalary>();
    salaries?.forEach((s) => map.set(s.staffId, s));
    return map;
  }, [salaries]);
  const totalMonthlyPayroll = useMemo(
    () => (salaries ?? []).reduce((sum, s) => sum + s.monthlySalary, 0),
    [salaries],
  );

  const setSalaryMutation = useMutation({
    mutationFn: () =>
      setSalary({
        staffId: editing!.uid,
        monthlySalary: form.monthlySalary,
        effectiveDate: form.effectiveDate,
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      toast.success(t("salariesPage.toasts.saved"));
      queryClient.invalidateQueries({ queryKey: ["salaries"] });
      setEditing(null);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (staffId: string) => deleteSalary(staffId),
    onSuccess: () => {
      toast.success(t("salariesPage.toasts.deleted"));
      queryClient.invalidateQueries({ queryKey: ["salaries"] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const payMutation = useMutation({
    mutationFn: (staffId: string) => paySalary(staffId),
    onSuccess: () => {
      toast.success(t("salariesPage.toasts.paid"));
      queryClient.invalidateQueries({ queryKey: ["salaries"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const unpayMutation = useMutation({
    mutationFn: (staffId: string) => unpaySalary(staffId),
    onSuccess: () => {
      toast.success(t("salariesPage.toasts.unpaid"));
      queryClient.invalidateQueries({ queryKey: ["salaries"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  function openDialog(user: UserProfile) {
    const existing = salaryByStaffId.get(user.uid);
    setForm(
      existing
        ? {
            monthlySalary: existing.monthlySalary,
            effectiveDate: new Date(existing.effectiveDate._seconds * 1000).toISOString().slice(0, 10),
            notes: existing.notes ?? "",
          }
        : EMPTY_FORM,
    );
    setEditing(user);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSalaryMutation.mutate();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("salariesPage.title")}</h1>
          <p className="text-muted-foreground">{t("salariesPage.subtitle")}</p>
        </div>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-success/10 text-success">
              <Banknote className="size-4.5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("salariesPage.totalPayroll")}</p>
              <p className="text-lg font-semibold">${totalMonthlyPayroll.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("common:fields.name")}</TableHead>
            <TableHead>{t("common:fields.role")}</TableHead>
            <TableHead>{t("salariesPage.columns.monthlySalary")}</TableHead>
            <TableHead>{t("salariesPage.columns.effectiveDate")}</TableHead>
            <TableHead>{t("common:fields.notes")}</TableHead>
            <TableHead>{t("salariesPage.columns.thisMonth")}</TableHead>
            <TableHead className="text-end">{t("common:fields.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                {t("common:actions.loading")}
              </TableCell>
            </TableRow>
          )}
          {!isLoading && eligibleStaff.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                {t("salariesPage.empty")}
              </TableCell>
            </TableRow>
          )}
          {eligibleStaff.map((user) => {
            const salary = salaryByStaffId.get(user.uid);
            return (
              <TableRow key={user.uid}>
                <TableCell className="font-medium">{user.displayName}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize">
                    {t(`common:roles.${user.role}`)}
                  </Badge>
                </TableCell>
                <TableCell>{salary ? `$${salary.monthlySalary.toFixed(2)}` : "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {salary ? new Date(salary.effectiveDate._seconds * 1000).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{salary?.notes ?? "—"}</TableCell>
                <TableCell>
                  {!salary ? (
                    "—"
                  ) : salary.paidThisMonth ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="success" className="gap-1">
                        <CheckCircle2 className="size-3.5" />
                        {t("salariesPage.paid")}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={unpayMutation.isPending}
                        onClick={() => unpayMutation.mutate(user.uid)}
                      >
                        {t("salariesPage.undoPaid")}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      disabled={payMutation.isPending}
                      onClick={() => payMutation.mutate(user.uid)}
                    >
                      {t("salariesPage.markAsPaid")}
                    </Button>
                  )}
                </TableCell>
                <TableCell className="text-end">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => openDialog(user)}>
                      {salary ? t("common:actions.edit") : t("salariesPage.setSalary")}
                    </Button>
                    {salary && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(user.uid)}
                      >
                        {t("common:actions.delete")}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={editing !== null} onOpenChange={(next) => !next && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("salariesPage.dialog.title", { name: editing?.displayName })}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="monthlySalary">{t("salariesPage.columns.monthlySalary")}</Label>
              <Input
                id="monthlySalary"
                type="number"
                min={0}
                step="0.01"
                required
                value={form.monthlySalary}
                onChange={(e) => setForm({ ...form, monthlySalary: Number(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="effectiveDate">{t("salariesPage.columns.effectiveDate")}</Label>
              <Input
                id="effectiveDate"
                type="date"
                required
                value={form.effectiveDate}
                onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">{t("common:fields.notes")}</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={setSalaryMutation.isPending}>
                {setSalaryMutation.isPending ? t("common:actions.saving") : t("salariesPage.dialog.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
