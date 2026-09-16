import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import { areaScope, areaForWrite } from "@backend/lib/scope";
import type { AuthUser } from "@backend/lib/auth";
import type { Permission } from "@backend/lib/rbac";
import { vehicleSchema, driverSchema, clientSchema } from "@backend/lib/validations";
import type { ImportField, RowError } from "@backend/services/import";

/**
 * What can be imported, and how.
 *
 * Deliberately limited to master data: the fleet list, the drivers and the
 * customer book are what a company actually carries over from an old system.
 * Transactions are not importable, and should not be: a migrated trip with no
 * ledger entries behind it looks like data and behaves like a hole.
 */

export interface ImportResource<S extends z.ZodTypeAny = z.ZodTypeAny> {
  title: string;
  read: Permission;
  write: Permission;
  fields: ImportField[];
  schema: S;
  /** Value that decides whether two rows describe the same thing. */
  naturalKey: (value: z.infer<S>) => string;
  /** Which of these keys already exist in the caller's tenant. */
  existing: (user: AuthUser, keys: string[]) => Promise<string[]>;
  /** Insert one validated row. Runs inside the import transaction. */
  insert: (tx: Prisma.TransactionClient, user: AuthUser, value: z.infer<S>) => Promise<void>;
}

const f = (key: string, label: string, required: boolean, aliases: string[] = []): ImportField =>
  ({ key, label, required, aliases });

const vehicles: ImportResource<typeof vehicleSchema> = {
  title: "Vehicles",
  read: "vehicle:read",
  write: "vehicle:write",
  fields: [
    f("vehicleNumber", "Vehicle number", true, ["fleet id", "fleet number", "truck no", "unit"]),
    f("plateNumber", "Plate number", true, ["registration", "reg no", "number plate", "licence plate", "license plate"]),
    f("maker", "Make", true, ["manufacturer", "brand"]),
    f("model", "Model", true, []),
    f("insuranceExpiry", "Insurance expiry", true, ["insurance expiry date", "insurance due"]),
    f("inspectionExpiry", "Inspection expiry", true, ["roadworthiness expiry", "inspection due"]),
    f("status", "Status", false, []),
    f("vin", "VIN", false, ["chassis", "chassis number"]),
    f("yearMade", "Year", false, ["year of manufacture", "yom"]),
    f("vehicleType", "Vehicle type", false, ["type"]),
    f("bodyType", "Body type", false, []),
    f("tareWeightKg", "Tare weight (kg)", false, ["tare"]),
    f("gvwKg", "GVW (kg)", false, ["gross vehicle weight"]),
    f("payloadKg", "Payload (kg)", false, ["capacity"]),
  ],
  schema: vehicleSchema,
  naturalKey: (v) => v.plateNumber,
  existing: async (user, keys) => {
    const rows = await prisma.vehicle.findMany({
      where: { ...areaScope(user), plateNumber: { in: keys } },
      select: { plateNumber: true },
    });
    return rows.map((r) => r.plateNumber);
  },
  insert: async (tx, user, v) => {
    await tx.vehicle.create({ data: { ...v, dataAreaId: areaForWrite(user), createdById: user.id } });
  },
};

const drivers: ImportResource<typeof driverSchema> = {
  title: "Drivers",
  read: "driver:read",
  write: "driver:write",
  fields: [
    f("name", "Name", true, ["driver name", "full name"]),
    f("email", "Email", true, ["email address"]),
    f("phone", "Phone", true, ["mobile", "telephone", "contact"]),
    f("address", "Address", true, ["residential address"]),
    f("contractType", "Contract type", true, ["employment type"]),
    f("joinedAt", "Joined", true, ["hire date", "date of engagement", "start date"]),
    f("status", "Status", false, []),
    f("licenseNumber", "Licence number", false, ["license number", "licence no", "dl number"]),
    f("licenseClass", "Licence class", false, ["license class", "class", "category"]),
    f("licenseExpiry", "Licence expiry", false, ["license expiry", "licence expiry date"]),
    f("medicalCertExpiry", "Medical expiry", false, ["medical certificate expiry"]),
    f("dateOfBirth", "Date of birth", false, ["dob"]),
    f("gender", "Gender", false, []),
    f("emergencyContact", "Emergency contact", false, ["next of kin"]),
    f("homeTerminal", "Home terminal", false, ["depot", "base"]),
  ],
  schema: driverSchema,
  naturalKey: (d) => d.email,
  existing: async (user, keys) => {
    const rows = await prisma.driver.findMany({
      where: { ...areaScope(user), email: { in: keys } },
      select: { email: true },
    });
    return rows.map((r) => r.email);
  },
  insert: async (tx, user, d) => {
    // createLogin/password belong to the interactive form, not a migration: an
    // import must not silently mint logins nobody asked for.
    const { createLogin: _createLogin, password: _password, ...rest } = d;
    await tx.driver.create({ data: { ...rest, dataAreaId: areaForWrite(user), createdById: user.id } });
  },
};

const clients: ImportResource<typeof clientSchema> = {
  title: "Clients",
  read: "client:read",
  write: "client:write",
  fields: [
    f("companyName", "Company name", true, ["client", "customer", "name", "account name"]),
    f("contactPerson", "Contact person", true, ["contact", "contact name"]),
    f("phone", "Phone", true, ["mobile", "telephone"]),
    f("address", "Address", true, []),
    f("email", "Email", true, ["email address"]),
    f("tradeName", "Trading name", false, []),
    f("industry", "Industry", false, ["segment", "sector"]),
    f("status", "Status", false, []),
    f("tin", "TIN", false, ["tax id", "vat number", "registration number"]),
    f("currency", "Currency", false, []),
    f("paymentTerm", "Payment terms", false, ["terms"]),
    f("creditLimit", "Credit limit", false, []),
    f("accountManager", "Account manager", false, ["relationship manager"]),
  ],
  schema: clientSchema,
  naturalKey: (c) => c.companyName,
  existing: async (user, keys) => {
    const rows = await prisma.client.findMany({
      where: { ...areaScope(user), companyName: { in: keys } },
      select: { companyName: true },
    });
    return rows.map((r) => r.companyName);
  },
  insert: async (tx, user, c) => {
    await tx.client.create({ data: { ...c, dataAreaId: areaForWrite(user), createdById: user.id } });
  },
};

/**
 * Erase the schema type so differently-shaped resources can share one map.
 *
 * ImportResource is invariant in S, because S appears both as a property and
 * inside callback parameters, so a typed resource does not fit a map keyed on
 * the base type without help. Every definition above is fully checked against
 * its own schema; this is the single point where that type is dropped, rather
 * than an "any" spread through the callbacks.
 */
function erase<S extends z.ZodTypeAny>(resource: ImportResource<S>): ImportResource {
  return resource as unknown as ImportResource;
}

export const IMPORTABLE: Record<string, ImportResource> = {
  vehicles: erase(vehicles),
  drivers: erase(drivers),
  clients: erase(clients),
};

export type ImportableName = keyof typeof IMPORTABLE;

export function importResource(name: string): ImportResource {
  const found = IMPORTABLE[name];
  if (!found) {
    throw new AuthError(
      `Cannot import "${name}". Available: ${Object.keys(IMPORTABLE).join(", ")}.`,
      422,
    );
  }
  return found;
}

export function importableNames(): string[] {
  return Object.keys(IMPORTABLE);
}

/**
 * Turn a unique-constraint violation into a row the user can find.
 *
 * `plateNumber`, `vehicleNumber` and driver `email` are unique across the whole
 * database rather than per tenant, so a clash can be with a record the importer
 * cannot see. Saying which column collided is the most that can be said without
 * disclosing another tenant's data.
 */
export function describeWriteFailure(e: unknown, row: number): RowError {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    const target = e.meta?.target;
    const columns = Array.isArray(target) ? target.join(", ") : String(target ?? "a unique field");
    return { row, message: `${columns} is already taken. Values must be unique across the system.` };
  }
  return { row, message: e instanceof Error ? e.message : "Could not be saved" };
}
