import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RatexMessage } from "../../client/message.tsx";

const colors = {
  foreground: "#e6e6e6", foregroundMuted: "#9aa0a6", border: "#333",
  surface0: "#111", surface1: "#181818", surface2: "#222", accent: "#4c8dff",
};
const text = [
  "# Heading $E=mc^2$", "",
  "Given $a^2$ and \\(b^2\\), we get:", "",
  "$$\nc^2 = a^2 + b^2\n$$", "",
  "**Bold $c$ text** and [docs](https://example.com/$x$).", "",
  "> Quote $x_i$", "", "- [x] Complete $a^2$", "",
  "| Name | Formula |", "|:--|--:|", "| Energy | $E=mc^2$ |", "",
  "~~~tex", "before $$literal$$ after", "~~~",
].join("\n");

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
window.pendingQueries = () => client.isFetching();
function Fixture() {
  const [fixture, setFixture] = useState({ text, colors, compact: false, platform: "web" });
  window.setFixture = (changes) => setFixture((previous) => ({ ...previous, ...changes }));
  window.resetFixture = () => setFixture({ text, colors, compact: false, platform: "web" });
  return <RatexMessage
    item={{ id: "fixture", data: { text: fixture.text, phase: "complete" } }}
    theme={{ colors: fixture.colors }}
    layout={{ compact: fixture.compact, platform: fixture.platform }}
  />;
}

createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={client}><Fixture /></QueryClientProvider>,
);
