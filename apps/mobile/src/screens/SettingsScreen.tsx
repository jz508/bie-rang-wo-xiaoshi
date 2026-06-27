import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemeToggleRow } from "../components/ThemeToggleRow";
import { spacing, themes, typography, type ThemeName } from "../theme/tokens";

type SettingsScreenProps = {
  onThemeNameChange: (themeName: ThemeName) => void;
  themeName: ThemeName;
};

export function SettingsScreen({ onThemeNameChange, themeName }: SettingsScreenProps) {
  const theme = themes[themeName];
  const nightModeEnabled = themeName === "night";

  function handleNightModeChange(enabled: boolean) {
    const nextThemeName: ThemeName = enabled ? "night" : "light";
    onThemeNameChange(nextThemeName);
  }

  return (
    <SafeAreaView
      testID="settings-screen"
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <View style={styles.shell}>
        <Text style={[styles.title, { color: theme.text }]}>设置</Text>
        <ThemeToggleRow
          enabled={nightModeEnabled}
          onValueChange={handleNightModeChange}
          themeName={themeName}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  shell: {
    flex: 1,
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  title: {
    fontSize: typography.title,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 24,
  },
});
