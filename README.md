# Simulario

Interactive learning paths for systems and software engineering, in Spanish and English. Every lesson follows **Predict → Run → Explain**: guess what the system will do, watch it happen step by step, then understand why.

The first path is **Operating systems**. Its first lesson is a CPU scheduler: define a workload, pick an algorithm (FCFS, SJF, SRTF, priority, Round Robin), predict the finishing order and play the schedule turn by turn.

> Status: Phase 0 (foundations). Not yet deployed.

## Stack

Astro 7 + MDX, Svelte 5 islands, TypeScript, pnpm, Biome, Vitest. Static output for Cloudflare Pages.

## Getting started

Requirements: Node (version in `.nvmrc`) and pnpm.

```sh
pnpm install
pnpm dev          # http://localhost:4321
```

Other scripts:

```sh
pnpm lint         # Biome lint + format check
pnpm check        # astro check + svelte-check
pnpm test         # Vitest
pnpm build        # static build into dist/
```

## How it is built

- **Engines** (`src/engines/`) are pure TypeScript functions that turn an input into a trace of steps. Each step holds the full state and the reasons for it as translation keys.
- **The player** (`src/player/`) plays any trace: play, pause, step back, step forward, speed, keyboard.
- **Lessons** (`src/content/lessons/{es,en}/`) are MDX pages that embed simulations as Svelte islands.
- **Design**: every simulated entity is a game token with its own shape and color, so it never depends on color alone.

Read more in [`docs/architecture.md`](docs/architecture.md) and [`docs/design.md`](docs/design.md). Contributors and AI agents: start with [`AGENTS.md`](AGENTS.md).

## Roadmap

| Phase          | Goal                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 0, foundations | Astro project with i18n, design system, generic player, CPU scheduler lesson in both languages, progress in the browser, CI |
| 1, first path  | The 8 modules of Operating systems; public launch                                                                           |
| 2, listen      | Share with students and universities, measure, adjust                                                                       |
| 3, grow        | Next path (Networks or Databases), open to contributors                                                                     |

## License

Code: [MIT](LICENSE). Lesson content: [CC BY-SA 4.0](LICENSE-CONTENT).

---

## En español

Simulario es un sitio gratuito de rutas de aprendizaje interactivas de ingeniería de sistemas y software, en español e inglés. Cada lección sigue el método **Predecir → Ejecutar → Explicar**: anticipas qué hará el sistema, lo ves ocurrir paso a paso y luego entiendes por qué.

La primera ruta es **Sistemas operativos**, y su primera lección es un planificador de CPU.

Para correrlo localmente necesitas Node (versión en `.nvmrc`) y pnpm:

```sh
pnpm install
pnpm dev
```

La documentación técnica está en inglés: [`docs/architecture.md`](docs/architecture.md), [`docs/design.md`](docs/design.md) y [`AGENTS.md`](AGENTS.md). El código usa licencia MIT y el contenido de las lecciones, CC BY-SA 4.0.
