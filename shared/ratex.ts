import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const DEFAULT_LATEX = "\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}";

/**
 * Version of the `ratex-wasm` dependency, used to fetch matching KaTeX webfonts.
 * Pinned by a test against package.json and the installed package: a drift here means
 * formulas are laid out by one version and drawn with another version's fonts.
 */
export const RATEX_WASM_VERSION = "0.1.14";

/** Upper bound on a single formula, so one pathological message cannot pin the daemon. */
export const MAX_LATEX_LENGTH = 4096;

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
// RaTeX supports this subset, not the complete CSS named-color vocabulary.
const NAMED_COLORS = new Set("aqua black blue brown cyan fuchsia gray green grey lime magenta maroon navy olive orange pink purple red silver teal transparent white yellow".split(" "));
const RGB_COLOR =
  /^rgba?\(\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

/**
 * RaTeX accepts named colors, #rgb, #rgba, #rrggbb, #rrggbbaa — and *fails the whole
 * render* on anything else, including the `rgba()` and `oklch()` a theme may hand us.
 * Convert what we can and drop the rest, so an exotic theme color costs the formula its
 * tint rather than its existence.
 */
export function normalizeColor(color?: string): string | undefined {
  if (!color) return undefined;
  const value = color.trim();
  if (value.length === 0) return undefined;
  if (HEX_COLOR.test(value)) return value;
  const rgb = RGB_COLOR.exec(value);
  if (rgb) {
    const channel = (raw: string): number | null => {
      const percent = raw.endsWith("%");
      const parsed = Number.parseFloat(percent ? raw.slice(0, -1) : raw);
      if (!Number.isFinite(parsed)) return null;
      const scaled = percent ? (parsed / 100) * 255 : parsed;
      return Math.max(0, Math.min(255, Math.round(scaled)));
    };
    const parts = [channel(rgb[1]), channel(rgb[2]), channel(rgb[3])];
    if (parts.every((part) => part !== null)) {
      const alphaRaw = rgb[4];
      const alpha =
        alphaRaw === undefined
          ? 1
          : alphaRaw.endsWith("%")
            ? Number.parseFloat(alphaRaw.slice(0, -1)) / 100
            : Number.parseFloat(alphaRaw);
      const hex = (part: number) => part.toString(16).padStart(2, "0");
      const base = `#${parts.map((part) => hex(part as number)).join("")}`;
      if (!Number.isFinite(alpha) || alpha >= 1) return base;
      return `${base}${hex(Math.max(0, Math.min(255, Math.round(alpha * 255))))}`;
    }
  }
  if (NAMED_COLORS.has(value.toLowerCase())) return value.toLowerCase();
  return undefined;
}

export const KNOWN_DISPLAY_ITEM_TYPES = ["GlyphPath", "Line", "Rect", "Path"] as const;

export type KnownDisplayItemType = (typeof KNOWN_DISPLAY_ITEM_TYPES)[number];

export type DisplayListItem = {
  type: string;
  [key: string]: unknown;
};

export type DisplayList = {
  width: number;
  height: number;
  depth?: number;
  version?: number;
  items: DisplayListItem[];
};

const displayListSchema = z.object({
  width: z.number(),
  height: z.number(),
  depth: z.number().optional(),
  version: z.number().optional(),
  items: z.array(z.looseObject({ type: z.string() })),
});

export const ratexMessageSchema = z.object({
  text: z.string(),
  phase: z.enum(["streaming", "complete"]),
});

export const renderLatexRpc = defineRpc({
  name: "ratex.render",
  input: z.object({
    latex: z.string().min(1).max(MAX_LATEX_LENGTH),
    displayMode: z.boolean(),
    color: z.string().optional(),
  }),
  output: z.discriminatedUnion("ok", [
    z.object({
      ok: z.literal(true),
      displayList: displayListSchema,
    }),
    z.object({
      ok: z.literal(false),
      error: z.string(),
    }),
  ]),
});
