# AGENTS.md

Guidance for AI agents and human contributors working on Simulario. Read `docs/architecture.md` and `docs/design.md` before changing code. This file holds the rules; those two documents explain them.

## Project in one paragraph

Simulario is a free, bilingual (es/en) site of interactive learning paths for systems and software engineering. Each lesson follows Predict → Run → Explain: the learner guesses what a system will do, watches a step-by-step simulation, then learns why. Stack: Astro 5 + MDX, Svelte 5 islands, TypeScript, pnpm, Biome, Vitest, deployed as a static site on Cloudflare Pages.

## Commands

```sh
pnpm install      # install dependencies (Node version in .nvmrc)
pnpm dev          # dev server at http://localhost:4321
pnpm lint         # Biome lint + format check
pnpm format       # Biome format (writes)
pnpm check        # astro check + svelte-check
pnpm test         # Vitest, single run
pnpm build        # static build into dist/
```

Before you say a change is done, run `pnpm lint && pnpm check && pnpm test && pnpm build` and report the results.

## Hard rules

1. **Engines are pure.** Code in `src/engines/` has no DOM, no Svelte, no `Date.now()`, no randomness without an injected seed, and no imports from other project folders. Same input, same trace.
2. **Engines never return prose.** Explanations are `{ key, params }`. Add every new key to the engine's key union and to both `src/i18n/engines/<engine>.es.ts` and `.en.ts`.
3. **No hard-coded visible text** in `.svelte` or `.astro` files. Interface strings go in `src/i18n/ui/es.ts` (source of truth) and `en.ts`. Lesson prose lives in MDX.
4. **Every lesson exists in both languages**, under the same id in `src/content/lessons/es/` and `src/content/lessons/en/`. If you cannot write a translation, say so; do not ship machine-translated text without flagging it in the PR.
5. **Every engine has tests.** New behavior needs a Vitest case with expected values computed by hand, not copied from the engine's own output.
6. **No literal colors, fonts or radii in components.** Use the CSS custom properties from `src/styles/tokens.css`. Entities use the `Token` component and the entity slots (shape + color), never a color alone.
7. **Accessibility is not optional.** Real `<button>`, `<a>` and `<input>` elements; visible focus; 44px touch targets; keyboard operation for every simulation; `aria-live` for step explanations; respect `prefers-reduced-motion`.
8. **No backend, no tracking.** Do not add servers, cookies, accounts or third-party scripts beyond Cloudflare Web Analytics.
9. **Wrap browser storage.** Any `localStorage` access goes through `src/lib/progress.ts` or `src/lib/theme.ts`, inside `try/catch`.

## Conventions

- Code, comments, commit messages, PRs and project docs are written in English. Learner-facing content is written in both Spanish and English.
- TypeScript `strict`. Prefer `type` imports, named exports and small pure functions. No `any`; use `unknown` and narrow it.
- Svelte 5 runes (`$state`, `$derived`, `$props`); no legacy stores in new code.
- File names: `kebab-case.ts`, `PascalCase.svelte` / `.astro` for components.
- URL slugs and content ids are shared across languages and written in Spanish kebab-case (`planificador-cpu`).
- Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`). Keep each commit to one concern.

## Adding a simulation

1. Create `src/engines/<name>/` with `types.ts` (input, state, result, explanation key union), `simulate.ts` returning a `Trace` and `simulate.test.ts`.
2. Add `src/i18n/engines/<name>.es.ts` and `.en.ts` covering every key.
3. Build the views in `src/components/<name>/` using `Board`, `Zone`, `Token`, `Timeline` and the generic `Player`.
4. Embed it in a lesson MDX file inside `<Run>`.

## Adding a lesson

1. Add `src/content/lessons/es/<id>.mdx` and `src/content/lessons/en/<id>.mdx` with the frontmatter required by `src/content/config.ts`.
2. Follow the PEE sections in order: `<Prerequisites>`, `<Theory>` (3–5 minutes), `<Predict>`, `<Run>`, `<Explain>`, `<Experiment>`, `<Check>`, `<Deeper>` (optional).
3. Keep theory before Predict minimal, just enough to reason. Put depth in Explain.

## Definition of done

- Lint, type check, tests and build pass.
- Both languages are complete for any new string, key or lesson.
- It works by keyboard and at 360px width, in light and dark themes.
- Docs are updated when an architectural rule, a token or a convention changes.
