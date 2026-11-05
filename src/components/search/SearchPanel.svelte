<script lang="ts">
import { onMount } from "svelte";
import { type Locale, localizedPath } from "../../i18n/config";
import { formatNumber, useTranslations } from "../../i18n/t";
import { loadPagefind } from "../../lib/pagefind";
import {
  groupResults,
  matchesQuery,
  resultCountKey,
  type SearchGroup,
  type SearchHit,
  toHit,
} from "../../lib/search";

interface Props {
  lang: Locale;
  /** Level of the group headings: 3 inside the dialog (titled by an h2), 2 on the search page. */
  headingLevel: 2 | 3;
  /** The search page reads ?q= on load and keeps it in sync, so a search can be linked. */
  syncUrl?: boolean;
  /** Runs when a result is followed (the dialog closes). */
  onnavigate?: () => void;
}

let { lang, headingLevel, syncUrl = false, onnavigate }: Props = $props();
const t = $derived(useTranslations(lang));
const uid = $props.id();
const MAX_RESULTS = 20;

let query = $state("");
let groups = $state<SearchGroup[]>([]);
let status = $state<"idle" | "loading" | "done" | "unavailable">("idle");
let message = $state("");
let input: HTMLInputElement | undefined = $state();
let root: HTMLElement | undefined = $state();
let latest = 0;

/** Focuses the field and selects its text, so typing replaces the last search. */
export function focus(): void {
  input?.focus();
  input?.select();
}

function isHit(hit: SearchHit | undefined): hit is SearchHit {
  return hit !== undefined;
}

async function run(raw: string): Promise<void> {
  const id = ++latest;
  const term = raw.trim();
  if (syncUrl) {
    const url = new URL(location.href);
    if (term) url.searchParams.set("q", term);
    else url.searchParams.delete("q");
    history.replaceState(history.state, "", url);
  }
  if (!term) {
    groups = [];
    status = "idle";
    message = "";
    return;
  }
  if (status !== "done") status = "loading";
  try {
    const api = await loadPagefind();
    const search = await api.debouncedSearch(term, {}, 250);
    // Null when a newer search replaced this one during the debounce.
    if (!search || id !== latest) return;
    const data = await Promise.all(search.results.slice(0, MAX_RESULTS).map((r) => r.data()));
    if (id !== latest) return;
    const hits = data
      .map(toHit)
      .filter(isHit)
      .filter((hit) => matchesQuery(hit, term));
    groups = groupResults(hits, lang);
    const count = groups.reduce((sum, g) => sum + g.hits.length, 0);
    status = "done";
    message = t(resultCountKey(count, lang), { n: formatNumber(lang, count), q: term });
  } catch {
    if (id !== latest) return;
    groups = [];
    status = "unavailable";
    message = t("search.unavailable");
  }
}

function resultLinks(): HTMLAnchorElement[] {
  return root ? [...root.querySelectorAll<HTMLAnchorElement>("[data-result]")] : [];
}

/** ↓ from the field enters the results; ↑/↓ move between them; ↑ on the first goes back. */
function onkeydown(event: KeyboardEvent): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const links = resultLinks();
  if (links.length === 0) return;
  const current = links.indexOf(event.target as HTMLAnchorElement);
  if (event.target === input) {
    if (event.key !== "ArrowDown") return;
    links[0]?.focus();
  } else if (current === -1) {
    return;
  } else if (event.key === "ArrowDown") {
    links[Math.min(current + 1, links.length - 1)]?.focus();
  } else if (current === 0) {
    input?.focus();
  } else {
    links[current - 1]?.focus();
  }
  event.preventDefault();
}

function onsubmit(event: SubmitEvent): void {
  event.preventDefault();
  resultLinks()[0]?.focus();
}

onMount(() => {
  if (!syncUrl) return;
  const initial = new URLSearchParams(location.search).get("q") ?? "";
  if (initial) {
    query = initial;
    void run(initial);
  }
});
</script>

<!-- The wrapper only moves focus between the field and the result links with the arrow keys. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="search-panel" bind:this={root} {onkeydown}>
  <form role="search" action={localizedPath(lang, "search")} method="get" {onsubmit}>
    <label class="visually-hidden" for={`${uid}-q`}>{t("search.input")}</label>
    <svg class="glass" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 21 21" />
    </svg>
    <input
      bind:this={input}
      bind:value={query}
      oninput={() => run(query)}
      id={`${uid}-q`}
      type="search"
      name="q"
      autocomplete="off"
      enterkeyhint="search"
      spellcheck="false"
      data-search-input
    />
  </form>

  {#if status === "idle"}
    <p class="note">{t("search.hint")}</p>
  {:else if status === "loading"}
    <p class="note">{t("search.loading")}</p>
  {/if}
  <p class="status" role="status">{message}</p>

  {#if groups.length > 0}
    <div class="results">
      {#each groups as group (group.pathId ?? "")}
        <div class="group">
          <svelte:element this={`h${headingLevel}`} class="group-title">
            {group.pathTitle ?? t("search.group.site")}
          </svelte:element>
          <ul>
            {#each group.hits as hit, h (hit.href)}
              {@const id = `${uid}-r${h}-${group.pathId ?? "site"}`}
              <li>
                <!-- Named by its title; the module and excerpt are its description, read after a pause. -->
                <a
                  href={hit.href}
                  data-result
                  aria-labelledby={`${id}-t`}
                  aria-describedby={`${id}-d`}
                  onclick={() => onnavigate?.()}
                >
                  <span class="title" id={`${id}-t`}>{hit.title}</span>
                  <span class="details" id={`${id}-d`}>
                  {#if hit.module}<span class="crumb">{hit.module}</span>{/if}
                  {#if hit.excerpt.length > 0}
                    <span class="excerpt">
                      {#each hit.excerpt as segment, s (s)}{#if segment.marked}<mark>{segment.text}</mark>{:else}{segment.text}{/if}{/each}
                    </span>
                  {/if}
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Grows and shrinks inside the dialog, so only the results scroll. */
  .search-panel {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 0;
  }

  form {
    position: relative;
    display: flex;
  }

  .glass {
    position: absolute;
    left: var(--space-4);
    top: 50%;
    translate: 0 -50%;
    pointer-events: none;
  }

  input {
    flex: 1;
    min-width: 0;
    min-height: var(--target-min);
    padding: var(--space-2) var(--space-4) var(--space-2) calc(var(--space-4) + 28px);
    border: var(--outline);
    border-radius: var(--radius-field);
    background: var(--color-ground);
    font-size: var(--text-body);
  }

  .note,
  .status {
    color: var(--color-ink-muted);
    font-size: var(--text-small);
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-height: 0;
    overflow-y: auto;
    scrollbar-color: var(--color-ink-muted) transparent;
    /* Room for the focus ring of the links, which the scrolling box would clip. */
    padding: var(--space-1);
    margin: calc(-1 * var(--space-1));
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .group-title {
    font-size: var(--text-small);
    font-weight: 800;
    color: var(--color-ink-muted);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  a {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-height: var(--target-min);
    padding: var(--space-3) var(--space-4);
    border: var(--outline);
    border-radius: var(--radius-card);
    background: var(--color-surface);
    color: var(--color-ink);
    text-decoration: none;
  }

  a:hover .title {
    text-decoration: underline;
  }

  .title {
    font-weight: 700;
  }

  .details {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .crumb {
    color: var(--color-ink-muted);
    font-size: var(--text-small);
  }

  .excerpt {
    font-size: var(--text-small);
    overflow-wrap: anywhere;
  }
</style>
