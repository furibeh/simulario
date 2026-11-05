/**
 * Pure helpers for site search: turn Pagefind results into what the search panel shows.
 * No DOM and no Pagefind import here, so everything is unit-tested (search.test.ts).
 */
import { type Locale, pagePathname } from "../i18n/config";

/** A run of excerpt text, highlighted when it matched the query. */
export interface ExcerptSegment {
  text: string;
  marked: boolean;
}

export interface SearchHit {
  href: string;
  title: string;
  /** Path id and title for lessons and path pages; absent for home and about. */
  pathId?: string | undefined;
  pathTitle?: string | undefined;
  /** "Module 7: MVCC and snapshots", for lessons. */
  module?: string | undefined;
  excerpt: ExcerptSegment[];
}

/** Hits of one path (or of the site pages when `pathId` is undefined), in ranking order. */
export interface SearchGroup {
  pathId: string | undefined;
  pathTitle: string | undefined;
  hits: SearchHit[];
}

export type SearchCountKey = "search.count.none" | "search.count.one" | "search.count.other";

/**
 * Public URL of a result. The build emits files ("/es/about.html"), which Cloudflare Pages
 * serves without the extension; the hash and query are kept: "/es/a/b.html#explain" → "/es/a/b#explain".
 */
export function resultHref(url: string): string {
  const cut = url.search(/[?#]/);
  const path = cut === -1 ? url : url.slice(0, cut);
  const rest = cut === -1 ? "" : url.slice(cut);
  return pagePathname(path) + rest;
}

const MARK = /<mark>|<\/mark>/;

/**
 * Splits a Pagefind excerpt into plain and highlighted runs, to render as text (never as HTML).
 * Pagefind wraps matches in <mark> and escapes only "<" and ">" in the page text, so those are
 * the only entities decoded; "&" arrives as is.
 */
export function parseExcerpt(excerpt: string): ExcerptSegment[] {
  const segments: ExcerptSegment[] = [];
  let marked = false;
  let rest = excerpt;
  while (rest.length > 0) {
    const match = MARK.exec(rest);
    const end = match ? match.index : rest.length;
    const text = rest.slice(0, end).replaceAll("&lt;", "<").replaceAll("&gt;", ">");
    if (text) {
      const last = segments.at(-1);
      if (last && last.marked === marked) last.text += text;
      else segments.push({ text, marked });
    }
    if (!match) break;
    marked = match[0] === "<mark>";
    rest = rest.slice(end + match[0].length);
  }
  return segments;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Narrows the data of one Pagefind result to a hit; undefined if it lacks a URL or title. */
export function toHit(data: unknown): SearchHit | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const record = data as Record<string, unknown>;
  const url = stringField(record, "url");
  const meta =
    typeof record["meta"] === "object" && record["meta"] !== null
      ? (record["meta"] as Record<string, unknown>)
      : {};
  const title = stringField(meta, "title");
  if (!url || !title) return undefined;
  return {
    href: resultHref(url),
    title,
    pathId: stringField(meta, "path_id"),
    pathTitle: stringField(meta, "path"),
    module: stringField(meta, "module"),
    excerpt: parseExcerpt(stringField(record, "excerpt") ?? ""),
  };
}

/** True when the URL belongs to the locale: "/es", "/es/…", "/es#…" or "/es?…". */
function inLocale(href: string, lang: Locale): boolean {
  const prefix = `/${lang}`;
  if (!href.startsWith(prefix)) return false;
  const next = href.charAt(prefix.length);
  return next === "" || next === "/" || next === "?" || next === "#";
}

/**
 * Groups ranked hits by path, keeping Pagefind's order inside each group. Groups are sorted by
 * their best hit, so the first group holds the top result. Hits from another locale are dropped
 * (each language has its own index; this is a guard, not the mechanism).
 */
export function groupResults(hits: readonly SearchHit[], lang: Locale): SearchGroup[] {
  const groups = new Map<string | undefined, SearchGroup>();
  for (const hit of hits) {
    if (!inLocale(hit.href, lang)) continue;
    let group = groups.get(hit.pathId);
    if (!group) {
      group = { pathId: hit.pathId, pathTitle: hit.pathTitle, hits: [] };
      groups.set(hit.pathId, group);
    }
    group.hits.push(hit);
  }
  return [...groups.values()];
}

/** Interface key for the number of results, by the locale's plural rules. */
export function resultCountKey(count: number, lang: Locale): SearchCountKey {
  if (count === 0) return "search.count.none";
  return new Intl.PluralRules(lang).select(count) === "one"
    ? "search.count.one"
    : "search.count.other";
}

export interface ShortcutKeys {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/**
 * The keys that open search: "/" outside editable fields (Shift is allowed, since "/" needs it
 * on Spanish keyboards), and Ctrl+K or ⌘K anywhere.
 */
export function isSearchShortcut(event: ShortcutKeys, inEditableField: boolean): boolean {
  if (event.altKey) return false;
  if (event.key === "/") return !event.ctrlKey && !event.metaKey && !inEditableField;
  return event.key.toLowerCase() === "k" && event.ctrlKey !== event.metaKey;
}
