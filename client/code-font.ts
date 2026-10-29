import { Platform } from "react-native";

/**
 * Paseo's default code font stack (DEFAULT_MONO_FONT_STACK in the web client). A bare
 * "monospace" lets Chromium pick the locale's fixed font, e.g. NSimSun on Chinese Windows.
 * Native clients resolve a single family name, not a CSS list.
 */
export const CODE_FONT_FAMILY =
  Platform.OS === "web"
    ? "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
    : Platform.OS === "ios"
      ? "Menlo"
      : "monospace";
