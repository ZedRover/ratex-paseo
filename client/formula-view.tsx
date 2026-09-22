import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { CHAT_FONT_SIZE } from "../shared/layout";
import { mathSource } from "../shared/math";
import { renderLatexRpc } from "../shared/ratex";
import { FormulaCanvas, isWebPlatform } from "./web";
import { FormulaSource } from "./formula-source";

export function RatexFormula({
  latex,
  displayMode,
  colors,
  platform,
  source,
  fontSize = CHAT_FONT_SIZE,
}: {
  latex: string;
  displayMode: boolean;
  colors: PluginTheme["colors"];
  platform: string;
  /** The formula exactly as written in the message, delimiters included. */
  source?: string;
  /** em size to draw at, so math in a heading matches the heading. */
  fontSize?: number;
}) {
  const renderLatex = useRpc(renderLatexRpc);
  const web = isWebPlatform(platform);
  const text = source ?? mathSource(latex, displayMode);
  const [sourceOpen, setSourceOpen] = useState(false);
  const showSource = useCallback(() => setSourceOpen(true), []);
  const closeSource = useCallback(() => setSourceOpen(false), []);
  useEffect(() => setSourceOpen(false), [text]);
  const query = useQuery({
    queryKey: ["ratex.render", latex, displayMode, colors.foreground],
    queryFn: () =>
      renderLatex({
        latex,
        displayMode,
        color: colors.foreground,
      }),
    // Native never draws the canvas, so it must not pay for the round trip.
    enabled: web,
    // A given (latex, mode, color) always renders to the same DisplayList.
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    // Keep the previous formula on screen while a theme change re-renders it,
    // instead of collapsing every formula and reflowing the transcript.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === latex && previousQuery.queryKey[2] === displayMode
        ? previous
        : undefined,
  });
  const result = query.data;
  const displayList = result?.ok ? result.displayList : null;
  const styles = useMemo(
    () => ({
      fallback: { color: colors.foregroundMuted, fontFamily: "monospace", fontSize },
      wrap: {
        alignItems: "center" as const,
        alignSelf: "stretch" as const,
        paddingVertical: 8,
        width: "100%" as const,
        maxWidth: "100%" as const,
        // No userSelect: "none" here — a browser drops user-select:none subtrees from
        // the clipboard, which would hide the source text below from copy.
      },
      /**
       * The TeX source as real text: out of flow and invisible, but selectable, so a drag
       * across the message copies the formula. A canvas contributes no text of its own.
       * Deliberately no whiteSpace: Text already inherits pre-wrap, which is what keeps
       * the newlines inside a multi-line $$…$$ source.
       */
      source: {
        position: "absolute" as const,
        width: 1,
        height: 1,
        overflow: "hidden" as const,
        opacity: 0,
        userSelect: "text" as const,
      },
    }),
    [colors.foregroundMuted, fontSize],
  );

  if (sourceOpen && web) {
    return <FormulaSource source={text} colors={colors} displayMode={displayMode} onClose={closeSource} />;
  }

  // Render failures and native platforms show the source as ordinary selectable text,
  // so they need no hidden twin.
  if (query.isError || !result || !result.ok || !web) {
    return (
      <Text selectable style={styles.fallback}>
        {text}
      </Text>
    );
  }

  if (!displayMode) {
    return (
      <>
        <Text style={styles.source}>{text}</Text>
        <FormulaCanvas
          displayList={displayList}
          backgroundColor="rgba(0,0,0,0)"
          fontSize={fontSize}
          padding={1}
          inline
          onShowSource={showSource}
        />
      </>
    );
  }

  return (
      <View style={styles.wrap}>
        <Text style={styles.source}>{text}</Text>
        <FormulaCanvas
          displayList={displayList}
          backgroundColor="rgba(0,0,0,0)"
          fontSize={fontSize}
          padding={4}
          onShowSource={showSource}
        />
      </View>
  );
}
