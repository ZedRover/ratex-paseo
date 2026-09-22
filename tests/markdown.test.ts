import assert from "node:assert/strict";
import { test } from "node:test";
import { markdownBlocks, type MarkdownBlock } from "../shared/markdown.ts";

test("renders ATX headings instead of leaving hash marks", () => {
  const blocks = markdownBlocks("#### 互补松弛条件\n\n因此 $x>0$");
  assert.equal(blocks[0]?.type, "heading");
  if (blocks[0]?.type !== "heading") throw new Error("expected heading");
  assert.equal(blocks[0].level, 4);
  assert.deepEqual(blocks[0].inlines, [{ type: "text", text: "互补松弛条件" }]);
  assert.equal(blocks.some((block) => block.type === "paragraph"), true);
});

test("keeps display math as its own block next to headings", () => {
  const blocks = markdownBlocks("## KKT\n\n$$\\sum_{i=1}^n \\alpha_i y_i = 0$$\n\n正文");
  assert.equal(blocks[0]?.type, "heading");
  assert.equal(blocks[1]?.type, "display-math");
  assert.equal(blocks[2]?.type, "paragraph");
});

test("parses bold, italic, lists, and inline math", () => {
  const blocks = markdownBlocks("- **bold** and *em* and $a_i$\n\n1. first");
  assert.equal(blocks[0]?.type, "list-item");
  if (blocks[0]?.type !== "list-item") throw new Error("expected list");
  assert.equal(blocks[0].ordered, false);
  assert.deepEqual(
    blocks[0].inlines.map((node) => node.type),
    ["strong", "text", "em", "text", "math"],
  );
  assert.equal(blocks[1]?.type, "list-item");
  if (blocks[1]?.type !== "list-item") throw new Error("expected ordered list");
  assert.equal(blocks[1].ordered, true);
  assert.equal(blocks[1].marker, "1.");
});

test("blocks keep the verbatim math source", () => {
  const blocks = markdownBlocks("a \\(x_i\\) b\n\n\\[y=1\\]");
  const paragraph = blocks[0];
  if (paragraph?.type !== "paragraph") throw new Error("expected paragraph");
  const inline = paragraph.inlines.find((node) => node.type === "math");
  assert.equal(inline?.type === "math" ? inline.source : null, "\\(x_i\\)");
  const display = blocks[1];
  assert.equal(display?.type === "display-math" ? display.source : null, "\\[y=1\\]");
});

test("a line holding nothing but an inline formula survives", () => {
  const blocks = markdownBlocks("before\n\n$x^2+y^2$\n\nafter");
  assert.equal(blocks.length, 3);
  const middle = blocks[1];
  if (middle?.type !== "paragraph") throw new Error("expected paragraph");
  assert.deepEqual(middle.inlines, [{ type: "math", latex: "x^2+y^2", source: "$x^2+y^2$" }]);
});

test("indented list items lose their marker and keep their depth", () => {
  const blocks = markdownBlocks("- top\n  - nested with $a$");
  const nested = blocks[1];
  if (nested?.type !== "list-item") throw new Error("expected list item");
  assert.equal(nested.indent, 1);
  assert.deepEqual(nested.inlines, [
    { type: "text", text: "nested with " },
    { type: "math", latex: "a", source: "$a$" },
  ]);
  const top = blocks[0];
  assert.equal(top?.type === "list-item" ? top.indent : null, 0);
  const deep = markdownBlocks("- top\n    - nested $a$")[1];
  assert.equal(deep?.type, "list-item");
  assert.ok(deep?.type === "list-item" && deep.inlines.some((node) => node.type === "math"));
});

test("a heading that contains math is still a heading", () => {
  const blocks = markdownBlocks("## KKT with $x>0$ ##\n\nbody");
  const heading = blocks[0];
  if (heading?.type !== "heading") throw new Error("expected heading");
  assert.equal(heading.level, 2);
  assert.deepEqual(heading.inlines, [
    { type: "text", text: "KKT with " },
    { type: "math", latex: "x>0", source: "$x>0$" },
  ]);
});

test("a line that merely starts with a formula is not a bullet", () => {
  const blocks = markdownBlocks("$x$ - 这是说明");
  assert.equal(blocks[0]?.type, "paragraph");
});

test("emphasis that spans a formula stays emphasis", () => {
  const blocks = markdownBlocks("**重要 $x$ 结论**");
  const paragraph = blocks[0];
  if (paragraph?.type !== "paragraph") throw new Error("expected paragraph");
  const strong = paragraph.inlines[0];
  if (strong?.type !== "strong") throw new Error("expected strong");
  assert.deepEqual(
    strong.children.map((node) => node.type),
    ["text", "math", "text"],
  );
});

test("links, images and strikethrough survive the takeover", () => {
  const blocks = markdownBlocks("see [docs](https://example.com/a?b=1), ~~old~~ ![chart](p.png)");
  const paragraph = blocks[0];
  if (paragraph?.type !== "paragraph") throw new Error("expected paragraph");
  const link = paragraph.inlines.find((node) => node.type === "link" && !node.image);
  assert.equal(link?.type === "link" ? link.href : null, "https://example.com/a?b=1");
  const image = paragraph.inlines.find((node) => node.type === "link" && node.image);
  assert.equal(image?.type === "link" ? image.href : null, "p.png");
  assert.equal(paragraph.inlines.some((node) => node.type === "strike"), true);
});

test("blockquotes keep their inner blocks and math", () => {
  const blocks = markdownBlocks("> quoted $E=mc^2$\n> second\n\nplain");
  const quote = blocks[0];
  if (quote?.type !== "quote") throw new Error("expected quote");
  const inner = quote.blocks[0];
  if (inner?.type !== "paragraph") throw new Error("expected paragraph inside quote");
  assert.equal(inner.inlines.some((node) => node.type === "math"), true);
  assert.equal(blocks[1]?.type, "paragraph");
});

test("task list items expose their checkbox state", () => {
  const blocks = markdownBlocks("- [x] done\n- [ ] todo\n- plain");
  const [done, todo, plain] = blocks;
  assert.equal(done?.type === "list-item" ? done.checked : null, true);
  assert.equal(todo?.type === "list-item" ? todo.checked : null, false);
  assert.equal(plain?.type === "list-item" ? plain.checked : "missing", null);
  assert.equal(done?.type === "list-item" ? done.marker : null, "\u2611");
  assert.equal(todo?.type === "list-item" ? todo.marker : null, "\u2610");
});

test("pipe tables parse with alignment and inline math in cells", () => {
  const blocks = markdownBlocks("| name | formula |\n|:--|--:|\n| energy | $E=mc^2$ |");
  const table = blocks[0];
  if (table?.type !== "table") throw new Error("expected table");
  assert.deepEqual(table.align, ["left", "right"]);
  assert.equal(table.header.length, 2);
  assert.equal(table.rows.length, 1);
  assert.equal(table.rows[0][1][0]?.type, "math");
});

test("tilde fences are code blocks too", () => {
  const blocks = markdownBlocks("~~~python\nx = 1\n~~~");
  assert.equal(blocks[0]?.type, "code");
  assert.equal(blocks[0]?.type === "code" ? blocks[0].text : null, "x = 1");
});

test("backslash escapes are unescaped and do not become emphasis", () => {
  const blocks = markdownBlocks("价格是 \\$5 和 \\*星号\\*");
  assert.deepEqual(blocks[0]?.type === "paragraph" ? blocks[0].inlines : null, [
    { type: "text", text: "价格是 $5 和 *星号*" },
  ]);
});

test("spaced asterisks and snake_case are left alone", () => {
  const spaced = markdownBlocks("a * b * c");
  assert.deepEqual(spaced[0]?.type === "paragraph" ? spaced[0].inlines : null, [
    { type: "text", text: "a * b * c" },
  ]);
  const snake = markdownBlocks("用 snake_case_name 收尾");
  assert.deepEqual(snake[0]?.type === "paragraph" ? snake[0].inlines : null, [
    { type: "text", text: "用 snake_case_name 收尾" },
  ]);
});

test("deeply nested quotes are capped instead of overflowing the stack", () => {
  const blocks = markdownBlocks(">".repeat(5000) + " deep");
  assert.equal(blocks[0]?.type, "quote");
  let depth = 0;
  let node: MarkdownBlock | undefined = blocks[0];
  while (node && node.type === "quote") {
    depth += 1;
    node = node.blocks[0];
  }
  assert.ok(depth <= 8, `quote nesting should be capped, got ${depth}`);
});

test("a literal NUL cannot impersonate a formula placeholder", () => {
  const blocks = markdownBlocks("x $a$ y \u00000\u0000 z");
  const paragraph = blocks[0];
  if (paragraph?.type !== "paragraph") throw new Error("expected paragraph");
  assert.equal(paragraph.inlines.filter((node) => node.type === "math").length, 1);
  assert.deepEqual(paragraph.inlines, [
    { type: "text", text: "x " },
    { type: "math", latex: "a", source: "$a$" },
    { type: "text", text: " y 0 z" },
  ]);
});

test("fenced code preserves formula delimiters and line boundaries verbatim", () => {
  const code = "before $$x$$ after\n\\[ y \\]\n$x$";
  for (const fence of ["~~~", "````"]) {
    const blocks = markdownBlocks(`${fence}tex\n${code}\n${fence}\n\n$a$`);
    assert.deepEqual(blocks[0], { type: "code", text: code });
    assert.equal(blocks[1]?.type, "paragraph");
  }
  assert.deepEqual(markdownBlocks("````\na\n```\nb\n````"), [
    { type: "code", text: "a\n```\nb" },
  ]);
  assert.deepEqual(markdownBlocks("    $$x$$\n    second"), [
    { type: "code", text: "$$x$$\nsecond" },
  ]);
});

test("code spans with embedded backticks preserve their entire source", () => {
  assert.deepEqual(markdownBlocks("``a ` $x$ b``"), [
    { type: "paragraph", inlines: [{ type: "code", text: "a ` $x$ b" }] },
  ]);
});

test("link destinations restore math source and balance URL parentheses", () => {
  for (const href of ["https://example.com/$x$", "https://example.com/a_(b)"]) {
    const block = markdownBlocks(`[docs](${href})`)[0];
    assert.equal(block?.type === "paragraph" && block.inlines[0]?.type === "link"
      ? block.inlines[0].href : null, href);
  }
  const source = "Try [this](\nand then compute f(x) later";
  assert.deepEqual(markdownBlocks(source), [{ type: "paragraph", inlines: [{ type: "text", text: source }] }]);
});
