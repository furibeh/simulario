/** Remembers the language a visitor chose, so `/` can send them back to it. */

export const LANGUAGE_KEY = "simulario:lang";

export function rememberLanguage(
  storage: Pick<Storage, "setItem"> | undefined,
  lang: string,
): void {
  try {
    storage?.setItem(LANGUAGE_KEY, lang);
  } catch {
    // Storage unavailable: the root page falls back to the browser languages.
  }
}
