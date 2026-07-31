import { UomDimension } from "@prisma/client";
import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";

/**
 * Units-of-measure registry (M30 Common). A per-company catalog of the units the
 * business trades in. Each unit stores `factorToBase` — how many of its
 * dimension's base unit one of it equals — which lets us convert a quantity
 * between any two units of the same dimension without a conversion table.
 */

const CODE_RE = /^[A-Z0-9][A-Z0-9/_-]{0,11}$/;

export interface UnitInput {
  dataAreaId: string;
  code: string;
  name: string;
  dimension?: UomDimension;
  symbol?: string | null;
  factorToBase?: number;
  isBase?: boolean;
}

/** A unit as far as conversion cares — dimension + factor to the base unit. */
export interface ConvertibleUnit {
  code: string;
  dimension: UomDimension | string;
  factorToBase: number;
}

/**
 * Convert `qty` from one unit to another. PURE — no DB — so it is unit-testable
 * and reused by the DB-backed `convert()` below. Conversion is only defined
 * within a single dimension; crossing dimensions (e.g. KG → LITRE) throws.
 */
export function convertQuantity(qty: number, from: ConvertibleUnit, to: ConvertibleUnit): number {
  if (from.dimension !== to.dimension) {
    throw new AuthError(
      `Cannot convert ${from.code} (${from.dimension}) to ${to.code} (${to.dimension}) — different dimensions`,
      422,
    );
  }
  if (!(to.factorToBase > 0)) throw new AuthError(`Unit ${to.code} has a non-positive conversion factor`, 422);
  return (qty * from.factorToBase) / to.factorToBase;
}

export async function listUnits(dataAreaId: string) {
  return prisma.unitOfMeasure.findMany({
    where: { dataAreaId },
    orderBy: [{ dimension: "asc" }, { isBase: "desc" }, { code: "asc" }],
  });
}

export async function createUnit(input: UnitInput) {
  const code = input.code.trim().toUpperCase();
  if (!CODE_RE.test(code)) throw new AuthError("Code must be 1–12 upper-case letters, digits or / _ -", 422);

  const dimension = input.dimension ?? "COUNT";
  // A base unit is the reference point of its dimension: its factor is 1 by
  // definition. A non-base unit needs a positive factor to be convertible.
  const isBase = !!input.isBase;
  const factorToBase = isBase ? 1 : Number(input.factorToBase ?? 1);
  if (!isBase && !(factorToBase > 0)) throw new AuthError("Conversion factor must be greater than 0", 422);

  const clash = await prisma.unitOfMeasure.findFirst({ where: { dataAreaId: input.dataAreaId, code }, select: { id: true } });
  if (clash) throw new AuthError(`A unit with code "${code}" already exists`, 409);

  // At most one base unit per dimension: demote any existing base first.
  if (isBase) {
    await prisma.unitOfMeasure.updateMany({
      where: { dataAreaId: input.dataAreaId, dimension, isBase: true },
      data: { isBase: false },
    });
  }

  return prisma.unitOfMeasure.create({
    data: {
      dataAreaId: input.dataAreaId,
      code,
      name: input.name.trim(),
      dimension,
      symbol: input.symbol?.trim() || null,
      factorToBase,
      isBase,
    },
  });
}

export async function deleteUnit(dataAreaId: string, id: string) {
  const unit = await prisma.unitOfMeasure.findFirst({ where: { id, dataAreaId }, select: { id: true } });
  if (!unit) throw new AuthError("Unit not found", 404);
  await prisma.unitOfMeasure.delete({ where: { id: unit.id } });
}

export interface ConversionResult {
  qty: number;
  from: string;
  to: string;
  dimension: UomDimension;
  result: number;
}

/** DB-backed conversion: look up both units in this company, then convert. */
export async function convert(dataAreaId: string, qty: number, fromCode: string, toCode: string): Promise<ConversionResult> {
  const from = fromCode.trim().toUpperCase();
  const to = toCode.trim().toUpperCase();
  const [fromUnit, toUnit] = await Promise.all([
    prisma.unitOfMeasure.findFirst({ where: { dataAreaId, code: from } }),
    prisma.unitOfMeasure.findFirst({ where: { dataAreaId, code: to } }),
  ]);
  if (!fromUnit) throw new AuthError(`Unknown unit "${from}"`, 404);
  if (!toUnit) throw new AuthError(`Unknown unit "${to}"`, 404);

  const result = convertQuantity(qty, {
    code: fromUnit.code, dimension: fromUnit.dimension, factorToBase: Number(fromUnit.factorToBase),
  }, {
    code: toUnit.code, dimension: toUnit.dimension, factorToBase: Number(toUnit.factorToBase),
  });
  return { qty, from: fromUnit.code, to: toUnit.code, dimension: fromUnit.dimension, result };
}
