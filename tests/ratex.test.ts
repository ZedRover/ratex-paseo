import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import parse from "semver/functions/parse.js";
import satisfies from "semver/functions/satisfies.js";
import { clearRenderCache, initRatex, renderLatexToDisplayList } from "../server/ratex.ts";
import { renderLatex } from "../server/render.ts";
import { RATEX_WASM_GZIP_BASE64 } from "../server/vendor/ratex-wasm-bytes.ts";
import {
  DEFAULT_LATEX,
  KNOWN_DISPLAY_ITEM_TYPES,
  MAX_LATEX_LENGTH,
  RATEX_WASM_VERSION,
  normalizeColor,
} from "../shared/ratex.ts";
import { FONT_CSS, FONT_DECLARATIONS } from "../client/vendor/fonts.ts";

async function readSource(relative: string): Promise<string> {
  return readFile(fileURLToPath(new URL(relative, import.meta.url).href), { encoding: "utf8" });
}

const knownTypes = new Set<string>(KNOWN_DISPLAY_ITEM_TYPES);

test("initRatex loads ratex-wasm once", async () => {
  await initRatex();
  await initRatex();
});

test("quadratic formula yields a DisplayList of draw ops", async () => {
  await initRatex();
  const list = renderLatexToDisplayList(DEFAULT_LATEX, { displayMode: true, color: "#1E88E5" });
  assert.ok(list.width > 0, `width should be > 0, got ${list.width}`);
  assert.ok(list.height > 0, `height should be > 0, got ${list.height}`);
  assert.ok(list.items.length >= 1, "items should be non-empty");
  const sampleTypes = [...new Set(list.items.map((item) => item.type))];
  assert.ok(
    sampleTypes.some((type) => knownTypes.has(type)),
    `expected GlyphPath/Line/Rect/Path, got ${sampleTypes.join(",")}`,
  );
});

test("displayMode true vs false produce different layout metrics", async () => {
  await initRatex();
  const display = renderLatexToDisplayList(DEFAULT_LATEX, { displayMode: true });
  const inline = renderLatexToDisplayList(DEFAULT_LATEX, { displayMode: false });
  assert.ok(display.width > 0 && inline.width > 0);
  assert.ok(display.height > 0 && inline.height > 0);
  const differs = display.width !== inline.width || display.height !== inline.height;
  assert.ok(
    differs,
    `display (${display.width}x${display.height}) should differ from inline (${inline.width}x${inline.height})`,
  );
});

test("invalid LaTeX fails instead of returning a successful DisplayList", async () => {
  await initRatex();
  assert.throws(
    () => renderLatexToDisplayList("\\definitelyNotACommand{x}", { displayMode: true }),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return /undefined control sequence|ParseError|invalid/i.test(message);
    },
  );
});

test("RPC handler returns DisplayList for valid LaTeX and error for invalid", async () => {
  const ok = await renderLatex({
    latex: DEFAULT_LATEX,
    displayMode: true,
    color: "#111111",
  });
  assert.equal(ok.ok, true);
  if (!ok.ok) throw new Error("expected success");
  assert.ok(ok.displayList.width > 0);
  assert.ok(ok.displayList.height > 0);
  assert.ok(ok.displayList.items.length >= 1);

  const bad = await renderLatex({
    latex: "\\definitelyNotACommand{x}",
    displayMode: true,
  });
  assert.equal(bad.ok, false);
  if (bad.ok) throw new Error("expected failure");
  assert.match(bad.error, /undefined control sequence|ParseError|invalid/i);
});

test("plugin manifest and client entry register a RaTeX UI", async () => {
  const manifest = JSON.parse(await readSource("../paseo-plugin.json")) as {
    id: string;
    requirements?: { paseo?: string };
  };
  assert.equal(manifest.id, "ratex-formula");
  const range = manifest.requirements?.paseo;
  assert.equal(range, ">=0.8.0 <0.10.0");
  function compatible(version: string): boolean {
    const parsed = parse(version);
    if (!parsed) return false;
    const stableCore = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
    return satisfies(version, range ?? "") || satisfies(stableCore, range ?? "");
  }
  assert.equal(compatible("0.8.0"), true);
  assert.equal(compatible("0.9.0-beta.2"), true);
  assert.equal(compatible("0.9.0"), true);
  assert.equal(compatible("0.10.0"), false);

  const client = await readSource("../index.client.tsx");
  assert.match(client, /addSurface\("ratex"/);
  assert.match(client, /addSidebarItem/);
  assert.match(client, /addWorkspacePanel/);
  assert.match(client, /addTimelineTransformer/);
  assert.match(client, /itemType: "assistant_message"/);
  assert.match(client, /kind: "ratex-message"/);

  const wrapper = await readSource("../server/ratex.ts");
  assert.match(wrapper, /from "ratex-wasm"/);
  assert.match(wrapper, /initRatexWasm/);
  assert.match(wrapper, /renderLatexToDisplayListWasm/);

  const web = await readSource("../client/web.ts");
  assert.match(web, /Platform\.OS === "web"/);
  assert.match(web, /renderToCanvas/);
  assert.match(web, /ratex-wasm\/dist\/renderer\.js/);
});

test("theme colors RaTeX cannot parse are normalized instead of failing the render", async () => {
  assert.equal(normalizeColor("#e6e6e6"), "#e6e6e6");
  assert.equal(normalizeColor("rgba(230,230,230,1.00)"), "#e6e6e6");
  assert.equal(normalizeColor("rgb(230 230 230)"), "#e6e6e6");
  assert.equal(normalizeColor("rgba(0,0,0,0.5)"), "#00000080");
  assert.equal(normalizeColor("white"), "white");
  // RaTeX rejects these outright; dropping the tint beats losing the formula.
  assert.equal(normalizeColor("oklch(0.7 0.1 250)"), undefined);
  assert.equal(normalizeColor(""), undefined);
  assert.equal(normalizeColor(undefined), undefined);

  const rendered = await renderLatex({
    latex: "x^2",
    displayMode: false,
    color: "rgba(230,230,230,1.00)",
  });
  assert.equal(rendered.ok, true, `rgba theme color should still render, got ${JSON.stringify(rendered)}`);
});

test("an oversized formula is refused through the ok:false contract", async () => {
  const result = await renderLatex({
    latex: "x".repeat(MAX_LATEX_LENGTH + 1),
    displayMode: false,
  });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected failure");
  assert.match(result.error, /over the \d+ limit/);
});

test("repeated renders of one formula are served from the cache", async () => {
  await initRatex();
  clearRenderCache();
  const first = renderLatexToDisplayList(DEFAULT_LATEX, { displayMode: true, color: "#111111" });
  const second = renderLatexToDisplayList(DEFAULT_LATEX, { displayMode: true, color: "#111111" });
  assert.equal(first, second, "identical inputs should return the cached DisplayList");
  const other = renderLatexToDisplayList(DEFAULT_LATEX, { displayMode: false, color: "#111111" });
  assert.notEqual(first, other, "display mode is part of the cache key");
  clearRenderCache();
  const afterClear = renderLatexToDisplayList(DEFAULT_LATEX, { displayMode: true, color: "#111111" });
  assert.notEqual(first, afterClear);
});

test("spacing-only math is a valid DisplayList, not an error", async () => {
  await initRatex();
  const list = renderLatexToDisplayList("\\quad", { displayMode: false });
  assert.equal(list.items.length, 0, "spacing draws nothing");
  assert.ok(list.width > 0, `spacing should still have width, got ${list.width}`);
  assert.ok(Number.isFinite(list.height));
});

test("the embedded WASM matches the installed ratex-wasm", async () => {
  const installed = await readFile(
    fileURLToPath(new URL("../node_modules/ratex-wasm/pkg/ratex_wasm_bg.wasm", import.meta.url).href),
  );
  const digest = (bytes: Buffer | string) =>
    createHash("sha256").update(bytes).digest("hex");
  assert.equal(
    digest(gunzipSync(Buffer.from(RATEX_WASM_GZIP_BASE64, "base64"))),
    digest(installed),
    "server/vendor/ratex-wasm-bytes.ts is stale — run npm run embed-wasm",
  );
});

test("the KaTeX font version tracks the ratex-wasm dependency", async () => {
  const manifest = JSON.parse(await readSource("../package.json")) as {
    dependencies: Record<string, string>;
  };
  const installed = JSON.parse(await readSource("../node_modules/ratex-wasm/package.json")) as {
    version: string;
  };
  assert.equal(RATEX_WASM_VERSION, installed.version);
  assert.equal(manifest.dependencies["ratex-wasm"], RATEX_WASM_VERSION);
  const web = await readSource("../client/web.ts");
  assert.match(web, /RATEX_WASM_VERSION/);
  assert.doesNotMatch(web, /ratex-wasm@0\.\d+\.\d+\/fonts\.css/);
});

test("embedded font bytes match the dependency and need no remote resources", async () => {
  const original = await readSource("../node_modules/ratex-wasm/fonts.css");
  const urls = [...original.matchAll(/url\(([^)]+\.woff2)\)/g)];
  assert.equal(FONT_DECLARATIONS.length, urls.length);
  assert.equal([...FONT_CSS.matchAll(/url\(/g)].length, urls.length);
  for (const [, relative] of urls) {
    const bytes = await readFile(fileURLToPath(new URL(`../node_modules/ratex-wasm/${relative}`, import.meta.url).href));
    assert.ok(FONT_CSS.includes(`data:font/woff2;base64,${bytes.toString("base64")}`));
  }
});

test("CSS color names outside RaTeX's subset do not make valid math fail", async () => {
  for (const color of ["gainsboro", "slategray", "rebeccapurple", "invalidcolor"]) {
    assert.equal(normalizeColor(color), undefined);
    assert.equal((await renderLatex({ latex: "x", displayMode: false, color })).ok, true);
  }
});

test("large display lists are not retained in the render cache", async () => {
  await initRatex();
  clearRenderCache();
  const formula = "x".repeat(MAX_LATEX_LENGTH);
  const first = renderLatexToDisplayList(formula);
  const second = renderLatexToDisplayList(formula);
  assert.ok(first !== second, "large lists should render without being retained");
  assert.deepEqual(first, second);
});

test("cache evicts by size before reaching the entry count limit", async () => {
  await initRatex();
  clearRenderCache();
  const formula = "x".repeat(1024);
  const first = renderLatexToDisplayList(formula);
  for (let index = 0; index < 40; index += 1) {
    renderLatexToDisplayList(`${formula}+${index}`);
  }
  assert.ok(first !== renderLatexToDisplayList(formula), "serialized size budget should evict the first list");
  clearRenderCache();
});
