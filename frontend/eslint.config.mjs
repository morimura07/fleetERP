import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

/**
 * ESLint 9 flat config.
 *
 * eslint and eslint-config-next were both already devDependencies, but no
 * config file existed, so `next lint` prompted for setup and exited 0 without
 * checking anything. A passing lint therefore meant nothing. `next lint` is
 * also deprecated in Next 15 and removed in 16, so the script now calls the
 * ESLint CLI directly.
 *
 * eslint-config-next still ships in eslintrc format, so FlatCompat bridges it.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "out/**", "next-env.d.ts", "public/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
