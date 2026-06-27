import { SettingsScreen } from "../src/screens/SettingsScreen";
import { useThemeState } from "../src/theme/ThemeProvider";

export default function SettingsRoute() {
  const { setThemeName, themeName } = useThemeState();

  return <SettingsScreen onThemeNameChange={setThemeName} themeName={themeName} />;
}
