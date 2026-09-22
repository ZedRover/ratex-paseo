import assert from "node:assert/strict";
import { test } from "node:test";
import { CHAT_FONT_SIZE, formulaDepth, formulaLayout } from "../shared/layout.ts";

test("same em size keeps glyph scale at 1 regardless of formula width", () => {
  const narrow = formulaLayout({ width: 2, height: 3, depth: 1 }, CHAT_FONT_SIZE, 4);
  const wide = formulaLayout({ width: 12, height: 1.2, depth: 0.3 }, CHAT_FONT_SIZE, 4);
  assert.equal(narrow.scale, 1);
  assert.equal(wide.scale, 1);
  assert.equal(narrow.naturalHeight - 8, (3 + 1) * CHAT_FONT_SIZE);
  assert.equal(wide.naturalHeight - 8, (1.2 + 0.3) * CHAT_FONT_SIZE);
});

test("wide formulas shrink to the container and never scale up", () => {
  const metrics = { width: 20, height: 1, depth: 0 };
  const fitted = formulaLayout(metrics, CHAT_FONT_SIZE, 0, 160);
  const tinyContainer = formulaLayout(metrics, CHAT_FONT_SIZE, 0, 10);
  const roomy = formulaLayout(metrics, CHAT_FONT_SIZE, 0, 10_000);
  assert.ok(fitted.scale < 1);
  assert.equal(fitted.displayWidth, 160);
  assert.equal(tinyContainer.scale, 10 / (20 * CHAT_FONT_SIZE));
  assert.equal(roomy.scale, 1);
  assert.ok(roomy.scale <= 1);
  assert.ok(fitted.scale <= 1);
  assert.ok(tinyContainer.scale <= 1);
});

test("a DisplayList without depth never produces a NaN canvas box", () => {
  const layout = formulaLayout({ width: 3, height: 1.2 }, CHAT_FONT_SIZE, 4);
  assert.ok(Number.isFinite(layout.naturalHeight), `height should be finite, got ${layout.naturalHeight}`);
  assert.ok(layout.naturalHeight > 0);
  assert.equal(formulaDepth({ width: 1, height: 1 }), 0);
  assert.equal(formulaDepth({ width: 1, height: 1, depth: 0.25 }), 0.25);
  assert.equal(formulaDepth({ width: 1, height: 1, depth: Number.NaN }), 0);
});

test("CSS size matches the device-pixel box renderToCanvas allocates", () => {
  const metrics = { width: 7.31, height: 1.13, depth: 0.37 };
  for (const dpr of [1, 1.25, 2, 3]) {
    const layout = formulaLayout(metrics, CHAT_FONT_SIZE, 4, undefined, dpr);
    // Mirrors renderToCanvas: ceil(width * em + 2 * pad) at device pixels.
    const pixelWidth = Math.ceil(metrics.width * CHAT_FONT_SIZE * dpr + 2 * 4 * dpr);
    const pixelHeight = Math.ceil(
      (metrics.height + metrics.depth) * CHAT_FONT_SIZE * dpr + 2 * 4 * dpr,
    );
    assert.equal(layout.displayWidth * dpr, pixelWidth, `width mismatch at dpr ${dpr}`);
    assert.equal(layout.displayHeight * dpr, pixelHeight, `height mismatch at dpr ${dpr}`);
  }
});
