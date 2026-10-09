import assert from "node:assert/strict";
import { test } from "node:test";
import { codeFileTarget, fileLinkTarget } from "../shared/file-link.ts";

const cwd = "/home/me/repo";

test("Markdown links to files open relative to the agent cwd", () => {
  assert.deepEqual(fileLinkTarget("/home/me/repo/client/message.tsx:105", cwd),
    { path: "client/message.tsx", lineStart: 105 });
  assert.deepEqual(fileLinkTarget("client/message.tsx#L10-L20", cwd),
    { path: "client/message.tsx", lineStart: 10, lineEnd: 20 });
  assert.deepEqual(fileLinkTarget("./shared/../shared/math.ts(7)", cwd),
    { path: "shared/math.ts", lineStart: 7 });
  assert.deepEqual(fileLinkTarget("file:///home/me/repo/README.md", cwd), { path: "README.md" });
  assert.deepEqual(fileLinkTarget("/home/me/repo/my%20notes.md", cwd), { path: "my notes.md" });
});

test("files outside the cwd keep their absolute path", () => {
  assert.deepEqual(fileLinkTarget("/etc/hosts", cwd), { path: "/etc/hosts" });
  assert.deepEqual(fileLinkTarget("/home/me/repository/a.ts", cwd), { path: "/home/me/repository/a.ts" });
  assert.deepEqual(fileLinkTarget("C:\\Work\\App\\src\\a.ts:3", "c:/work/app"), { path: "src/a.ts", lineStart: 3 });
  assert.deepEqual(fileLinkTarget("~/notes.md", cwd), { path: "~/notes.md" });
});

test("URLs, anchors and non-file targets are not file links", () => {
  for (const href of [
    "https://example.com/a.ts", "mailto:me@example.com", "#section", "docs/README",
    "example.com/app.js", "../outside.ts", "/home/me/repo", "src/", "a.ts?raw", "client/a.ts#intro",
  ]) assert.equal(fileLinkTarget(href, cwd), null, href);
  assert.equal(fileLinkTarget("client/a.ts", null), null, "relative paths need a cwd");
  assert.deepEqual(fileLinkTarget("/abs/a.ts", null), { path: "/abs/a.ts" });
});

test("invalid line ranges are rejected", () => {
  assert.equal(fileLinkTarget("a/b.ts:0", cwd), null);
  assert.equal(fileLinkTarget("a/b.ts:20-10", cwd), null);
  assert.deepEqual(fileLinkTarget("a/b.ts:12:4", cwd), { path: "a/b.ts", lineStart: 12 });
});

test("inline code links paths but leaves bare names and prose alone", () => {
  assert.deepEqual(codeFileTarget("client/message.tsx:105", cwd), { path: "client/message.tsx", lineStart: 105 });
  assert.deepEqual(codeFileTarget("`./package.json`", cwd), { path: "package.json" });
  assert.deepEqual(codeFileTarget("src/.env", cwd), { path: "src/.env" });
  for (const code of ["message.tsx", "npm test", "a.b", "node_modules/foo", "x = $y$", "http://a.b/c.ts"]) {
    assert.equal(codeFileTarget(code, cwd), null, code);
  }
  assert.deepEqual(fileLinkTarget("package.json", cwd), { path: "package.json" }, "explicit links may name a root file");
});
