import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { loadNightModePreference, saveNightModePreference } from "../storage/themeStorage";
import {
  themeNameForNightModePreference,
  type NightModePreference,
} from "./nightMode";
import type { ThemeName } from "./tokens";

type ThemeState = {
  nightModePreference: NightModePreference;
  setNightModePreference: (preference: NightModePreference) => void;
  setThemeName: (themeName: ThemeName) => void;
  themeName: ThemeName;
};

const ThemeStateContext = createContext<ThemeState | undefined>(undefined);

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [themeName, setThemeNameState] = useState<ThemeName>("light");
  const [nightModePreference, setNightModePreferenceState] = useState<NightModePreference>("off");
  const userSelectedThemeRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    loadNightModePreference()
      .then((storedPreference) => {
        if (mounted && !userSelectedThemeRef.current) {
          setNightModePreferenceState(storedPreference);
          setThemeNameState(themeNameForNightModePreference(storedPreference));
        }
      })
      .catch(() => {
        if (mounted && !userSelectedThemeRef.current) {
          setNightModePreferenceState("off");
          setThemeNameState("light");
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (nightModePreference !== "auto") {
      return undefined;
    }

    const syncAutomaticTheme = () => {
      setThemeNameState(themeNameForNightModePreference("auto"));
    };
    const intervalId = setInterval(syncAutomaticTheme, 60 * 1000);

    syncAutomaticTheme();

    return () => clearInterval(intervalId);
  }, [nightModePreference]);

  const setNightModePreference = useCallback((nextPreference: NightModePreference) => {
    userSelectedThemeRef.current = true;
    setNightModePreferenceState(nextPreference);
    setThemeNameState(themeNameForNightModePreference(nextPreference));
    void saveNightModePreference(nextPreference).catch(() => undefined);
  }, []);

  const setThemeName = useCallback((nextThemeName: ThemeName) => {
    setNightModePreference(nextThemeName === "night" ? "on" : "off");
  }, [setNightModePreference]);

  const value = useMemo(
    () => ({
      nightModePreference,
      setNightModePreference,
      setThemeName,
      themeName,
    }),
    [nightModePreference, setNightModePreference, setThemeName, themeName],
  );

  return <ThemeStateContext.Provider value={value}>{children}</ThemeStateContext.Provider>;
}

export function useThemeState() {
  const themeState = useContext(ThemeStateContext);

  if (!themeState) {
    throw new Error("useThemeState must be used within ThemeProvider");
  }

  return themeState;
}
