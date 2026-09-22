import { createElement, useEffect, useRef } from "react";
import { Platform, Text, View } from "react-native";
import { renderToCanvas } from "../node_modules/ratex-wasm/dist/renderer.js";
import { formulaDepth, formulaLayout } from "../shared/layout";
import { RATEX_WASM_VERSION, type DisplayList } from "../shared/ratex";
import { FONT_CSS, FONT_DECLARATIONS } from "./vendor/fonts";

declare const document: {
  createElement(tag: "canvas"): WebCanvas;
  createElement(tag: "style"): { id: string; textContent: string };
  getElementById(id: string): unknown;
  head: { appendChild(node: unknown): void };
  /** FontFaceSet, absent on older engines. */
  fonts?: { load(font: string): Promise<unknown> };
};
declare const window: { devicePixelRatio?: number };

type WebCanvas = {
  width: number;
  height: number;
  style: {
    display: string;
    width: string;
    height: string;
    maxWidth: string;
    pointerEvents: string;
    userSelect: string;
  };
  getContext(contextId: "2d"): unknown;
  setAttribute(name: string, value: string): void;
};

type HostNode = {
  appendChild(node: unknown): unknown;
  innerHTML: string;
  clientWidth?: number;
  parentElement?: { clientWidth: number } | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  addEventListener(type: string, listener: (event: InteractionEvent) => void): void;
  removeEventListener(type: string, listener: (event: InteractionEvent) => void): void;
};

type InteractionEvent = {
  key?: string;
  preventDefault(): void;
  stopPropagation(): void;
};

declare const ResizeObserver: {
  new (callback: () => void): { observe(node: unknown): void; disconnect(): void };
};

const KATEX_FONTS_ID = `ratex-formula-katex-fonts-${RATEX_WASM_VERSION}`;
let fontsReady: Promise<unknown> | undefined;

export function isWebPlatform(platform?: string): boolean {
  return platform ? platform === "web" : Platform.OS === "web";
}

function ensureKatexFonts(): Promise<unknown> {
  if (!fontsReady) {
    if (!document.getElementById(KATEX_FONTS_ID)) {
      const style = document.createElement("style");
      style.id = KATEX_FONTS_ID;
      style.textContent = FONT_CSS;
      document.head.appendChild(style);
    }
    // Explicitly load each face after installing the CSS. fonts.ready can already be
    // resolved before newly inserted styles or canvas-only faces start loading.
    fontsReady = Promise.allSettled(FONT_DECLARATIONS.map((font) => document.fonts?.load(font)));
  }
  return fontsReady;
}

function resolveHost(value: unknown): HostNode | null {
  if (value == null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.appendChild === "function") {
    return value as HostNode;
  }
  for (const key of ["_nativeNode", "_node"]) {
    const nested = record[key];
    if (nested && typeof nested === "object" && typeof (nested as HostNode).appendChild === "function") {
      return nested as HostNode;
    }
  }
  return null;
}

export function FormulaCanvas({
  displayList,
  backgroundColor,
  fontSize,
  padding = 12,
  inline = false,
  onShowSource,
}: {
  displayList: DisplayList | null;
  backgroundColor: string;
  fontSize: number;
  padding?: number;
  inline?: boolean;
  onShowSource?: () => void;
}) {
  const hostRef = useRef(null as unknown);

  useEffect(() => {
    if (Platform.OS !== "web" || !onShowSource) return;
    const host = resolveHost(hostRef.current);
    if (!host) return;
    const open = (event: InteractionEvent) => {
      event.preventDefault();
      event.stopPropagation();
      onShowSource();
    };
    const keydown = (event: InteractionEvent) => {
      if (event.key === "Enter" || event.key === " ") open(event);
    };
    // Keep clicks on formulas inside Markdown links from navigating, while leaving
    // pointerdown/move untouched so normal drag selection still works.
    const click = (event: InteractionEvent) => event.stopPropagation();
    host.setAttribute("tabindex", "0");
    host.setAttribute("role", "button");
    host.setAttribute("aria-label", "View formula source");
    host.setAttribute("title", "Double-click to view source, or press Enter or Space when focused");
    host.addEventListener("dblclick", open);
    host.addEventListener("keydown", keydown);
    host.addEventListener("click", click);
    return () => {
      host.removeEventListener("dblclick", open);
      host.removeEventListener("keydown", keydown);
      host.removeEventListener("click", click);
      for (const name of ["tabindex", "role", "aria-label", "title"]) host.removeAttribute(name);
    };
  }, [onShowSource]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const host = resolveHost(hostRef.current);
    if (!host) return;
    const ready = ensureKatexFonts();

    let signature = "";
    const draw = () => {
      const node = resolveHost(hostRef.current);
      if (!node) return;
      if (!displayList) {
        node.innerHTML = "";
        signature = "";
        return;
      }
      const dpr = window.devicePixelRatio && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      const parentWidth = node.parentElement?.clientWidth || node.clientWidth || 0;
      const depth = formulaDepth(displayList);
      const next = `${parentWidth}|${dpr}|${fontSize}|${padding}|${displayList.width}|${displayList.height}|${depth}`;
      if (next === signature) return;
      signature = next;
      const layout = formulaLayout(displayList, fontSize, padding, parentWidth, dpr);
      const canvas = document.createElement("canvas");
      // renderToCanvas reads height + depth with no default: an absent depth would size
      // the backing store to NaN, i.e. a blank canvas.
      renderToCanvas({ ...displayList, depth } as never, canvas as never, {
        fontSize: fontSize * dpr,
        padding: padding * dpr,
        backgroundColor,
      });
      canvas.style.display = inline ? "inline-block" : "block";
      canvas.style.width = `${layout.displayWidth}px`;
      canvas.style.height = `${layout.displayHeight}px`;
      canvas.style.pointerEvents = onShowSource ? "auto" : "none";
      canvas.style.userSelect = "none";
      // The TeX source next to it is the accessible (and copyable) representation.
      canvas.setAttribute("aria-hidden", "true");
      node.innerHTML = "";
      node.appendChild(canvas);
    };

    draw();
    // Glyphs are painted with the KaTeX webfonts; until they load the browser
    // substitutes a fallback face, so repaint once they are ready.
    let disposed = false;
    void ready.then(() => {
      if (disposed) return;
      signature = "";
      draw();
    });
    const observer = new ResizeObserver(draw);
    observer.observe(host);
    if (host.parentElement) observer.observe(host.parentElement);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [backgroundColor, displayList, fontSize, inline, padding, onShowSource]);

  if (Platform.OS !== "web") return null;
  // A View is a flex box, and nested in a paragraph react-native-web renders it as
  // display:inline-flex — a box boundary where the browser injects a line break into
  // copied text. An inline formula therefore hosts its canvas in a Text (a plain span).
  // No userSelect: "none" on the host: it would take the source text out of the clipboard.
  if (inline) {
    return createElement(Text, {
      ref: hostRef,
      style: { pointerEvents: "auto", cursor: onShowSource ? "pointer" : "auto" },
    } as never);
  }
  return createElement(
    View,
    {
      ref: hostRef,
      collapsable: false,
      style: {
        maxWidth: "100%",
        flexShrink: 1,
        alignSelf: "center",
        pointerEvents: "auto",
        cursor: onShowSource ? "pointer" : "auto",
      },
    } as never,
  );
}
