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
| Search              | Pagefind, one index per language (Phase 3, with the second path)                          |
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
    transactions/     simulate.ts, types.ts, presets.ts, simulate.test.ts
    trace.ts          Trace contract shared by engines and the player
  player/             Player.svelte and state.ts (pure reducer and keyboard map)
  components/
    token/            Token, shapes
    board/            Timeline (optional slotOf resolver when ids do not end in the
                      entity number), board.css (shared board pieces, scoped under .sim)
    cpu-scheduler/    CpuScheduler: workload, prediction order, metrics for this engine
    process-states/   ProcessStates: workload, prediction grid, state table, metrics
    race-conditions/  RaceConditions: thread listings, shared memory cell, manual interleaving, write log
    bounded-buffer/   BoundedBuffer: buffer slots, semaphore counters with queues, thread loops, block log
    resource-graph/   ResourceGraph: live resource-allocation graph (SVG), holdings table, delays, lock order
    address-translation/ AddressTranslation: address split in binary, TLB, page table, frames, disk, access log
    page-replacement/ PageReplacement: frame grid, FIFO queue / LRU list / OPT next uses / Clock dial, comparison table
    file-system/      FileSystem: script editor, bitmaps, directory, inode cards, data blocks, descriptors, output
    transactions/     Transactions: scenario, level and write mode (each lesson picks its scenarios, levels
                      and question), order of turns, items (committed, uncommitted, exclusive and shared
                      locks, queue), transaction scripts (lines a rolled-back one never ran are struck
                      through), read and write logs
    lesson/           Stage, Quiz, stages.ts (stage ids, stepper and gated stages)
    site/             Nav (with the language switch), ThemeToggle, PathMap
  i18n/
    config.ts         Locales, default locale, helpers for localized paths
    ui/es.ts, ui/en.ts               Interface strings
    engines/cpu-scheduling.es.ts, process-states.es.ts …   Explanation templates per engine
  content.config.ts   Collection schemas
  content/
    paths/            One YAML file per learning path
    modules/          One YAML file per module
    lessons/es/, lessons/en/         One MDX file per lesson and language
    pages/es/, pages/en/             Standalone pages (about)
  layouts/            Base.astro, Page.astro, Lesson.astro
  pages/
    index.astro                      Language redirect
    [lang]/index.astro               Home
    [lang]/about.astro              About
    [lang]/[path]/index.astro        Path page
    [lang]/[path]/[lesson].astro     Lesson page
  lib/                progress.ts, theme.ts, language.ts (browser storage),
                      catalog.ts (content queries), events.ts (island → page events),
                      legacy-ids.ts (renamed ids, for redirects and stored progress)
  styles/             tokens.css, base.css
docs/                 design.md, architecture.md
  lessons/            One spec per lesson (_template.md, then one file per lesson id)
.github/workflows/    ci.yml
```

## Layers and dependency rule

```
pages / layouts  →  content (MDX)  →  components  →  player  →  engines
                         ↘                ↘
                          i18n  ←──────────┘
```

Arrows point to what a layer may import. `engines/` imports nothing from the project. `player/` knows traces, not specific engines. Specific views (`components/cpu-scheduler/`) wire an engine to the player and to i18n.

## The trace contract

```ts
// src/engines/trace.ts (shared by engines and the player)
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

### CPU scheduling engine

Port of the prototype's `simulate()`. Input: processes `{ id, arrival, burst, priority }`, algorithm (`fcfs | sjf | srtf | priority | rr`) and quantum. State per step: running process, ready queue, finished list, remaining time per process. Result: per-process finish, turnaround, waiting and response times, their averages, and the finish order. Keys include `fcfs.pick`, `sjf.pick`, `srtf.pick`, `srtf.preempt`, `srtf.keep`, `priority.pick`, `rr.pick`, `rr.continue`, `rr.expire`, `nonpreemptive.continue`, `finish` and `idle`.

### Process states engine

Implements `docs/lessons/process-states.md`. Input: processes `{ id, arrival, bursts }` (alternating CPU and I/O bursts, starting and ending with CPU) and `quantum` (`null` for non-preemptive). One CPU, FCFS dispatch, one private I/O device per process. Steps are **instants**, not units: `steps[t]` holds the state after the transitions at `t`, that is, during `[t, t + 1)`, and the last step is the instant of the last exit, with no unit after it (`steps.length === makespan + 1`). This differs from the CPU engine, whose steps are units. State per step: one view per process (`status` absent/ready/running/blocked/terminated, current burst and units left, `ioUntil`, and CPU, I/O and ready units spent in `[0, t)`), the running process, the ready queue and busy units so far. Result: per-process finish, turnaround, CPU, I/O and ready time (`turnaround = cpu + io + ready`), finish order, CPU and I/O segments, makespan, busy units, utilization and serial time. Keys: `admit`, `dispatch`, `continue`, `block`, `wakeup`, `timeout`, `exit`, `idle.io` and `idle.arrivals`.

### Race conditions engine

Implements `docs/lessons/race-conditions.md`. Input: `threads` (2–3, ids `T1`…), `increments` per thread (1–3), `atomic` and a `schedule`: `{ kind: "timer", quantum }` (round robin, quantum counted in instructions) or `{ kind: "manual", order }` (one thread id per instruction; an order that names a finished thread throws, a short one ends the trace early with `complete: false`). Every thread runs the same program: `load`, `add`, `store` per increment, or one `inc` when atomic. One step per **instruction**, `t` starting at 0; the state is the shared `counter`, one view per thread (`pc`, private `reg`, value `loaded` for the increment in progress, status) and the instruction just run. A `store` is stale when `counter` differs from the value that thread loaded. Result: `final`, `expected`, `lost`, `complete`, `switches`, the write log (`writes`) and timeline `segments`. Keys: `dispatch`, `preempt`, `pick`, `load`, `add`, `store`, `store.stale`, `inc` and `finish`.

### Bounded buffer engine

Implements `docs/lessons/mutex-semaphores.md`. Input: `producers` and `consumers` (1–2 each, ids `P1`, `P2`, `C1`, `C2`), `items` per producer, buffer `capacity`, `version` (`correct`, or `swapped`: the producer waits on `mutex` before `empty`) and `quantum` (`null` keeps the CPU until a thread blocks or finishes). Semaphores `empty`, `full` and `mutex` are counters with FIFO queues; `signal` hands the permit straight to the first waiter, so the counter only rises when nobody waits. One step per operation (`wait`, `signal`, `put`, `take`) on one CPU with a FIFO ready queue. When every unfinished thread is blocked, the step gets `deadlock` and one `stuck` per thread, and the trace ends. Result: `completed`, `deadlock`, consumed items, block log, finish order, final counters and timeline segments. Keys: `dispatch`, `preempt`, `wait.pass`, `wait.block`, `signal.inc`, `signal.wake`, `put`, `take`, `finish`, `deadlock` and `stuck`.

### Resource graph engine

Implements `docs/lessons/deadlock.md`. Input: `resources` (2–5 single-instance resources `R1`…), `threads` (2–5, each `{ delay, script }` with `acquire`, `release` and `work` operations) and `ordering` (`script`, or `global`: each thread's acquires keep their positions but take its resources in increasing order). The effective script is validated (no double acquire, no release without holding, nothing held at the end). One step per operation; the head of a FIFO ready queue runs one operation and goes to the end. Releasing a resource hands it to the first waiter. After every block the engine follows "waits for R, held by U" and reports the first cycle as a path string; when no thread is ready and some are blocked, the step gets `stalled` and the trace ends. State: per-thread holdings, wait and program counter, per-resource holder and queue, the cycle found so far. Result: `deadlock`, `cycle`, `cycleStep`, `stalled`, finish order, threads that ran `work`, block log and segments. Keys: `acquire`, `block`, `release`, `handoff`, `work`, `think`, `finish`, `cycle` and `stalled`.

### Address translation engine

Implements `docs/lessons/paging.md`. Input: `pageSize` (8–64), `pages` (page k at index k: in a frame, on disk or invalid), `frames`, `tlbSize` (0–4; 0 means no TLB) and `accesses` (virtual addresses). One step per access: split into page and offset, TLB lookup (LRU), page-table read, page fault (lowest free frame, else FIFO eviction that also drops the victim's TLB entry), TLB fill and the physical access. An invalid page ends the trace. A fixed cost model (`costs`: TLB 1, memory 100, fault 10 000) gives each access its cost. State: page table, TLB (LRU first), frame contents, FIFO order and the access record. Result: per-access records, hits, misses, faults, `invalid`, total cost and completed accesses. Keys: `split`, `tlb.hit`, `tlb.miss`, `pt.hit`, `fault`, `evict`, `tlb.drop`, `load`, `segfault`, `tlb.evict`, `tlb.fill` and `access`.

### Page replacement engine

Implements `docs/lessons/page-replacement.md`. Input: `refs` (1–20 pages, 0–9), `frames` (1–6) and `algorithm` (`fifo`, `lru`, `opt`, `clock`). One step per reference. Free frames fill from slot 0; a full memory picks a victim by the algorithm's rule (OPT ties go to the lowest slot; Clock clears use bits under the hand until it finds a 0). State: slot contents plus each algorithm's bookkeeping (FIFO queue, LRU recency, OPT next uses, Clock bits and hand). Result: per-reference records, faults, hits and `compulsory` (distinct pages). `faultTable(refs)` runs every algorithm with 1–6 frames for the comparison table. Keys: `hit`, `load`, `evict.fifo`, `evict.lru`, `evict.opt`, `evict.opt.never`, `clock.clear` and `evict.clock`.

### File system engine

Implements `docs/lessons/inodes-links.md`. Input: a `script` of 1–12 operations (`create`, `write`, `link`, `symlink`, `unlink`, `open`, `close`, `cat`, `read`, `rename`) on a fixed tiny file system (`geometry`: one root directory with up to 8 entries, 8 inodes, 12 blocks of 4 bytes). Structurally invalid scripts throw; operations that fail at run time emit an `error.*` key and change nothing. Names resolve through symbolic links (at most 4 hops). An inode and its blocks are freed only when its link count is 0 and no descriptor is open. One step per operation; the state holds the inode table, blocks, directory entries, open descriptors and what the step touched. Result: read outputs, failed steps, inodes and blocks in use, final entries. Keys: `create`, `free.blocks`, `write`, `link`, `symlink`, `unlink.keep`, `unlink.orphan`, `unlink.free`, `unlink.symlink`, `open`, `close.keep`, `close.free`, `cat`, `cat.via`, `read`, `rename` and eight `error.*` keys (`error.loop` after 4 symbolic links).

### Transactions engine

Implements `docs/lessons/isolation-anomalies.md` and `docs/lessons/two-phase-locking.md`; `mvcc-snapshots` will add one more level without changing earlier results. Input: `items` (1–3 initial values, ids `x`, `y`, `z`), `transactions` (2–3 scripts of `read`, `readForUpdate`, `write`, `writeFromRead`, `add`, ending in `commit` or `abort`), `isolation` (`read-uncommitted`, `read-committed` or `serializable-2pl`) and an `order` of transaction ids, one per step (an entry that names an ended or blocked transaction throws; a short order ends with `complete: false`). Each item has a committed value and at most one uncommitted value; every write takes the item's lock until commit or abort, so the second writer waits in a FIFO queue and gets the lock, and runs its pending operation, in the step that releases it. Under the first two levels reads never wait: Read Uncommitted sees the uncommitted value, Read Committed the committed one. Under `serializable-2pl` (strict two-phase locking) a read takes a shared lock held until the end, a write needs every other reader gone (a reader that writes upgrades), and compatible waiters at the head of the queue are granted together on release. A `writeFromRead` computed from a committed version that is no longer current is stale (a lost update if it commits). A wait that closes a cycle in the wait-for graph (searched depth first, holders in id order) aborts the waiting transaction. State: per item committed value, version, uncommitted value, exclusive holder, shared readers and queue; per transaction status, program counter, wait and last reads. Result: final values, committed and aborted, read and write logs, `lostUpdates`, `dirtyReads`, `dirtyAborted`, `nonRepeatable`, blocks, deadlocks and segments. Keys: `read`, `read.hidden`, `read.dirty`, `read.own`, `read.changed`, `read.lock`, `write`, `write.computed`, `write.stale`, `add`, `lock.wait`, `read.shared`, `lock.wait.shared`, `lock.upgrade`, `handoff`, `commit`, `abort` and `deadlock`.

## Player

A Svelte component, `Player.svelte`, driven by a pure reducer in `state.ts` (`playerReducer`, `actionForKey`), which is unit-tested without the DOM:

- State: `cursor` (0…steps.length), `status` (`idle | playing | paused | ended`), `speed`.
- Controls: play/pause, step back/forward, jump to start/end, speed. Keyboard: Space, ←, →, Home, End, active while focus is inside the board.
- Hooks: `onfirstplay` runs before the first step is shown (the CPU board locks the prediction there) and `onend` runs each time playback reaches the last step (the lesson board unlocks the gated stages). Comparing the guess with `trace.result` is the specific view's job.
- Rendering: the player receives the number of steps (`total`), a `traceKey` that rewinds it when the trace changes, and a Svelte snippet that draws the board for a cursor (the view reads `steps[cursor - 1]`). The player holds no knowledge of processes, queues or CPUs.
- Accessibility: explanations of the current step are rendered into an `aria-live="polite"` region. Reduced motion disables easing.

## Internationalization

- **Locales**: `es` and `en`, both prefixed (`/es/…`, `/en/…`), configured with Astro's built-in i18n routing (`prefixDefaultLocale: true`, default locale `es`).
- **Root `/`**: a static page that redirects with a tiny inline script. It uses the language stored from a previous visit, then `navigator.languages`, then `es`. It also contains plain links to both languages for no-JS visitors and crawlers. Cloudflare Pages redirects cannot branch on `Accept-Language`, so this happens on the client.
- **Interface strings**: `src/i18n/ui/es.ts` is the source of truth (`as const`). `en.ts` is typed with `satisfies UiDict`, so a missing or extra key fails `astro check`. Components get a `t` function through `useTranslations(lang)`.
- **Engine explanations**: `src/i18n/engines/<engine>.<lang>.ts` maps every engine key to a template function `(params) => string`. Typed as `Record<CpuExplainKey, …>`, so a new key without both translations fails type checking.
- **Content**: lessons live in `src/content/lessons/<lang>/<id>.mdx`, and the same `id` in both folders links the translations. Paths and modules are single YAML entries with localized fields (`title: { es, en }`).
- **Missing translation**: the page renders the available language with a notice and a link. `lang` on the content wrapper reflects the language actually shown.
- **SEO**: `<link rel="alternate" hreflang>` for both locales plus `x-default` pointing at the default locale's version of the same page (`/es/…`); `lang` on `<html>`; localized sitemap through `@astrojs/sitemap`. The root `/` is `noindex` and left out of the sitemap, since it only picks a language. `robots.txt` is an endpoint (`src/pages/robots.txt.ts`) that points to the sitemap at the configured `site`.
- **Sharing**: every indexable page gets Open Graph tags (`og:title`, `og:description`, `og:url`, `og:locale` from `ogLocales` in `src/i18n/config.ts` plus the other locale as `og:locale:alternate`, `og:type` `article` for lessons and `website` otherwise) and `twitter:card` `summary_large_image`. They all share `public/og.png` (1200×630), a language-neutral card with no text to translate besides the brand name; its source is `docs/assets/og.svg`, and its alt text is the `share.imageAlt` key.
- **Not found**: `src/pages/[lang]/404.astro` emits `es/404.html` and `en/404.html`, and `src/pages/404.astro` emits a bilingual `404.html` for paths without a language prefix. Cloudflare Pages serves the nearest `404.html` up the requested path, so a missing `/en/…` page gets the English one. Without any `404.html`, Pages would treat the site as a single-page app and answer unknown URLs with the root page. The 404 pages pass `indexable={false}` to `Base`: `noindex`, no canonical, `hreflang` or share tags, and they are filtered out of the sitemap.
- **URLs**: no trailing slash anywhere (`trailingSlash: "never"`). The build emits files (`build.format: "file"`, e.g. `es/about.html`), which Cloudflare Pages serves at `/es/about` without redirecting; a directory build would make Pages answer every slashless URL with a 308. Canonical, `hreflang` and language-switch links use `pagePathname()` (`src/i18n/config.ts`) to drop the `.html` that `Astro.url.pathname` carries at build time.
- **Caching**: `public/_headers` gives everything under `/_astro/` (scripts, styles and fonts whose file names carry a content hash) `Cache-Control: public, max-age=31536000, immutable`. HTML and the unhashed files in `public/` (`og.png`, `favicon.svg`) keep the Pages default, `max-age=0, must-revalidate`, so a deploy shows up at once.
- **Formatting**: numbers and dates through `Intl` with the active locale.
- **Language switch**: it keeps the current page (`/es/operating-systems/cpu-scheduling` ↔ `/en/operating-systems/cpu-scheduling`). Slugs are shared ids, not translated, and written in English.
- **Renamed slugs**: until 2026-11-04 slugs were Spanish (`/es/sistemas-operativos/planificador-cpu`). `src/lib/legacy-ids.ts` lists every old id, and `public/_redirects` sends each old URL to the new one with a 301 in both languages, so shared links and search results keep working; `legacy-ids.test.ts` checks that the two agree. A future rename adds to both.

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

A path's modules are the modules whose `path` points to it, sorted by `order`. Lesson `prerequisites` are lesson slugs kept as plain strings, not references, so a lesson can name a prerequisite that is still planned (`cpu-scheduling` lists `process-states`). Pages must not assume every prerequisite exists.

A path with `draft: true` is built by `pnpm dev` but left out of production builds, together with its modules and lessons (`withoutDrafts` in `src/lib/drafts.ts`, applied by `getCatalog()`). Its pages, home card and sitemap entries appear only when the flag is removed. The Databases path (`databases`) is a draft while its first modules are written.

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
| Build           | `pnpm build`                                  | yes        |

Engine tests cover every preset × algorithm against the hand-computed metrics and finish orders recorded in the lesson spec (`docs/lessons/<id>.md`), plus edge cases: idle CPU, ties, quantum 1 and simultaneous arrivals. An i18n test renders every engine key in both languages with sample params and asserts that no placeholder is left. `src/engines/invariants.test.ts` adds property tests: on hundreds of seeded random inputs each engine must keep the guarantees of its topic (lost updates never exceed the request, the correct bounded buffer never deadlocks, a global lock order never deadlocks and a stall implies a cycle, the offset survives translation, OPT equals a brute-force optimum and LRU/OPT never fault more with more frames, link counts equal the names of an inode, transactions never leave a dirty write or an unbroken wait cycle, a serial order shows no anomaly, and under two-phase locking the result equals running the committed transactions one after another in commit order). They found two engine bugs that the hand-computed presets did not reach. `src/engines/published-traces.test.ts` replays published examples as an external reference, at least one per lesson: for operating systems, OSTEP §19.2, Figures 22.1, 22.2, 22.5, 26.7, 31.12 and 32.6, and §39.14–39.15; for databases, the histories H1, H2, H4 and P0 of Berenson et al. (1995) and Hermitage's PostgreSQL Read Committed tests G0, G1a, G1b, G1c, OTV, P4 and G-single; for two-phase locking, H4 under Berenson's Locking SERIALIZABLE and Hermitage's MySQL InnoDB Serializable tests P4 and G2-item.

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
