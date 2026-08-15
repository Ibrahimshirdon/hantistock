import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Upload } from "lucide-react";
import { ImportSupplierProductsDialog } from "./ImportSupplierProductsDialog";
import {
  createSupplierProduct,
  deleteSupplierProduct,
  listSupplierCompanies,
  listSupplierProducts,
  listSupplierSubmissions,
  requestSupplierProductSubmission,
  updateSupplierProduct,
  type CreateSupplierProductInput,
} from "@/api/supplier.api";
import { listCategories } from "@/api/inventory.api";
import { listTaxRates } from "@/api/sales.api";
import { getApiErrorMessage } from "@/api/client";
import type { SupplierProduct } from "@/types/supplier.types";
import { toDate } from "@/types/inventory.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

const STATUS_VARIANT = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
} as const;

const EMPTY_FORM: CreateSupplierProductInput = {
  companyId: "",
  name: "",
  description: "",
  category: "",
  brand: "",
  unitType: "pcs",
  quantityInStock: 0,
  wholesalePrice: 0,
  sellingPrice: 0,
  minimumStockLevel: 0,
  taxRateId: null,
  purchasePrice: 0,
  batchNumber: "",
  warehouseLocation: "",
};

export function SupplierProductsPage() {
  const { t } = useTranslation(["supplierPortal", "common"]);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierProduct | null>(null);
  const [deleting, setDeleting] = useState<SupplierProduct | null>(null);
  const [submitting, setSubmitting] = useState<SupplierProduct | null>(null);
  const [form, setForm] = useState<CreateSupplierProductInput>(EMPTY_FORM);
  const [submitQuantity, setSubmitQuantity] = useState(0);

  const { data: companies } = useQuery({
    queryKey: ["supplierCompanies", "mine"],
    queryFn: () => listSupplierCompanies(),
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
  });
  const { data: products, isLoading } = useQuery({
    queryKey: ["supplierProducts", "mine"],
    queryFn: () => listSupplierProducts(),
  });
  const { data: taxRates } = useQuery({ queryKey: ["taxRates"], queryFn: listTaxRates });
  const { data: submissions } = useQuery({
    queryKey: ["supplierSubmissions", "mine"],
    queryFn: () => listSupplierSubmissions(),
  });

  const createMutation = useMutation({
    mutationFn: createSupplierProduct,
    onSuccess: () => {
      toast.success(t("productsPage.toasts.created"));
      queryClient.invalidateQueries({ queryKey: ["supplierProducts"] });
      setForm(EMPTY_FORM);
      setOpen(false);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: () => updateSupplierProduct(editing!.id, form),
    onSuccess: () => {
      toast.success(t("productsPage.toasts.updated"));
      queryClient.invalidateQueries({ queryKey: ["supplierProducts"] });
      setEditing(null);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteSupplierProduct(deleting!.id),
    onSuccess: () => {
      toast.success(t("productsPage.toasts.deleted"));
      queryClient.invalidateQueries({ queryKey: ["supplierProducts"] });
      setDeleting(null);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      requestSupplierProductSubmission(submitting!.id, {
        quantity: submitQuantity,
      }),
    onSuccess: () => {
      toast.success(t("productsPage.toasts.submissionRequested"));
      queryClient.invalidateQueries({ queryKey: ["supplierSubmissions"] });
      setSubmitting(null);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  function handleOpenChange(next: boolean) {
    if (next) setForm(EMPTY_FORM);
    setOpen(next);
  }

  function openEdit(product: SupplierProduct) {
    setForm({
      companyId: product.companyId,
      name: product.name,
      description: product.description ?? "",
      category: product.category,
      brand: product.brand ?? "",
      unitType: product.unitType,
      quantityInStock: product.quantityInStock,
      wholesalePrice: product.wholesalePrice,
      sellingPrice: product.sellingPrice,
      minimumStockLevel: product.minimumStockLevel,
      taxRateId: product.taxRateId,
      purchasePrice: product.purchasePrice,
      batchNumber: product.batchNumber,
      warehouseLocation: product.warehouseLocation,
    });
    setEditing(product);
  }

  function openSubmit(product: SupplierProduct) {
    setSubmitQuantity(product.quantityInStock);
    setSubmitting(product);
  }

  function validatePrices() {
    if (form.sellingPrice <= form.wholesalePrice) {
      toast.error(t("productsPage.toasts.sellingPriceTooLow"));
      return false;
    }
    return true;
  }

  function handleCreateSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.companyId) {
      toast.error(t("productsPage.toasts.selectCompany"));
      return;
    }
    if (!validatePrices()) return;
    createMutation.mutate(form);
  }

  function handleEditSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validatePrices()) return;
    updateMutation.mutate();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("productsPage.title")}</h1>
          <p className="text-muted-foreground">{t("productsPage.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={!companies || companies.length === 0}
            onClick={() => setImportOpen(true)}
          >
            <Upload className="me-1.5 size-4" />
            {t("productsPage.importCsv")}
          </Button>
          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button disabled={!companies || companies.length === 0}>
                {t("productsPage.addProduct")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("productsPage.addProduct")}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={handleCreateSubmit}
              className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pe-1"
            >
              <div className="flex flex-col gap-1.5">
                <Label>{t("productsPage.fields.company")}</Label>
                <Select value={form.companyId} onValueChange={(v) => setForm({ ...form, companyId: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("productsPage.fields.selectCompanyPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {companies?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <Label>{t("productsPage.fields.brandOptional")}</Label>
                  <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("productsPage.fields.descriptionOptional")}</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              {categories && categories.filter((c) => c.isActive).length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label>{t("productsPage.fields.existingCategory")}</Label>
                  <Select
                    value=""
                    onValueChange={(v) => setForm({ ...form, category: v })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("productsPage.fields.existingCategoryPlaceholder")} />
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>{t("productsPage.fields.category")}</Label>
                  <Input
                    required
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("productsPage.fields.unitType")}</Label>
                  <Input
                    required
                    value={form.unitType}
                    onChange={(e) => setForm({ ...form, unitType: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>{t("productsPage.fields.quantityInStock")}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.quantityInStock}
                    onChange={(e) => setForm({ ...form, quantityInStock: Number(e.target.value) })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("productsPage.fields.wholesalePrice")}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.wholesalePrice}
                    onChange={(e) => setForm({ ...form, wholesalePrice: Number(e.target.value) })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("productsPage.fields.sellingPrice")}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.sellingPrice}
                    className={form.wholesalePrice > 0 && form.sellingPrice <= form.wholesalePrice ? "border-destructive focus-visible:ring-destructive" : ""}
                    onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })}
                  />
                  {form.wholesalePrice > 0 && form.sellingPrice <= form.wholesalePrice && (
                    <p className="text-xs text-destructive">{t("productsPage.toasts.sellingPriceTooLow")}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>{t("productsPage.fields.minimumStockLevel")}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.minimumStockLevel}
                    onChange={(e) => setForm({ ...form, minimumStockLevel: Number(e.target.value) })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("productsPage.fields.expiryDateOptional")}</Label>
                  <Input
                    type="date"
                    value={form.expiryDate ?? ""}
                    onChange={(e) => setForm({ ...form, expiryDate: e.target.value || undefined })}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("productsPage.fields.taxRate")}</Label>
                <Select
                  value={form.taxRateId ?? "none"}
                  onValueChange={(v) => setForm({ ...form, taxRateId: v === "none" ? null : v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("productsPage.fields.noTax")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("productsPage.fields.noTax")}</SelectItem>
                    {taxRates?.map((rate) => (
                      <SelectItem key={rate.id} value={rate.id}>
                        {rate.name} ({(rate.rate * 100).toFixed(0)}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {t("productsPage.fields.purchaseSource")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>{t("productsPage.fields.purchasePrice")}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.purchasePrice}
                    onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("productsPage.fields.batchNumber")}</Label>
                  <Input
                    required
                    value={form.batchNumber}
                    onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("productsPage.fields.warehouseLocation")}</Label>
                <Input
                  required
                  value={form.warehouseLocation}
                  onChange={(e) => setForm({ ...form, warehouseLocation: e.target.value })}
                />
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
        </div>
      </div>

      <ImportSupplierProductsDialog open={importOpen} onOpenChange={setImportOpen} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("productsPage.table.product")}</TableHead>
            <TableHead>{t("productsPage.table.company")}</TableHead>
            <TableHead>{t("productsPage.fields.category")}</TableHead>
            <TableHead>{t("common:fields.quantity")}</TableHead>
            <TableHead>{t("productsPage.table.unit")}</TableHead>
            <TableHead>{t("productsPage.table.wholesale")}</TableHead>
            <TableHead>{t("productsPage.table.selling")}</TableHead>
            <TableHead>{t("productsPage.table.purchase")}</TableHead>
            <TableHead>{t("common:fields.status")}</TableHead>
            <TableHead className="text-end">{t("common:fields.actions")}</TableHead>
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
          {!isLoading && products?.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">
                {t("productsPage.empty")}
              </TableCell>
            </TableRow>
          )}
          {products?.map((product) => (
            <TableRow key={product.id}>
              <TableCell className="font-medium">
                {product.name}
                {product.brand && <p className="text-xs text-muted-foreground">{product.brand}</p>}
              </TableCell>
              <TableCell>{product.companyName}</TableCell>
              <TableCell>{product.category}</TableCell>
              <TableCell>{product.quantityInStock}</TableCell>
              <TableCell className="text-muted-foreground">{product.unitType}</TableCell>
              <TableCell>${product.wholesalePrice.toFixed(2)}</TableCell>
              <TableCell>${product.sellingPrice.toFixed(2)}</TableCell>
              <TableCell>${product.purchasePrice.toFixed(2)}</TableCell>
              <TableCell>
                {submissions?.some(
                  (s) => s.supplierProductId === product.id && s.status === "pending",
                ) ? (
                  <Badge variant="info">{t("productsPage.statusPendingApproval")}</Badge>
                ) : (
                  <Badge variant={product.linkedProductId ? "success" : "warning"}>
                    {product.linkedProductId
                      ? t("productsPage.statusSubmitted")
                      : t("productsPage.statusNotSubmitted")}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-end">
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    disabled={product.quantityInStock <= 0}
                    onClick={() => openSubmit(product)}
                  >
                    {t("productsPage.submit")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(product)}>
                    {t("common:actions.edit")}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setDeleting(product)}>
                    {t("common:actions.delete")}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("productsPage.submissionsCard.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("productsPage.table.product")}</TableHead>
                <TableHead>{t("common:fields.quantity")}</TableHead>
                <TableHead>{t("common:fields.status")}</TableHead>
                <TableHead>{t("productsPage.submissionsCard.reason")}</TableHead>
                <TableHead>{t("common:fields.date")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!submissions || submissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t("productsPage.submissionsCard.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                submissions.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell className="font-medium">{submission.productName}</TableCell>
                    <TableCell>{submission.quantity}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[submission.status]}>
                        {t(`common:status.${submission.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {submission.rejectionReason ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {toDate(submission.createdAt)?.toLocaleDateString() ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(next) => !next && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("productsPage.editDialog.title", { name: editing?.name })}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleEditSubmit}
            className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pe-1"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>{t("common:fields.name")}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("productsPage.fields.brandOptional")}</Label>
                <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>{t("productsPage.fields.quantityInStock")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.quantityInStock}
                  onChange={(e) => setForm({ ...form, quantityInStock: Number(e.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("productsPage.fields.wholesalePrice")}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.wholesalePrice}
                  onChange={(e) => setForm({ ...form, wholesalePrice: Number(e.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("productsPage.fields.sellingPrice")}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.sellingPrice}
                  className={form.wholesalePrice > 0 && form.sellingPrice <= form.wholesalePrice ? "border-destructive focus-visible:ring-destructive" : ""}
                  onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })}
                />
                {form.wholesalePrice > 0 && form.sellingPrice <= form.wholesalePrice && (
                  <p className="text-xs text-destructive">{t("productsPage.toasts.sellingPriceTooLow")}</p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("productsPage.fields.minimumStockLevel")}</Label>
              <Input
                type="number"
                min={0}
                value={form.minimumStockLevel}
                onChange={(e) => setForm({ ...form, minimumStockLevel: Number(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("productsPage.fields.taxRate")}</Label>
              <Select
                value={form.taxRateId ?? "none"}
                onValueChange={(v) => setForm({ ...form, taxRateId: v === "none" ? null : v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("productsPage.fields.noTax")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("productsPage.fields.noTax")}</SelectItem>
                  {taxRates?.map((rate) => (
                    <SelectItem key={rate.id} value={rate.id}>
                      {rate.name} ({(rate.rate * 100).toFixed(0)}%)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t("common:actions.saving") : t("productsPage.editDialog.submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(next) => !next && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("productsPage.deleteDialog.title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("productsPage.deleteDialog.bodyPrefix")} <strong>{deleting?.name}</strong>
            {t("productsPage.deleteDialog.bodySuffix")}
          </p>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending
                ? t("common:actions.deleting")
                : t("productsPage.deleteDialog.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={submitting !== null} onOpenChange={(next) => !next && setSubmitting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("productsPage.submitDialog.title", { name: submitting?.name })}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>
                {t("productsPage.submitDialog.quantityLabel", { count: submitting?.quantityInStock ?? 0 })}
              </Label>
              <Input
                type="number"
                min={1}
                max={submitting?.quantityInStock}
                value={submitQuantity}
                onChange={(e) => setSubmitQuantity(Number(e.target.value))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={submitMutation.isPending || submitQuantity <= 0}
              onClick={() => submitMutation.mutate()}
            >
              {submitMutation.isPending
                ? t("productsPage.submitDialog.submitting")
                : t("productsPage.submitDialog.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
