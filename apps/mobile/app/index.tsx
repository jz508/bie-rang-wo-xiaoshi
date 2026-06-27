import Constants from "expo-constants";

import { HomeScreen } from "../src/screens/HomeScreen";
import { useThemeState } from "../src/theme/ThemeProvider";

const DEFAULT_API_BASE_URL = "https://bie-rang-wo-xiaoshi-web.vercel.app";

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
      apiBaseUrl={extra?.apiBaseUrl ?? DEFAULT_API_BASE_URL}
      nightModePreference={nightModePreference}
      onNightModePreferenceChange={setNightModePreference}
      onThemeNameChange={setThemeName}
      themeName={themeName}
      userId={extra?.demoUserId ?? "demo-user"}
    />
  );
}
