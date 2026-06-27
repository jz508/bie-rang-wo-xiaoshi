import Constants from "expo-constants";

import { HomeScreen } from "../src/screens/HomeScreen";
import { useThemeState } from "../src/theme/ThemeProvider";

export default function IndexRoute() {
  const { nightModePreference, setNightModePreference, setThemeName, themeName } = useThemeState();
  const extra = Constants.expoConfig?.extra as
    | {
        apiBaseUrl?: string;
        demoUserId?: string;
      }
    | undefined;

  return (
    <HomeScreen
      apiBaseUrl={extra?.apiBaseUrl ?? "http://localhost:3000"}
      nightModePreference={nightModePreference}
      onNightModePreferenceChange={setNightModePreference}
      onThemeNameChange={setThemeName}
      themeName={themeName}
      userId={extra?.demoUserId ?? "demo-user"}
    />
  );
}
