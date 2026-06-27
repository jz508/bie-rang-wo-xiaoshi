import type { ThemeName } from "./tokens";

export type NightModePreference = "off" | "auto" | "on";

export const automaticNightModeStartHour = 21;
export const automaticNightModeEndHour = 7;

export function isAutomaticNightModeActive(date = new Date()): boolean {
  const hour = date.getHours();

  return hour >= automaticNightModeStartHour || hour < automaticNightModeEndHour;
}

export function themeNameForNightModePreference(preference: NightModePreference, date = new Date()): ThemeName {
  if (preference === "on") {
    return "night";
  }

  if (preference === "auto") {
    return isAutomaticNightModeActive(date) ? "night" : "light";
  }

  return "light";
}
