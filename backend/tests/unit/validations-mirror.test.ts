import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * backend/src/lib/validations.ts and frontend/lib/validations.ts are mirrors:
 * a form validates with the same rule the API enforces. The files are not
 * byte-identical (the backend carries server-only schemas, and the two import
 * headers differ), so this compares each exported schema that both files
 * define, whitespace-normalised, and fails on the first one that drifts.
 */
const ROOT = resolve(__dirname, "../../..");

function exportsOf(file: string): Map<string, string> {
  const src = readFileSync(resolve(ROOT, file), "utf8").replace(/\r\n/g, "\n");
  const re = /^export (?:const|function|type) (\w+)/gm;
  const starts: { name: string; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) starts.push({ name: m[1], at: m.index });
  const out = new Map<string, string>();
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].at : src.length;
    const body = src.slice(starts[i].at, end).replace(/(\n\s*\/\/.*|\n\s*\/\*[\s\S]*?\*\/|\n\s*)*$/, "");
    out.set(starts[i].name, body.replace(/\s+/g, " ").trim());
  }
  return out;
}

describe("validations.ts mirror", () => {
  const be = exportsOf("backend/src/lib/validations.ts");
  const fe = exportsOf("frontend/lib/validations.ts");

  it("defines every shared schema identically on both sides", () => {
    const drift: string[] = [];
    for (const [name, body] of be) {
      if (fe.has(name) && fe.get(name) !== body) drift.push(name);
    }
    expect(drift, `schemas that differ between backend and frontend: ${drift.join(", ")}`).toEqual([]);
  });

  it("has nothing on the frontend the backend does not know", () => {
    // The frontend may define fewer schemas, never ones of its own.
    const feOnly = [...fe.keys()].filter((k) => !be.has(k));
    expect(feOnly).toEqual([]);
  });
});
