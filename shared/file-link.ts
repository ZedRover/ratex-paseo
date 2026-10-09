/** A workspace file in the shape Paseo's file tabs open: relative to the agent cwd when inside it. */
export type FileLocation = { path: string; lineStart?: number; lineEnd?: number };

// Mirrors Paseo 0.11's assistant file links (classifyAssistantFileLink and
// normalizeInlinePathTarget) minus its daemon lookup, which resolves bare file names.
const EXTENSIONS = new Set([
  "astro", "bash", "c", "cc", "cjs", "cpp", "cs", "css", "cts", "cxx", "env", "fish", "go", "gql",
  "gradle", "graphql", "h", "hpp", "htm", "html", "ini", "java", "js", "json", "jsonc", "jsx", "kt",
  "kts", "less", "lock", "lua", "md", "mdx", "mjs", "mts", "php", "proto", "py", "rb", "rs", "sass",
  "scss", "sh", "sql", "svelte", "swift", "toml", "ts", "tsx", "txt", "vue", "xml", "yaml", "yml", "zsh",
]);
const LINE_SUFFIX = /^(.+?)(?::(\d+)(?::\d+)?(?:-(\d+)(?::\d+)?)?|\((\d+)(?:,\d+)?(?:-(\d+)(?:,\d+)?)?\))$/;
const LINE_HASH = /^L(\d+)(?:C\d+)?(?:-L?(\d+)(?:C\d+)?)?$/i;
const FILE_URL = /^file:\/\/(?:localhost)?(\/[^?#]*)(#.*)?$/i;
const DRIVE = /^[A-Za-z]:\//;

/** Target of a Markdown link, or null for URLs and anything that is not a file. */
export function fileLinkTarget(href: string, cwd: string | null): FileLocation | null {
  return fileTarget(href, cwd, true);
}

/**
 * Target of inline code naming a file, e.g. `client/message.tsx:105`. Bare names such as
 * `message.tsx` stay plain code: Paseo finds them through its daemon, which plugins cannot.
 */
export function codeFileTarget(code: string, cwd: string | null): FileLocation | null {
  return fileTarget(code, cwd, false);
}

/** Links may name a root file and percent-encode spaces; inline code does neither. */
function fileTarget(raw: string, cwd: string | null, link: boolean): FileLocation | null {
  let token = raw.trim().replace(/^['"`]|['"`]$/g, "").replace(/\\/g, "/");
  if (!token || /\s/.test(token) || token.includes("?")) return null;
  if (link) {
    try { token = decodeURI(token); } catch { /* keep the raw target */ }
  }
  const fileUrl = FILE_URL.exec(token);
  const location = fileUrl
    ? withLines(fileUrl[1].replace(/^\/([A-Za-z]:\/)/, "$1"), fileUrl[2] ?? "")
    : isExternal(token) ? null : splitLines(token);
  if (!location || location.path.endsWith("/")) return null;
  const { path } = location;
  if (!fileUrl && !isAbsolute(path)) {
    if (path.includes(":") || !looksLikeFile(path)) return null;
    if (!link && !path.includes("/")) return null;
  }
  const resolved = resolve(path, cwd);
  return resolved ? { ...location, path: resolved } : null;
}

function isExternal(token: string): boolean {
  if (token.includes("://")) return true;
  return !LINE_SUFFIX.test(token) && /^[A-Za-z][A-Za-z0-9+.-]*:/.test(token) && !DRIVE.test(token);
}

/** `path:12-20`, `path(12)` and `path#L12-L20` all carry a line range. */
function splitLines(token: string): FileLocation | null {
  const hash = token.indexOf("#");
  const base = hash >= 0 ? token.slice(0, hash) : token;
  const anchor = withLines(base, hash >= 0 ? token.slice(hash) : "");
  const suffix = LINE_SUFFIX.exec(base);
  if (!anchor || !suffix) return anchor;
  return lineRange(suffix[1], suffix[2] ?? suffix[4], suffix[3] ?? suffix[5]);
}

function withLines(path: string, hash: string): FileLocation | null {
  if (!hash || hash === "#") return { path };
  const anchor = LINE_HASH.exec(hash.slice(1));
  return anchor ? lineRange(path, anchor[1], anchor[2]) : null;
}

function lineRange(path: string, start?: string, end?: string): FileLocation | null {
  const lineStart = start ? Number(start) : undefined;
  const lineEnd = end ? Number(end) : undefined;
  if (lineStart === 0 || lineEnd === 0 || (lineStart && lineEnd && lineEnd < lineStart)) return null;
  return { path, ...(lineStart ? { lineStart } : {}), ...(lineEnd ? { lineEnd } : {}) };
}

function isAbsolute(path: string): boolean {
  return path.startsWith("/") || DRIVE.test(path);
}

function looksLikeFile(path: string): boolean {
  if (/^(?:\.\.?|~)\//.test(path)) return true;
  const parts = path.split("/").filter(Boolean);
  // `example.com/app.js` is a URL without a scheme, not a directory.
  if (parts.length > 1 && /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(parts[0])) return false;
  const name = parts[parts.length - 1] ?? "";
  if (name.startsWith(".") && name.length > 1) return true;
  const dot = name.lastIndexOf(".");
  return dot >= 0 && EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** Relative paths resolve against cwd; absolute paths inside cwd become relative. */
function resolve(path: string, cwd: string | null): string | null {
  const root = cwd?.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/(.)\/+$/, "$1") || null;
  if (path === "~" || path.startsWith("~/")) return path;
  if (isAbsolute(path)) {
    if (!root) return path;
    // Windows paths compare case-insensitively, as in Paseo.
    const isRoot = (value: string) =>
      DRIVE.test(root) ? value.toLowerCase() === root.toLowerCase() : value === root;
    if (isRoot(path)) return null;
    return path[root.length] === "/" && isRoot(path.slice(0, root.length))
      ? path.slice(root.length + 1)
      : path;
  }
  if (!root) return null;
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part !== "..") parts.push(part);
    else if (parts.pop() === undefined) return null;
  }
  return parts.length > 0 ? parts.join("/") : null;
}
