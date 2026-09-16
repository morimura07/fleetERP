import { prisma } from "@backend/lib/prisma";
import { AuthError } from "@backend/lib/errors";
import type { Scheme } from "@backend/services/payslip-engine";
import { SEED_SCHEMES } from "@backend/services/statutory-seed";
import type { PayeBand } from "@backend/services/statutory";

/**
 * Where a country's payroll rules come from.
 *
 * The database is the authority, so that a rate change is an edit rather than
 * a release. The seed is what fills the database the first time a country is
 * needed, so a fresh tenant in Tanzania gets a working payslip on day one and
 * the accountant can correct any figure afterwards.
 */

/** Load the scheme for a country, seeding it on first use. */
export async function schemeFor(country: string): Promise<Scheme & { verifiedAt: Date | null; name: string }> {
  const code = country.toUpperCase();
  let row = await prisma.statutoryScheme.findUnique({
    where: { country: code },
    include: { deductions: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
  });

  if (!row) {
    const seed = SEED_SCHEMES.find((s) => s.country === code);
    if (!seed) {
      throw new AuthError(
        `No payroll scheme for ${code}. Add one under Payroll settings, or set the employee's country to one that has a scheme.`,
        422,
      );
    }
    row = await prisma.statutoryScheme.create({
      data: {
        country: seed.country,
        name: seed.name,
        currency: seed.currency,
        payeBands: seed.payeBands,
        source: seed.source,
        deductions: {
          create: seed.deductions.map((d) => ({
            code: d.code,
            label: d.label,
            employeeRatePct: d.employeeRatePct,
            employerRatePct: d.employerRatePct,
            basis: d.basis,
            basisCap: d.basisCap ?? null,
            minAmount: d.minAmount ?? null,
            fixedAmount: d.fixedAmount ?? null,
            reducesTaxable: d.reducesTaxable ?? false,
            optIn: d.optIn ?? false,
            sortOrder: d.sortOrder,
          })),
        },
      },
      include: { deductions: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
    });
  }

  return {
    country: row.country,
    name: row.name,
    verifiedAt: row.verifiedAt,
    payeBands: row.payeBands as unknown as PayeBand[],
    deductions: row.deductions.map((d) => ({
      code: d.code,
      label: d.label,
      employeeRatePct: d.employeeRatePct,
      employerRatePct: d.employerRatePct,
      basis: d.basis,
      basisCap: d.basisCap,
      minAmount: d.minAmount,
      fixedAmount: d.fixedAmount,
      reducesTaxable: d.reducesTaxable,
      optIn: d.optIn,
      sortOrder: d.sortOrder,
    })),
  };
}

/** Every scheme on file, seeding any the seed knows that the database lacks. */
export async function allSchemes() {
  for (const seed of SEED_SCHEMES) await schemeFor(seed.country);
  return prisma.statutoryScheme.findMany({
    include: { deductions: { orderBy: { sortOrder: "asc" } } },
    orderBy: { country: "asc" },
  });
}
