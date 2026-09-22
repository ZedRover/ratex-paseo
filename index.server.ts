import type { PluginServerContext } from "@getpaseo/plugin/server";
import { renderLatex } from "./server/render";
import { renderLatexRpc } from "./shared/ratex";

export default function contribute(server: PluginServerContext) {
  server.handle(renderLatexRpc, renderLatex);
  return () => {};
}
