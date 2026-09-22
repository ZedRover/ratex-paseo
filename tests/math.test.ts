import assert from "node:assert/strict";
import { test } from "node:test";
import { hasCompleteMath, mathSource, splitMathSegments } from "../shared/math.ts";

test("splits display and inline TeX from a chat message", () => {
  const segments = splitMathSegments(
    "The roots are $$\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$ and energy $E=mc^2$.",
  );
  const math = segments.filter((segment) => segment.type === "math");
  assert.equal(math.length, 2);
  assert.equal(math[0]?.displayMode, true);
  assert.equal(math[0]?.latex, "\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}");
  assert.equal(math[1]?.displayMode, false);
  assert.equal(math[1]?.latex, "E=mc^2");
  assert.equal(hasCompleteMath("The roots are $$\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$."), true);
});

test("recognizes \\[ \\] and \\( \\) delimiters", () => {
  const segments = splitMathSegments("See \\[a^2+b^2=c^2\\] and \\(x_i\\).");
  const math = segments.filter((segment) => segment.type === "math");
  assert.equal(math.length, 2);
  assert.equal(math[0]?.displayMode, true);
  assert.equal(math[0]?.latex, "a^2+b^2=c^2");
  assert.equal(math[1]?.displayMode, false);
  assert.equal(math[1]?.latex, "x_i");
});

test("ignores dollars inside code and unclosed streaming math", () => {
  assert.equal(hasCompleteMath("Use `$x^2$` in a command"), false);
  assert.equal(hasCompleteMath("```\n$E=mc^2$\n```"), false);
  assert.equal(hasCompleteMath("Working on $$\\frac{1}{2}"), false);
  assert.equal(hasCompleteMath("plain text with a $ sign"), false);
});

test("keeps ordinary text when there is no math", () => {
  const text = "No formulas here.";
  assert.deepEqual(splitMathSegments(text), [{ type: "text", text }]);
  assert.equal(hasCompleteMath(text), false);
});

test("segments carry the verbatim source so a copy reproduces the message", () => {
  const input = "Energy is $E=mc^2$ and \\(x_i\\) too, plus $$ \\frac{1}{2} $$ done";
  const segments = splitMathSegments(input);
  const rebuilt = segments
    .map((segment) => (segment.type === "math" ? segment.source : segment.text))
    .join("");
  assert.equal(rebuilt, input);
  const math = segments.filter((segment) => segment.type === "math");
  assert.equal(math[1]?.source, "\\(x_i\\)");
  assert.equal(math[1]?.latex, "x_i");
  assert.equal(math[2]?.source, "$$ \\frac{1}{2} $$");
  assert.equal(mathSource("E=mc^2", false), "$E=mc^2$");
  assert.equal(mathSource("a+b", true), "$$a+b$$");
});

test("dollar amounts never pair into a formula that swallows the sentence", () => {
  const input = "It costs $5 and $7 total, and $E=mc^2$ holds.";
  const segments = splitMathSegments(input);
  const math = segments.filter((segment) => segment.type === "math");
  assert.equal(math.length, 1);
  assert.equal(math[0]?.latex, "E=mc^2");
  assert.equal(segments[0]?.type === "text" ? segments[0].text : "", "It costs $5 and $7 total, and ");
  assert.equal(hasCompleteMath("Prices run $5 to $7 per unit"), false);
});

test("an unterminated opener does not hide the formulas after it", () => {
  const segments = splitMathSegments("broken $$\\frac{1}{2} but then $E=mc^2$ still counts");
  const math = segments.filter((segment) => segment.type === "math");
  assert.equal(math.length, 1);
  assert.equal(math[0]?.latex, "E=mc^2");
  assert.equal(hasCompleteMath("still streaming $$\\frac{1}{2"), false);
});

test("a stray $$ does not turn whole paragraphs into one display formula", () => {
  const segments = splitMathSegments("opening $$ here\n\nand a later $$ there");
  assert.equal(segments.some((segment) => segment.type === "math"), false);
});

test("a stray backtick does not hide the formulas after it", () => {
  const segments = splitMathSegments("use ` here and $E=mc^2$ after");
  const math = segments.filter((segment) => segment.type === "math");
  assert.equal(math.length, 1);
  assert.equal(math[0]?.latex, "E=mc^2");
  // A closed code span still shields its dollars.
  assert.equal(hasCompleteMath("use `$x$` here"), false);
});

test("math detection shields tilde, long fences, indented code and multi-backtick spans", () => {
  for (const source of [
    "~~~tex\nbefore $$x$$ after\n~~~",
    "````tex\n```\n$x$\n````",
    "~~~\n$x$",
    "    $$x$$",
    "``a ` $x$ b``",
  ]) {
    assert.equal(hasCompleteMath(source), false, source);
    assert.deepEqual(splitMathSegments(source), [{ type: "text", text: source }]);
    const segments = splitMathSegments(source + "\n\n$y$");
    if (!source.startsWith("~~~\n")) {
      assert.equal(segments.filter((s) => s.type === "math").length, 1, source);
    }
  }
});

test("escaped display delimiters remain text and even backslashes allow math", () => {
  assert.equal(hasCompleteMath(String.raw`\$\$x\$\$`), false);
  assert.equal(hasCompleteMath(String.raw`\\(x\\)`), false);
  assert.equal(hasCompleteMath(String.raw`\\$x$`), true);
});
