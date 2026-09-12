import { describe, it, expect } from "vitest";
import { ATTACHABLE, attachableTypes, isAttachableType } from "@backend/services/attachment";
import { ALL as ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "@backend/lib/rbac";

describe("attachable allowlist", () => {
  it("accepts the types it declares", () => {
    for (const t of attachableTypes()) expect(isAttachableType(t)).toBe(true);
  });

  it("rejects anything not on the list", () => {
    // A typo would otherwise write an attachment nothing can ever find again.
    expect(isAttachableType("FixedAssset")).toBe(false);
    expect(isAttachableType("User")).toBe(false);
    expect(isAttachableType("")).toBe(false);
  });

  it("is not fooled by inherited object properties", () => {
    // A plain `value in ATTACHABLE` would say yes to these.
    expect(isAttachableType("toString")).toBe(false);
    expect(isAttachableType("constructor")).toBe(false);
    expect(isAttachableType("__proto__")).toBe(false);
  });

  it("names a real permission for every type", () => {
    // A permission string that no role grants would deny everyone silently,
    // and the failure would look like a bug in the upload button.
    const known = new Set<string>(ALL_PERMISSIONS);
    for (const [type, cfg] of Object.entries(ATTACHABLE)) {
      expect(known.has(cfg.read), `${type}.read = ${cfg.read}`).toBe(true);
      expect(known.has(cfg.write), `${type}.write = ${cfg.write}`).toBe(true);
    }
  });

  it("never lets a read permission be the stricter of the pair", () => {
    // Reading a document must not require more than adding one.
    for (const [type, cfg] of Object.entries(ATTACHABLE)) {
      expect(cfg.read.endsWith(":read"), `${type} reads with ${cfg.read}`).toBe(true);
      expect(cfg.write.endsWith(":write"), `${type} writes with ${cfg.write}`).toBe(true);
    }
  });

  it("covers the records the September document asks for documents on", () => {
    const types = attachableTypes();
    for (const required of [
      "ExpenseClaim", "FixedAsset", "DamageReport", "Driver",
      "Employee", "Vehicle", "Vendor", "PurchaseOrder",
    ]) {
      expect(types, `${required} should be attachable`).toContain(required);
    }
  });
});

describe("attachable permissions are actually grantable", () => {
  it("gives an ADMIN document access to every attachable module", () => {
    // ADMIN is who runs a customer tenant. If a module's permission were
    // outside their grant, the upload control would render and then 403.
    const admin = new Set<string>(DEFAULT_ROLE_PERMISSIONS.ADMIN);
    for (const [type, cfg] of Object.entries(ATTACHABLE)) {
      expect(admin.has(cfg.read), `ADMIN cannot read ${type} documents`).toBe(true);
      expect(admin.has(cfg.write), `ADMIN cannot add ${type} documents`).toBe(true);
    }
  });
});
