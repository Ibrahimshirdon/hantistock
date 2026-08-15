import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { createProduct, listCategories, type CreateProductInput } from "@/api/inventory.api";
import { listSupplierCompanies } from "@/api/supplier.api";
import { listTaxRates } from "@/api/sales.api";
import { getApiErrorMessage } from "@/api/client";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMPTY_FORM: CreateProductInput = {
  companyId: "",
  sku: "",
  barcode: "",
  name: "",
  description: "",
  category: "",
  unit: "pcs",
  costPrice: 0,
  sellingPrice: 0,
  taxRateId: null,
  reorderLevel: 10,
  maxStockLevel: undefined,
  expiryDate: undefined,
  batchNumber: "",
  warehouseLocation: "",
  initialQuantity: 0,
};

interface CreateProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProductDialog({ open, onOpenChange }: CreateProductDialogProps) {
  const { t } = useTranslation(["inventory", "common"]);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateProductInput>(EMPTY_FORM);

  const { data: companies } = useQuery({
    queryKey: ["supplierCompanies", "all"],
    queryFn: () => listSupplierCompanies(),
  });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: taxRates } = useQuery({ queryKey: ["taxRates"], queryFn: listTaxRates });

  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      toast.success(t("productsPage.createDialog.toastCreated"));
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setForm(EMPTY_FORM);
      onOpenChange(false);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  function handleOpenChange(next: boolean) {
    if (next) setForm(EMPTY_FORM);
    onOpenChange(next);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.companyId) {
      toast.error(t("productsPage.createDialog.selectCompany"));
      return;
    }
    if (form.sellingPrice <= form.costPrice) {
      toast.error(t("productsPage.createDialog.sellingPriceTooLow"));
      return;
    }
    createMutation.mutate(form);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("productsPage.createDialog.title")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pe-1"
        >
          <div className="flex flex-col gap-1.5">
            <Label>{t("productsPage.createDialog.supplierCompany")}</Label>
            <Select value={form.companyId} onValueChange={(v) => setForm({ ...form, companyId: v })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("productsPage.createDialog.selectCompanyPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {companies?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("productsPage.createDialog.supplierCompanyHint")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t("common:fields.name")}</Label>
              <Input
                required
                minLength={2}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("productsPage.sku")}</Label>
              <Input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t("productsPage.createDialog.barcodeOptional")}</Label>
              <Input
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("productsPage.unit")}</Label>
              <Input
                required
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t("productsPage.createDialog.descriptionOptional")}</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          {categories && categories.filter((c) => c.isActive).length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label>{t("productsPage.createDialog.existingCategory")}</Label>
              <Select value="" onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("productsPage.createDialog.existingCategoryPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {categories
                    .filter((c) => c.isActive)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>{t("productsPage.category")}</Label>
            <Input
              required
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("productsPage.createDialog.initialQuantity")}</Label>
              <Input
                type="number"
                min={0}
                value={form.initialQuantity}
                onChange={(e) => setForm({ ...form, initialQuantity: Number(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("productsPage.createDialog.costPrice")}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.costPrice}
                onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("productsPage.sellingPrice")}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.sellingPrice}
                className={
                  form.costPrice > 0 && form.sellingPrice <= form.costPrice
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }
                onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })}
              />
              {form.costPrice > 0 && form.sellingPrice <= form.costPrice && (
                <p className="text-xs text-destructive">
                  {t("productsPage.createDialog.sellingPriceTooLow")}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t("productsPage.createDialog.reorderLevel")}</Label>
              <Input
                type="number"
                min={0}
                value={form.reorderLevel}
                onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("productsPage.createDialog.expiryDateOptional")}</Label>
              <Input
                type="date"
                value={form.expiryDate ?? ""}
                onChange={(e) => setForm({ ...form, expiryDate: e.target.value || undefined })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t("productsPage.createDialog.taxRate")}</Label>
            <Select
              value={form.taxRateId ?? "none"}
              onValueChange={(v) => setForm({ ...form, taxRateId: v === "none" ? null : v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("productsPage.createDialog.noTax")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("productsPage.createDialog.noTax")}</SelectItem>
                {taxRates?.map((rate) => (
                  <SelectItem key={rate.id} value={rate.id}>
                    {rate.name} ({(rate.rate * 100).toFixed(0)}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t("productsPage.createDialog.batchNumber")}</Label>
              <Input
                required
                value={form.batchNumber}
                onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("productsPage.createDialog.warehouseLocation")}</Label>
              <Input
                required
                value={form.warehouseLocation}
                onChange={(e) => setForm({ ...form, warehouseLocation: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending
                ? t("productsPage.createDialog.creating")
                : t("productsPage.createDialog.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
