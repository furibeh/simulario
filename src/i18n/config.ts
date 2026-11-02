export const locales = ["es", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "es";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** Builds a localized path: localizedPath("en", "/sistemas-operativos") → "/en/sistemas-operativos". */
export function localizedPath(locale: Locale, path = "/"): string {
  const clean = path.replace(/^\/+|\/+$/g, "");
  return clean ? `/${locale}/${clean}` : `/${locale}`;
}

/** Swaps the locale prefix of a pathname, keeping the rest: "/es/a/b" → "/en/a/b". */
export function switchLocale(pathname: string, to: Locale): string {
  const [, first, ...rest] = pathname.split("/");
  const tail = isLocale(first) ? rest : [first, ...rest];
  return localizedPath(to, tail.filter(Boolean).join("/"));
}
