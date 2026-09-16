import { Hono } from "hono";
import { Prisma } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import {
  consolidationMapSchema, consolidationMapUpdateSchema, consolidationEntitySchema, consolidationRunSchema, consolidationPeriod, paginationSchema,
} from "@backend/lib/validations";
import { createRun, computeRun, getRun, postRun, deleteRun, testMapping, updateMap } from "@backend/services/consolidation";
import { logActivity } from "@backend/lib/activity";
import { requireAuth, requirePermission } from "@backend/lib/auth";
import { ok, created, pageMeta } from "@backend/lib/http";
import { canReachArea } from "@backend/lib/scope";
import { requireVersion, updateWithVersion } from "@backend/lib/concurrency";
import { AuthError } from "@backend/lib/errors";
import { exportIfRequested } from "@backend/lib/export-http";
import type { ExportSpec } from "@backend/services/export";
import type { ConsolidationRunLine } from "@prisma/client";
import type { AuthUser } from "@backend/lib/auth";

export const consolidation = new Hono();

/**
 * The consolidating entity a request is about. It arrives as a parameter,
 * so it is checked against what the caller may reach: without this any
 * holder of consolidation:read could name another group's parent and read
 * its consolidated financials.
 */
function parentFor(user: AuthUser, requested?: string | null): string {
  const area = requested || user.dataAreaId;
  if (!canReachArea(user, area)) throw new AuthError("Not found", 404);
  return area;
}

async function assertSubsidiaryReachable(user: AuthUser, subsidiary: string) {
  const exists = await prisma.company.findUnique({ where: { code: subsidiary }, select: { code: true } });
  if (!exists || !canReachArea(user, subsidiary)) throw new AuthError(`Unknown entity: ${subsidiary}`, 404);
}

// ── Lookups ──────────────────────────────────────────────────────────────────

/** The entities the caller may consolidate, with their currency and chart. */
consolidation.get("/entities/available", requireAuth, requirePermission("consolidation:read"), async (c) => {
  const parentArea = parentFor(c.get("user"), c.req.query("parentArea"));
  const user = c.get("user");
  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: { code: true, name: true, baseCurrency: true, country: true },
    orderBy: { code: "asc" },
  });
  const reachable = companies.filter((co) => canReachArea(user, co.code));
  const accounts = await prisma.account.findMany({
    where: { dataAreaId: { in: reachable.map((co) => co.code) }, isActive: true },
    select: { dataAreaId: true, code: true, name: true, type: true },
    orderBy: [{ dataAreaId: "asc" }, { code: "asc" }],
  });
  return ok(c, { parentArea, companies: reachable, accounts });
});

// ── Subsidiaries (ownership share, CTA account) ──────────────────────────────

consolidation.get("/entities", requireAuth, requirePermission("consolidation:read"), async (c) => {
  const parentArea = parentFor(c.get("user"), c.req.query("parentArea"));
  const rows = await prisma.consolidationEntity.findMany({ where: { parentArea }, orderBy: { subsidiary: "asc" } });
  return ok(c, rows);
});

/** Add or update a subsidiary's share and CTA account. */
consolidation.put("/entities", requireAuth, requirePermission("consolidation:run"), async (c) => {
  const user = c.get("user");
  const body = consolidationEntitySchema.parse(await c.req.json());
  const parentArea = parentFor(c.get("user"), body.parentArea);
  if (body.subsidiary === parentArea) throw new AuthError("The parent cannot be its own subsidiary", 422);
  await assertSubsidiaryReachable(c.get("user"), body.subsidiary);
  const row = await prisma.consolidationEntity.upsert({
    where: { parentArea_subsidiary: { parentArea, subsidiary: body.subsidiary } },
    update: { sharePct: body.sharePct, ctaAccount: body.ctaAccount, isActive: body.isActive, updatedById: user.id, version: { increment: 1 } },
    create: { parentArea, subsidiary: body.subsidiary, sharePct: body.sharePct, ctaAccount: body.ctaAccount, isActive: body.isActive, createdById: user.id },
  });
  await logActivity({ userId: user.id, action: "UPSERT", target: `ConsolidationEntity:${row.id}`, detail: { subsidiary: row.subsidiary, sharePct: row.sharePct } });
  return ok(c, row);
});

consolidation.delete("/entities/:id", requireAuth, requirePermission("consolidation:run"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const row = await prisma.consolidationEntity.findUnique({ where: { id }, select: { parentArea: true } });
  if (!row) throw new AuthError("Not found", 404);
  parentFor(c.get("user"), row.parentArea);
  await prisma.consolidationEntity.delete({ where: { id } });
  await logActivity({ userId: user.id, action: "DELETE", target: `ConsolidationEntity:${id}` });
  return ok(c, { ok: true });
});

// ── Mapping ──────────────────────────────────────────────────────────────────

/** Mapping rows with both account names, for the mapping table. */
consolidation.get("/maps", requireAuth, requirePermission("consolidation:read"), async (c) => {
  const parentArea = parentFor(c.get("user"), c.req.query("parentArea"));
  const maps = await prisma.consolidationMap.findMany({ where: { parentArea }, orderBy: [{ subsidiary: "asc" }, { subAccount: "asc" }] });
  const codes = [...new Set([parentArea, ...maps.map((m) => m.subsidiary)])];
  const accounts = await prisma.account.findMany({ where: { dataAreaId: { in: codes } }, select: { dataAreaId: true, code: true, name: true, type: true } });
  const name = new Map(accounts.map((a) => [`${a.dataAreaId}:${a.code}`, a]));
  return ok(c, maps.map((m) => ({
    ...m,
    subAccountName: name.get(`${m.subsidiary}:${m.subAccount}`)?.name ?? null,
    accountType: name.get(`${m.subsidiary}:${m.subAccount}`)?.type ?? null,
    parentAccountName: name.get(`${parentArea}:${m.parentAccount}`)?.name ?? null,
  })));
});

consolidation.post("/maps", requireAuth, requirePermission("consolidation:run"), async (c) => {
  const user = c.get("user");
  const body = consolidationMapSchema.parse(await c.req.json());
  const parentArea = parentFor(c.get("user"), body.parentArea);
  await assertSubsidiaryReachable(c.get("user"), body.subsidiary);
  const clash = await prisma.consolidationMap.findUnique({ where: { parentArea_subsidiary_subAccount: { parentArea, subsidiary: body.subsidiary, subAccount: body.subAccount } } });
  if (clash) throw new AuthError(`${body.subsidiary} ${body.subAccount} is already mapped`, 409);
  const map = await prisma.consolidationMap.create({
    data: {
      parentArea, subsidiary: body.subsidiary, subAccount: body.subAccount, parentAccount: body.parentAccount,
      rateType: body.rateType ?? null, intercompany: body.intercompany, icPartner: body.icPartner || null, note: body.note || null, createdById: user.id,
    },
  });
  await logActivity({ userId: user.id, action: "CREATE", target: `ConsolidationMap:${map.id}` });
  return created(c, map);
});

consolidation.patch("/maps/:id", requireAuth, requirePermission("consolidation:run"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.consolidationMap.findUnique({ where: { id }, select: { parentArea: true } });
  if (!existing) throw new AuthError("Not found", 404);
  parentFor(c.get("user"), existing.parentArea);
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const body = consolidationMapUpdateSchema.parse(raw);
  const data: Record<string, unknown> = {};
  if (body.parentAccount !== undefined) data.parentAccount = body.parentAccount;
  if (body.rateType !== undefined) data.rateType = body.rateType;
  if (body.intercompany !== undefined) data.intercompany = body.intercompany;
  if (body.icPartner !== undefined) data.icPartner = body.icPartner || null;
  if (body.note !== undefined) data.note = body.note || null;
  const map = await updateMap(id, version, user.id, data);
  await logActivity({ userId: user.id, action: "UPDATE", target: `ConsolidationMap:${id}` });
  return ok(c, map);
});

consolidation.delete("/maps/:id", requireAuth, requirePermission("consolidation:run"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.consolidationMap.findUnique({ where: { id }, select: { parentArea: true } });
  if (!existing) throw new AuthError("Not found", 404);
  parentFor(c.get("user"), existing.parentArea);
  await prisma.consolidationMap.delete({ where: { id } });
  await logActivity({ userId: user.id, action: "DELETE", target: `ConsolidationMap:${id}` });
  return ok(c, { ok: true });
});

/** What this row would produce for a period. Body: { period, baseCurrency? }. */
consolidation.post("/maps/:id/test", requireAuth, requirePermission("consolidation:read"), async (c) => {
  const id = c.req.param("id");
  const existing = await prisma.consolidationMap.findUnique({ where: { id }, select: { parentArea: true } });
  if (!existing) throw new AuthError("Not found", 404);
  parentFor(c.get("user"), existing.parentArea);
  const raw = (await c.req.json()) as { period?: unknown; baseCurrency?: unknown };
  const period = consolidationPeriod.parse(raw.period);
  const base = typeof raw.baseCurrency === "string" && raw.baseCurrency ? raw.baseCurrency : "USD";
  return ok(c, await testMapping(id, period, base));
});

// ── Runs ─────────────────────────────────────────────────────────────────────

consolidation.get("/runs", requireAuth, requirePermission("consolidation:read"), async (c) => {
  const parentArea = parentFor(c.get("user"), c.req.query("parentArea"));
  const { page, pageSize } = paginationSchema.parse(c.req.query());
  const where: Prisma.ConsolidationRunWhereInput = { parentArea };
  const [items, total] = await Promise.all([
    prisma.consolidationRun.findMany({ where, orderBy: [{ period: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.consolidationRun.count({ where }),
  ]);
  return ok(c, items, pageMeta(page, pageSize, total));
});

/** Create a run and translate it straight away. */
consolidation.post("/runs", requireAuth, requirePermission("consolidation:run"), async (c) => {
  const user = c.get("user");
  const body = consolidationRunSchema.parse(await c.req.json());
  const parentArea = parentFor(c.get("user"), body.parentArea);
  for (const s of body.subsidiaries) await assertSubsidiaryReachable(c.get("user"), s);
  const run = await createRun({ ...body, parentArea }, user.id);
  await logActivity({ userId: user.id, action: "RUN", target: `ConsolidationRun:${run.id}`, detail: { period: run.period, subsidiaries: run.subsidiaries } });
  return created(c, run);
});

const RUN_EXPORT: Omit<ExportSpec<ConsolidationRunLine>, "title"> = {
  columns: [
    { header: "Entity", value: (r) => r.subsidiary, width: 8 },
    { header: "Account", value: (r) => r.subAccount, width: 9 },
    { header: "Account name", value: (r) => r.subAccountName, width: 22 },
    { header: "Type", value: (r) => r.accountType, width: 10 },
    { header: "Parent account", value: (r) => r.parentAccount, width: 9 },
    { header: "Parent account name", value: (r) => r.parentAccountName, width: 22 },
    { header: "Currency", value: (r) => r.currency, width: 8 },
    { header: "Rate type", value: (r) => r.rateType, width: 10 },
    { header: "Rate", value: (r) => (r.rate == null ? "" : r.rate.toString()), width: 10 },
    { header: "Beginning (local)", value: (r) => r.beginningLocal.toNumber(), width: 14 },
    { header: "Debit (local)", value: (r) => r.debitLocal.toNumber(), width: 14 },
    { header: "Credit (local)", value: (r) => r.creditLocal.toNumber(), width: 14 },
    { header: "Ending (local)", value: (r) => r.endingLocal.toNumber(), width: 14 },
    { header: "Beginning (base)", value: (r) => r.beginningBase.toNumber(), width: 14 },
    { header: "Activity (base)", value: (r) => r.activityBase.toNumber(), width: 14 },
    { header: "Ending (base)", value: (r) => r.endingBase.toNumber(), width: 14 },
    { header: "Elimination", value: (r) => r.eliminationBase.toNumber(), width: 12 },
    { header: "Share %", value: (r) => r.sharePct.toNumber(), width: 8 },
    { header: "Consolidated", value: (r) => r.consolidatedBase.toNumber(), width: 14 },
    { header: "Intercompany", value: (r) => (r.intercompany ? "Yes" : ""), width: 10 },
    { header: "CTA", value: (r) => (r.isCta ? "Yes" : ""), width: 6 },
  ],
};

/** A run with its lines and summary; `?format=csv|xlsx|pdf` downloads the lines. */
consolidation.get("/runs/:id", requireAuth, requirePermission("consolidation:read"), async (c) => {
  const id = c.req.param("id");
  const existing = await prisma.consolidationRun.findUnique({ where: { id }, select: { parentArea: true, period: true } });
  if (!existing) throw new AuthError("Not found", 404);
  parentFor(c.get("user"), existing.parentArea);
  const exported = await exportIfRequested(
    c,
    { ...RUN_EXPORT, title: `Consolidation ${existing.period}` },
    (take) => prisma.consolidationRunLine.findMany({ where: { runId: id }, orderBy: { sortOrder: "asc" }, take }),
  );
  if (exported) return exported;
  return ok(c, await getRun(id));
});

/** Translate again from the ledgers as they stand now. */
consolidation.post("/runs/:id/run", requireAuth, requirePermission("consolidation:run"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.consolidationRun.findUnique({ where: { id }, select: { parentArea: true } });
  if (!existing) throw new AuthError("Not found", 404);
  parentFor(c.get("user"), existing.parentArea);
  const run = await computeRun(id, user.id);
  await logActivity({ userId: user.id, action: "RUN", target: `ConsolidationRun:${id}` });
  return ok(c, run);
});

/** Post the eliminations to the parent ledger and lock the run. */
consolidation.post("/runs/:id/post", requireAuth, requirePermission("consolidation:run"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.consolidationRun.findUnique({ where: { id }, select: { parentArea: true } });
  if (!existing) throw new AuthError("Not found", 404);
  parentFor(c.get("user"), existing.parentArea);
  const run = await postRun(id, user.id);
  await logActivity({ userId: user.id, action: "POST", target: `ConsolidationRun:${id}`, detail: { postingEntryId: run.postingEntryId } });
  return ok(c, run);
});

consolidation.patch("/runs/:id", requireAuth, requirePermission("consolidation:run"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.consolidationRun.findUnique({ where: { id }, select: { parentArea: true, status: true } });
  if (!existing) throw new AuthError("Not found", 404);
  parentFor(c.get("user"), existing.parentArea);
  if (existing.status === "POSTED") throw new AuthError("A posted run is locked", 409);
  const raw = await c.req.json();
  const version = requireVersion(raw);
  const memo = typeof raw.memo === "string" ? raw.memo.slice(0, 300) : null;
  const run = await updateWithVersion(prisma.consolidationRun, id, version, user.id, { memo });
  return ok(c, run);
});

consolidation.delete("/runs/:id", requireAuth, requirePermission("consolidation:run"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await prisma.consolidationRun.findUnique({ where: { id }, select: { parentArea: true } });
  if (!existing) throw new AuthError("Not found", 404);
  parentFor(c.get("user"), existing.parentArea);
  const res = await deleteRun(id);
  await logActivity({ userId: user.id, action: "DELETE", target: `ConsolidationRun:${id}` });
  return ok(c, res);
});
