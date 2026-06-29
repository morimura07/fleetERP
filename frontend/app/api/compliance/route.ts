import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError } from "@/lib/api";
import { complianceReport } from "@/lib/services/compliance";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("compliance:read");
    const sp = req.nextUrl.searchParams;
    const warningDays = Number(sp.get("warningDays")) || 14;
    const onlyAttention = sp.get("onlyAttention") === "1";
    const report = await complianceReport({ warningDays, onlyAttention });
    return ok(report);
  } catch (e) {
    return handleError(e);
  }
}
