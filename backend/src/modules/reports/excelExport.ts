import ExcelJS from "exceljs";
import type { InventoryReportRow, SalesReportRow } from "./reports.service.js";

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  });
}

export async function generateSalesReportExcel(
  range: { dateFrom: string; dateTo: string },
  summary: { orderCount: number; subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number },
  rows: SalesReportRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.addRow(["Hantistock - Sales Report"]);
  summarySheet.addRow([`${range.dateFrom} to ${range.dateTo}`]);
  summarySheet.addRow([]);
  summarySheet.addRow(["Orders", summary.orderCount]);
  summarySheet.addRow(["Subtotal", summary.subtotal]);
  summarySheet.addRow(["Discount", -summary.discountTotal]);
  summarySheet.addRow(["Tax", summary.taxTotal]);
  summarySheet.addRow(["Grand total", summary.grandTotal]);
  summarySheet.getColumn(1).width = 20;

  const ordersSheet = workbook.addWorksheet("Orders");
  ordersSheet.columns = [
    { header: "Order #", key: "orderNumber", width: 14 },
    { header: "Date", key: "date", width: 22 },
    { header: "Customer", key: "customerName", width: 22 },
    { header: "Items", key: "itemCount", width: 8 },
    { header: "Subtotal", key: "subtotal", width: 12 },
    { header: "Discount", key: "discountTotal", width: 12 },
    { header: "Tax", key: "taxTotal", width: 12 },
    { header: "Total", key: "grandTotal", width: 12 },
    { header: "Payment", key: "paymentMethod", width: 14 },
  ];
  styleHeaderRow(ordersSheet.getRow(1));
  rows.forEach((r) => ordersSheet.addRow(r));

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function generateInventoryReportExcel(
  summary: { totalProducts: number; totalInventoryValue: number; lowStockCount: number },
  rows: InventoryReportRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.addRow(["Hantistock - Inventory Report"]);
  summarySheet.addRow([new Date().toLocaleDateString()]);
  summarySheet.addRow([]);
  summarySheet.addRow(["Total products", summary.totalProducts]);
  summarySheet.addRow(["Inventory value", summary.totalInventoryValue]);
  summarySheet.addRow(["Low stock items", summary.lowStockCount]);
  summarySheet.getColumn(1).width = 20;

  const productsSheet = workbook.addWorksheet("Products");
  productsSheet.columns = [
    { header: "SKU", key: "sku", width: 14 },
    { header: "Product", key: "name", width: 26 },
    { header: "Category", key: "categoryName", width: 16 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Stock", key: "totalStock", width: 10 },
    { header: "Reorder level", key: "reorderLevel", width: 12 },
    { header: "Cost price", key: "costPrice", width: 12 },
    { header: "Selling price", key: "sellingPrice", width: 12 },
    { header: "Stock value", key: "stockValue", width: 12 },
    { header: "Status", key: "stockStatus", width: 10 },
  ];
  styleHeaderRow(productsSheet.getRow(1));
  rows.forEach((r) =>
    productsSheet.addRow({ ...r, stockStatus: r.stockStatus.toUpperCase() }),
  );

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
