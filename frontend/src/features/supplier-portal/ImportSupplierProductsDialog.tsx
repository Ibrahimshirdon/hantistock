import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Upload, Download, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  importSupplierProducts,
  listSupplierCompanies,
  type ImportSupplierProductResult,
  type ImportSupplierProductRow,
} from "@/api/supplier.api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TEMPLATE_HEADERS = [
  "name",
  "category",
  "brand",
  "unitType",
  "quantityInStock",
  "wholesalePrice",
  "sellingPrice",
  "minimumStockLevel",
  "purchasePrice",
  "batchNumber",
  "warehouseLocation",
  "expiryDate",
];

function quoteCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

function downloadTemplate() {
  const examples = [
    ["Mineral Water 500ml", "Drinks", "AquaPure", "pcs", "200", "0.40", "0.60", "20", "0.35", "BATCH-001", "Warehouse A", ""],
    ["Sunflower Oil 1L", "Grains & Cereals", "", "pcs", "100", "1.00", "1.30", "15", "0.90", "BATCH-002", "Warehouse A", ""],
  ];
  const csvRows = [TEMPLATE_HEADERS.join(","), ...examples.map((r) => r.map(quoteCsv).join(","))];
  const blob = new Blob(["﻿" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "supplier_products_import_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    rows.push(fields);
  }
  return rows;
}

function csvToRows(rawRows: string[][]): ImportSupplierProductRow[] {
  const [header, ...dataRows] = rawRows;
  if (!header) return [];
  const idx = (col: string) => header.findIndex((h) => h.toLowerCase().trim() === col.toLowerCase());
  const iName = idx("name");
  const iCategory = idx("category");
  const iBrand = idx("brand");
  const iUnit = idx("unitType");
  const iQty = idx("quantityInStock");
  const iWholesale = idx("wholesalePrice");
  const iSelling = idx("sellingPrice");
  const iMinStock = idx("minimumStockLevel");
  const iPurchase = idx("purchasePrice");
  const iBatch = idx("batchNumber");
  const iWarehouse = idx("warehouseLocation");
  const iExpiry = idx("expiryDate");

  return dataRows.map((cols) => ({
    name: cols[iName] ?? "",
    category: cols[iCategory] ?? "",
    brand: cols[iBrand]?.trim() || undefined,
    unitType: cols[iUnit] || "pcs",
    quantityInStock: parseFloat(cols[iQty] ?? "0") || 0,
    wholesalePrice: parseFloat(cols[iWholesale] ?? "0") || 0,
    sellingPrice: parseFloat(cols[iSelling] ?? "0") || 0,
    minimumStockLevel: parseFloat(cols[iMinStock] ?? "0") || 0,
    purchasePrice: parseFloat(cols[iPurchase] ?? "0") || 0,
    batchNumber: cols[iBatch] ?? "",
    warehouseLocation: cols[iWarehouse] ?? "",
    expiryDate: cols[iExpiry]?.trim() || undefined,
  }));
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ImportSupplierProductsDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation(["supplierPortal", "common"]);
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [companyId, setCompanyId] = useState("");
  const [rows, setRows] = useState<ImportSupplierProductRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportSupplierProductResult | null>(null);

  const { data: companies } = useQuery({
    queryKey: ["supplierCompanies", "mine"],
    queryFn: () => listSupplierCompanies(),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () => importSupplierProducts(companyId, rows),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["supplierProducts"] });
    },
  });

  function handleFile(file: File) {
    setParseError(null);
    setResult(null);
    setRows([]);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const bomPattern = new RegExp("^\u{FEFF}", "u");
        const text = (e.target?.result as string).replace(bomPattern, "");
        const raw = parseCsv(text);
        if (raw.length < 2) {
          setParseError(t("importDialog.errorEmpty"));
          return;
        }
        setRows(csvToRows(raw));
      } catch {
        setParseError(t("importDialog.errorParse"));
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function reset() {
    setCompanyId("");
    setRows([]);
    setParseError(null);
    setResult(null);
    mutation.reset();
    if (fileRef.current) fileRef.current.value = "";
  }

  const preview = rows.slice(0, 5);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("importDialog.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>{t("productsPage.fields.company")}</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
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

          <Button variant="outline" size="sm" className="self-start" onClick={downloadTemplate}>
            <Download className="me-1.5 size-4" />
            {t("importDialog.downloadTemplate")}
          </Button>

          {!result && (
            <div
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/20"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {rows.length > 0
                  ? t("importDialog.fileLoaded", { count: rows.length })
                  : t("importDialog.dropzone")}
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </div>
          )}

          {parseError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {parseError}
            </div>
          )}

          {preview.length > 0 && !result && (
            <div className="overflow-x-auto">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                {t("importDialog.preview", { count: Math.min(rows.length, 5) })}
                {rows.length > 5 && ` (${t("importDialog.andMore", { count: rows.length - 5 })})`}
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common:fields.name")}</TableHead>
                    <TableHead>{t("productsPage.fields.category")}</TableHead>
                    <TableHead>{t("productsPage.fields.quantityInStock")}</TableHead>
                    <TableHead>{t("productsPage.fields.wholesalePrice")}</TableHead>
                    <TableHead>{t("productsPage.fields.sellingPrice")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.category}</TableCell>
                      <TableCell>{row.quantityInStock}</TableCell>
                      <TableCell>${row.wholesalePrice.toFixed(2)}</TableCell>
                      <TableCell>${row.sellingPrice.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {result && (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" />
                {t("importDialog.resultCreated", { count: result.created })}
              </div>
              {result.errors.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-destructive">
                    {t("importDialog.resultErrors", { count: result.errors.length })}
                  </p>
                  <ul className="max-h-32 overflow-y-auto text-xs text-muted-foreground">
                    {result.errors.map((e) => (
                      <li key={e.row}>{t("importDialog.errorRow", { row: e.row, message: e.message })}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            {result ? (
              <>
                <Button variant="outline" onClick={reset}>
                  {t("importDialog.importMore")}
                </Button>
                <Button
                  onClick={() => {
                    reset();
                    onOpenChange(false);
                  }}
                >
                  {t("common:actions.close")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    reset();
                    onOpenChange(false);
                  }}
                >
                  {t("common:actions.cancel")}
                </Button>
                <Button
                  disabled={rows.length === 0 || !companyId || mutation.isPending}
                  onClick={() => mutation.mutate()}
                >
                  <Upload className="me-1.5 size-4" />
                  {mutation.isPending
                    ? t("importDialog.importing")
                    : t("importDialog.import", { count: rows.length })}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
