import PDFDocument from "pdfkit";

/**
 * Render a PDFKit document to a Buffer.
 *
 * NOTE on Japanese fonts: PDFKit's built-in fonts (Helvetica) do not contain
 * CJK glyphs. For production, place a TTF such as NotoSansJP at
 * `public/fonts/NotoSansJP-Regular.ttf` and it will be registered automatically.
 * Without it, the documents still render but Japanese text shows as blanks.
 */
import { existsSync } from "fs";
import path from "path";

const JP_FONT = path.join(process.cwd(), "public/fonts/NotoSansJP-Regular.ttf");

function newDoc(): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  if (existsSync(JP_FONT)) {
    doc.registerFont("jp", JP_FONT);
    doc.font("jp");
  }
  return doc;
}

function render(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function table(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  colWidths: number[],
) {
  const startX = doc.x;
  let y = doc.y;
  const rowH = 22;

  const drawRow = (cells: string[], bold = false) => {
    let x = startX;
    doc.fontSize(9);
    if (bold) doc.rect(x, y, colWidths.reduce((a, b) => a + b, 0), rowH).fill("#f1f5f9");
    doc.fillColor("#000");
    cells.forEach((cell, i) => {
      doc.text(cell, x + 4, y + 6, { width: colWidths[i] - 8, height: rowH, ellipsis: true });
      x += colWidths[i];
    });
    doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowH).stroke("#cbd5e1");
    y += rowH;
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = doc.y;
    }
  };

  drawRow(headers, true);
  rows.forEach((r) => drawRow(r));
  doc.y = y + 10;
}

// ───────── Dispatch sheet ─────────
export async function dispatchSheetPdf(
  date: string,
  rows: {
    jobCode: string;
    client: string;
    pickup: string;
    delivery: string;
    driver: string;
    vehicle: string;
    time: string;
  }[],
): Promise<Buffer> {
  const doc = newDoc();
  doc.fontSize(18).text(`Dispatch Sheet`, { align: "center" });
  doc.fontSize(11).text(`Date: ${date}`, { align: "center" });
  doc.moveDown();
  table(
    doc,
    ["Job", "Client", "Pickup", "Delivery", "Driver", "Vehicle", "Time"],
    rows.map((r) => [r.jobCode, r.client, r.pickup, r.delivery, r.driver, r.vehicle, r.time]),
    [60, 70, 80, 80, 70, 60, 75],
  );
  doc.fontSize(8).fillColor("#64748b").text(`Generated: ${new Date().toLocaleString("en-US")}`);
  return render(doc);
}

// ───────── Daily report ─────────
export async function dailyReportPdf(report: {
  driver: string;
  jobCode: string;
  client: string;
  deliveryAddress: string;
  workStart: string;
  workEnd: string;
  mileage: number;
  note: string;
}): Promise<Buffer> {
  const doc = newDoc();
  doc.fontSize(18).text("Daily Report", { align: "center" });
  doc.moveDown();
  const lines: [string, string][] = [
    ["Driver", report.driver],
    ["Job Code", report.jobCode],
    ["Client", report.client],
    ["Delivery", report.deliveryAddress],
    ["Work Start", report.workStart],
    ["Work End", report.workEnd],
    ["Distance", `${report.mileage} km`],
    ["Note", report.note || "—"],
  ];
  doc.fontSize(11);
  for (const [k, v] of lines) {
    doc.text(`${k}： ${v}`);
    doc.moveDown(0.4);
  }
  return render(doc);
}

// ───────── Monthly payment list ─────────
export async function monthlyPaymentPdf(
  year: number,
  month: number,
  rows: { driverName: string; jobCount: number; totalAmount: number }[],
): Promise<Buffer> {
  const doc = newDoc();
  doc.fontSize(18).text("Monthly Payments", { align: "center" });
  doc.fontSize(11).text(`${year}-${month}`, { align: "center" });
  doc.moveDown();
  const total = rows.reduce((s, r) => s + r.totalAmount, 0);
  table(
    doc,
    ["Driver", "Jobs", "Total"],
    rows.map((r) => [r.driverName, String(r.jobCount), r.totalAmount.toLocaleString()]),
    [220, 100, 195],
  );
  doc.fontSize(12).text(`Total: ${total.toLocaleString()}`, { align: "right" });
  return render(doc);
}
