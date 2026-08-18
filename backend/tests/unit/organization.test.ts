import { describe, it, expect, beforeEach } from "vitest";
import {
  hydrateOrganizations,
  registerCompany,
  forgetCompany,
  organizationOf,
  companiesInOrganization,
  isHydrated,
} from "@backend/lib/organization";

const ORG_A = "org_a";
const ORG_B = "org_b";

beforeEach(() => {
  hydrateOrganizations([
    { code: "HQ01", organizationId: ORG_A },
    { code: "KE01", organizationId: ORG_A },
    { code: "ZM01", organizationId: ORG_B },
  ]);
});

describe("company to organization map", () => {
  it("resolves a company to its parent", () => {
    expect(organizationOf("HQ01")).toBe(ORG_A);
    expect(organizationOf("ZM01")).toBe(ORG_B);
  });

  it("returns null for a company it has never seen", () => {
    expect(organizationOf("XX99")).toBeNull();
  });

  it("groups companies under their parent", () => {
    expect(companiesInOrganization(ORG_A).sort()).toEqual(["HQ01", "KE01"]);
    expect(companiesInOrganization(ORG_B)).toEqual(["ZM01"]);
  });

  it("returns an empty list for an unknown organization, never everything", () => {
    // Callers treat [] as "reaches nothing"; returning all codes here would
    // silently turn a lookup miss into a cross-tenant read.
    expect(companiesInOrganization("org_missing")).toEqual([]);
  });
});

describe("keeping the map current", () => {
  it("adds a newly created company without a full reload", () => {
    registerCompany("UG01", ORG_A);
    expect(organizationOf("UG01")).toBe(ORG_A);
    expect(companiesInOrganization(ORG_A).sort()).toEqual(["HQ01", "KE01", "UG01"]);
  });

  it("removes a company from its old parent when it moves", () => {
    registerCompany("KE01", ORG_B);
    expect(organizationOf("KE01")).toBe(ORG_B);
    expect(companiesInOrganization(ORG_A)).toEqual(["HQ01"]); // no longer listed under A
    expect(companiesInOrganization(ORG_B).sort()).toEqual(["KE01", "ZM01"]);
  });

  it("is idempotent when the same company is registered twice", () => {
    registerCompany("HQ01", ORG_A);
    registerCompany("HQ01", ORG_A);
    expect(companiesInOrganization(ORG_A).sort()).toEqual(["HQ01", "KE01"]);
  });

  it("forgets a company on both sides of the map", () => {
    forgetCompany("KE01");
    expect(organizationOf("KE01")).toBeNull();
    expect(companiesInOrganization(ORG_A)).toEqual(["HQ01"]);
  });

  it("replaces the whole map on rehydration", () => {
    hydrateOrganizations([{ code: "NEW1", organizationId: ORG_B }]);
    expect(organizationOf("HQ01")).toBeNull();
    expect(companiesInOrganization(ORG_A)).toEqual([]);
    expect(companiesInOrganization(ORG_B)).toEqual(["NEW1"]);
  });

  it("reports an empty map as not hydrated so startup failure is detectable", () => {
    expect(isHydrated()).toBe(true);
    hydrateOrganizations([]);
    expect(isHydrated()).toBe(false);
  });
});
