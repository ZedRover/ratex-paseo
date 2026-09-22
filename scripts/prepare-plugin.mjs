import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
async function exists(relative) {
  try {
    await access(new URL(relative, new URL("../", import.meta.url)));
    return true;
  } catch {
    return false;
  }
}

// Git checkouts carry a lockfile; npm excludes it from published packages.
// npm installations already contain the embedded assets and bundled RaTeX.
if (await exists("package-lock.json")) {
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm",
    ["ci", "--omit=dev"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

for (const file of [
  "server/vendor/ratex-wasm-bytes.ts",
  "client/vendor/fonts.ts",
  "node_modules/ratex-wasm/pkg/ratex_wasm.js",
  "node_modules/ratex-wasm/dist/renderer.js",
]) {
  if (!await exists(file)) throw new Error(`Missing plugin asset: ${file}. Reinstall the plugin.`);
}
