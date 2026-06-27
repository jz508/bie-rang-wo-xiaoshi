import { StyleSheet, Text, View } from "react-native";

import { spacing, themes, typography, type ThemeName } from "../theme/tokens";

type CountdownDisplayProps = {
  durationMinutes?: number;
  themeName?: ThemeName;
};

export function CountdownDisplay({ durationMinutes = 135, themeName = "light" }: CountdownDisplayProps) {
  const theme = themes[themeName];

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.subtitle, { color: theme.mutedText }]}>如果我没有回来确认</Text>
      <Text style={[styles.timer, { color: theme.text }]}>{formatDuration(durationMinutes)}</Text>
    </View>
  );
}

function formatDuration(durationMinutes: number): string {
  const safeMinutes = Math.max(1, Math.floor(durationMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  subtitle: {
    fontSize: typography.body,
    fontWeight: "500",
    lineHeight: 22,
  },
  timer: {
    fontSize: typography.timer,
    fontVariant: ["tabular-nums"],
    fontWeight: "300",
    letterSpacing: 0,
    lineHeight: 68,
  },
});
