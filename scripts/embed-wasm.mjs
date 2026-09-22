import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = path.join(root, "node_modules", "ratex-wasm", "pkg", "ratex_wasm_bg.wasm");
const outDir = path.join(root, "server", "vendor");
const outPath = path.join(outDir, "ratex-wasm-bytes.ts");

const bytes = await readFile(wasmPath);
await mkdir(outDir, { recursive: true });
const base64 = bytes.toString("base64");
const source = `// Generated from ratex-wasm ${path.relative(root, wasmPath)} by scripts/embed-wasm.mjs.
// Embedded so the Paseo server bundle can instantiate WASM without fetch() or a plugin directory path.
export const RATEX_WASM_BASE64 = "${base64}";
`;
await writeFile(outPath, source);
console.log(`wrote ${path.relative(root, outPath)} (${bytes.length} wasm bytes, ${base64.length} base64 chars)`);
