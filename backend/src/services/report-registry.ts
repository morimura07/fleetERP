import { z } from "zod";
import type { AuthUser } from "@backend/lib/auth";
import type { Permission } from "@backend/lib/rbac";
import { AuthError } from "@backend/lib/errors";
import type { ExportColumn } from "@backend/services/export";

/**
 * The report library (client requirements, Sept 2026).
 *
 * Around thirty reports across seven groups. Each declares its parameters,
 * columns and permission once, and everything else follows: the catalogue is
 * generated from the registry, the runner is one route, and export to Excel,
 * CSV or PDF comes free because a report's columns are an ExportSpec already.
 *
 * The alternative, a handler per report, would mean thirty routes each
 * re-implementing permission checks, filter parsing and export.
 */

export const REPORT_GROUPS = {
  FLEET: "Fleet operations & dispatch",
  FUEL: "Fuel & energy",
  MAINTENANCE: "Maintenance, workshop & tyres",
  DRIVER: "Driver performance, safety & HR",
  FINANCE: "Transport finance & cost accounting",
  COMPLIANCE: "Compliance, risk & regulatory",
  EXECUTIVE: "Executive KPI & service level",
} as const;

export type ReportGroup = keyof typeof REPORT_GROUPS;

/** Filters a report accepts. Rendered as the form above its results. */
export type ReportParam =
  | { name: "from"; label: string; kind: "date"; required?: boolean }
  | { name: "to"; label: string; kind: "date"; required?: boolean }
  | { name: "period"; label: string; kind: "period"; required?: boolean }
  | { name: "corridor"; label: string; kind: "corridor" }
  | { name: "vehicleId"; label: string; kind: "vehicle" }
  | { name: "clientId"; label: string; kind: "client" }
  | { name: "asOf"; label: string; kind: "date" };

export interface ReportContext {
  user: AuthUser;
  dataAreaId: string;
  params: Record<string, string>;
  /** Resolved date window, when the report declares `from`/`to`. */
  from: Date | null;
  to: Date | null;
}

/** A figure shown above the table, for reports where the total is the point. */
export interface ReportTile {
  label: string;
  value: string;
  hint?: string;
}

export interface ReportDefinition<Row = Record<string, unknown>> {
  key: string;
  title: string;
  group: ReportGroup;
  /** One sentence saying what question this answers. */
  description: string;
  permission: Permission;
  params: ReportParam[];
  columns: ExportColumn<Row>[];
  run: (ctx: ReportContext) => Promise<Row[]>;
  summary?: (rows: Row[]) => ReportTile[];
  /**
   * Set when a report cannot be built with the data this system holds, so the
   * catalogue can say why rather than returning an empty table that looks like
   * a bug. Used for the telematics-dependent reports.
   */
  unavailable?: string;
}

const registry = new Map<string, ReportDefinition<never>>();

export function defineReport<Row>(definition: ReportDefinition<Row>): ReportDefinition<Row> {
  if (registry.has(definition.key)) {
    throw new Error(`Duplicate report key: ${definition.key}`);
  }
  // Erased on the way in: the map is heterogeneous, and every definition is
  // fully checked against its own row type at the point it is written.
  registry.set(definition.key, definition as unknown as ReportDefinition<never>);
  return definition;
}

export function allReports(): ReportDefinition<never>[] {
  return [...registry.values()].sort((a, b) => a.group.localeCompare(b.group) || a.title.localeCompare(b.title));
}

export function findReport(key: string): ReportDefinition<never> {
  const found = registry.get(key);
  if (!found) throw new AuthError(`No report called "${key}"`, 404);
  return found;
}

/** A date-only parameter read as the whole day it names. */
export function dayBound(value: string | undefined, endOfDay = false): Date | null {
  if (!value) return null;
  const d = new Date(endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const reportParamsSchema = z.record(z.string());

/**
 * Check the caller supplied everything the report needs.
 *
 * Refusing up front beats running a report over an unbounded range and timing
 * out, or worse, silently reporting on all of history because a date was blank.
 */
export function assertRequiredParams(definition: ReportDefinition<never>, params: Record<string, string>) {
  const missing = definition.params
    .filter((p) => "required" in p && p.required && !params[p.name])
    .map((p) => p.label);
  if (missing.length > 0) {
    throw new AuthError(`${definition.title} needs: ${missing.join(", ")}`, 422);
  }
}
