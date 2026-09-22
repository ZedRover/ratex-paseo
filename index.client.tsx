import type { PluginClientContext } from "@getpaseo/plugin/client";
import { FormulaPanel, FormulaSurface } from "./client/formula";
import { RatexMessage } from "./client/message";
import type { z } from "zod";
import { hasCompleteMath } from "./shared/math";
import { ratexMessageSchema } from "./shared/ratex";

function transformMath({
  item,
  phase,
}: {
  item: { text: string };
  phase: "streaming" | "complete";
}) {
  if (!hasCompleteMath(item.text)) return undefined;
  // Typed against the renderer's schema: a payload change breaks the build, not the UI.
  const data: z.infer<typeof ratexMessageSchema> = { text: item.text, phase };
  return {
    items: [
      {
        type: "plugin" as const,
        kind: "ratex-message",
        version: 1,
        data,
      },
    ],
  };
}

export default function contribute(client: PluginClientContext) {
  client.addTimelineTransformer({
    id: "ratex-assistant-math",
    query: { itemType: "assistant_message" },
    transform: transformMath,
  });
  client.addTimelineTransformer({
    id: "ratex-user-math",
    query: { itemType: "user_message" },
    transform: transformMath,
  });
  client.addTimelineRenderer({
    kind: "ratex-message",
    version: 1,
    schema: ratexMessageSchema,
    Component: RatexMessage,
  });
  client.addSurface("ratex", FormulaSurface);
  client.addSidebarItem({
    id: "ratex",
    title: "RaTeX",
    icon: "Sigma",
    surface: "ratex",
  });
  client.addWorkspacePanel({
    id: "ratex",
    title: "RaTeX formula",
    icon: "Sigma",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: FormulaPanel,
  });
  client.addCommandCenterItem({
    id: "open-ratex",
    title: "Open RaTeX formula",
    icon: "Sigma",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("ratex");
    },
  });
  client.addCommandCenterItem({
    id: "open-ratex-surface",
    title: "Open RaTeX",
    icon: "Sigma",
    context: "global",
    onSelect({ openSurface }) {
      openSurface("ratex");
    },
  });
  return () => {};
}
