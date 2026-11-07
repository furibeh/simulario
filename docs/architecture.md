# Architecture

Simulario is a static, bilingual (Spanish/English) site built with Astro. Lessons are MDX pages with interactive simulations embedded as Svelte islands. Every simulation follows one rule: **a pure engine produces a trace of steps, and a generic player renders it.**

## Stack

| Piece               | Choice                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Framework           | Astro 7, static output                                                                    |
| Content             | MDX + content collections (zod schemas)                                                   |
| Interactive islands | Svelte 5 (runes)                                                                          |
| Language            | TypeScript 6, `strictest`                                                                 |
| Package manager     | pnpm                                                                                      |
| Lint and format     | Biome (TS/JS/JSON/CSS); `astro check` and `svelte-check` for `.astro` and `.svelte` types |
| Tests               | Vitest                                                                                    |
| Hosting             | Cloudflare Pages, deployed from `main` at https://simulario.pages.dev                     |
| Analytics           | Cloudflare Web Analytics, enabled only when `PUBLIC_CF_BEACON_TOKEN` is set               |
| Search              | Pagefind, one static index per language, with our own interface (see "Search")            |
| CI                  | GitHub Actions                                                                            |

## Directory layout

```
src/
  engines/            Pure simulation engines. No DOM, no Svelte, no UI strings.
    cpu-scheduling/   simulate.ts, types.ts, presets.ts, simulate.test.ts
    process-states/   simulate.ts, types.ts, presets.ts, simulate.test.ts
    race-conditions/  simulate.ts, types.ts, presets.ts, simulate.test.ts
    bounded-buffer/   simulate.ts, types.ts, presets.ts, simulate.test.ts
    resource-graph/   simulate.ts, types.ts, presets.ts, simulate.test.ts
    address-translation/ simulate.ts, types.ts, presets.ts, simulate.test.ts
    page-replacement/ simulate.ts, types.ts, presets.ts, simulate.test.ts
    file-system/      simulate.ts, types.ts, presets.ts, simulate.test.ts
    transactions/     simulate.ts, types.ts, presets.ts, order.ts (fitOrder), simulate.test.ts
    trace.ts          Trace contract shared by every engine
    invariants.test.ts, published-traces.test.ts   Property tests and published examples
  player/             Player.svelte and state.ts (pure reducer and keyboard map)
  components/
    token/            Token, shapes
    board/            Timeline (optional slotOf resolver when ids do not end in the
                      entity number), board.css (shared board pieces, scoped under .sim),
                      scroll-current.ts (keeps the current cell of a scrolling table in view)
    cpu-scheduler/    CpuScheduler: workload, prediction order, metrics for this engine
    process-states/   ProcessStates: workload, prediction grid, state table, metrics
    race-conditions/  RaceConditions: thread listings, shared memory cell, manual interleaving, write log
    bounded-buffer/   BoundedBuffer: buffer slots, semaphore counters with queues, thread loops, block log
    resource-graph/   ResourceGraph: live resource-allocation graph (SVG), holdings table, delays, lock order
    address-translation/ AddressTranslation: address split in binary, TLB, page table, frames, disk, access log
    page-replacement/ PageReplacement: frame grid, FIFO queue / LRU list / OPT next uses / Clock dial, comparison table
    file-system/      FileSystem: script editor, bitmaps, directory, inode cards, data blocks, descriptors, output
    transactions/     Transactions: scenario, level and write mode (each lesson picks its scenarios, levels
                      and question), order of turns (fitted to the level by fitOrder), items (committed,
                      uncommitted, exclusive and shared locks, queue, and the chain of versions under
                      snapshots), transaction scripts with their snapshot turn (lines a rolled-back one
                      never ran are struck through), read and write logs
    lesson/           Stage, Quiz, stages.ts (stage ids, stepper and gated stages)
    search/           Search (nav link, dialog and shortcuts), SearchPanel (field, count, grouped results)
    site/             Nav (with the language switch and search), ThemeToggle, PathMap, NotFound
  i18n/
    config.ts         Locales, default locale, helpers for localized paths
    t.ts              useTranslations
    ui/es.ts, ui/en.ts               Interface strings
    engines/cpu-scheduling.es.ts, process-states.es.ts …   Explanation templates per engine,
                      with one test per engine; types.ts
  content.config.ts   Collection schemas
  content/
    paths/            One YAML file per learning path
    modules/          One YAML file per module
    lessons/es/, lessons/en/         One MDX file per lesson and language
    pages/es/, pages/en/             Standalone pages (about)
  layouts/            Base.astro, Page.astro, Lesson.astro
  pages/
    index.astro                      Language redirect
    404.astro, [lang]/404.astro      Not found pages
    robots.txt.ts                    robots.txt endpoint
    [lang]/index.astro               Home
    [lang]/about.astro              About
    [lang]/search.astro             Search page (no-JS fallback and ?q= links)
    [lang]/[path]/index.astro        Path page
    [lang]/[path]/[lesson].astro     Lesson page
  lib/                progress.ts, theme.ts, language.ts (browser storage),
                      catalog.ts (content queries), drafts.ts (draft path filter), events.ts (island → page events),
                      legacy-ids.ts (renamed ids, for redirects and stored progress),
                      search.ts (pure result helpers), pagefind.ts (loads the index on demand)
  styles/             tokens.css, base.css
public/               _headers, _redirects, favicon.svg, og.png
docs/                 design.md, architecture.md
  assets/             og.svg (source of public/og.png)
  engines/            Specs of engines shared by several lessons (transactions.md)
  lessons/            _template.md, then one spec per lesson: <path>/<id>.md
scripts/              check-search-index.mjs (CI check of the Pagefind index)
pagefind.yml          What Pagefind indexes and leaves out
.github/workflows/    ci.yml
```

## Layers and dependency rule

```
pages            →  layouts, components, i18n, lib, styles
layouts          →  components, i18n, lib, styles
content (MDX)    →  components
components       →  player, engines, i18n, lib
i18n             →  engines (their types)
lib              →  i18n
player, engines  →  nothing else in the project
```

Arrows point to what a layer may import. `player/` receives a step count and a snippet, so it knows neither traces nor engines. Specific views (`components/cpu-scheduler/`) wire an engine to the player and to i18n.

## The trace contract

```ts
// src/engines/trace.ts (shared by every engine)
export interface Explanation<K extends string = string> {
  key: K; // e.g. "fcfs.pick"
  params?: Readonly<Record<string, string | number>>; // e.g. { id: "P2", arrival: 1 }
}

export interface Step<S, E extends Explanation = Explanation> {
  t: number; // simulated time at the start of the step
  state: S; // complete state after the step, never a diff
  explain: readonly E[]; // why this step happened, in order
}

export interface Trace<S, R, E extends Explanation = Explanation> {
  steps: readonly Step<S, E>[];
  result: R; // final metrics and orders, used by Predict and Check
}

export type Engine<I, S, R, E extends Explanation = Explanation> = (input: I) => Trace<S, R, E>;
```

Steps are generic over the explanation type, not only its key, so an engine can tie each key to its params. The CPU engine declares `CpuExplainParams` (key → params) and derives `CpuExplanation`, a union in which `params` is required and typed per key.

Rules:

- Engines are deterministic, synchronous and pure: same input, same trace.
- Each step stores the whole state, so the player can jump to any step without replaying. Traces are small (hundreds of steps).
- Engines never produce prose. An explanation is a key plus parameters, and each engine declares its keys and their params (`CpuExplainParams`, `CpuExplainKey`).
- A step's explanations may contain several entries, for example "P1 finishes" followed by "P2 is first in the queue".

Each engine's rules, keys and expected results live in its spec. The sections below only say what the engine does and what sets it apart.

### CPU scheduling engine

Spec: `docs/lessons/operating-systems/cpu-scheduling.md`. FCFS, SJF, SRTF, priority and Round Robin on one CPU, with one step per time unit. The result holds per-process times, their averages and the finish order.

### Process states engine

Spec: `docs/lessons/operating-systems/process-states.md`. One CPU, FCFS dispatch and a private I/O device per process, with alternating CPU and I/O bursts. Steps are **instants**, not units: `steps[t]` holds the state after the transitions at `t`, and the last step is the instant of the last exit (`steps.length === makespan + 1`).

### Race conditions engine

Spec: `docs/lessons/operating-systems/race-conditions.md`. Threads run `load`, `add`, `store` per increment, or one atomic `inc`, under a timer or a manual order, with one step per instruction. A `store` is stale when `counter` differs from the value that thread loaded.

### Bounded buffer engine

Spec: `docs/lessons/operating-systems/mutex-semaphores.md`. Producers and consumers on a buffer guarded by the semaphores `empty`, `full` and `mutex`, with correct or swapped code and one step per operation. `signal` hands the permit straight to the first waiter, so the counter only rises when nobody waits.

### Resource graph engine

Spec: `docs/lessons/operating-systems/deadlock.md`. Threads acquire and release single-instance resources in script or global order, with one step per operation. After every block the engine follows the waits and reports the first cycle as a path.

### Address translation engine

Spec: `docs/lessons/operating-systems/paging.md`. One step per access: split into page and offset, TLB (LRU), page table, page fault (FIFO eviction) and the physical access. A fixed cost model (`costs`) prices each access, and an invalid page ends the trace.

### Page replacement engine

Spec: `docs/lessons/operating-systems/page-replacement.md`. FIFO, LRU, OPT and Clock, with one step per reference. `faultTable(refs)` runs every algorithm with 1–6 frames for the comparison table.

### File system engine

Spec: `docs/lessons/operating-systems/inodes-links.md`. A script of operations on a fixed tiny file system (`geometry`), with one step per operation. Structurally invalid scripts throw; operations that fail at run time emit an `error.*` key and change nothing.

### Transactions engine

Spec: `docs/engines/transactions.md`, shared by three lessons. Scripted transactions on up to three items, in a given `order`, under `read-uncommitted`, `read-committed`, `serializable-2pl` or `snapshot`. Each level was added without changing the results of the others.

## Player

A Svelte component, `Player.svelte`, driven by a pure reducer in `state.ts` (`playerReducer`, `actionForKey`), which is unit-tested without the DOM:

- State: `cursor` (0…`total`), `total` and `status` (`idle | playing | paused | ended`). The speed stays in `Player.svelte`, as the interval between ticks.
- Controls: play/pause, step back/forward, jump to start/end, speed. Keyboard: Space, ←, →, Home, End, active while focus is inside the board.
- Hooks: `onfirstplay` runs before the first step is shown (the CPU board locks the prediction there) and `onend` runs each time playback reaches the last step (the lesson board unlocks the gated stages). Comparing the guess with `trace.result` is the specific view's job.
- Rendering: the player receives the number of steps (`total`), a `traceKey` that rewinds it when the trace changes, and a Svelte snippet that draws the board for a cursor (the view reads `steps[cursor - 1]`). The player holds no knowledge of processes, queues or CPUs.
- Accessibility: explanations of the current step are rendered into an `aria-live="polite"` region. Reduced motion disables easing.

## Internationalization

- **Locales**: `es` and `en`, both prefixed (`/es/…`, `/en/…`), configured with Astro's built-in i18n routing (`prefixDefaultLocale: true`, default locale `es`).
- **Root `/`**: a static page that redirects with a tiny inline script. It uses the language stored from a previous visit, then `navigator.languages`, then `es`. It also contains plain links to both languages for no-JS visitors and crawlers. Cloudflare Pages redirects cannot branch on `Accept-Language`, so this happens on the client.
- **Interface strings**: `src/i18n/ui/es.ts` is the source of truth (`as const`). `en.ts` is typed with `satisfies UiDict`, so a missing or extra key fails `astro check`. Components get a `t` function through `useTranslations(lang)`.
- **Engine explanations**: `src/i18n/engines/<engine>.<lang>.ts` maps every engine key to a template function `(params) => string`. Typed as `ExplainTemplates<CpuExplainParams>`, so a new key without both translations fails type checking.
- **Content**: lessons live in `src/content/lessons/<lang>/<id>.mdx`, and the same `id` in both folders links the translations. Paths and modules are single YAML entries with localized fields (`title: { es, en }`).
- **Missing translation**: the page renders the available language with a notice and a link. `lang` on the content wrapper reflects the language actually shown.
- **SEO**: `<link rel="alternate" hreflang>` for both locales plus `x-default` pointing at the default locale's version of the same page (`/es/…`); `lang` on `<html>`; localized sitemap through `@astrojs/sitemap`. The root `/` is `noindex` and left out of the sitemap, since it only picks a language. `robots.txt` is an endpoint (`src/pages/robots.txt.ts`) that points to the sitemap at the configured `site`.
- **Sharing**: every indexable page gets Open Graph tags (`og:title`, `og:description`, `og:url`, `og:locale` from `ogLocales` in `src/i18n/config.ts` plus the other locale as `og:locale:alternate`, `og:type` `article` for lessons and `website` otherwise) and `twitter:card` `summary_large_image`. They all share `public/og.png` (1200×630), a language-neutral card with no text to translate besides the brand name; its source is `docs/assets/og.svg`, and its alt text is the `share.imageAlt` key.
- **Not found**: `src/pages/[lang]/404.astro` emits `es/404.html` and `en/404.html`, and `src/pages/404.astro` emits a bilingual `404.html` for paths without a language prefix. Cloudflare Pages serves the nearest `404.html` up the requested path, so a missing `/en/…` page gets the English one. Without any `404.html`, Pages would treat the site as a single-page app and answer unknown URLs with the root page. The 404 pages pass `indexable={false}` to `Base`: `noindex`, no canonical, `hreflang` or share tags, and they are filtered out of the sitemap.
- **URLs**: no trailing slash anywhere (`trailingSlash: "never"`). The build emits files (`build.format: "file"`, e.g. `es/about.html`), which Cloudflare Pages serves at `/es/about` without redirecting; a directory build would make Pages answer every slashless URL with a 308. Canonical, `hreflang` and language-switch links use `pagePathname()` (`src/i18n/config.ts`) to drop the `.html` that `Astro.url.pathname` carries at build time.
- **Caching**: `public/_headers` gives everything under `/_astro/` (scripts, styles and fonts whose file names carry a content hash) and the hashed Pagefind chunks (`/pagefind/fragment/*`, `/pagefind/index/*`) `Cache-Control: public, max-age=31536000, immutable`. HTML, the unhashed files in `public/` (`og.png`, `favicon.svg`) and the unhashed Pagefind files (`pagefind.js`, `pagefind-entry.json`, the `.pf_meta` and wasm files) keep the Pages default, `max-age=0, must-revalidate`, so a deploy shows up at once. Rules for Pagefind are only the specific ones: Cloudflare combines every matching rule, so a broad `/pagefind/*` would add a second `Cache-Control`.
- **Formatting**: numbers and dates through `Intl` with the active locale.
- **Language switch**: it keeps the current page (`/es/operating-systems/cpu-scheduling` ↔ `/en/operating-systems/cpu-scheduling`). Slugs are shared ids, not translated, and written in English.
- **Renamed slugs**: until 2026-11-04 slugs were Spanish (`/es/sistemas-operativos/planificador-cpu`). `src/lib/legacy-ids.ts` lists every old id, and `public/_redirects` sends each old URL to the new one with a 301 in both languages, so shared links and search results keep working; `legacy-ids.test.ts` checks that the two agree. A future rename adds to both.

## Search

[Pagefind](https://pagefind.app) builds a static index after the site: `pnpm build` runs `astro build && pagefind`, configured by `pagefind.yml`. The index is plain files under `dist/pagefind/` served from our own origin and fetched only when a visitor searches: no server, no cookies and no third-party script, so it fits hard rule 8.

- **One index per language**: Pagefind splits pages by `<html lang>`, and the JS API loads the index of the current page's language, so Spanish and English results never mix. `groupResults` also drops a result from another locale, as a guard.
- **What is indexed**: only pages with a `data-pagefind-body` element. `Page.astro` puts it on `<main>` when `searchable` (default: `indexable`) is true, so the 404 pages, the search page and the root `/` are left out. Lessons shown in a fallback language are left out too, so the English index holds no Spanish text. Inside a page, `data-pagefind-ignore` covers the lesson track, the unlock announcement, the module link, the locked-stage notes and `PathMap`. `pagefind.yml` excludes every island (`astro-island`, `.sim`: boards, the home demo, Quiz questions and options) and the solutions of Experiment challenges (`.experiment details > *:not(summary)`; the challenge in `<summary>` stays). Explain is indexed: its depth is what people search for.
- **Metadata**: lessons and path pages carry `path_id`, `path` and (lessons) `module` through `data-pagefind-meta`, used to group results by path and show a breadcrumb. There are no Pagefind filters yet; with two paths they would add little.
- **Interface**: our own Svelte components, not Pagefind's UI, which brings its own colors (hard rule 6). `Search.svelte` in the nav is a link to `/<lang>/search` that, with scripts, opens a native `<dialog>`; `/` (outside editable fields) and Ctrl+K / ⌘K open it from any page. `SearchPanel.svelte` imports `/pagefind/pagefind.js` on first use (`src/lib/pagefind.ts`), searches with a 250 ms debounce and announces the count in a `role="status"` region. On the search page it reads and updates `?q=`; without scripts that page lists every lesson instead.
- **Results** (`src/lib/search.ts`, unit-tested): `resultHref` drops the `.html` that the file build gives Pagefind's URLs (through `pagePathname()`), keeping the hash. Pagefind does not escape the page text in excerpts (only `<` and `>`), so `parseExcerpt` turns an excerpt into text runs and `<mark>` runs and the panel never uses `{@html}`. When no word matches, Pagefind falls back to the longest known prefix, down to one letter; `matchesQuery` drops those hits.
- **Development**: `pnpm dev` has no index; the panel shows "search is not available right now". Try search with `pnpm build && pnpm preview`.
- **CI**: `scripts/check-search-index.mjs` requires one index per locale holding every page of that locale except 404 and search.

## Content model

Ruta → Módulo → Lección → Componente (path → module → lesson → component).

```ts
// src/content.config.ts (summary)
paths:   { id, order, title: {es,en}, summary: {es,en}, draft: boolean = false }
modules: { id, path: reference('paths'), order, title: {es,en}, status: 'planned' | 'available' }
lessons: { id: "<lang>/<slug>", module: reference('modules'), order, title, summary, minutes,
           prerequisites: string[] }   // MDX, one per language
pages:   { id: "<lang>/<slug>", title, description }   // standalone MDX pages
```

A path's modules are the modules whose `path` points to it, sorted by `order`. Lesson `prerequisites` are lesson slugs kept as plain strings, not references, so a lesson can name a prerequisite that is still planned. Pages must not assume every prerequisite exists.

A path with `draft: true` is built by `pnpm dev` but left out of production builds, together with its modules and lessons (`withoutDrafts` in `src/lib/drafts.ts`, applied by `getCatalog()`). Its pages, home card and sitemap entries appear only when the flag is removed. No path is a draft today; the Databases path (`databases`) used the flag until its first three modules were available.

A lesson's MDX body wraps each PEE stage in `<Stage stage="…">`: `prerequisites`, `theory`, `predict`, `run`, `explain`, `experiment`, `check` and `deeper` (`src/components/lesson/stages.ts`). `Lesson.astro` builds the stepper from them. "I already know the theory" is an in-page link to the Predict stage.

### One page, gated stages

A lesson is a single page so the simulation keeps its state across stages. To avoid spoilers, **Explain, Experiment and Check stay closed until the learner runs the simulation to the end**:

- The board's player calls `onend` when playback reaches the last step; the lesson board then dispatches `simulario:run-finished` on `document` (`src/lib/events.ts`).
- A script in `Lesson.astro` listens for it, sets `data-unlocked` on the lesson wrapper, records `unlockedAt` in progress and announces the change through an `aria-live` region.
- "Show all stages" unlocks without running, for review or teachers preparing a class.
- Returning learners whose progress says unlocked (or completed) see everything open.
- Closed stages stay in the HTML. CSS hides their body only when scripts run (`.js` on `<html>`, set by an inline script before first paint), so no-JS visitors and crawlers get the whole lesson.
- The stepper marks the stage in view with `aria-current="step"` and shows a lock on gated stages while they are closed.

## Progress

`src/lib/progress.ts` stores progress in `localStorage` under `simulario:progress:v1`:

```json
{
  "v": 1,
  "lessons": {
    "cpu-scheduling": {
      "unlockedAt": "2026-11-02T09:40:00Z",
      "completedAt": "2026-11-02T10:00:00Z"
    }
  }
}
```

- Every read and write is wrapped in `try/catch`. Without storage (private mode, blocked cookies) the site works and simply forgets.
- Progress saved under an old lesson id (`legacyLessonIds` in `src/lib/legacy-ids.ts`) is read under its new id, keeping the earliest date of each field if both exist; the next write saves it under the new id only.
- Gated stages are unlocked when a run reaches its last step or the learner chooses to show all stages (`unlockedAt`).
- A lesson is completed when every Check question has been answered (`completedAt`). Completed implies unlocked.
- No personal data. Accounts and server sync (Supabase) are out of scope until there is demand.

## Theme

`data-theme` on `<html>` is `light`, `dark` or absent (follow the system). A blocking inline script in `<head>` applies the stored choice before first paint. Tokens are defined in `src/styles/tokens.css` under `:root`, `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) … }` and `:root[data-theme="dark"]`.

## Quality gates

| Gate            | Command                                       | Runs in CI |
| --------------- | --------------------------------------------- | ---------- |
| Lint and format | `pnpm lint` (`biome ci`)                      | yes        |
| Types           | `pnpm check` (`astro check` + `svelte-check`) | yes        |
| Unit tests      | `pnpm test` (`vitest run`)                    | yes        |
| Build           | `pnpm build` (Astro, then the Pagefind index) | yes        |
| Search index    | `node scripts/check-search-index.mjs`         | yes        |

Engine tests cover every preset × algorithm against the hand-computed metrics and finish orders recorded in the lesson spec (`docs/lessons/<path>/<id>.md`), plus edge cases: idle CPU, ties, quantum 1 and simultaneous arrivals. An i18n test renders every engine key in both languages with sample params and asserts that no placeholder is left. `src/engines/invariants.test.ts` adds property tests: on hundreds of seeded random inputs seven of the nine engines (all but CPU scheduling and process states) must keep the guarantees of their topic (lost updates never exceed the request, the correct bounded buffer never deadlocks, a global lock order never deadlocks and a stall implies a cycle, the offset survives translation, OPT equals a brute-force optimum and LRU/OPT never fault more with more frames, link counts equal the names of an inode, transactions never leave a dirty write or an unbroken wait cycle, a serial order shows no anomaly, under two-phase locking the result equals running the committed transactions one after another in commit order, and under snapshot isolation reads match the state before the reader started and overlapping committed transactions never wrote the same item). They found two engine bugs that the hand-computed presets did not reach. `src/engines/published-traces.test.ts` replays published examples as an external reference, for every lesson except `cpu-scheduling` and `process-states`, whose references are the hand-computed values: for operating systems, OSTEP §19.2, Figures 22.1, 22.2, 22.5, 26.7, 31.12 and 32.6, and §39.14–39.15; for databases, the histories H1, H2, H4 and P0 of Berenson et al. (1995) and Hermitage's PostgreSQL Read Committed tests G0, G1a, G1b, G1c, OTV, P4 and G-single; for two-phase locking, H4 under Berenson's Locking SERIALIZABLE and Hermitage's MySQL InnoDB Serializable tests P4 and G2-item; for snapshot isolation, Berenson's H1.SI, H5 and H4 and Hermitage's PostgreSQL Repeatable Read tests P4, G-single and G2-item.

## Decisions

| #   | Decision                                  | Reason                                                                         |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Static site, no backend                   | Free hosting, no accounts needed for learning                                  |
| 2   | Engine/player split with full-state steps | Write the player once; step back is free; engines are trivially testable       |
| 3   | Engines emit keys, not text               | Bilingual from day one; engines and tests are language-independent             |
| 4   | Both locales prefixed                     | Symmetric URLs; neither language is second-class                               |
| 5   | Svelte for islands                        | Small runtime, fine-grained reactivity for per-tick updates                    |
| 6   | Tokens (shape + color) for entities       | Accessible identity without relying on color (see `design.md`)                 |
| 7   | Biome instead of ESLint + Prettier        | One fast tool; type checkers cover `.astro`/`.svelte`                          |
| 8   | One page per lesson with gated stages     | The board keeps its state across stages; gating avoids spoiling the prediction |
| 9   | Pagefind with our own search interface    | Static, same-origin index; Pagefind's UI brings its own colors (hard rule 6)   |
