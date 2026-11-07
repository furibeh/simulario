# AGENTS.md

Guidance for AI agents and human contributors working on Simulario. Read `docs/architecture.md` and `docs/design.md` before changing code. This file holds the rules; those two documents explain them.

## Project in one paragraph

Simulario is a free, bilingual (es/en) site of interactive learning paths for systems and software engineering. Each lesson follows Predict → Run → Explain: the learner guesses what a system will do, watches a step-by-step simulation, then learns why. Stack: Astro 7 + MDX, Svelte 5 islands, TypeScript, pnpm, Biome, Vitest, deployed as a static site on Cloudflare Pages.

## Commands

```sh
pnpm install      # install dependencies (Node version in .nvmrc)
pnpm dev          # dev server at http://localhost:4321
pnpm lint         # Biome lint + format check
pnpm format       # Biome format + safe fixes (writes)
pnpm check        # astro check + svelte-check
pnpm test         # Vitest, single run
pnpm build        # static build into dist/, then the Pagefind search index
```

Before you say a change is done, run `pnpm lint && pnpm check && pnpm test && pnpm build && node scripts/check-search-index.mjs` and report the results.

## Hard rules

1. **Engines are pure.** Code in `src/engines/` has no DOM, no Svelte, no `Date.now()`, no randomness without an injected seed, and no imports from other project folders. Same input, same trace.
2. **Engines never return prose.** Explanations are `{ key, params }`. Add every new key to the engine's key union and to both `src/i18n/engines/<engine>.es.ts` and `.en.ts`.
3. **No hard-coded visible text** in `.svelte` or `.astro` files. Interface strings go in `src/i18n/ui/es.ts` (source of truth) and `en.ts`. Lesson prose lives in MDX.
4. **Every lesson exists in both languages**, under the same id in `src/content/lessons/es/` and `src/content/lessons/en/`. If you cannot write a translation, say so; do not ship machine-translated text without flagging it in the PR.
5. **Every engine has tests.** New behavior needs a Vitest case with expected values computed by hand, not copied from the engine's own output. Those values live in the lesson spec (`docs/lessons/<id>.md`, "Expected results") or, for an engine shared by several lessons, also in the engine spec (`docs/engines/<engine>.md`); if a test and the spec disagree, fix the spec or the engine, never silence the test.
6. **No literal colors, fonts or radii in components.** Use the CSS custom properties from `src/styles/tokens.css`. Entities use the `Token` component and the entity slots (shape + color), never a color alone.
7. **Accessibility is not optional.** Real `<button>`, `<a>` and `<input>` elements; visible focus; 44px touch targets; keyboard operation for every simulation; `aria-live` for step explanations; respect `prefers-reduced-motion`.
8. **No backend, no tracking.** Do not add servers, cookies, accounts or third-party scripts beyond Cloudflare Web Analytics.
9. **Wrap browser storage.** Any `localStorage` access goes through a module in `src/lib/` (`progress.ts`, `theme.ts`, `language.ts`), inside `try/catch`. The only exception is a blocking `is:inline` script that must run before first paint: it reads storage inside `try/catch` and gets the key from the `src/lib/` constant through `define:vars`, never as a literal.

## Conventions

- Code, comments, commit messages, PRs and project docs are written in English. Learner-facing content is written in both Spanish and English.
- TypeScript with Astro's `strictest` preset. Prefer `type` imports, named exports and small pure functions. No `any`; use `unknown` and narrow it.
- Svelte 5 runes (`$state`, `$derived`, `$props`); no legacy stores in new code.
- File names: `kebab-case.ts`, `PascalCase.svelte` / `.astro` for components.
- URL slugs and content ids (paths, modules, lessons, pages) are shared across languages and written in English kebab-case (`cpu-scheduling`). Lesson slugs and module ids are global, so they must be unique across paths. Renaming a published slug needs a 301 in `public/_redirects` and an entry in `src/lib/legacy-ids.ts`, so links and stored progress keep working.
- Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`). Keep each commit to one concern.

## Adding a simulation

1. Create `src/engines/<name>/` with `types.ts` (input, state, result, explanation key union), `presets.ts` (the workloads named in the spec), `simulate.ts` returning a `Trace` and `simulate.test.ts`.
2. Add `src/i18n/engines/<name>.es.ts` and `.en.ts` covering every key, and `src/i18n/engines/<name>.test.ts`, which renders every key in both languages.
3. Build the views in `src/components/<name>/` using `Token`, `Timeline` and the generic `Player` (`src/player/`). Shared board styles (cards, controls, zones, tables, the "why" panel) live in `src/components/board/board.css`: import it and put `class="sim"` on the view's root. Keep only view-specific layout in the view's own `<style>`.
4. Embed it in a lesson MDX file inside `<Stage stage="run">`.
5. Add the engine's guarantees to `src/engines/invariants.test.ts` when its topic has properties that hold on random inputs, and replay a published example in `src/engines/published-traces.test.ts` when a citable source has one. Record both in the spec.

An engine's rules, keys and cases live in the spec of its lesson. When a second lesson uses the engine, move them to `docs/engines/<engine>.md`; each lesson spec keeps its teaching plan and its scenarios. `docs/architecture.md` only summarizes each engine and links to its spec.

## Adding a lesson

0. Write the lesson spec first: copy `docs/lessons/_template.md` to `docs/lessons/<id>.md` and fill it in (objectives, misconceptions, prediction, experiments, checks, engine rules and hand-computed expected results). The MDX files and the engine tests follow it.
1. Add `src/content/lessons/es/<id>.mdx` and `src/content/lessons/en/<id>.mdx` with the frontmatter required by `src/content.config.ts`.
2. Wrap each PEE section in `<Stage stage="…">`, in this order: `prerequisites`, `theory` (3–5 minutes), `predict`, `run`, `explain`, `experiment`, `check`, `deeper` (optional). The ids live in `src/components/lesson/stages.ts`.
3. Keep theory before Predict minimal, just enough to reason. Put depth in Explain.
4. Mind the search index. Islands (boards, Quiz) and the solutions inside Experiment `<details>` stay out of it on their own (`pagefind.yml`). Any other answer written in prose that would spoil a question needs `data-pagefind-ignore`.
5. To publish, set `status: available` in `src/content/modules/<module>.yaml` and update the module tables in `README.md`.

## Definition of done

- Lint, type check, tests, build and the search index check pass.
- Both languages are complete for any new string, key or lesson.
- It works by keyboard and at 360px width, in light and dark themes.
- Docs are updated when an architectural rule, a token or a convention changes.
