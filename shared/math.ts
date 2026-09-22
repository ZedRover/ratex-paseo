import { closesFence, codeSpan, isIndentedCode, openingFence } from "./code.ts";

export type MathSegment =
  | { type: "text"; text: string }
  /** `source` is the untouched slice, delimiters included: what a copy of this formula must yield. */
  | { type: "math"; latex: string; displayMode: boolean; source: string };

/** Delimited TeX for callers that have no original slice (scratch pad, fallbacks). */
export function mathSource(latex: string, displayMode: boolean): string {
  return displayMode ? `$$${latex}$$` : `$${latex}$`;
}

export function splitMathSegments(input: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let cursor = 0;
  let textStart = 0;
  let fence: string | null = null;

  const flushText = (end: number) => {
    if (end > textStart) {
      segments.push({ type: "text", text: input.slice(textStart, end) });
    }
  };

  const takeMath = (openLength: number, closeIndex: number, closeLength: number, displayMode: boolean) => {
    const latex = input.slice(cursor + openLength, closeIndex).trim();
    if (!latex) {
      cursor = closeIndex + closeLength;
      return;
    }
    flushText(cursor);
    segments.push({
      type: "math",
      latex,
      displayMode,
      source: input.slice(cursor, closeIndex + closeLength),
    });
    cursor = closeIndex + closeLength;
    textStart = cursor;
  };

  while (cursor < input.length) {
    if (cursor === 0 || input[cursor - 1] === "\n") {
      const end = input.indexOf("\n", cursor);
      const lineEnd = end === -1 ? input.length : end;
      const line = input.slice(cursor, lineEnd);
      if (fence) {
        if (closesFence(line, fence)) fence = null;
        cursor = lineEnd + 1;
        continue;
      }
      fence = openingFence(line);
      if (fence || isIndentedCode(line)) {
        cursor = lineEnd + 1;
        continue;
      }
    }

    if (input[cursor] === "`") {
      const span = codeSpan(input, cursor);
      // An unmatched backtick is literal text; skipping to the end would hide every
      // formula after it.
      if (span) cursor = span.end;
      else while (input[cursor] === "`") cursor += 1;
      continue;
    }

    // Consume escaped characters as a pair, so even runs of backslashes still allow
    // a following delimiter while escaped dollars/backslashes remain literal.
    if (input[cursor] === "\\" && ["\\", "$", "`"].includes(input[cursor + 1])) {
      cursor += 2;
      continue;
    }

    if (input.startsWith("$$", cursor)) {
      const close = input.indexOf("$$", cursor + 2);
      // Unterminated (still streaming) or spanning a blank line: not a formula. Skip the
      // opener and keep scanning, so one stray $$ cannot swallow the rest of the message.
      if (close === -1 || input.slice(cursor + 2, close).includes("\n\n")) {
        cursor += 2;
        continue;
      }
      takeMath(2, close, 2, true);
      continue;
    }

    if (input.startsWith("\\[", cursor)) {
      const close = input.indexOf("\\]", cursor + 2);
      if (close === -1) {
        cursor += 2;
        continue;
      }
      takeMath(2, close, 2, true);
      continue;
    }

    if (input.startsWith("\\(", cursor)) {
      const close = input.indexOf("\\)", cursor + 2);
      if (close === -1) {
        cursor += 2;
        continue;
      }
      takeMath(2, close, 2, false);
      continue;
    }

    if (input[cursor] === "$" && input[cursor + 1] !== "$") {
      const next = input[cursor + 1];
      if (next && next !== " " && next !== "\n" && next !== "\t") {
        const close = findInlineDollarClose(input, cursor + 1);
        if (close !== -1) {
          takeMath(1, close, 1, false);
          continue;
        }
      }
    }

    cursor += 1;
  }

  flushText(input.length);
  return mergeText(segments);
}

export function hasCompleteMath(text: string): boolean {
  return splitMathSegments(text).some((segment) => segment.type === "math");
}

function findInlineDollarClose(input: string, from: number): number {
  // A `$` that opens a new word ("$5 and $7") never closes a formula. Seeing one means the
  // run is prose: pairing across it would turn a whole sentence into math and delete it.
  for (let index = from; index < input.length; index += 1) {
    if (input[index] === "\n") return -1;
    if (input[index] === "\\") {
      index += 1;
      continue;
    }
    if (input[index] !== "$") continue;
    if (input[index + 1] === "$") return -1;
    if (input[index - 1] === " " || input[index - 1] === "\t") {
      return -1;
    }
    return index;
  }
  return -1;
}

function mergeText(segments: MathSegment[]): MathSegment[] {
  const merged: MathSegment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (segment.type === "text" && last?.type === "text") {
      merged[merged.length - 1] = { type: "text", text: last.text + segment.text };
    } else {
      merged.push(segment);
    }
  }
  return merged;
}
