import { splitMathSegments, type MathSegment } from "./math.ts";
import { closesFence, codeSpan, isIndentedCode, openingFence } from "./code.ts";

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "math"; latex: string; source: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "strike"; children: InlineNode[] }
  | { type: "link"; href: string; image: boolean; children: InlineNode[] };

export type TableAlign = "left" | "center" | "right";

export type MarkdownBlock =
  | { type: "heading"; level: number; inlines: InlineNode[] }
  | { type: "paragraph"; inlines: InlineNode[] }
  | {
      type: "list-item";
      ordered: boolean;
      marker: string;
      indent: number;
      checked: boolean | null;
      inlines: InlineNode[];
    }
  | { type: "quote"; blocks: MarkdownBlock[] }
  | { type: "code"; text: string }
  | { type: "display-math"; latex: string; source: string }
  | { type: "table"; align: TableAlign[]; header: InlineNode[][]; rows: InlineNode[][][] }
  | { type: "hr" };

type LinePart =
  | { type: "text"; text: string }
  | { type: "math"; latex: string; source: string };

type Line = LinePart[] | { display: string; source: string };

export function markdownBlocks(source: string): MarkdownBlock[] {
  return blocksFromSegments(splitMathSegments(source));
}

export function blocksFromSegments(segments: MathSegment[]): MarkdownBlock[] {
  return blocksFromLines(linesFromSegments(segments));
}

function linesFromSegments(segments: MathSegment[]): Line[] {
  const lines: Line[] = [];
  let current: LinePart[] = [];

  const flushLine = () => {
    lines.push(current);
    current = [];
  };

  for (const segment of segments) {
    if (segment.type === "math" && segment.displayMode) {
      flushLine();
      lines.push({ display: segment.latex, source: segment.source });
      continue;
    }
    if (segment.type === "math") {
      current.push({ type: "math", latex: segment.latex, source: segment.source });
      continue;
    }
    const pieces = segment.text.split("\n");
    pieces.forEach((piece, index) => {
      if (index > 0) flushLine();
      if (piece.length > 0) current.push({ type: "text", text: piece });
    });
  }
  flushLine();
  return lines;
}

/** Quotes recurse; a model can emit ">" thousands deep, and unbounded recursion overflows the stack. */
const MAX_QUOTE_DEPTH = 8;

function blocksFromLines(lines: Line[], depth = 0): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: LinePart[] = [];
  let inCode = false;
  let fence = "```";
  let code: string[] = [];

  const flushParagraph = () => {
    const inlines = parseLineParts(paragraph);
    if (inlines.length > 0) blocks.push({ type: "paragraph", inlines });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if ("display" in line) {
      if (inCode) {
        code.push(line.source);
        continue;
      }
      flushParagraph();
      blocks.push({ type: "display-math", latex: line.display, source: line.source });
      continue;
    }

    const raw = lineText(line);
    const trimmed = raw.trim();

    if (inCode) {
      if (closesFence(raw, fence)) {
        blocks.push({ type: "code", text: code.join("\n") });
        code = [];
        inCode = false;
      } else {
        code.push(raw);
      }
      continue;
    }

    const opening = openingFence(raw);
    if (opening) {
      flushParagraph();
      inCode = true;
      fence = opening;
      continue;
    }

    if (trimmed.length === 0) {
      flushParagraph();
      continue;
    }

    if (isIndentedCode(raw) && paragraph.length === 0) {
      const indented: string[] = [];
      while (index < lines.length) {
        const candidate = lines[index];
        if ("display" in candidate) break;
        const value = lineText(candidate);
        if (!isIndentedCode(value)) break;
        indented.push(value.replace(/^(?: {4}|\t)/, ""));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: "code", text: indented.join("\n") });
      continue;
    }

    const quote = depth < MAX_QUOTE_DEPTH ? /^ {0,3}> ?/.exec(raw) : null;
    if (quote) {
      flushParagraph();
      const quoted: Line[] = [];
      while (index < lines.length) {
        const candidate = lines[index];
        if ("display" in candidate) {
          if (quoted.length === 0) break;
          quoted.push(candidate);
          index += 1;
          continue;
        }
        const marker = /^ {0,3}> ?/.exec(lineText(candidate));
        if (!marker) break;
        quoted.push(stripPrefix(candidate, marker[0].length));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: "quote", blocks: blocksFromLines(quoted, depth + 1) });
      continue;
    }

    const next = lines[index + 1];
    if (raw.includes("|") && next && !("display" in next) && isDelimiterRow(lineText(next))) {
      flushParagraph();
      const align = rowAlignments(lineText(next));
      const header = splitCells(line).map(parseLineParts);
      const rows: InlineNode[][][] = [];
      index += 2;
      while (index < lines.length) {
        const candidate = lines[index];
        if ("display" in candidate) break;
        const candidateRaw = lineText(candidate);
        if (!candidateRaw.includes("|") || candidateRaw.trim().length === 0) break;
        rows.push(splitCells(candidate).map(parseLineParts));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: "table", align, header, rows });
      continue;
    }

    const heading = /^ {0,3}(#{1,6})\s+/.exec(raw);
    if (heading && raw.slice(heading[0].length).trim().length > 0) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: heading[1].length,
        inlines: parseLineParts(stripTrailingHashes(stripPrefix(line, heading[0].length))),
      });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed) && line.every((part) => part.type === "text")) {
      flushParagraph();
      blocks.push({ type: "hr" });
      continue;
    }

    // Matched against the raw line (formulas included) so an indented marker is stripped
    // with its indent, and a line that merely starts with a formula is not a list.
    const ul = /^(\s*)[-*+](\s+)(?=\S)/.exec(raw);
    if (ul) {
      flushParagraph();
      blocks.push(listItem(line, ul[0].length, listIndent(ul[1]), false, "•"));
      continue;
    }

    const ol = /^(\s*)(\d+)\.(\s+)(?=\S)/.exec(raw);
    if (ol) {
      flushParagraph();
      blocks.push(listItem(line, ol[0].length, listIndent(ol[1]), true, `${ol[2]}.`));
      continue;
    }

    if (paragraph.length > 0) paragraph.push({ type: "text", text: "\n" });
    paragraph.push(...line);
  }

  if (inCode) blocks.push({ type: "code", text: code.join("\n") });
  flushParagraph();
  return blocks;
}

function listItem(
  line: LinePart[],
  prefixLength: number,
  indent: number,
  ordered: boolean,
  marker: string,
): MarkdownBlock {
  let parts = stripPrefix(line, prefixLength);
  let checked: boolean | null = null;
  const task = /^\[([ xX])\]\s+/.exec(lineText(parts));
  if (task && !ordered) {
    checked = task[1] !== " ";
    parts = stripPrefix(parts, task[0].length);
  }
  return {
    type: "list-item",
    ordered,
    marker: checked === null ? marker : checked ? "☑" : "☐",
    indent,
    checked,
    inlines: parseLineParts(parts),
  };
}

/** Text of a line as written, formulas contributing their own source. */
function lineText(parts: LinePart[]): string {
  return parts.map((part) => (part.type === "text" ? part.text : part.source)).join("");
}

function listIndent(whitespace: string): number {
  return Math.min(4, Math.floor(whitespace.replace(/\t/g, "  ").length / 2));
}

function isDelimiterRow(raw: string): boolean {
  return /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-*:?\s*\|?\s*$/.test(raw) && raw.includes("-");
}

function rowAlignments(raw: string): TableAlign[] {
  return raw
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => {
      const text = cell.trim();
      if (text.startsWith(":") && text.endsWith(":")) return "center" as const;
      if (text.endsWith(":")) return "right" as const;
      return "left" as const;
    });
}

function splitCells(parts: LinePart[]): LinePart[][] {
  const cells: LinePart[][] = [[]];
  for (const part of parts) {
    if (part.type !== "text") {
      cells[cells.length - 1].push(part);
      continue;
    }
    const pieces = part.text.split("|");
    pieces.forEach((piece, index) => {
      if (index > 0) cells.push([]);
      if (piece.length > 0) cells[cells.length - 1].push({ type: "text", text: piece });
    });
  }
  const trimmed = cells.map(trimCell);
  if (trimmed.length > 1 && isBlankCell(trimmed[0])) trimmed.shift();
  if (trimmed.length > 1 && isBlankCell(trimmed[trimmed.length - 1])) trimmed.pop();
  return trimmed;
}

function trimCell(parts: LinePart[]): LinePart[] {
  const result = parts.map((part) => ({ ...part }));
  const first = result[0];
  if (first?.type === "text") first.text = first.text.replace(/^\s+/, "");
  const last = result[result.length - 1];
  if (last?.type === "text") last.text = last.text.replace(/\s+$/, "");
  return result.filter((part) => part.type !== "text" || part.text.length > 0);
}

function isBlankCell(parts: LinePart[]): boolean {
  return parts.length === 0;
}

function stripPrefix(parts: LinePart[], count: number): LinePart[] {
  let remaining = count;
  const result: LinePart[] = [];
  for (const part of parts) {
    if (part.type !== "text" || remaining === 0) {
      result.push(part);
      continue;
    }
    if (part.text.length <= remaining) {
      remaining -= part.text.length;
      continue;
    }
    result.push({ type: "text", text: part.text.slice(remaining) });
    remaining = 0;
  }
  return result;
}

/** ATX headings may be closed with trailing hashes: "## Title ##". */
function stripTrailingHashes(parts: LinePart[]): LinePart[] {
  const last = parts[parts.length - 1];
  if (!last || last.type !== "text") return parts;
  const text = last.text.replace(/\s+#+\s*$/, "").replace(/\s+$/, "");
  if (text === last.text) return parts;
  const head = parts.slice(0, -1);
  return text.length > 0 ? [...head, { type: "text", text }] : head;
}

const MATH_MARK = "\u0000";

/**
 * How far an unclosed `[`, `*`, `**` or `~~` may look ahead for its partner. Without a
 * bound, a line full of delimiters costs O(n²) scans and can stall the renderer; emphasis
 * spanning more than this is not emphasis anyone wrote.
 */
const MAX_INLINE_SPAN = 2048;

/** Link labels are short; a tighter bound keeps a bracket-heavy message cheap to scan. */
const MAX_LINK_LABEL = 512;

/**
 * Inline markdown is parsed over the whole line, with formulas standing in as
 * placeholders, so emphasis that spans a formula ("**bold $x$ text**") is still emphasis
 * instead of leaking its literal asterisks.
 */
function parseLineParts(parts: LinePart[]): InlineNode[] {
  const maths: Array<{ latex: string; source: string }> = [];
  let text = "";
  for (const part of parts) {
    if (part.type === "math") {
      text += `${MATH_MARK}${maths.length}${MATH_MARK}`;
      maths.push(part);
    } else {
      // A literal NUL in the message must not be able to impersonate a placeholder.
      text += part.text.replace(/\u0000/g, "");
    }
  }
  return restoreMath(parseInlineMarkdown(text), maths);
}

function restoreMath(
  nodes: InlineNode[],
  maths: Array<{ latex: string; source: string }>,
): InlineNode[] {
  if (maths.length === 0) return mergeText(nodes).filter(isRenderable);
  const result: InlineNode[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        result.push(...expandPlaceholders(node.text, maths));
        break;
      case "code":
        result.push({ type: "code", text: replacePlaceholders(node.text, maths) });
        break;
      case "math":
        result.push(node);
        break;
      case "link":
        result.push({ ...node, href: replacePlaceholders(node.href, maths), children: restoreMath(node.children, maths) });
        break;
      default:
        result.push({ ...node, children: restoreMath(node.children, maths) });
        break;
    }
  }
  return mergeText(result).filter(isRenderable);
}

function expandPlaceholders(
  text: string,
  maths: Array<{ latex: string; source: string }>,
): InlineNode[] {
  const nodes: InlineNode[] = [];
  const pattern = new RegExp(`${MATH_MARK}(\\d+)${MATH_MARK}`, "g");
  let last = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > last) nodes.push({ type: "text", text: text.slice(last, match.index) });
    const math = maths[Number(match[1])];
    if (math) nodes.push({ type: "math", latex: math.latex, source: math.source });
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push({ type: "text", text: text.slice(last) });
  return nodes;
}

/** Escapes and placeholders split text apart; glue the pieces back together. */
function mergeText(nodes: InlineNode[]): InlineNode[] {
  const merged: InlineNode[] = [];
  for (const node of nodes) {
    const last = merged[merged.length - 1];
    if (node.type === "text" && last?.type === "text") {
      merged[merged.length - 1] = { type: "text", text: last.text + node.text };
    } else {
      merged.push(node);
    }
  }
  return merged;
}

function replacePlaceholders(text: string, maths: Array<{ latex: string; source: string }>): string {
  return text.replace(new RegExp(`${MATH_MARK}(\\d+)${MATH_MARK}`, "g"), (_all, index: string) => {
    return maths[Number(index)]?.source ?? "";
  });
}

function isRenderable(node: InlineNode): boolean {
  if (node.type === "text") return node.text.length > 0;
  if (node.type === "strong" || node.type === "em" || node.type === "strike") {
    return node.children.length > 0;
  }
  return true;
}

export function parseInlineMarkdown(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let cursor = 0;
  let start = 0;

  const flush = (end: number) => {
    if (end > start) nodes.push({ type: "text", text: text.slice(start, end) });
  };

  while (cursor < text.length) {
    if (text[cursor] === "\\" && cursor + 1 < text.length && isEscapable(text[cursor + 1])) {
      flush(cursor);
      nodes.push({ type: "text", text: text[cursor + 1] });
      cursor += 2;
      start = cursor;
      continue;
    }

    if (text[cursor] === "`") {
      const span = codeSpan(text, cursor);
      if (span) {
        flush(cursor);
        nodes.push({ type: "code", text: span.content });
        cursor = span.end;
        start = cursor;
        continue;
      }
      while (text[cursor] === "`") cursor += 1;
      continue;
    }

    const link = matchLink(text, cursor);
    if (link) {
      flush(cursor);
      nodes.push({
        type: "link",
        href: link.href,
        image: link.image,
        children: parseInlineMarkdown(link.label),
      });
      cursor = link.end;
      start = cursor;
      continue;
    }

    const emphasis =
      matchDelimited(text, cursor, "**") ??
      matchDelimited(text, cursor, "__") ??
      matchDelimited(text, cursor, "~~") ??
      matchDelimited(text, cursor, "*");
    if (emphasis) {
      flush(cursor);
      const children = parseInlineMarkdown(emphasis.inner);
      const type = emphasis.delim === "*" ? "em" : emphasis.delim === "~~" ? "strike" : "strong";
      nodes.push({ type, children } as InlineNode);
      cursor = emphasis.end;
      start = cursor;
      continue;
    }

    cursor += 1;
  }
  flush(text.length);
  return mergeText(nodes);
}

function isEscapable(char: string): boolean {
  return "\\`*_{}[]()#+-.!|~$".includes(char);
}

function matchLink(
  text: string,
  cursor: number,
): { label: string; href: string; end: number; image: boolean } | null {
  const image = text[cursor] === "!" && text[cursor + 1] === "[";
  if (!image && text[cursor] !== "[") return null;
  const labelStart = cursor + (image ? 2 : 1);
  const labelLimit = Math.min(text.length, labelStart + MAX_LINK_LABEL);
  let depth = 1;
  let index = labelStart;
  for (; index < labelLimit; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }
    if (text[index] === "[") depth += 1;
    if (text[index] === "]") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0 || text[index + 1] !== "(") return null;
  const targetStart = index + 2;
  const targetLimit = Math.min(text.length, targetStart + MAX_INLINE_SPAN);
  let close = targetStart;
  let parentheses = 1;
  for (; close < targetLimit; close += 1) {
    if (text[close] === "\\") { close += 1; continue; }
    if (text[close] === "(") parentheses += 1;
    if (text[close] === ")" && --parentheses === 0) break;
  }
  if (parentheses !== 0) return null;
  const target = text.slice(index + 2, close).trim();
  const destination = /^(<[^<>\n]+>|\S+?)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^\n]*\)))?$/.exec(target);
  if (!destination) return null;
  return {
    label: text.slice(labelStart, index),
    href: destination[1].replace(/^<|>$/g, "").replace(/\\([()\\])/g, "$1"),
    end: close + 1,
    image,
  };
}

/** CommonMark-ish flanking: no space just inside either delimiter, and no empty span. */
function matchDelimited(
  text: string,
  cursor: number,
  delim: string,
): { inner: string; end: number; delim: string } | null {
  if (!text.startsWith(delim, cursor)) return null;
  if (delim === "*" && text[cursor + 1] === "*") return null;
  const from = cursor + delim.length;
  const opener = text[from];
  if (!opener || /\s/.test(opener)) return null;
  const limit = Math.min(text.length, from + MAX_INLINE_SPAN);
  let index = from;
  while (index < limit) {
    const offset = text.slice(index, limit).indexOf(delim);
    if (offset === -1) return null;
    const close = index + offset;
    const before = text[close - 1];
    if (before && !/\s/.test(before) && close > from) {
      if (delim === "*" && text[close + 1] === "*") {
        index = close + 1;
        continue;
      }
      return { inner: text.slice(from, close), end: close + delim.length, delim };
    }
    index = close + delim.length;
  }
  return null;
}
