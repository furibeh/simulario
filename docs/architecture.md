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
| Hosting             | Cloudflare Pages (automatic deploy comes after Phase 0)                                   |
| Analytics           | Cloudflare Web Analytics, enabled only when `PUBLIC_CF_BEACON_TOKEN` is set               |
| Search              | Pagefind, one index per language (Phase 1)                                                |
| CI                  | GitHub Actions                                                                            |

## Directory layout

```
src/
  engines/            Pure simulation engines. No DOM, no Svelte, no UI strings.
    cpu-scheduling/   simulate.ts, types.ts, presets.ts, simulate.test.ts
    trace.ts          Trace contract shared by engines and the player
  player/             Player.svelte and state.ts (pure reducer and keyboard map)
  components/
    token/            Token, shapes
    board/            Timeline (shared board pieces)
    cpu-scheduler/    CpuScheduler: board, zones, prediction, metrics for this engine
    lesson/           Stage, Quiz, stages.ts (stage ids, stepper and gated stages)
    site/             Nav (with the language switch), ThemeToggle, PathMap
  i18n/
    config.ts         Locales, default locale, helpers for localized paths
    ui/es.ts, ui/en.ts               Interface strings
    engines/cpu-scheduling.es.ts …   Explanation templates per engine
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
    [lang]/acerca.astro              About
    [lang]/[path]/index.astro        Path page
    [lang]/[path]/[lesson].astro     Lesson page
  lib/                progress.ts, theme.ts, language.ts (browser storage),
                      catalog.ts (content queries), events.ts (island → page events)
  styles/             tokens.css, base.css
docs/                 design.md, architecture.md
  lessons/            One spec per lesson (_template.md, planificador-cpu.md)
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
- **SEO**: `<link rel="alternate" hreflang>` for both locales plus `x-default` pointing at the default locale's version of the same page (`/es/…`); `lang` on `<html>`; localized sitemap through `@astrojs/sitemap`. The root `/` is `noindex` and left out of the sitemap, since it only picks a language.
- **URLs**: no trailing slash anywhere (`trailingSlash: "never"`). The build emits files (`build.format: "file"`, e.g. `es/acerca.html`), which Cloudflare Pages serves at `/es/acerca` without redirecting; a directory build would make Pages answer every slashless URL with a 308. Canonical, `hreflang` and language-switch links use `pagePathname()` (`src/i18n/config.ts`) to drop the `.html` that `Astro.url.pathname` carries at build time.
- **Formatting**: numbers and dates through `Intl` with the active locale.
- **Language switch**: it keeps the current page (`/es/sistemas-operativos/planificador-cpu` ↔ `/en/sistemas-operativos/planificador-cpu`). Slugs are shared ids, not translated.

## Content model

Ruta → Módulo → Lección → Componente (path → module → lesson → component).

```ts
// src/content.config.ts (summary)
paths:   { id, order, title: {es,en}, summary: {es,en} }
modules: { id, path: reference('paths'), order, title: {es,en}, status: 'planned' | 'available' }
lessons: { id: "<lang>/<slug>", module: reference('modules'), order, title, summary, minutes,
           prerequisites: string[] }   // MDX, one per language
pages:   { id: "<lang>/<slug>", title, description }   // standalone MDX pages
```

A path's modules are the modules whose `path` points to it, sorted by `order`. Lesson `prerequisites` are lesson slugs kept as plain strings, not references, so a lesson can name a prerequisite that is still planned (`planificador-cpu` lists `procesos-estados`). Pages must not assume every prerequisite exists.

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
    "planificador-cpu": {
      "unlockedAt": "2026-11-02T09:40:00Z",
      "completedAt": "2026-11-02T10:00:00Z"
    }
  }
}
```

- Every read and write is wrapped in `try/catch`. Without storage (private mode, blocked cookies) the site works and simply forgets.
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

Engine tests cover every preset × algorithm against the hand-computed metrics and finish orders recorded in the lesson spec (`docs/lessons/<id>.md`), plus edge cases: idle CPU, ties, quantum 1 and simultaneous arrivals. An i18n test renders every engine key in both languages with sample params and asserts that no placeholder is left.

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
