import { Buffer } from "node:buffer";
import {
  initRatex as initRatexWasm,
  renderLatexToDisplayList as renderLatexToDisplayListWasm,
  type DisplayList as RatexDisplayList,
  type RenderLatexOptions,
} from "ratex-wasm";
import glueInit, {
  renderLatex as glueRenderLatex,
  renderLatexWithOptions as glueRenderLatexWithOptions,
} from "../node_modules/ratex-wasm/pkg/ratex_wasm.js";
import { RATEX_WASM_BASE64 } from "./vendor/ratex-wasm-bytes.ts";
import { normalizeColor, type DisplayList } from "../shared/ratex.ts";

/** Bounded so a long transcript cannot grow the daemon's heap without limit. */
const CACHE_LIMIT = 512;
// A count cap alone allows hundreds of very large display lists to occupy the heap.
const CACHE_WEIGHT_LIMIT = 8 * 1024 * 1024;
const ENTRY_WEIGHT_LIMIT = 1024 * 1024;

const cache = new Map<string, { list: DisplayList; weight: number }>();
let cacheWeight = 0;

let initPromise: Promise<void> | null = null;
let initFailure: Error | null = null;

/**
 * Shipped RaTeX render wrapper.
 * Initializes `ratex-wasm` via `initRatex(customInit)` with the package WASM
 * binary and returns a DisplayList from `renderLatexToDisplayList`.
 *
 * `ratex-wasm` caches its init promise forever, including a rejected one, so a failure is
 * terminal for the process: remember it here and fail fast with an actionable message
 * instead of calling back into a poisoned module.
 */
export async function initRatex(): Promise<void> {
  if (initFailure) throw initFailure;
  if (!initPromise) {
    initPromise = initRatexWasm(async () => {
      await glueInit({ module_or_path: Buffer.from(RATEX_WASM_BASE64, "base64") });
      return {
        renderLatex: glueRenderLatex,
        renderLatexWithOptions: glueRenderLatexWithOptions,
        capabilities: { displayMode: true },
      };
    }).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      initFailure = new Error(
        `RaTeX WASM failed to initialize and cannot be retried in this process (${reason}). Restart the plugin.`,
      );
      throw initFailure;
    });
  }
  return initPromise;
}

export function renderLatexToDisplayList(
  latex: string,
  options: RenderLatexOptions = {},
): DisplayList {
  const displayMode = options.displayMode ?? true;
  const color = typeof options.color === "string" ? normalizeColor(options.color) : options.color;
  const key = `${displayMode ? "d" : "i"}|${typeof color === "string" ? color : JSON.stringify(color ?? null)}|${latex}`;
  const cached = cache.get(key);
  if (cached) return cached.list;

  const list = renderLatexToDisplayListWasm(latex, { displayMode, color }) as RatexDisplayList;
  assertDisplayList(list, latex);
  const result = list as DisplayList;
  // UTF-16 serialized size is a conservative accounting unit, not a heap measurement.
  const weight = 2 * (key.length + JSON.stringify(result).length);
  if (weight > ENTRY_WEIGHT_LIMIT) return result;
  while (cache.size >= CACHE_LIMIT || cacheWeight + weight > CACHE_WEIGHT_LIMIT) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cacheWeight -= cache.get(oldest.value)!.weight;
    cache.delete(oldest.value);
  }
  cache.set(key, { list: result, weight });
  cacheWeight += weight;
  return result;
}

/** Test seam: the cache is process-wide and would otherwise mask a re-render. */
export function clearRenderCache(): void {
  cache.clear();
  cacheWeight = 0;
}

function assertDisplayList(list: RatexDisplayList, latex: string): void {
  if (!list || typeof list !== "object") {
    throw new Error("RaTeX returned a non-object DisplayList");
  }
  // Unknown item types are legal per the DisplayList protocol (decoders must ignore them),
  // and spacing-only math such as \quad legitimately draws nothing, so only the geometry
  // and the shape of the payload are checked here.
  if (
    !Number.isFinite(list.width) ||
    !Number.isFinite(list.height) ||
    list.width < 0 ||
    list.height < 0 ||
    !Array.isArray(list.items)
  ) {
    throw new Error(`RaTeX produced an empty or invalid DisplayList for ${JSON.stringify(latex)}`);
  }
}
