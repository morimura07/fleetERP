import { prisma } from "@/lib/prisma";

/** Record an audit-log entry. Failures must never break the main flow. */
export async function logActivity(params: {
  userId?: string | null;
  action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "EXPORT" | string;
  target: string;
  detail?: unknown;
  ipAddress?: string | null;
}) {
  try {
    await prisma.activityLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        target: params.target,
        detail:
          params.detail === undefined
            ? null
            : typeof params.detail === "string"
              ? params.detail
              : JSON.stringify(params.detail),
        ipAddress: params.ipAddress ?? null,
      },
    });
  } catch (e) {
    console.error("[activity] failed to log", e);
  }
}
