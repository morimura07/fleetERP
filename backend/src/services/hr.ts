import { Prisma, LeaveType } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { docStatus, type DocBucket } from "@backend/services/compliance";

/**
 * Human Resources (M24) — contracts, leave management, and document expiry, built
 * on top of the Employee record that Payroll (M9) already uses.
 *
 *  • Contracts — one ACTIVE contract per employee. Activating a contract ends the
 *    previous ACTIVE one and syncs the employee's current salary.
 *  • Leave — requests carry the working-day count (weekends excluded). Approving a
 *    *paid* request (ANNUAL / SICK) deducts from that year's LeaveBalance; the
 *    balance can't go negative. UNPAID / statutory leave doesn't touch a balance.
 *  • Documents — reuse the compliance `docStatus` classifier for expiry buckets.
 *
 * The pure helpers (`workingDays`, `remaining`, `leaveConsumesBalance`) are
 * unit-tested; the rest orchestrates Prisma.
 */

// Leave types that draw down an accrued balance (paid, entitlement-based).
const BALANCE_TYPES: LeaveType[] = ["ANNUAL", "SICK"];

/** Does this leave type consume an entitlement balance? */
export function leaveConsumesBalance(type: LeaveType): boolean {
  return BALANCE_TYPES.includes(type);
}

/**
 * Count working days (Mon–Fri) in the inclusive range [start, end]. Weekends are
 * excluded; public holidays are not modeled here. Pure — unit-tested.
 */
export function workingDays(start: Date, end: Date): number {
  const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  if (e < s) return 0;
  let days = 0;
  for (let t = s; t <= e; t += 86_400_000) {
    const dow = new Date(t).getUTCDay(); // 0 = Sun, 6 = Sat
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
}

/** Remaining leave days = entitled − taken, floored at 0. Pure. */
export function remaining(entitled: number, taken: number): number {
  return Math.max(0, entitled - taken);
}

// ── Contracts ───────────────────────────────────────────────────────────────

export interface ContractInput {
  dataAreaId: string;
  employeeId: string;
  type?: "PERMANENT" | "FIXED_TERM" | "PROBATION" | "CONTRACTOR";
  title: string;
  grossSalary: Prisma.Decimal.Value;
  currency?: string;
  startDate: Date;
  endDate?: Date | null;
  note?: string | null;
  createdById?: string | null;
}

export async function createContract(input: ContractInput) {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, dataAreaId: input.dataAreaId },
    select: { id: true },
  });
  if (!employee) throw new AuthError("Employee not found in this company", 404);

  const type = input.type ?? "PERMANENT";
  if ((type === "FIXED_TERM" || type === "PROBATION") && !input.endDate) {
    throw new AuthError(`${type} contracts require an end date`, 422);
  }
  if (input.endDate && input.endDate < input.startDate) {
    throw new AuthError("End date cannot be before start date", 422);
  }

  return prisma.employmentContract.create({
    data: {
      dataAreaId: input.dataAreaId,
      employeeId: input.employeeId,
      type,
      title: input.title,
      grossSalary: new Prisma.Decimal(input.grossSalary),
      currency: input.currency ?? "USD",
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      note: input.note ?? null,
      createdById: input.createdById ?? null,
    },
  });
}

/**
 * Activate a DRAFT contract: end any currently-active contract, mark this one
 * ACTIVE, and sync the employee's current salary/currency. Atomic.
 */
export async function activateContract(dataAreaId: string, contractId: string, createdById?: string | null) {
  const contract = await prisma.employmentContract.findFirst({ where: { id: contractId, dataAreaId } });
  if (!contract) throw new AuthError("Contract not found", 404);
  if (contract.status === "ENDED") throw new AuthError("Cannot activate an ended contract", 409);
  if (contract.status === "ACTIVE") return contract;

  return prisma.$transaction(async (tx) => {
    await tx.employmentContract.updateMany({
      where: { employeeId: contract.employeeId, status: "ACTIVE" },
      data: { status: "ENDED", updatedById: createdById ?? null },
    });
    const activated = await tx.employmentContract.update({
      where: { id: contract.id },
      data: { status: "ACTIVE", updatedById: createdById ?? null },
    });
    await tx.employee.update({
      where: { id: contract.employeeId },
      data: { grossSalary: contract.grossSalary, currency: contract.currency, status: "ACTIVE", updatedById: createdById ?? null },
    });
    return activated;
  });
}

/** End an ACTIVE/DRAFT contract without a successor (e.g. termination). */
export async function endContract(dataAreaId: string, contractId: string, createdById?: string | null) {
  const contract = await prisma.employmentContract.findFirst({ where: { id: contractId, dataAreaId } });
  if (!contract) throw new AuthError("Contract not found", 404);
  if (contract.status === "ENDED") return contract;
  return prisma.employmentContract.update({
    where: { id: contract.id },
    data: { status: "ENDED", updatedById: createdById ?? null },
  });
}

// ── Leave ───────────────────────────────────────────────────────────────────

export interface LeaveInput {
  dataAreaId: string;
  employeeId: string;
  type?: LeaveType;
  startDate: Date;
  endDate: Date;
  reason?: string | null;
  createdById?: string | null;
}

/** Submit a leave request. Computes the working-day count up front. */
export async function requestLeave(input: LeaveInput) {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, dataAreaId: input.dataAreaId },
    select: { id: true },
  });
  if (!employee) throw new AuthError("Employee not found in this company", 404);
  if (input.endDate < input.startDate) throw new AuthError("End date cannot be before start date", 422);

  const days = workingDays(input.startDate, input.endDate);
  if (days <= 0) throw new AuthError("Leave must span at least one working day", 422);

  return prisma.leaveRequest.create({
    data: {
      dataAreaId: input.dataAreaId,
      employeeId: input.employeeId,
      type: input.type ?? "ANNUAL",
      startDate: input.startDate,
      endDate: input.endDate,
      days,
      reason: input.reason ?? null,
      createdById: input.createdById ?? null,
    },
  });
}

/**
 * Approve or reject a PENDING leave request. On approval of a balance-bearing
 * type, deduct the days from that leave-year's balance (created on demand); the
 * balance cannot go negative. Long approved leave flips the employee to ON_LEAVE.
 */
export async function reviewLeave(dataAreaId: string, leaveId: string, approve: boolean, reviewerId?: string | null) {
  const leave = await prisma.leaveRequest.findFirst({ where: { id: leaveId, dataAreaId } });
  if (!leave) throw new AuthError("Leave request not found", 404);
  if (leave.status !== "PENDING") throw new AuthError(`Cannot review a ${leave.status} request`, 409);

  if (!approve) {
    return prisma.leaveRequest.update({
      where: { id: leave.id },
      data: { status: "REJECTED", reviewedById: reviewerId ?? null, reviewedAt: new Date() },
    });
  }

  return prisma.$transaction(async (tx) => {
    if (leaveConsumesBalance(leave.type)) {
      const year = leave.startDate.getUTCFullYear();
      const balance = await tx.leaveBalance.upsert({
        where: { employeeId_type_year: { employeeId: leave.employeeId, type: leave.type, year } },
        update: {},
        create: { dataAreaId, employeeId: leave.employeeId, type: leave.type, year, entitled: 0, taken: 0 },
      });
      if (remaining(balance.entitled, balance.taken) < leave.days) {
        throw new AuthError(
          `Insufficient ${leave.type} balance: ${remaining(balance.entitled, balance.taken)} day(s) left, ${leave.days} requested`,
          422,
        );
      }
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { taken: balance.taken + leave.days, updatedById: reviewerId ?? null },
      });
    }

    const approved = await tx.leaveRequest.update({
      where: { id: leave.id },
      data: { status: "APPROVED", reviewedById: reviewerId ?? null, reviewedAt: new Date() },
    });

    // A week or more of approved leave marks the employee ON_LEAVE.
    if (leave.days >= 5) {
      await tx.employee.update({ where: { id: leave.employeeId }, data: { status: "ON_LEAVE" } });
    }
    return approved;
  });
}

/** Cancel a request (by the employee/HR); refunds the balance if it was approved. */
export async function cancelLeave(dataAreaId: string, leaveId: string, userId?: string | null) {
  const leave = await prisma.leaveRequest.findFirst({ where: { id: leaveId, dataAreaId } });
  if (!leave) throw new AuthError("Leave request not found", 404);
  if (leave.status === "CANCELLED" || leave.status === "REJECTED") return leave;

  return prisma.$transaction(async (tx) => {
    if (leave.status === "APPROVED" && leaveConsumesBalance(leave.type)) {
      const year = leave.startDate.getUTCFullYear();
      const balance = await tx.leaveBalance.findUnique({
        where: { employeeId_type_year: { employeeId: leave.employeeId, type: leave.type, year } },
      });
      if (balance) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { taken: Math.max(0, balance.taken - leave.days), updatedById: userId ?? null },
        });
      }
    }
    return tx.leaveRequest.update({
      where: { id: leave.id },
      data: { status: "CANCELLED", updatedById: userId ?? null },
    });
  });
}

/** Set (or grant) the yearly entitlement for a leave type. */
export async function setEntitlement(
  dataAreaId: string,
  employeeId: string,
  type: LeaveType,
  year: number,
  entitled: number,
  userId?: string | null,
) {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, dataAreaId }, select: { id: true } });
  if (!employee) throw new AuthError("Employee not found in this company", 404);
  if (entitled < 0) throw new AuthError("Entitlement cannot be negative", 422);

  return prisma.leaveBalance.upsert({
    where: { employeeId_type_year: { employeeId, type, year } },
    update: { entitled, updatedById: userId ?? null },
    create: { dataAreaId, employeeId, type, year, entitled, taken: 0, createdById: userId ?? null },
  });
}

// ── Documents ───────────────────────────────────────────────────────────────

export interface DocInput {
  dataAreaId: string;
  employeeId: string;
  type: "CONTRACT" | "NATIONAL_ID" | "PASSPORT" | "WORK_PERMIT" | "CERTIFICATE" | "OTHER";
  number?: string | null;
  issuedAt?: Date | null;
  expiresAt?: Date | null;
  fileUrl?: string | null;
  note?: string | null;
  createdById?: string | null;
}

/** Upsert an employee document (one row per type). */
export async function upsertDocument(input: DocInput) {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, dataAreaId: input.dataAreaId },
    select: { id: true },
  });
  if (!employee) throw new AuthError("Employee not found in this company", 404);

  return prisma.employeeDocument.upsert({
    where: { employeeId_type: { employeeId: input.employeeId, type: input.type } },
    update: {
      number: input.number ?? null,
      issuedAt: input.issuedAt ?? null,
      expiresAt: input.expiresAt ?? null,
      fileUrl: input.fileUrl ?? null,
      note: input.note ?? null,
      updatedById: input.createdById ?? null,
    },
    create: {
      dataAreaId: input.dataAreaId,
      employeeId: input.employeeId,
      type: input.type,
      number: input.number ?? null,
      issuedAt: input.issuedAt ?? null,
      expiresAt: input.expiresAt ?? null,
      fileUrl: input.fileUrl ?? null,
      note: input.note ?? null,
      createdById: input.createdById ?? null,
    },
  });
}

export interface ExpiringDoc {
  employeeId: string;
  employeeName: string;
  type: string;
  number: string | null;
  expiresAt: string | null;
  status: DocBucket | "MISSING";
}

/**
 * Employee documents that need attention (expiring within the window or expired).
 * Reuses the shared compliance `docStatus` classifier for consistency.
 */
export async function expiringDocuments(dataAreaId: string, warningDays = 14): Promise<ExpiringDoc[]> {
  const docs = await prisma.employeeDocument.findMany({
    where: { dataAreaId, expiresAt: { not: null } },
    include: { employee: { select: { name: true } } },
    orderBy: { expiresAt: "asc" },
  });
  return docs
    .map((d) => ({
      employeeId: d.employeeId,
      employeeName: d.employee.name,
      type: d.type,
      number: d.number,
      expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
      status: docStatus(d.expiresAt, new Date(), warningDays),
    }))
    .filter((d) => d.status === "EXPIRING_SOON" || d.status === "EXPIRED");
}
