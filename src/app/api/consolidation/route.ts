import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { ok, created, handleError } from "@/lib/api";
import { consolidationMapSchema } from "@/lib/validations";
import { runConsolidation } from "@/lib/services/consolidation";
import { logActivity } from "@/lib/activity";
import { RateType } from "@prisma/client";

/** GET — run a consolidation report; also returns the mapping table. */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("consolidation:read");
    const sp = req.nextUrl.searchParams;
    const parentArea = sp.get("parentArea") ?? "HQ01";
    const baseCurrency = sp.get("baseCurrency") ?? "USD";
    const rt = sp.get("rateType");
    const rateType = (rt && rt in RateType ? rt : "AVERAGE") as RateType;
    const asOf = sp.get("asOf") ? new Date(sp.get("asOf") as string) : undefined;

    const [result, maps] = await Promise.all([
      runConsolidation({ parentArea, baseCurrency, rateType, asOf }),
      prisma.consolidationMap.findMany({ where: { parentArea }, orderBy: [{ subsidiary: "asc" }, { subAccount: "asc" }] }),
    ]);
    return ok({ result, maps });
  } catch (e) {
    return handleError(e);
  }
}

/** POST — add a subsidiary→parent account mapping row. */
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("consolidation:run");
    const body = consolidationMapSchema.parse(await req.json());
    const map = await prisma.consolidationMap.create({
      data: {
        parentArea: body.parentArea,
        subsidiary: body.subsidiary,
        subAccount: body.subAccount,
        parentAccount: body.parentAccount,
      },
    });
    await logActivity({ userId: user.id, action: "CREATE", target: `ConsolidationMap:${map.id}` });
    return created(map);
  } catch (e) {
    return handleError(e);
  }
}
