# RaTeX for Paseo

[English](README.md) | [简体中文](README.zh-CN.md)

Render LaTeX formulas directly in Paseo conversations, select and copy their original source, and double-click a formula to inspect its TeX in place.

## Features

- Automatically renders formulas in assistant and user messages.
- Supports inline delimiters `$...$` and `\(...\)`, and display delimiters `$$...$$` and `\[...\]`.
- Preserves the original formula delimiters, whitespace, and line breaks when copying across a formula.
- Double-click a formula to replace it with a Markdown-style code box. **Copy** is in the upper right; **Show formula** restores the rendered view.
- Keyboard access: focus a formula and press **Enter** or **Space** to show its source.
- Embeds the math fonts and WASM binary; rendering does not fetch assets from a CDN.
- Provides a **RaTeX** sidebar scratch pad and a **RaTeX formula** workspace panel.
- Shows selectable TeX while loading, on render failure, and on native iOS/Android clients.

Plugin controls, tooltips, and accessibility labels use English. The installed Paseo plugin SDK does not expose the app's language setting.

## Requirements

| Component | Requirement |
| --- | --- |
| Paseo | Manifest targets `>=0.8.0 <0.10.0`; developed against SDK `0.9.0-beta.2` |
| Client | Web for rendered formulas and double-click interaction; native clients show source |
| Development runtime | Node.js 22.14+ recommended; tested with Node.js 22.21.1 and npm 11.10.1 |
| Dependencies | Installed from `package-lock.json` with `npm ci` |

Paseo plugins must already be enabled on the target daemon. Plugins run as trusted code on that daemon and in its connected clients.

## Install from GitHub

```bash
paseo plugin add ZedRover/ratex-paseo --ref main
paseo plugin ls
```

A private repository requires Git access from the daemon machine. The plugin manifest runs `npm ci` during installation, which also generates the embedded assets. The runtime plugin ID is **`ratex-formula`**.

To update a Git installation:

```bash
paseo plugin update ratex-formula
```

## Local development

```bash
git clone https://github.com/ZedRover/ratex-paseo.git
cd ratex-paseo
npm ci
npm run typecheck
npm test
npm run render:launch
```

Install the checkout into your local daemon:

```bash
paseo plugin install "$PWD"
paseo plugin ls
```

After editing the source:

```bash
npm run typecheck
paseo plugin reload ratex-formula
```

Refresh the web client if it still shows the previous UI. Source edits do not require restarting the daemon.

## Using formulas

For example, send a message containing:

```text
Energy is $E=mc^2$.

\[
a^2 + b^2 = c^2
\]
```

Select across the message to copy the formulas as TeX. Double-click either formula to show a code box at its original location. The copy button copies the complete formula source, including its delimiters.

The scratch pad is available from the **RaTeX** sidebar entry, the **RaTeX formula** workspace panel, and the **Open RaTeX formula** Command Center action.

## How rendering works

1. A client timeline transformer detects complete formulas in messages.
2. The client sends TeX, display mode, and color through a plugin RPC.
3. `ratex-wasm` parses and lays out the formula in the daemon, returning a DisplayList.
4. The web client draws that DisplayList using Canvas 2D and embedded KaTeX font files.
5. Selectable source text preserves copy behavior; opening the code box replaces the canvas with visible source.

The server caches render results with both an entry limit and a serialized-size budget. Large results bypass the cache. Formula input is limited to 4096 characters.

## Markdown behavior and limits

Messages without a complete formula retain Paseo's built-in Markdown renderer. For messages containing formulas, this plugin renders the whole message. It supports headings, emphasis, strikethrough, code spans, fenced and indented code, links, quotes, lists, task lists, pipe tables, and horizontal rules.

- This is a limited Markdown renderer, not a complete CommonMark/GFM implementation.
- Images are shown as their label and URL, rather than fetched and displayed.
- Copying preserves formula source, but does not reconstruct all original Markdown markers or table separators.
- Native clients display TeX source; Canvas rendering and double-click source inspection are web features.
- Unsupported formulas fall back to their source.

## Generated assets

`npm ci` and `npm install` run the `prepare` script, which generates:

| Generated file | Command |
| --- | --- |
| `server/vendor/ratex-wasm-bytes.ts` | `npm run embed-wasm` |
| `client/vendor/fonts.ts` | `npm run embed-fonts` |

These files are ignored by Git and regenerated from the pinned `ratex-wasm` dependency. Do not use `--ignore-scripts` unless you then run `npm run prepare`. Asset consistency is checked by `npm test`.

## Browser regression checks

The browser harness uses the production components, React Query, and server renderer. It substitutes only Paseo host hooks. Install the browser tools in a separate directory:

```bash
mkdir -p /tmp/ratex-browser-tools
npm install --prefix /tmp/ratex-browser-tools \
  esbuild puppeteer-core@25.11.0 react@19.1.0 react-dom@19.1.0 react-native-web@0.21.2
```

Run the real Chrome checks with an installed Chrome or Chromium executable:

```bash
RATEX_BROWSER_DEPS=/tmp/ratex-browser-tools \
CHROME_BIN=/absolute/path/to/chrome \
npm run test:browser
```

With `obscura` installed on `PATH`, also run:

```bash
RATEX_BROWSER_DEPS=/tmp/ratex-browser-tools npm run test:browser -- --obscura
```

Chrome checks actual mouse dragging, clipboard reads and writes, inline/display source boxes, the upper-right copy button, keyboard access, fonts, loading states, theme changes, failures, native fallback, and compact layout. Obscura checks programmatic Range selection through Puppeteer/CDP; it does not verify native mouse selection or clipboard behavior. Both commands shut down their own test servers and browsers.

## Project layout

```text
index.client.tsx       Client contributions and timeline transformers
index.server.ts       Server RPC registration
client/               Message, formula, code-box, and canvas UI
server/               WASM initialization, rendering, and cache
shared/               Parsing, layout, and RPC contracts
scripts/              Embedded asset generation and render smoke test
tests/                Unit tests and browser regression harness
```

## Distribution status

This repository is installable as a Paseo Git plugin. npm publishing is not yet enabled: `package.json` intentionally still contains `"private": true`. Publishing to npm requires a separate package-name/version decision and a review of the packed files and release workflow.

## Acknowledgments

This plugin builds on the work of these projects and their contributors:

- [RaTeX](https://github.com/erweixin/RaTeX): the Rust/WASM math parser and layout engine, plus the web DisplayList renderer used through `ratex-wasm`.
- [Paseo](https://github.com/getpaseo/paseo): the host application, plugin SDK, timeline integration, and client/server runtime.
- [KaTeX](https://github.com/KaTeX/KaTeX): the math font files bundled by `ratex-wasm` and embedded in this plugin.

Thank you to their maintainers and contributors for making this integration possible.

## License and third-party notices

This project's original code is licensed under the [MIT License](LICENSE), copyright © 2026 ZedRover.

Third-party code and assets retain their own licenses. RaTeX (`ratex-wasm`) uses the MIT license; the bundled KaTeX fonts use the SIL Open Font License 1.1. Their copyright and license notices are preserved in [client/vendor/FONT-LICENSE.txt](client/vendor/FONT-LICENSE.txt). The project's MIT license does not replace the fonts' OFL license or other dependency licenses.

When redistributing the plugin with these third-party components, include their applicable copyright and license notices as well as this project's license.
