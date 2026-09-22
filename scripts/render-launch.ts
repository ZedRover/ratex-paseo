import { initRatex, renderLatexToDisplayList } from "../server/ratex.ts";
import { DEFAULT_LATEX } from "../shared/ratex.ts";

await initRatex();
const list = renderLatexToDisplayList(DEFAULT_LATEX, { displayMode: true, color: "#1E88E5" });
const sampleTypes = [...new Set(list.items.map((item) => String(item.type)))];
process.stdout.write(
  `${JSON.stringify({
    width: list.width,
    height: list.height,
    itemCount: list.items.length,
    sampleTypes,
  })}\n`,
);
