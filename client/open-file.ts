import type { FileLocation } from "../shared/file-link";

type Fiber = { return: Fiber | null; memoizedProps?: { value?: unknown } | null };
type OpenFileInWorkspace = (request: { location: FileLocation; disposition: "preferred" }) => void;

/**
 * Opens a file the way Paseo's own message links do. The plugin SDK (0.11) has no file
 * API, so this borrows `openFileInWorkspace` from the workspace pane context that wraps
 * each agent timeline, reached on web through the clicked node's React fiber. Returns
 * false where that context is absent: native clients, timelines outside a workspace
 * pane, or a Paseo release that reshaped it.
 */
export function openWorkspaceFile(node: unknown, location: FileLocation): boolean {
  try {
    if (node == null || typeof node !== "object") return false;
    const key = Object.keys(node).find((name) => name.startsWith("__reactFiber$"));
    for (let fiber = key ? (node as Record<string, Fiber>)[key] : null; fiber; fiber = fiber.return) {
      // The node's fiber can be a render behind; Paseo wraps the opener in a stable
      // event, so a stale copy of the context value still opens the current pane.
      const value = fiber.memoizedProps?.value as { openFileInWorkspace?: unknown } | null | undefined;
      if (typeof value?.openFileInWorkspace === "function") {
        (value.openFileInWorkspace as OpenFileInWorkspace)({ location, disposition: "preferred" });
        return true;
      }
    }
  } catch {
    // Host internals changed shape; report the link as unopened.
  }
  return false;
}
