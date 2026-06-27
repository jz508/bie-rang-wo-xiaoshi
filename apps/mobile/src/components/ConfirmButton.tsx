import { Pressable, StyleSheet, Text } from "react-native";

import { radii, spacing, themes, typography, type ThemeName } from "../theme/tokens";

type ConfirmButtonProps = {
  disabled?: boolean;
  label?: string;
  themeName?: ThemeName;
  onPress?: () => void;
};

export function ConfirmButton({
  disabled = false,
  label = "我还在",
  themeName = "light",
  onPress,
}: ConfirmButtonProps) {
  const theme = themes[themeName];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.primaryButton,
          opacity: disabled ? 0.56 : pressed ? 0.86 : 1,
        },
      ]}
    >
      <Text style={[styles.label, { color: theme.primaryButtonText }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: radii.md,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: spacing.lg,
    width: "100%",
  },
  label: {
    fontSize: typography.button,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 24,
  },
});
