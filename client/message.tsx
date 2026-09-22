import type { PluginTheme } from "@getpaseo/plugin";
import { openExternalUrl, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useRevealedText } from "@getpaseo/plugin/client/react-native";
import { useMemo, type ReactNode } from "react";
import { Text, View } from "react-native";
import type { z } from "zod";
import {
  markdownBlocks,
  type InlineNode,
  type MarkdownBlock,
  type TableAlign,
} from "../shared/markdown";
import type { ratexMessageSchema } from "../shared/ratex";
import { RatexFormula } from "./formula-view";

/** Tied to the schema the renderer is registered with, so the two cannot drift. */
type RatexMessageData = z.infer<typeof ratexMessageSchema>;

type Layout = PluginTimelineItemProps["layout"];

const HEADING_SIZE = [32, 26, 22, 18, 16, 15];

function headingSize(level: number, compact: boolean): number {
  const size = HEADING_SIZE[Math.min(level, HEADING_SIZE.length) - 1];
  return compact ? size - 2 : size;
}

function messageStyles(theme: PluginTheme, compact: boolean) {
  const bodySize = compact ? 15 : 16;
  const body = {
    color: theme.colors.foreground,
    fontSize: bodySize,
    lineHeight: compact ? 22 : 24,
    userSelect: "text" as const,
  };
  return {
    column: {
      gap: compact ? 8 : 10,
      userSelect: "text" as const,
    },
    paragraph: body,
    bodySize,
    headingSize: (level: number) => headingSize(level, compact),
    heading: (level: number) => ({
      color: theme.colors.foreground,
      fontSize: headingSize(level, compact),
      fontWeight: "700" as const,
      lineHeight: compact ? 26 : 32,
      marginTop: compact ? 6 : 8,
      userSelect: "text" as const,
    }),
    list: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: 8,
      userSelect: "text" as const,
    },
    marker: {
      color: theme.colors.foregroundMuted,
      fontSize: compact ? 15 : 16,
      lineHeight: compact ? 22 : 24,
      userSelect: "text" as const,
    },
    quote: {
      borderLeftWidth: 3,
      borderLeftColor: theme.colors.border,
      paddingLeft: 12,
      gap: compact ? 6 : 8,
    },
    table: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      overflow: "hidden" as const,
    },
    tableRow: {
      flexDirection: "row" as const,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    tableLastRow: {
      flexDirection: "row" as const,
    },
    tableCell: {
      flex: 1,
      paddingVertical: compact ? 6 : 8,
      paddingHorizontal: compact ? 8 : 10,
      borderRightWidth: 1,
      borderRightColor: theme.colors.border,
    },
    tableHeadRow: {
      backgroundColor: theme.colors.surface2,
    },
    tableHeadText: { ...body, fontWeight: "700" as const },
    code: {
      color: theme.colors.foreground,
      fontFamily: "monospace",
      fontSize: compact ? 13 : 14,
      backgroundColor: theme.colors.surface2,
      padding: 12,
      borderRadius: 8,
      userSelect: "text" as const,
    },
    inlineCode: {
      fontFamily: "monospace",
      backgroundColor: theme.colors.surface2,
      color: theme.colors.foreground,
      userSelect: "text" as const,
    },
    strong: { fontWeight: "700" as const, userSelect: "text" as const },
    em: { fontStyle: "italic" as const, userSelect: "text" as const },
    strike: { textDecorationLine: "line-through" as const, userSelect: "text" as const },
    link: {
      color: theme.colors.accent,
      textDecorationLine: "underline" as const,
      userSelect: "text" as const,
    },
    imageLabel: { color: theme.colors.foregroundMuted, userSelect: "text" as const },
    hr: { height: 1, backgroundColor: theme.colors.border, marginVertical: 8 },
  };
}

type MessageStyles = ReturnType<typeof messageStyles>;

export function RatexMessage({ item, theme, layout }: PluginTimelineItemProps<RatexMessageData>) {
  const revealed = useRevealedText(item.data.text, item.data.phase);
  const blocks = useMemo(() => markdownBlocks(revealed), [revealed]);
  const compact = layout.compact;
  const styles = useMemo(() => messageStyles(theme, compact), [compact, theme]);

  return (
    <View style={styles.column}>
      {blocks.map((block, index) => (
        <MarkdownBlockView
          key={index}
          block={block}
          theme={theme}
          layout={layout}
          styles={styles}
        />
      ))}
    </View>
  );
}

function MarkdownBlockView({
  block,
  theme,
  layout,
  styles,
}: {
  block: MarkdownBlock;
  theme: PluginTheme;
  layout: Layout;
  styles: MessageStyles;
}) {
  switch (block.type) {
    case "heading":
      return (
        <Text selectable style={styles.heading(block.level)}>
          {renderInlines(block.inlines, theme, layout, styles, styles.headingSize(block.level))}
        </Text>
      );
    case "paragraph":
      return (
        <Text selectable style={styles.paragraph}>
          {renderInlines(block.inlines, theme, layout, styles)}
        </Text>
      );
    case "list-item":
      return (
        <View style={[styles.list, { marginLeft: block.indent * 16 }]}>
          <Text selectable style={styles.marker}>
            {block.marker}
          </Text>
          <Text selectable style={[styles.paragraph, { flex: 1 }]}>
            {renderInlines(block.inlines, theme, layout, styles)}
          </Text>
        </View>
      );
    case "quote":
      return (
        <View style={styles.quote}>
          {block.blocks.map((child, index) => (
            <MarkdownBlockView
              key={index}
              block={child}
              theme={theme}
              layout={layout}
              styles={styles}
            />
          ))}
        </View>
      );
    case "table":
      return <TableView block={block} theme={theme} layout={layout} styles={styles} />;
    case "code":
      return (
        <Text selectable style={styles.code}>
          {block.text}
        </Text>
      );
    case "display-math":
      return (
        <RatexFormula
          latex={block.latex}
          source={block.source}
          displayMode
          colors={theme.colors}
          platform={layout.platform}
          fontSize={styles.bodySize}
        />
      );
    case "hr":
      return <View style={styles.hr} />;
  }
}

function TableView({
  block,
  theme,
  layout,
  styles,
}: {
  block: Extract<MarkdownBlock, { type: "table" }>;
  theme: PluginTheme;
  layout: Layout;
  styles: MessageStyles;
}) {
  const rows = [block.header, ...block.rows];
  return (
    <View style={styles.table}>
      {rows.map((cells, rowIndex) => (
        <View
          key={rowIndex}
          style={[
            rowIndex === rows.length - 1 ? styles.tableLastRow : styles.tableRow,
            rowIndex === 0 ? styles.tableHeadRow : null,
          ]}
        >
          {cells.map((cell, cellIndex) => (
            <View key={cellIndex} style={styles.tableCell}>
              <Text
                selectable
                style={[
                  rowIndex === 0 ? styles.tableHeadText : styles.paragraph,
                  { textAlign: cellAlign(block.align, cellIndex) },
                ]}
              >
                {renderInlines(cell, theme, layout, styles)}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function cellAlign(align: TableAlign[], index: number): TableAlign {
  return align[index] ?? "left";
}

function renderInlines(
  nodes: InlineNode[],
  theme: PluginTheme,
  layout: Layout,
  styles: MessageStyles,
  fontSize: number = styles.bodySize,
): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return node.text;
      case "strong":
        return (
          <Text key={index} selectable style={styles.strong}>
            {renderInlines(node.children, theme, layout, styles, fontSize)}
          </Text>
        );
      case "em":
        return (
          <Text key={index} selectable style={styles.em}>
            {renderInlines(node.children, theme, layout, styles, fontSize)}
          </Text>
        );
      case "strike":
        return (
          <Text key={index} selectable style={styles.strike}>
            {renderInlines(node.children, theme, layout, styles, fontSize)}
          </Text>
        );
      case "link":
        // Images are not fetched: the label plus its target stays readable and copyable.
        if (node.image) {
          return (
            <Text key={index} selectable style={styles.imageLabel}>
              {renderInlines(node.children, theme, layout, styles, fontSize)}
              {` (${node.href})`}
            </Text>
          );
        }
        return (
          <Text
            key={index}
            selectable
            style={styles.link}
            accessibilityRole="link"
            onPress={() => {
              void openExternalUrl(node.href).catch(() => {});
            }}
          >
            {renderInlines(node.children, theme, layout, styles, fontSize)}
          </Text>
        );
      case "code":
        return (
          <Text key={index} selectable style={styles.inlineCode}>
            {node.text}
          </Text>
        );
      case "math":
        // No wrapping View: react-native-web renders one as an inline-flex box inside the
        // paragraph, and browsers put a line break at such a boundary when copying.
        return (
          <RatexFormula
            key={index}
            latex={node.latex}
            source={node.source}
            displayMode={false}
            colors={theme.colors}
            platform={layout.platform}
            fontSize={fontSize}
          />
        );
    }
  });
}
