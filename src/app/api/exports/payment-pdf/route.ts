import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth-guard";
import { handleError } from "@/lib/api";
import { computeMonthlyPayments } from "@/lib/services/payment";
import { monthlyPaymentPdf } from "@/lib/services/pdf";
import { logActivity } from "@/lib/activity";

/** Monthly payments PDF. GET ?year=&month= */
export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission("export:run");
    const sp = req.nextUrl.searchParams;
    const now = new Date();
    const year = Number(sp.get("year") ?? now.getFullYear());
    const month = Number(sp.get("month") ?? now.getMonth() + 1);

    const rows = await computeMonthlyPayments(year, month);
    const pdf = await monthlyPaymentPdf(year, month, rows);

    await logActivity({ userId: user.id, action: "EXPORT", target: `Payment:pdf:${year}-${month}` });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="payments-${year}-${month}.pdf"`,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
