import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}
