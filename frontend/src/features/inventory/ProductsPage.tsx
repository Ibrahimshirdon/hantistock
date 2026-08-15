import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Package, Plus, Upload } from "lucide-react";
import { ImportProductsDialog } from "./ImportProductsDialog";
import { CreateProductDialog } from "./CreateProductDialog";
import { listCategories, listProducts } from "@/api/inventory.api";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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

export function ProductsPage() {
  const { t } = useTranslation(["inventory", "common"]);
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canImport = profile?.role === "admin" || profile?.role === "manager";
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data: products, isLoading } = useQuery({
    queryKey: ["products", categoryId, lowStockOnly],
    queryFn: () =>
      listProducts({
        categoryId: categoryId === "all" ? undefined : categoryId,
        lowStock: lowStockOnly || undefined,
      }),
  });

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        p.barcode?.toLowerCase().includes(term) ||
        p.categoryName?.toLowerCase().includes(term),
    );
  }, [products, search]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("productsPage.title")}</h1>
          <p className="text-muted-foreground">{t("productsPage.subtitle")}</p>
        </div>
        {canImport && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Upload className="size-4" />
              {t("productsPage.importCsv")}
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Plus className="size-4" />
              {t("productsPage.addProduct")}
            </button>
          </div>
        )}
      </div>

      {canImport && <ImportProductsDialog open={importOpen} onOpenChange={setImportOpen} />}
      {canImport && <CreateProductDialog open={createOpen} onOpenChange={setCreateOpen} />}

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="search">{t("common:actions.search")}</Label>
          <Input
            id="search"
            placeholder={t("productsPage.searchPlaceholder")}
            className="w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("productsPage.category")}</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("productsPage.allCategories")}</SelectItem>
              {categories?.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Checkbox
            id="lowStock"
            checked={lowStockOnly}
            onCheckedChange={(checked) => setLowStockOnly(checked === true)}
          />
          <Label htmlFor="lowStock">{t("productsPage.lowStockOnly")}</Label>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead>{t("common:fields.name")}</TableHead>
            <TableHead>{t("productsPage.sku")}</TableHead>
            <TableHead>{t("productsPage.category")}</TableHead>
            <TableHead>{t("productsPage.stock")}</TableHead>
            <TableHead>{t("productsPage.unit")}</TableHead>
            <TableHead>{t("productsPage.sellingPrice")}</TableHead>
            <TableHead>{t("common:fields.status")}</TableHead>
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
          {!isLoading && filteredProducts.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                {t("productsPage.empty")}
              </TableCell>
            </TableRow>
          )}
          {filteredProducts.map((product) => (
            <TableRow
              key={product.id}
              className="cursor-pointer"
              onClick={() => navigate(`/app/inventory/products/${product.id}`)}
            >
              <TableCell>
                <div className="flex size-8 items-center justify-center overflow-hidden rounded-md border bg-muted">
                  {product.images[0] ? (
                    <img src={product.images[0]} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <Package className="size-4 text-muted-foreground/40" />
                  )}
                </div>
              </TableCell>
              <TableCell className="font-medium">{product.name}</TableCell>
              <TableCell className="text-muted-foreground">{product.sku}</TableCell>
              <TableCell>{product.categoryName}</TableCell>
              <TableCell>
                {product.totalStock}
                {product.isLowStock && (
                  <Badge variant="warning" className="ms-2">
                    {t("productsPage.lowStock")}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{product.unit}</TableCell>
              <TableCell>${product.sellingPrice.toFixed(2)}</TableCell>
              <TableCell>
                <Badge variant={product.isActive ? "success" : "secondary"}>
                  {product.isActive ? t("common:status.active") : t("common:status.inactive")}
                </Badge>
                {product.approvalStatus === "pending" && (
                  <Badge variant="warning" className="ms-2">
                    {t("productsPage.pendingApproval")}
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
