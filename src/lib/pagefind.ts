/**
 * Loads Pagefind's JS API on demand. The index is static files under /pagefind/ written by
 * `pagefind` after `astro build` (see docs/architecture.md, "Search"); `pnpm dev` has none,
 * so the load fails there and the panel shows its "unavailable" state.
 * Pagefind picks the index of the page language from <html lang>.
 */

export interface PagefindResult {
  id: string;
  data: () => Promise<unknown>;
}

export interface PagefindSearch {
  results: PagefindResult[];
}

export interface PagefindApi {
  options: (options: Record<string, unknown>) => Promise<void>;
  init: () => Promise<void>;
  /** Resolves to null when a newer call replaced this one before it ran. */
  debouncedSearch: (
    term: string,
    options?: Record<string, unknown>,
    debounceMs?: number,
  ) => Promise<PagefindSearch | null>;
}

const PAGEFIND_URL = "/pagefind/pagefind.js";

function isPagefind(value: unknown): value is PagefindApi {
  if (typeof value !== "object" || value === null) return false;
  const api = value as Record<string, unknown>;
  return (
    typeof api["options"] === "function" &&
    typeof api["init"] === "function" &&
    typeof api["debouncedSearch"] === "function"
  );
}

let loading: Promise<PagefindApi> | undefined;

/** Imports and initializes Pagefind once; a failed load is forgotten, so the next open retries. */
export function loadPagefind(): Promise<PagefindApi> {
  loading ??= (async () => {
    // A runtime URL, not a module Vite should bundle: the file only exists after the build.
    const module: unknown = await import(/* @vite-ignore */ PAGEFIND_URL);
    if (!isPagefind(module)) throw new Error("Unexpected Pagefind module");
    await module.options({ excerptLength: 24 });
    await module.init();
    return module;
  })().catch((error: unknown) => {
    loading = undefined;
    if (import.meta.env.DEV) {
      console.info("Search has no index in `pnpm dev`. Try it with `pnpm build && pnpm preview`.");
    }
    throw error;
  });
  return loading;
}
