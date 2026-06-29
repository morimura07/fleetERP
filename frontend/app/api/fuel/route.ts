import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth-guard";
import { ok, handleError } from "@/lib/api";
import { vehicleFuelStats } from "@/lib/services/fuel";

export async function GET(_req: NextRequest) {
  try {
    await requirePermission("compliance:read");
    const stats = await vehicleFuelStats();
    return ok(stats);
  } catch (e) {
    return handleError(e);
  }
}
