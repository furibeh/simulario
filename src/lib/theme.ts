/** Theme preference: "system" follows prefers-color-scheme; the others force a theme. */
export type ThemePreference = "system" | "light" | "dark";

export const THEME_KEY = "simulario:theme";
const ORDER: readonly ThemePreference[] = ["system", "light", "dark"];

export function readTheme(storage: Pick<Storage, "getItem"> | undefined): ThemePreference {
  try {
    const value = storage?.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function writeTheme(
  storage: Pick<Storage, "setItem" | "removeItem"> | undefined,
  theme: ThemePreference,
): void {
  try {
    if (theme === "system") storage?.removeItem(THEME_KEY);
    else storage?.setItem(THEME_KEY, theme);
  } catch {
    // Storage unavailable (private mode, blocked): the choice lasts for this page only.
  }
}

/** The preference the toggle switches to next: system → light → dark → system. */
export function nextTheme(current: ThemePreference): ThemePreference {
  return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? "system";
}

export function applyTheme(root: HTMLElement, theme: ThemePreference): void {
  if (theme === "system") delete root.dataset["theme"];
  else root.dataset["theme"] = theme;
}
