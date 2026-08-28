import "../src/lib/load-env";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@backend/lib/password";

/**
 * Set a user's password from the command line.
 *
 *   npm run set-password -- user@example.com "new-password"
 *
 * The application has no admin password-change route: users can only be created
 * with a password, or reset themselves through the forgot-password email flow,
 * which needs working SMTP. This closes that gap for the cases that matter —
 * rotating a seeded credential, or helping a locked-out administrator.
 *
 * Writes to whichever database DATABASE_URL points at, so check it first.
 */

const prisma = new PrismaClient();

// Matches the minimum enforced by the reset-password endpoint.
const MIN_LENGTH = 8;

async function main() {
  const [email, password] = process.argv.slice(2);

  if (!email || !password) {
    console.error('Usage: npm run set-password -- <email> "<new-password>"');
    process.exit(1);
  }
  if (password.length < MIN_LENGTH) {
    console.error(`Password must be at least ${MIN_LENGTH} characters.`);
    process.exit(1);
  }

  const target = email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: target },
    select: { id: true, name: true, email: true, role: true, dataAreaId: true },
  });

  if (!user) {
    console.error(`No user with email ${target}.`);
    process.exit(1);
  }

  // Show the database being written to, minus the credentials — a rotation run
  // against the wrong environment is easy to do and hard to notice.
  const host = (process.env.DATABASE_URL ?? "").replace(/\/\/[^@]+@/, "//***@");
  console.log(`database : ${host.split("?")[0]}`);
  console.log(`user     : ${user.email}  (${user.role}, ${user.dataAreaId})`);

  await prisma.user.update({
    where: { id: user.id },
    // Any outstanding reset link is invalidated at the same time; leaving one
    // live would let an old email undo the rotation.
    data: { passwordHash: await hashPassword(password), resetToken: null, resetTokenExpires: null },
  });

  console.log("\nPassword updated. Any pending reset link for this user is now void.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
