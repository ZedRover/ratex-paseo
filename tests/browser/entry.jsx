import React, { createContext, useState } from "react";
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
  "Run `npm test` first.", "",
  "See [message](client/message.tsx:105) and `shared/math.ts#L3`.", "",
  "$$\nc^2 = a^2 + b^2\n$$", "",
  "**Bold $c$ text** and [docs](https://example.com/$x$).", "",
  "> Quote $x_i$", "", "- [x] Complete $a^2$", "",
  "| Name | Formula |", "|:--|--:|", "| Energy | $E=mc^2$ |", "",
  "~~~tex", "before $$literal$$ after", "~~~",
].join("\n");

// Stands in for Paseo's workspace PaneProvider, whose value carries the file opener.
const PaneContext = createContext(null);
const pane = { openFileInWorkspace: (request) => window.openedFiles.push(request) };
window.openedFiles = [];

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
window.pendingQueries = () => client.isFetching();
function Fixture() {
  const initial = { text, colors, compact: false, platform: "web", pane: true };
  const [fixture, setFixture] = useState(initial);
  window.setFixture = (changes) => setFixture((previous) => ({ ...previous, ...changes }));
  window.resetFixture = () => setFixture(initial);
  const message = <RatexMessage
    agentId="agent"
    item={{ id: "fixture", data: { text: fixture.text } }}
    theme={{ colors: fixture.colors }}
    layout={{ compact: fixture.compact, platform: fixture.platform }}
  />;
  return fixture.pane ? <PaneContext.Provider value={pane}>{message}</PaneContext.Provider> : message;
}

createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={client}><Fixture /></QueryClientProvider>,
);
