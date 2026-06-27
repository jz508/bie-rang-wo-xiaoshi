import AsyncStorage from "@react-native-async-storage/async-storage";

import { themeNameForNightModePreference, type NightModePreference } from "../theme/nightMode";
import type { ThemeName } from "../theme/tokens";

const NIGHT_MODE_KEY = "bie-rang-wo-xiaoshi:night-mode";

export async function loadNightModePreference(): Promise<NightModePreference> {
  const storedValue = await AsyncStorage.getItem(NIGHT_MODE_KEY);

  if (storedValue === "auto" || storedValue === "on" || storedValue === "off") {
    return storedValue;
  }

  if (storedValue === "night") {
    return "on";
  }

  return "off";
}

export async function saveNightModePreference(preference: NightModePreference): Promise<void> {
  await AsyncStorage.setItem(NIGHT_MODE_KEY, preference);
}

export async function loadThemeName(): Promise<ThemeName> {
  const storedValue = await loadNightModePreference();

  return themeNameForNightModePreference(storedValue);
}

export async function saveThemeName(themeName: ThemeName): Promise<void> {
  await saveNightModePreference(themeName === "night" ? "on" : "off");
}
