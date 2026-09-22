import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { renderLatex } from "../../server/render.ts";

// Browser tools can live in a scratch install instead of the plugin's production bundle.
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(path.join(process.env.RATEX_BROWSER_DEPS || root, "package.json"));
const { build } = require("esbuild");
const puppeteer = require("puppeteer-core");
const dependency = (name) => path.dirname(require.resolve(`${name}/package.json`));
const mode = process.argv.includes("--obscura") ? "obscura" : "chrome";
const errors = [];
const rpcRequests = [];
let rpcDelay = 0;

const bundle = await build({
  entryPoints: [path.join(root, "tests/browser/entry.jsx")], bundle: true, write: false,
  format: "iife", jsx: "automatic", logLevel: "warning",
  alias: {
    react: dependency("react"), "react-dom": dependency("react-dom"),
    "react-native": dependency("react-native-web"),
  },
  plugins: [{ name: "paseo-host-fixture", setup(builder) {
    builder.onResolve({ filter: /^@getpaseo\/plugin(?:\/.*)?$/ }, ({ path: name }) => name.endsWith("/react-native")
      ? { path: path.join(root, "tests/browser/host-native.jsx") }
      : { path: name, namespace: "host" });
    builder.onLoad({ filter: /.*/, namespace: "host" }, ({ path }) => ({
      contents: path.endsWith("/react-native")
        ? "export const useRevealedText = (text) => text;"
        : path.endsWith("/client")
          ? `export const useRpc = () => async (input) => {
              const response = await fetch('/render', {method:'POST',body:JSON.stringify(input)});
              return response.json();
            }; export const openExternalUrl = async (url) => { window.lastOpenedUrl = url; };`
          : "export const defineRpc = (contract) => contract;",
      loader: "js",
    }));
  } }],
});

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>body{margin:20px;background:#111;color:#eee;font:16px sans-serif}#before,#after{padding:4px}</style>
</head><body><div id="before">BEFORE</div><div id="root"></div><div id="after">AFTER</div>
<script src="/bundle.js"></script></body></html>`;
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/render") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const input = JSON.parse(raw);
      rpcRequests.push(input);
      if (rpcDelay) await new Promise((resolve) => setTimeout(resolve, rpcDelay));
      const result = await renderLatex(input);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result));
    } else if (req.url === "/bundle.js") {
      res.setHeader("Content-Type", "application/javascript");
      res.end(bundle.outputFiles[0].text);
    } else { res.setHeader("Content-Type", "text/html"); res.end(html); }
  } catch (error) { errors.push(String(error)); res.writeHead(500).end(); }
});
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
let obscura;
try {
  if (mode === "obscura") {
    const port = Number(process.env.OBSCURA_PORT || 19223);
    obscura = spawn("obscura", ["serve", "--port", String(port), "--allow-private-network"], { stdio: "ignore" });
    let startupError;
    obscura.on("error", (error) => { startupError = error; });
    const browserURL = `http://127.0.0.1:${port}`;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (startupError) throw startupError;
      if (obscura.exitCode !== null) throw new Error("obscura exited before CDP became available");
      try { browser = await puppeteer.connect({ browserURL }); break; }
      catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    assert.ok(browser, "obscura CDP startup timed out");
  } else {
    assert.ok(process.env.CHROME_BIN, "Set CHROME_BIN to a Chrome/Chromium executable");
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN,
      args: ["--no-sandbox", "--disable-dev-shm-usage"], headless: true });
    await browser.defaultBrowserContext().overridePermissions(origin, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
  }
  const page = await browser.newPage();
  const external = [];
  page.on("pageerror", (error) => { errors.push(String(error)); console.error("Browser error:", String(error)); });
  page.on("request", (request) => { if (/^https?:/.test(request.url()) && !request.url().startsWith(origin)) external.push(request.url()); });
  if (mode === "chrome") await page.setViewport({ width: 1100, height: 1100 });
  await page.goto(origin, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll("canvas").length === 8);
  const rangeCopy = await page.evaluate(() => {
    const range = document.createRange(); range.selectNodeContents(document.getElementById("root"));
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    return selection.toString();
  });
  for (const token of ["$E=mc^2$", "$a^2$", "\\(b^2\\)", "$$\nc^2 = a^2 + b^2\n$$", "$c$", "$x_i$", "before $$literal$$ after"]) {
    assert.ok(rangeCopy.includes(token), `${mode}: missing source ${JSON.stringify(token)} from ${JSON.stringify(rangeCopy)}`);
  }
  console.log(`${mode}: Range selection retains all math delimiters, multiline source and literal code`);

  if (mode === "chrome") {
    await page.waitForFunction(() => [...document.fonts].filter((font) => font.family.startsWith("KaTeX_")).every((font) => font.status === "loaded"));
    const fontCount = await page.evaluate(() => [...document.fonts].filter((font) => font.family.startsWith("KaTeX_")).length);
    assert.equal(fontCount, 20);
    const before = await (await page.$("#before")).boundingBox();
    const after = await (await page.$("#after")).boundingBox();
    await page.mouse.move(before.x + 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(after.x + 40, after.y + after.height / 2, { steps: 30 });
    await page.mouse.up();
    await page.keyboard.down("Control"); await page.keyboard.press("KeyC"); await page.keyboard.up("Control");
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(clipboard.includes(rangeCopy), `clipboard differs from Range: ${JSON.stringify(clipboard)}`);
    console.log("chrome: real mouse drag + Ctrl+C + clipboard read passed; 20 embedded fonts loaded without network");

    // Actual double-click coordinates must hit the formula even though its bitmap is
    // excluded from selection. Exercise inline and display formulas independently.
    for (const [index, source] of [[2, "\\(b^2\\)"], [3, "$$\nc^2 = a^2 + b^2\n$$"]]) {
      const canvases = await page.$$("canvas");
      await canvases[index].click({ count: 2 });
      await page.waitForSelector('#root [data-testid="formula-source"]', { timeout: 5000 });
      assert.equal(await page.$('dialog'), null, "source must be shown in place, without a dialog");
      assert.equal(await page.$eval('#root', (node) => node.querySelectorAll('canvas').length), 7);
      assert.equal(await page.$eval('[aria-label="TeX source"]', (node) => node.textContent), source);
      const box = await (await page.$('[data-testid="formula-source"]')).boundingBox();
      const copy = await (await page.$('[aria-label="Copy formula source"]')).boundingBox();
      assert.ok(copy.x + copy.width > box.x + box.width - 24, "copy button should be in upper right");
      assert.ok(copy.y < box.y + 24, "copy button should be in the top toolbar");
      await page.click('[aria-label="Copy formula source"]');
      await page.waitForFunction(() => document.querySelector('[data-testid="formula-source"]').textContent.includes("Copied"), { timeout: 5000 });
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), source);
      const selectedSource = await page.$eval('[data-testid="formula-source"]', (node) => {
        const range = document.createRange(); range.selectNodeContents(node);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        return selection.toString();
      });
      assert.equal(selectedSource.trim(), source.trim(), "selection must not duplicate source or include toolbar labels");
      if (index === 3) await page.screenshot({ path: "/tmp/ratex-formula-source.png" });
      await page.click('[aria-label="Show formula"]');
      await page.waitForFunction(() => !document.querySelector('[data-testid="formula-source"]'));
      assert.equal(await page.$eval("#root", (node) => node.querySelectorAll("canvas").length), 8);
    }
    const formulaButton = await page.$('[aria-label="View formula source"]');
    await formulaButton.focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-testid="formula-source"]');
    assert.equal(await page.$eval('[aria-label="TeX source"]', (node) => node.textContent), "$E=mc^2$");
    await page.click('[aria-label="Show formula"]');
    await page.waitForFunction(() => !document.querySelector('[data-testid="formula-source"]'));
    assert.equal(await page.evaluate(() => {
      const range = document.createRange(); range.selectNodeContents(document.getElementById("root"));
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      return selection.toString();
    }), rangeCopy, "restoring formula must not change copied message text");
    console.log("chrome: double-click inline/display math, in-place code boxes, top-right copy, source selection and restore passed");

    rpcDelay = 500;
    await page.evaluate(() => window.setFixture({ text: "New $z^{123}$ formula" }));
    await page.waitForFunction(() => document.getElementById("root").innerText.includes("$z^{123}$"));
    assert.equal(await page.$eval("#root", (node) => node.querySelectorAll("canvas").length), 0, "old formula must not survive new source");
    await page.waitForFunction(() => document.querySelectorAll("canvas").length === 1);
    const canvas = await page.$("canvas");
    await page.evaluate(() => window.setFixture({ colors: { foreground: "#121212", foregroundMuted: "#555", border: "#ddd", surface2: "#eee", accent: "blue" } }));
    await page.waitForFunction(() => getComputedStyle(document.getElementById("root").firstChild.firstChild).color === "rgb(18, 18, 18)");
    assert.equal(await canvas.evaluate((node) => node.isConnected), true, "theme loading must retain canvas");
    await page.waitForFunction((node) => !node.isConnected, {}, canvas);
    assert.ok(await page.$("canvas"), "theme response should repaint the canvas");
    rpcDelay = 0;
    await page.evaluate(() => window.setFixture({ text: "Bad $\\definitelyNotACommand{x}$ formula" }));
    await page.waitForFunction(() => document.getElementById("root").innerText.includes("$\\definitelyNotACommand{x}$"));
    await page.waitForFunction(() => window.pendingQueries() === 0);
    assert.equal(await page.$eval("#root", (node) => node.querySelectorAll("canvas").length), 0);
    const count = rpcRequests.length;
    await page.evaluate(() => window.setFixture({ text: "Native $n_{native}$", platform: "ios" }));
    await page.waitForFunction(() => document.getElementById("root").innerText.includes("$n_{native}$"));
    assert.equal(rpcRequests.length, count, "native should not request canvas rendering");

    await page.evaluate(() => window.resetFixture());
    await page.setViewport({ width: 390, height: 1200 });
    await page.evaluate(() => window.setFixture({ compact: true }));
    await page.waitForFunction(() => document.querySelectorAll("canvas").length === 8);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 390), true, "compact fixture must not overflow");
    const compactFormulas = await page.$$('canvas');
    await compactFormulas[2].click({ count: 2 });
    await page.waitForSelector('[data-testid="formula-source"]');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 390), true, "compact source box must not overflow");
    await page.click('[aria-label="Show formula"]');
    await page.waitForFunction(() => document.querySelectorAll('canvas').length === 8);
    console.log("chrome: new-source loading, theme continuity, render failure, native RPC suppression and compact layout passed");
  }
  assert.deepEqual(external, [], "fonts must not request a CDN");
  assert.deepEqual(errors, [], "no browser or RPC errors");
} finally {
  if (browser) {
    if (mode === "obscura") await browser.disconnect();
    else await browser.close();
  }
  if (obscura) obscura.kill();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
