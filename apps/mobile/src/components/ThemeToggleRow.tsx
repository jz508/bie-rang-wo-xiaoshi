import { StyleSheet, Switch, Text, View } from "react-native";

import { radii, spacing, themes, typography, type ThemeName } from "../theme/tokens";

type ThemeToggleRowProps = {
  enabled: boolean;
  onValueChange: (value: boolean) => void;
  themeName?: ThemeName;
};

export function ThemeToggleRow({
  enabled,
  onValueChange,
  themeName = "light",
}: ThemeToggleRowProps) {
  const theme = themes[themeName];

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: theme.surface,
          borderColor: theme.hairline,
        },
      ]}
    >
      <View style={styles.copy}>
        <Text style={[styles.title, { color: theme.text }]}>夜间模式</Text>
        <Text style={[styles.description, { color: theme.mutedText }]}>
          打开后使用深色背景，降低夜间查看时的刺眼感。
        </Text>
      </View>
      <Switch
        accessibilityLabel="夜间模式"
        accessibilityRole="switch"
        onValueChange={onValueChange}
        thumbColor={enabled ? theme.primaryButton : theme.surface}
        trackColor={{ false: theme.hairline, true: theme.accent }}
        value={enabled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 22,
  },
  description: {
    fontSize: typography.label,
    fontWeight: "500",
    lineHeight: 19,
  },
});
