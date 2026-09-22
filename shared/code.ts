/** Share fence rules between math detection and Markdown rendering. */
export function openingFence(line: string): string | null {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match || (match[1][0] === "`" && match[2].includes("`"))) return null;
  return match[1];
}

export function closesFence(line: string, fence: string): boolean {
  const match = /^ {0,3}(`+|~+)\s*$/.exec(line);
  return !!match && match[1][0] === fence[0] && match[1].length >= fence.length;
}

export function isIndentedCode(line: string): boolean {
  // Preserve the renderer's existing support for deeply indented list markers.
  return /^(?: {4}|\t)/.test(line) && !/^\s*(?:[-+*]|\d+\.)\s+\S/.test(line);
}

/** Code spans close with the same number of backticks as their opener. */
export function codeSpan(text: string, start: number): { end: number; content: string } | null {
  let from = start;
  while (text[from] === "`") from += 1;
  const size = from - start;
  let cursor = from;
  while (cursor < text.length) {
    const close = text.indexOf("`", cursor);
    if (close === -1) return null;
    cursor = close;
    while (text[cursor] === "`") cursor += 1;
    if (cursor - close === size) return { end: cursor, content: text.slice(from, close) };
  }
  return null;
}
