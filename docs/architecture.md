# Architecture

Simulario is a static, bilingual (Spanish/English) site built with Astro. Lessons are MDX pages with interactive simulations embedded as Svelte islands. Every simulation follows one rule: **a pure engine produces a trace of steps, and a generic player renders it.**

## Stack

| Piece | Choice |
|---|---|
| Framework | Astro 5, static output |
| Content | MDX + content collections (zod schemas) |
| Interactive islands | Svelte 5 (runes) |
| Language | TypeScript, `strict` |
| Package manager | pnpm |
| Lint and format | Biome (TS/JS/JSON/CSS); `astro check` and `svelte-check` for `.astro` and `.svelte` types |
| Tests | Vitest |
| Hosting | Cloudflare Pages (automatic deploy comes after Phase 0) |
| Analytics | Cloudflare Web Analytics, enabled only when `PUBLIC_CF_BEACON_TOKEN` is set |
| Search | Pagefind, one index per language (Phase 1) |
| CI | GitHub Actions |

## Directory layout

```
src/
  engines/            Pure simulation engines. No DOM, no Svelte, no UI strings.
    cpu-scheduling/   simulate.ts, types.ts, presets.ts, simulate.test.ts
  player/             Generic trace player (Svelte) and its types
  components/
    token/            Token, shapes
    board/            Board, Zone, Timeline, PredictionCard, Explanation, DataTable
    cpu-scheduler/    Views specific to the CPU scheduling engine
    site/             Nav, LanguageSwitch, ThemeToggle, Stepper, PathMap
  i18n/
    config.ts         Locales, default locale, helpers for localized paths
    ui/es.ts, ui/en.ts               Interface strings
    engines/cpu-scheduling.es.ts …   Explanation templates per engine
  content/
    config.ts         Collection schemas
    paths/            One YAML file per learning path
    modules/          One YAML file per module
    lessons/es/, lessons/en/         One MDX file per lesson and language
  layouts/            Base.astro, Lesson.astro
  pages/
    index.astro                      Language redirect
    [lang]/index.astro               Home
    [lang]/[path]/index.astro        Path page
    [lang]/[path]/[lesson].astro     Lesson page
  lib/                progress.ts, theme.ts
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
// src/player/types.ts
export interface Explanation<K extends string = string> {
  key: K;                                   // e.g. "fcfs.pick"
  params?: Record<string, string | number>; // e.g. { id: "P2", arrival: 1 }
}

export interface Step<S, K extends string = string> {
  t: number;                 // simulated time at the start of the step
  state: S;                  // complete state after the step, never a diff
  explain: Explanation<K>[]; // why this step happened, in order
}

export interface Trace<S, R, K extends string = string> {
  steps: Step<S, K>[];
  result: R;                 // final metrics and orders, used by Predict and Check
}

export type Engine<I, S, R, K extends string = string> = (input: I) => Trace<S, R, K>;
```

Rules:

- Engines are deterministic, synchronous and pure: same input, same trace.
- Each step stores the whole state, so the player can jump to any step without replaying. Traces are small (hundreds of steps).
- Engines never produce prose. An explanation is a key plus parameters, and each engine declares its keys as a string-literal union (`CpuExplainKey`).
- A step's explanations may contain several entries, for example "P1 finishes" followed by "P2 is first in the queue".

### CPU scheduling engine

Port of the prototype's `simulate()`. Input: processes `{ id, arrival, burst, priority }`, algorithm (`fcfs | sjf | srtf | priority | rr`) and quantum. State per step: running process, ready queue, finished list, remaining time per process. Result: per-process finish, turnaround, waiting and response times, their averages, and the finish order. Keys include `fcfs.pick`, `sjf.pick`, `srtf.pick`, `srtf.preempt`, `srtf.keep`, `priority.pick`, `rr.pick`, `rr.continue`, `rr.expire`, `nonpreemptive.continue`, `finish` and `idle`.

## Player

A Svelte component, `Player.svelte`, plus a runes-based controller, `usePlayer.svelte.ts`:

- State: `cursor` (0…steps.length), `status` (`idle | playing | paused | ended`), `speed`.
- Controls: play/pause, step back/forward, jump to start/end, speed. Keyboard: Space, ←, →, Home, End, active while focus is inside the board.
- Prediction gate: when a lesson defines a prediction, the first play locks the learner's guess. Afterwards the guess is compared with `trace.result`.
- Rendering: the player receives the trace and a Svelte snippet that draws the board for `steps[cursor - 1]`. The player holds no knowledge of processes, queues or CPUs.
- Accessibility: explanations of the current step are rendered into an `aria-live="polite"` region. Reduced motion disables easing.

## Internationalization

- **Locales**: `es` and `en`, both prefixed (`/es/…`, `/en/…`), configured with Astro's built-in i18n routing (`prefixDefaultLocale: true`, default locale `es`).
- **Root `/`**: a static page that redirects with a tiny inline script. It uses the language stored from a previous visit, then `navigator.languages`, then `es`. It also contains plain links to both languages for no-JS visitors and crawlers. Cloudflare Pages redirects cannot branch on `Accept-Language`, so this happens on the client.
- **Interface strings**: `src/i18n/ui/es.ts` is the source of truth (`as const`). `en.ts` is typed with `satisfies UiDict`, so a missing or extra key fails `astro check`. Components get a `t` function through `useTranslations(lang)`.
- **Engine explanations**: `src/i18n/engines/<engine>.<lang>.ts` maps every engine key to a template function `(params) => string`. Typed as `Record<CpuExplainKey, …>`, so a new key without both translations fails type checking.
- **Content**: lessons live in `src/content/lessons/<lang>/<id>.mdx`, and the same `id` in both folders links the translations. Paths and modules are single YAML entries with localized fields (`title: { es, en }`).
- **Missing translation**: the page renders the available language with a notice and a link. `lang` on the content wrapper reflects the language actually shown.
- **SEO**: `<link rel="alternate" hreflang>` for both locales plus `x-default` pointing at `/`; `lang` on `<html>`; localized sitemap through `@astrojs/sitemap`.
- **Formatting**: numbers and dates through `Intl` with the active locale.
- **Language switch**: it keeps the current page (`/es/sistemas-operativos/planificador-cpu` ↔ `/en/sistemas-operativos/planificador-cpu`). Slugs are shared ids, not translated.

## Content model

Ruta → Módulo → Lección → Componente (path → module → lesson → component).

```ts
// src/content/config.ts (sketch)
paths:   { id, title: {es,en}, summary: {es,en}, modules: reference('modules')[] }
modules: { id, path: reference('paths'), order, title: {es,en}, status: 'planned' | 'available' }
lessons: { id, module: reference('modules'), order, title, summary, minutes,
           prerequisites: reference('lessons')[] }   // MDX, one per language
```

A lesson's MDX body follows the PEE structure with layout components: `<Prerequisites>`, `<Theory>`, `<Predict>`, `<Run>`, `<Explain>`, `<Experiment>`, `<Check>` and `<Deeper>`. `Lesson.astro` builds the stepper from those sections. "I already know the theory" is an in-page link to `<Predict>`.

## Progress

`src/lib/progress.ts` stores progress in `localStorage` under `simulario:progress:v1`:

```json
{ "v": 1, "lessons": { "planificador-cpu": { "step": "run", "completedAt": "2026-11-02T10:00:00Z" } } }
```

- Every read and write is wrapped in `try/catch`. Without storage (private mode, blocked cookies) the site works and simply forgets.
- A lesson is completed when its Check section is answered.
- No personal data. Accounts and server sync (Supabase) are out of scope until there is demand.

## Theme

`data-theme` on `<html>` is `light`, `dark` or absent (follow the system). A blocking inline script in `<head>` applies the stored choice before first paint. Tokens are defined in `src/styles/tokens.css` under `:root`, `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) … }` and `:root[data-theme="dark"]`.

## Quality gates

| Gate | Command | Runs in CI |
|---|---|---|
| Lint and format | `pnpm lint` (`biome ci`) | yes |
| Types | `pnpm check` (`astro check` + `svelte-check`) | yes |
| Unit tests | `pnpm test` (`vitest run`) | yes |
| Build | `pnpm build` | yes |

Engine tests cover every preset × algorithm against the hand-computed metrics and finish orders recorded in the lesson spec (`docs/lessons/<id>.md`), plus edge cases: idle CPU, ties, quantum 1 and simultaneous arrivals. An i18n test renders every engine key in both languages with sample params and asserts that no placeholder is left.

## Decisions

| # | Decision | Reason |
|---|---|---|
| 1 | Static site, no backend | Free hosting, no accounts needed for learning |
| 2 | Engine/player split with full-state steps | Write the player once; step back is free; engines are trivially testable |
| 3 | Engines emit keys, not text | Bilingual from day one; engines and tests are language-independent |
| 4 | Both locales prefixed | Symmetric URLs; neither language is second-class |
| 5 | Svelte for islands | Small runtime, fine-grained reactivity for per-tick updates |
| 6 | Tokens (shape + color) for entities | Accessible identity without relying on color (see `design.md`) |
| 7 | Biome instead of ESLint + Prettier | One fast tool; type checkers cover `.astro`/`.svelte` |
