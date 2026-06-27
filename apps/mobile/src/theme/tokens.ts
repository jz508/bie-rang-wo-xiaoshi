export const themes = {
  light: {
    background: "#F6F8FA",
    surface: "#FFFFFF",
    text: "#171717",
    mutedText: "#66717A",
    hairline: "#DDE3E8",
    accent: "#8E514A",
    primaryButton: "#181A1B",
    primaryButtonText: "#FFFFFF",
  },
  night: {
    background: "#0C0D0F",
    surface: "#15171A",
    text: "#F2F3F4",
    mutedText: "#8D949B",
    hairline: "#2A2E33",
    accent: "#A46A55",
    primaryButton: "#F2F3F4",
    primaryButtonText: "#111315",
  },
} as const;

export type ThemeName = keyof typeof themes;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 36,
  xxl: 52,
} as const;

export const radii = {
  sm: 6,
  md: 8,
  lg: 14,
  pill: 999,
} as const;

export const typography = {
  title: 18,
  label: 13,
  body: 15,
  timer: 58,
  button: 17,
} as const;
