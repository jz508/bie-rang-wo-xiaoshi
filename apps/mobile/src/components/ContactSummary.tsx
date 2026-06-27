import { StyleSheet, Text, View } from "react-native";

import { radii, spacing, themes, typography, type ThemeName } from "../theme/tokens";

type ContactSummaryProps = {
  contactName?: string;
  messageText?: string;
  shortNote?: string;
  themeName?: ThemeName;
};

export function ContactSummary({
  contactName = "陈默",
  messageText = "请联系我，或者来找我。",
  shortNote,
  themeName = "light",
}: ContactSummaryProps) {
  const theme = themes[themeName];

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: theme.surface,
          borderColor: theme.hairline,
        },
      ]}
    >
      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.mutedText }]}>紧急联系人</Text>
        <Text style={[styles.value, { color: theme.text }]}>{contactName}</Text>
      </View>
      <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.mutedText }]}>预留消息</Text>
        <Text style={[styles.value, styles.message, { color: theme.text }]}>{messageText}</Text>
        {shortNote ? (
          <Text style={[styles.value, styles.message, { color: theme.text }]}>{shortNote}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    width: "100%",
  },
  row: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  label: {
    fontSize: typography.label,
    fontWeight: "600",
    lineHeight: 18,
  },
  value: {
    fontSize: typography.body,
    fontWeight: "600",
    lineHeight: 22,
  },
  message: {
    fontWeight: "500",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.lg,
  },
});
