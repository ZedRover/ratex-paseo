export type FormulaMetrics = {
  width: number;
  height: number;
  depth?: number;
};

export const CHAT_FONT_SIZE = 16;

/** `depth` is optional in the DisplayList protocol; absent means zero, never NaN. */
export function formulaDepth(metrics: FormulaMetrics): number {
  return Number.isFinite(metrics.depth) ? (metrics.depth as number) : 0;
}

/**
 * Convert a RaTeX DisplayList (em units) into CSS pixels at a fixed em size.
 * `scale` is never greater than 1: wide formulas shrink to the container,
 * narrow formulas keep the same glyph size.
 *
 * The natural size is derived from the same ceil()ed device-pixel box that
 * `renderToCanvas` allocates, so the bitmap is never stretched anisotropically.
 */
export function formulaLayout(
  metrics: FormulaMetrics,
  fontSize: number,
  padding: number,
  containerWidth?: number,
  devicePixelRatio = 1,
) {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const em = fontSize * dpr;
  const pad = padding * dpr;
  const pixelWidth = Math.max(1, Math.ceil(metrics.width * em + 2 * pad));
  const pixelHeight = Math.max(1, Math.ceil((metrics.height + formulaDepth(metrics)) * em + 2 * pad));
  const naturalWidth = pixelWidth / dpr;
  const naturalHeight = pixelHeight / dpr;
  const scale =
    containerWidth && containerWidth > 0 ? Math.min(1, containerWidth / naturalWidth) : 1;
  return {
    naturalWidth,
    naturalHeight,
    scale,
    displayWidth: naturalWidth * scale,
    displayHeight: naturalHeight * scale,
  };
}
