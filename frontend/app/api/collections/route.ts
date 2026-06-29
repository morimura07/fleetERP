import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError } from "@/lib/api";
import { computeAgingReport } from "@/lib/services/collections";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("collection:read");
    const sp = req.nextUrl.searchParams;
    const asOfParam = sp.get("asOf");
    const asOf = asOfParam ? new Date(asOfParam) : new Date();
    const report = await computeAgingReport(asOf);
    return ok(report);
  } catch (e) {
    return handleError(e);
  }
}
