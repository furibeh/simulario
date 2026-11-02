import type { Locale } from "./config";
import { en } from "./ui/en";
import { es, type UiDict, type UiKey } from "./ui/es";

const dictionaries: Record<Locale, UiDict> = { es, en };

/** Replaces {name} placeholders. Unknown placeholders are left as they are. */
export function format(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export type Translate = (key: UiKey, params?: Record<string, string | number>) => string;

/** Returns a translator for interface strings in the given locale. */
export function useTranslations(locale: Locale): Translate {
  const dict = dictionaries[locale];
  return (key, params) => format(dict[key], params);
}

/** Formats a number for the locale (decimal comma in Spanish). */
export function formatNumber(locale: Locale, value: number, maxFractionDigits = 2): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits }).format(value);
}

export { dictionaries };
