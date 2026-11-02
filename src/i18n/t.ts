import type { Locale } from "./config";
import { en } from "./ui/en";
import { es, type UiDict, type UiKey } from "./ui/es";

const dictionaries: Record<Locale, UiDict> = { es, en };

/** Returns a translator for interface strings in the given locale. */
export function useTranslations(locale: Locale): (key: UiKey) => string {
  const dict = dictionaries[locale];
  return (key) => dict[key];
}

export { dictionaries };
