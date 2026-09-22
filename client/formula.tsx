import type { PluginSurfaceProps, PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { DEFAULT_LATEX } from "../shared/ratex";
import { RatexFormula } from "./formula-view";

type PlaygroundProps = {
  theme: PluginSurfaceProps["theme"];
  layout: PluginSurfaceProps["layout"];
};

const PRESETS = [
  { label: "Quadratic", latex: DEFAULT_LATEX },
  { label: "Integral", latex: "\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}" },
  { label: "Matrix", latex: "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}" },
];

function FormulaPlayground({ theme, layout }: PlaygroundProps) {
  const [latex, setLatex] = useState(DEFAULT_LATEX);
  const [draft, setDraft] = useState(DEFAULT_LATEX);
  const [displayMode, setDisplayMode] = useState(true);
  const compact = layout.compact;
  const pad = compact ? 16 : 24;

  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        backgroundColor: theme.colors.surface0,
      },
      content: {
        padding: pad,
        gap: compact ? 10 : 14,
      },
      title: {
        color: theme.colors.foreground,
        fontSize: compact ? 20 : 24,
        fontWeight: "600" as const,
      },
      label: {
        color: theme.colors.foregroundMuted,
        fontSize: compact ? 13 : 14,
      },
      input: {
        minHeight: compact ? 88 : 112,
        padding: compact ? 10 : 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
        color: theme.colors.foreground,
        textAlignVertical: "top" as const,
        fontFamily: "monospace",
        fontSize: compact ? 14 : 15,
      },
      row: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 8,
      },
      button: {
        paddingVertical: compact ? 8 : 10,
        paddingHorizontal: compact ? 12 : 14,
        borderRadius: 10,
        backgroundColor: theme.colors.accent,
      },
      buttonText: {
        color: theme.colors.accentForeground,
        fontWeight: "600" as const,
      },
      mutedButton: {
        paddingVertical: compact ? 8 : 10,
        paddingHorizontal: compact ? 12 : 14,
        borderRadius: 10,
        backgroundColor: theme.colors.surface2,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      mutedButtonText: {
        color: theme.colors.foreground,
      },
      preview: {
        padding: compact ? 12 : 16,
        borderRadius: 12,
        backgroundColor: theme.colors.surface1,
        borderWidth: 1,
        borderColor: theme.colors.border,
        gap: 8,
        minHeight: compact ? 96 : 128,
      },
      error: {
        color: theme.colors.statusDanger,
      },
      fallback: {
        color: theme.colors.foregroundMuted,
      },
      source: {
        color: theme.colors.foreground,
        fontFamily: "monospace",
      },
    }),
    [compact, pad, theme],
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>RaTeX formula</Text>
      <Text style={styles.label}>
        Chat messages with $…$ or $$…$$ are rendered automatically. This panel is a scratch pad.
      </Text>
      <TextInput
        accessibilityLabel="LaTeX input"
        multiline
        value={draft}
        onChangeText={setDraft}
        placeholder="Enter LaTeX"
        placeholderTextColor={theme.colors.foregroundMuted}
        style={styles.input}
      />
      <View style={styles.row}>
        {PRESETS.map((preset) => (
          <Pressable
            key={preset.label}
            accessibilityRole="button"
            accessibilityLabel={`Use ${preset.label} formula`}
            onPress={() => {
              setDraft(preset.latex);
              setLatex(preset.latex);
            }}
            style={styles.mutedButton}
          >
            <Text style={styles.mutedButtonText}>{preset.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Render as display (block) formula"
          onPress={() => setDisplayMode(true)}
          style={displayMode ? styles.button : styles.mutedButton}
        >
          <Text style={displayMode ? styles.buttonText : styles.mutedButtonText}>Display</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Render as inline formula"
          onPress={() => setDisplayMode(false)}
          style={displayMode ? styles.mutedButton : styles.button}
        >
          <Text style={displayMode ? styles.mutedButtonText : styles.buttonText}>Inline</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Render LaTeX"
          onPress={() => setLatex(draft.trim() || DEFAULT_LATEX)}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Render</Text>
        </Pressable>
      </View>
      <View style={styles.preview}>
        <RatexFormula
          latex={latex}
          displayMode={displayMode}
          colors={theme.colors}
          platform={layout.platform}
        />
      </View>
    </ScrollView>
  );
}

export function FormulaSurface({ theme, layout }: PluginSurfaceProps) {
  return <FormulaPlayground theme={theme} layout={layout} />;
}

export function FormulaPanel({ theme, layout }: PluginWorkspacePanelProps) {
  return <FormulaPlayground theme={theme} layout={layout} />;
}
