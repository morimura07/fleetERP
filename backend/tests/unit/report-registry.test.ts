import { describe, it, expect } from "vitest";
import {
  allReports, findReport, assertRequiredParams, dayBound, REPORT_GROUPS,
} from "@backend/services/report-registry";
import { ALL as ALL_PERMISSIONS } from "@backend/lib/rbac";
// Importing the definitions is what registers them.
import "@backend/services/reports/finance";

describe("the report catalogue", () => {
  it("has registered the finance and executive reports", () => {
    const keys = allReports().map((r) => r.key);
    expect(keys).toContain("cost-per-km");
    expect(keys).toContain("trip-profitability");
    expect(keys).toContain("ar-aging");
    expect(keys).toContain("otif");
  });

  it("gives every report a key, a title and a description", () => {
    for (const r of allReports()) {
      expect(r.key, "key").toMatch(/^[a-z0-9-]+$/);
      expect(r.title.length, `${r.key} title`).toBeGreaterThan(3);
      expect(r.description.length, `${r.key} description`).toBeGreaterThan(10);
    }
  });

  it("puts every report in a group that exists", () => {
    for (const r of allReports()) {
      expect(Object.keys(REPORT_GROUPS), `${r.key} group`).toContain(r.group);
    }
  });

  it("gates every report on a real permission", () => {
    // A permission no role grants would hide the report from everyone, and the
    // failure would look like a missing feature rather than a typo.
    const known = new Set<string>(ALL_PERMISSIONS);
    for (const r of allReports()) {
      expect(known.has(r.permission), `${r.key} wants ${r.permission}`).toBe(true);
    }
  });

  it("gives every report at least one column", () => {
    for (const r of allReports()) {
      expect(r.columns.length, `${r.key} has no columns`).toBeGreaterThan(0);
    }
  });

  it("never repeats a column header within a report", () => {
    // Duplicated headers silently collapse into one key in the JSON response.
    for (const r of allReports()) {
      const headers = r.columns.map((c) => c.header);
      expect(new Set(headers).size, `${r.key} repeats a header`).toBe(headers.length);
    }
  });

  it("refuses an unknown key rather than returning nothing", () => {
    expect(() => findReport("no-such-report")).toThrow(/No report called/);
  });
});

describe("required parameters", () => {
  const report = findReport("cost-per-km");

  it("names what is missing, using the labels the user sees", () => {
    expect(() => assertRequiredParams(report, {})).toThrow(/From, To/);
  });

  it("names only what is actually missing", () => {
    expect(() => assertRequiredParams(report, { from: "2026-09-01" })).toThrow(/To/);
    expect(() => assertRequiredParams(report, { from: "2026-09-01" })).not.toThrow(/From,/);
  });

  it("passes once everything required is present", () => {
    expect(() => assertRequiredParams(report, { from: "2026-09-01", to: "2026-09-30" })).not.toThrow();
  });

  it("does not demand the optional ones", () => {
    const withOptional = findReport("trip-profitability");
    expect(() => assertRequiredParams(withOptional, { from: "2026-09-01", to: "2026-09-30" })).not.toThrow();
  });
});

describe("date bounds", () => {
  it("reads a date as the start of that day", () => {
    expect(dayBound("2026-09-01")!.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("reads an end date as the last instant of that day", () => {
    // Otherwise a range ending "today" silently excludes everything today.
    expect(dayBound("2026-09-30", true)!.toISOString()).toBe("2026-09-30T23:59:59.999Z");
  });

  it("is null for a missing or unparseable value", () => {
    expect(dayBound(undefined)).toBeNull();
    expect(dayBound("")).toBeNull();
    expect(dayBound("last Tuesday")).toBeNull();
  });
});
