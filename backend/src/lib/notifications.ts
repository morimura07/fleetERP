import { prisma } from "@backend/prisma";
import type { NotificationType } from "@prisma/client";

export async function notify(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}) {
  try {
    await prisma.notification.create({ data: params });
  } catch (e) {
    console.error("[notify] failed", e);
  }
}

/** Notify the user account behind a driver, if one exists. */
export async function notifyDriver(
  driverId: string,
  payload: { type: NotificationType; title: string; body: string; link?: string },
) {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { userId: true },
  });
  if (driver?.userId) {
    await notify({ userId: driver.userId, ...payload });
  }
}
