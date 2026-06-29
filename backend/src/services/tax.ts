import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";

/**
 * Tax module (M10) — VAT & WHT return preparation.
 *
 * Reads tax already captured on POSTED invoices within a filing period:
 *   - Output VAT  = Σ CustomerInvoice.vatAmount   (VAT we charged customers)
 *   - Input VAT   = Σ VendorInvoice.vatAmount      (VAT we paid suppliers, recoverable)
 *   - Net VAT     = Output − Input  (>0 payable to authority, <0 reclaimable)
 *   - WHT payable = Σ VendorInvoice.whtAmount      (tax withheld from suppliers, owed to authority)
 *
 * Country tax component reference (PRD M10) is static metadata for the return.
 */

// Static reference table — tax component codes per country (PRD M10).
export interface TaxComponent {
  code: string;
  country: string;
  name: string;
  rate: number; // percentage
  kind: "VAT" | "WHT";
}

export const TAX_COMPONENTS: TaxComponent[] = [
  { code: "TZ-VAT-18", country: "Tanzania", name: "VAT", rate: 18, kind: "VAT" },
  { code: "KE-VAT-16", country: "Kenya", name: "VAT", rate: 16, kind: "VAT" },
  { code: "UG-VAT-18", country: "Uganda", name: "VAT", rate: 18, kind: "VAT" },
  { code: "RW-VAT-18", country: "Rwanda", name: "VAT", rate: 18, kind: "VAT" },
  { code: "ZM-VAT-16", country: "Zambia", name: "VAT", rate: 16, kind: "VAT" },
  { code: "TZ-WHT-05", country: "Tanzania", name: "Withholding Tax", rate: 5, kind: "WHT" },
  { code: "KE-WHT-05", country: "Kenya", name: "Withholding Tax", rate: 5, kind: "WHT" },
];

export interface TaxReturn {
  year: number;
  month: number;
  currency: string;
  outputVat: string; // VAT charged to customers
  inputVat: string; // VAT paid to vendors (recoverable)
  netVat: string; // output − input
  netVatLabel: "Payable" | "Reclaimable" | "Nil";
  whtPayable: string; // withholding tax owed to the authority
  customerInvoiceCount: number;
  vendorInvoiceCount: number;
  taxableSales: string; // Σ customer subtotal
  taxablePurchases: string; // Σ vendor subtotal
}

const D = (v: Prisma.Decimal.Value | null | undefined) => new Prisma.Decimal(v ?? 0);

/**
 * Compute the VAT/WHT return for a filing period (month). Only POSTED, non-
 * cancelled invoices whose invoiceDate falls in the month are included.
 */
export async function computeTaxReturn(
  year: number,
  month: number,
  dataAreaId = "HQ01",
): Promise<TaxReturn> {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const dateFilter = { gte: start, lt: end };
  const postedStatuses = ["POSTED", "PARTIALLY_PAID", "PAID"] as const;

  const [customer, vendor] = await Promise.all([
    prisma.customerInvoice.findMany({
      where: { dataAreaId, status: { in: [...postedStatuses] }, invoiceDate: dateFilter },
      select: { subtotal: true, vatAmount: true, currency: true },
    }),
    prisma.vendorInvoice.findMany({
      where: { dataAreaId, status: { in: [...postedStatuses] }, invoiceDate: dateFilter },
      select: { subtotal: true, vatAmount: true, whtAmount: true, currency: true },
    }),
  ]);

  let outputVat = new Prisma.Decimal(0);
  let taxableSales = new Prisma.Decimal(0);
  for (const c of customer) {
    outputVat = outputVat.plus(D(c.vatAmount));
    taxableSales = taxableSales.plus(D(c.subtotal));
  }

  let inputVat = new Prisma.Decimal(0);
  let whtPayable = new Prisma.Decimal(0);
  let taxablePurchases = new Prisma.Decimal(0);
  for (const v of vendor) {
    inputVat = inputVat.plus(D(v.vatAmount));
    whtPayable = whtPayable.plus(D(v.whtAmount));
    taxablePurchases = taxablePurchases.plus(D(v.subtotal));
  }

  const netVat = outputVat.minus(inputVat);
  const netVatLabel = netVat.greaterThan(0)
    ? "Payable"
    : netVat.lessThan(0)
      ? "Reclaimable"
      : "Nil";

  // Currency: assume a single base currency per entity for the return.
  const currency = customer[0]?.currency ?? vendor[0]?.currency ?? "USD";

  return {
    year,
    month,
    currency,
    outputVat: outputVat.toFixed(2),
    inputVat: inputVat.toFixed(2),
    netVat: netVat.toFixed(2),
    netVatLabel,
    whtPayable: whtPayable.toFixed(2),
    customerInvoiceCount: customer.length,
    vendorInvoiceCount: vendor.length,
    taxableSales: taxableSales.toFixed(2),
    taxablePurchases: taxablePurchases.toFixed(2),
  };
}
