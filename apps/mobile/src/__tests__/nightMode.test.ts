import {
  automaticNightModeEndHour,
  automaticNightModeStartHour,
  isAutomaticNightModeActive,
  themeNameForNightModePreference,
} from "../theme/nightMode";

describe("night mode time rules", () => {
  it("uses 21:00 through 06:59 as automatic night mode", () => {
    expect(automaticNightModeStartHour).toBe(21);
    expect(automaticNightModeEndHour).toBe(7);
    expect(isAutomaticNightModeActive(new Date(2026, 5, 26, 20, 59))).toBe(false);
    expect(isAutomaticNightModeActive(new Date(2026, 5, 26, 21, 0))).toBe(true);
    expect(isAutomaticNightModeActive(new Date(2026, 5, 27, 6, 59))).toBe(true);
    expect(isAutomaticNightModeActive(new Date(2026, 5, 27, 7, 0))).toBe(false);
  });

  it("maps automatic preference to a theme by local time", () => {
    expect(themeNameForNightModePreference("auto", new Date(2026, 5, 26, 22, 0))).toBe("night");
    expect(themeNameForNightModePreference("auto", new Date(2026, 5, 26, 10, 0))).toBe("light");
    expect(themeNameForNightModePreference("on", new Date(2026, 5, 26, 10, 0))).toBe("night");
    expect(themeNameForNightModePreference("off", new Date(2026, 5, 26, 22, 0))).toBe("light");
  });
});
