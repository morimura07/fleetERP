import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError } from "@/lib/api";
import { computeTaxReturn, TAX_COMPONENTS } from "@/lib/services/tax";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("tax:read");
    const sp = req.nextUrl.searchParams;
    const now = new Date();
    const year = Number(sp.get("year")) || now.getFullYear();
    const month = Number(sp.get("month")) || now.getMonth() + 1;
    const ret = await computeTaxReturn(year, month);
    return ok({ return: ret, components: TAX_COMPONENTS });
  } catch (e) {
    return handleError(e);
  }
}
