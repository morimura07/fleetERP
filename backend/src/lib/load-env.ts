/**
 * Loads `.env` into process.env at startup — imported FIRST, before any module
 * that reads env (Prisma, auth, etc.).
 *
 * Done in code rather than via `node --env-file` so it works on any Node version
 * (the CLI flag needs Node ≥ 20.6 / 20.12 and is rejected by older runtimes).
 * Existing process.env values win, so real env vars override the file.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const path = process.env.ENV_FILE ?? resolve(process.cwd(), ".env");

try {
  const text = readFileSync(path, "utf8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // Strip surrounding single or double quotes.
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {
  // No .env file (e.g. env injected by the platform) — that's fine.
}
