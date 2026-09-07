import "../src/lib/load-env";
import { randomInt } from "crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@backend/lib/password";
import { organizationSchema, companySchema } from "@backend/lib/validations";
import { isCurrencyCode } from "@backend/lib/currency";

/**
 * Create a real customer tenant: organization, its first legal entity, and an
 * administrator who can sign in.
 *
 *   npm run provision-tenant -- --name "Petrofuel Ltd" --email admin@petrofuel.co.tz
 *
 * This is deliberately not the sandbox flow. `POST /api/sandbox/provision`
 * builds a throwaway partition inside the *existing* organization, with
 * `isSandbox` set and `isDemo` users that a sandbox reset deletes. That is right
 * for a demo and wrong for a paying customer: it leaves their data reachable by
 * the parent organization's administrators and eligible for a wipe.
 *
 * A tenant created here gets its own Organization, which is the isolation
 * boundary `lib/scope.ts` enforces, so no administrator outside it can read a
 * single row.
 *
 * Writes to whichever database DATABASE_URL points at, so check the line it
 * prints before answering the confirmation.
 */

const prisma = new PrismaClient();

/** Matches the minimum enforced by the reset-password endpoint. */
const MIN_PASSWORD = 8;

/**
 * No look-alike characters (0/O, 1/l/I). These passwords get read off a screen
 * and typed by hand at least once, and a transcription error in a handover
 * looks exactly like a broken account.
 */
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generatePassword(length = 20): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** `--key value` pairs; unknown keys are rejected rather than ignored. */
function parseArgs(argv: string[]): Record<string, string> {
  const known = new Set(["name", "email", "org", "company", "currency", "country", "password", "admin-name"]);
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const value = argv[i + 1];
    if (!key || value === undefined) fail(`Missing value for --${key ?? "?"}`);
    if (!known.has(key)) fail(`Unknown option --${key}. Known: ${[...known].map((k) => `--${k}`).join(" ")}`);
    out[key] = value;
  }
  return out;
}

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

/** Uppercase alphanumerics only, which is what both code schemas allow. */
function slug(text: string, max: number): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, max);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.name || !args.email) {
    console.error(`
Usage:
  npm run provision-tenant -- --name "<Tenant name>" --email <admin email> [options]

Options:
  --org        <CODE>   organization code      (default: derived from --name)
  --company    <CODE>   first entity code      (default: derived from --name)
  --admin-name <text>   administrator's name   (default: "<tenant> Administrator")
  --currency   <ISO>    base currency          (default: USD)
  --country    <ISO2>   country                (default: TZ)
  --password   <text>   admin password         (default: generated)
`);
    process.exit(1);
  }

  const tenantName = args.name.trim();
  const email = args.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(`"${email}" is not a valid email address.`);

  const currency = (args.currency ?? "USD").toUpperCase();
  if (!isCurrencyCode(currency)) fail(`Unsupported currency "${currency}". See backend/src/lib/currency.ts.`);

  const country = (args.country ?? "TZ").toUpperCase();
  if (country.length !== 2) fail(`Country must be a 2-letter ISO code, got "${country}".`);

  const orgCode = slug(args.org ?? tenantName.split(/\s+/)[0], 10);
  // Two letters plus a sequence number, matching the existing HQ01 / KE01 style.
  const companyCode = slug(args.company ?? `${slug(tenantName, 2)}01`, 10);

  const password = args.password ?? generatePassword();
  if (password.length < MIN_PASSWORD) fail(`Password must be at least ${MIN_PASSWORD} characters.`);

  // Validate through the same schemas the API uses, so the rules live in one
  // place and a tenant made here is indistinguishable from one made in the UI.
  const org = organizationSchema.parse({ code: orgCode, name: tenantName, isActive: true });
  const company = companySchema.parse({
    code: companyCode,
    name: tenantName,
    baseCurrency: currency,
    country,
    isActive: true,
  });

  const host = (process.env.DATABASE_URL ?? "").replace(/\/\/[^@]+@/, "//***@");
  console.log(`\ndatabase     : ${host.split("?")[0]}`);
  console.log(`organization : ${org.code}  ${org.name}`);
  console.log(`company      : ${company.code}  (this is the dataAreaId)`);
  console.log(`currency     : ${company.baseCurrency}    country: ${company.country}`);
  console.log(`administrator: ${email}\n`);

  // Fail before writing anything rather than half-way through. All three are
  // unique columns, so the transaction would abort anyway; this just names the
  // conflict instead of surfacing a Prisma P2002.
  const [orgClash, companyClash, userClash] = await Promise.all([
    prisma.organization.findUnique({ where: { code: org.code }, select: { name: true } }),
    prisma.company.findUnique({ where: { code: company.code }, select: { name: true } }),
    prisma.user.findUnique({ where: { email }, select: { dataAreaId: true } }),
  ]);
  if (orgClash) fail(`Organization ${org.code} already exists ("${orgClash.name}"). Pass a different --org.`);
  if (companyClash) fail(`Company code ${company.code} is taken by "${companyClash.name}". Pass a different --company.`);
  if (userClash) fail(`A user with ${email} already exists (in ${userClash.dataAreaId}).`);

  const passwordHash = await hashPassword(password);

  // One transaction: a tenant with no entity, or an entity with no
  // administrator, is not something anyone should have to clean up by hand.
  const result = await prisma.$transaction(async (tx) => {
    const createdOrg = await tx.organization.create({
      data: { code: org.code, name: org.name, isActive: true },
    });
    const createdCompany = await tx.company.create({
      data: {
        organizationId: createdOrg.id,
        code: company.code,
        name: company.name,
        baseCurrency: company.baseCurrency,
        country: company.country,
        isActive: true,
        // Explicitly a real tenant. isSandbox would make it eligible for a
        // sandbox reset, which deletes the partition's data.
        isSandbox: false,
      },
    });
    const createdUser = await tx.user.create({
      data: {
        name: args["admin-name"]?.trim() || `${tenantName} Administrator`,
        email,
        passwordHash,
        role: "ADMIN",
        dataAreaId: createdCompany.code,
        // Not a demo login: a sandbox wipe must never delete a customer's admin.
        isDemo: false,
        isActive: true,
      },
      select: { id: true, name: true, email: true },
    });
    return { createdOrg, createdCompany, createdUser };
  });

  console.log("Created.\n");
  console.log("─".repeat(58));
  console.log("  Hand these to the customer");
  console.log("─".repeat(58));
  console.log(`  Organization : ${result.createdOrg.name} (${result.createdOrg.code})`);
  console.log(`  Company      : ${result.createdCompany.name} (${result.createdCompany.code})`);
  console.log(`  Email        : ${result.createdUser.email}`);
  console.log(`  Password     : ${password}`);
  console.log("─".repeat(58));
  console.log(`
This administrator sees only ${result.createdCompany.code}. No administrator in
another organization can read its data, and it will not appear in their
company switcher.

The password is shown once and stored only as a hash. If it is lost:
  npm run set-password -- ${result.createdUser.email} "<new password>"

Ask the customer to change it on first sign-in.
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
