import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const output = execFileSync(npm, ["pack", "--dry-run", "--json"], {
  encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
  shell: process.platform === "win32",
});
// Lifecycle scripts may print progress before npm's JSON result.
const [pack] = JSON.parse(output.slice(output.indexOf("[\n")));
const paths = new Set(pack.files.map(({ path }) => path));
for (const path of [
  "index.client.tsx", "index.server.ts", "paseo-plugin.json",
  "server/vendor/ratex-wasm-bytes.ts", "client/vendor/fonts.ts",
  "scripts/prepare-plugin.mjs", "scripts/embed-wasm.mjs", "scripts/embed-fonts.mjs",
  "LICENSE", "client/vendor/FONT-LICENSE.txt", "README.md", "README.zh-CN.md",
  "node_modules/ratex-wasm/pkg/ratex_wasm.js",
  "node_modules/ratex-wasm/dist/renderer.js",
]) assert.ok(paths.has(path), `Missing published file: ${path}`);
for (const path of paths) {
  assert.ok(!/^(tests\/|\.github\/|\.env(?:\.|$)|\.npmrc$|package-lock\.json$)/.test(path),
    `Unexpected published file: ${path}`);
}
// Keep our runtime sources (including embedded data) within the community
// catalog's inspection budget. Count all our runtime files conservatively.
const runtimeFiles = pack.files.filter(({ path }) =>
  path === "paseo-plugin.json" ||
  /^(?:index\.(?:client|server)\.tsx?$|(?:client|server|shared)\/.*\.[cm]?[jt]sx?$)/.test(path));
const runtimeBytes = runtimeFiles.reduce((sum, { size }) => sum + size, 0);
assert.ok(runtimeFiles.length <= 200, "Runtime source count exceeds 200 files");
assert.ok(runtimeBytes <= 2_000_000, `Runtime sources exceed 2 MB: ${runtimeBytes} bytes`);
console.log(`Runtime source budget: ${runtimeFiles.length} files, ${runtimeBytes} bytes.`);
console.log(`${pack.name}@${pack.version}: ${pack.entryCount} files, ${pack.unpackedSize} unpacked bytes; package checks passed.`);
