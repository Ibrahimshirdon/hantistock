import PDFDocument from "pdfkit";
import type { InventoryReportRow, SalesReportRow } from "./reports.service.js";

function streamToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function drawHeader(doc: PDFKit.PDFDocument, title: string, subtitle: string) {
  doc.fontSize(18).font("Helvetica-Bold").text("Hantistock", { align: "left" });
  doc.fontSize(14).font("Helvetica-Bold").text(title);
  doc.fontSize(10).font("Helvetica").fillColor("#666666").text(subtitle);
  doc.fillColor("#000000").moveDown(1);
}

// pdfkit has no built-in table widget, so columns are laid out manually by
// fixed x-offsets - a standard, well-documented pattern for this library.
function drawTable(
  doc: PDFKit.PDFDocument,
  columns: { label: string; width: number }[],
  rows: string[][],
) {
  const startX = doc.x;
  let y = doc.y;
  const rowHeight = 18;

  function drawRow(values: string[], bold: boolean) {
    let x = startX;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    values.forEach((value, i) => {
      doc.text(value, x, y, { width: columns[i]!.width, ellipsis: true });
      x += columns[i]!.width;
    });
    y += rowHeight;
  }

  drawRow(columns.map((c) => c.label), true);
  doc
    .moveTo(startX, y - 4)
    .lineTo(startX + columns.reduce((s, c) => s + c.width, 0), y - 4)
    .strokeColor("#cccccc")
    .stroke();

  rows.forEach((row) => {
    if (y > doc.page.height - doc.page.margins.bottom - rowHeight) {
      doc.addPage();
      y = doc.y;
    }
    drawRow(row, false);
  });

  doc.y = y + 8;
}

export async function generateSalesReportPdf(
  range: { dateFrom: string; dateTo: string },
  summary: { orderCount: number; subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number },
  rows: SalesReportRow[],
): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 40 });
  drawHeader(doc, "Sales Report", `${range.dateFrom} to ${range.dateTo}`);

  doc
    .fontSize(10)
    .font("Helvetica")
    .text(
      `Orders: ${summary.orderCount}   Subtotal: $${summary.subtotal.toFixed(2)}   Discount: -$${summary.discountTotal.toFixed(2)}   Tax: $${summary.taxTotal.toFixed(2)}   Total: $${summary.grandTotal.toFixed(2)}`,
    );
  doc.moveDown(1);

  drawTable(
    doc,
    [
      { label: "Order #", width: 80 },
      { label: "Date", width: 110 },
      { label: "Customer", width: 110 },
      { label: "Items", width: 40 },
      { label: "Total", width: 70 },
      { label: "Payment", width: 80 },
    ],
    rows.map((r) => [
      r.orderNumber,
      r.date,
      r.customerName,
      String(r.itemCount),
      `$${r.grandTotal.toFixed(2)}`,
      r.paymentMethod,
    ]),
  );

  return streamToBuffer(doc);
}

export async function generateInventoryReportPdf(
  summary: { totalProducts: number; totalInventoryValue: number; lowStockCount: number },
  rows: InventoryReportRow[],
): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 40 });
  drawHeader(doc, "Inventory Report", new Date().toLocaleDateString());

  doc
    .fontSize(10)
    .font("Helvetica")
    .text(
      `Products: ${summary.totalProducts}   Inventory value: $${summary.totalInventoryValue.toFixed(2)}   Low stock items: ${summary.lowStockCount}`,
    );
  doc.moveDown(1);

  drawTable(
    doc,
    [
      { label: "SKU", width: 70 },
      { label: "Product", width: 130 },
      { label: "Category", width: 80 },
      { label: "Stock", width: 50 },
      { label: "Reorder", width: 50 },
      { label: "Value", width: 70 },
      { label: "Status", width: 50 },
    ],
    rows.map((r) => [
      r.sku,
      r.name,
      r.categoryName,
      `${r.totalStock} ${r.unit}`,
      String(r.reorderLevel),
      `$${r.stockValue.toFixed(2)}`,
      r.stockStatus.toUpperCase(),
    ]),
  );

  return streamToBuffer(doc);
}
