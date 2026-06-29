import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError, error } from "@/lib/api";
import { availableDrivers, availableVehicles } from "@/lib/services/dispatch";

/** GET /api/dispatch/available?start=ISO&end=ISO -> free drivers + vehicles */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("dispatch:write");
    const sp = req.nextUrl.searchParams;
    const start = new Date(sp.get("start") ?? "");
    const end = new Date(sp.get("end") ?? "");
    if (isNaN(+start) || isNaN(+end) || end <= start) {
      return error("Invalid start/end", 422);
    }
    const [drivers, vehicles] = await Promise.all([
      availableDrivers(start, end),
      availableVehicles(start, end),
    ]);
    return ok({ drivers, vehicles });
  } catch (e) {
    return handleError(e);
  }
}
