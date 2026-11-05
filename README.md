# Simulario

Interactive learning paths for systems and software engineering, in Spanish and English. Every lesson follows **Predict → Run → Explain**: guess what the system will do, watch it happen step by step, then understand why.

The first path is **Operating systems**, with one lesson per module, each built around its own simulation:

| Module                         | Lesson id          | Simulation                                                                    |
| ------------------------------ | ------------------ | ----------------------------------------------------------------------------- |
| 1. Processes and their states  | `process-states`   | Processes moving between the ready queue, the CPU and I/O, instant by instant |
| 2. CPU scheduling              | `cpu-scheduling`   | FCFS, SJF, SRTF, priority and Round Robin on your own workload                |
| 3. Threads and race conditions | `race-conditions`  | Interleaving `load`/`add`/`store` of a shared counter, by timer or by hand    |
| 4. Mutexes and semaphores      | `mutex-semaphores` | A bounded buffer with `empty`, `full` and `mutex`, and the swapped-wait bug   |
| 5. Deadlock                    | `deadlock`         | A live resource-allocation graph: dining philosophers and lock ordering       |
| 6. Virtual memory and paging   | `paging`           | Address translation through a TLB, a page table and page faults               |
| 7. Page replacement            | `page-replacement` | FIFO, LRU, OPT and Clock, with Belady's anomaly                               |
| 8. File systems                | `inodes-links`     | Directory, inodes and blocks under `link`, `symlink`, `unlink` and open files |

The second path, **Databases**, explains how a database works on the inside. Three of its eight modules are available, all on one transactions simulation:

| Module                 | Lesson id             | Simulation                                                                          |
| ---------------------- | --------------------- | ----------------------------------------------------------------------------------- |
| 5. Isolation anomalies | `isolation-anomalies` | Two or three transactions on shared rows under Read Uncommitted and Read Committed  |
| 6. Two-phase locking   | `two-phase-locking`   | Shared and exclusive locks, wait queues and a deadlock detector that picks a victim |
| 7. MVCC and snapshots  | `mvcc-snapshots`      | Version chains, snapshots, first updater wins and write skew                        |

Buffer pool, B+ trees, access paths, joins and recovery are planned.

Each lesson has a spec in [`docs/lessons/`](docs/lessons/) with its objectives, misconceptions and hand-computed expected results.

> Status: Phase 3 under way. Operating systems is complete (8 modules); Databases has 3 of 8 modules. Live at **[simulario.pages.dev](https://simulario.pages.dev)**.

## Stack

Astro 7 + MDX, Svelte 5 islands, TypeScript, pnpm, Biome, Vitest. Static output, deployed to Cloudflare Pages on every push to `main`.

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
pnpm build        # static build into dist/, plus the search index
pnpm preview      # serve dist/ (search only works on a build)
```

## How it is built

- **Engines** (`src/engines/`) are pure TypeScript functions that turn an input into a trace of steps. Each step holds the full state and the reasons for it as translation keys.
- **The player** (`src/player/`) plays any trace: play, pause, step back, step forward, speed, keyboard.
- **Lessons** (`src/content/lessons/{es,en}/`) are MDX pages that embed simulations as Svelte islands.
- **Search**: a static [Pagefind](https://pagefind.app) index per language, built after the site and searched in the browser.
- **Design**: every simulated entity is a game token with its own shape and color, so it never depends on color alone.

Read more in [`docs/architecture.md`](docs/architecture.md) and [`docs/design.md`](docs/design.md). Contributors and AI agents: start with [`AGENTS.md`](AGENTS.md).

## Roadmap

| Phase          | Goal                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 0, foundations | Astro project with i18n, design system, generic player, CPU scheduler lesson in both languages, progress in the browser, CI |
| 1, first path  | The 8 modules of Operating systems; public launch                                                                           |
| 2, listen      | Share with students and universities, measure, adjust                                                                       |
| 3, grow        | Next path (Databases, under way), site search (done), open to contributors                                                  |

## License

Code: [MIT](LICENSE). Lesson content: [CC BY-SA 4.0](LICENSE-CONTENT).

---

## En español

Simulario es un sitio gratuito de rutas de aprendizaje interactivas de ingeniería de sistemas y software, en español e inglés. Está publicado en **[simulario.pages.dev](https://simulario.pages.dev)**. Cada lección sigue el método **Predecir → Ejecutar → Explicar**: anticipas qué hará el sistema, lo ves ocurrir paso a paso y luego entiendes por qué.

La primera ruta es **Sistemas operativos**: ocho módulos, cada uno con una lección y su propia simulación (estados de procesos, planificación de CPU, condiciones de carrera, semáforos, interbloqueo, paginación, reemplazo de páginas e inodos y enlaces).

La segunda ruta es **Bases de datos** y explica cómo funciona una base de datos por dentro. Tiene tres de sus ocho módulos: anomalías de aislamiento, bloqueo en dos fases y MVCC con instantáneas. Faltan el gestor de búferes, los árboles B+, los índices, los joins y la recuperación.

El sitio tiene un buscador: pulsa / o Ctrl+K en cualquier página. Usa un índice estático por idioma generado con Pagefind.

Para correrlo localmente necesitas Node (versión en `.nvmrc`) y pnpm:

```sh
pnpm install
pnpm dev
```

El buscador solo funciona sobre la versión construida: `pnpm build && pnpm preview`.

La documentación técnica está en inglés: [`docs/architecture.md`](docs/architecture.md), [`docs/design.md`](docs/design.md) y [`AGENTS.md`](AGENTS.md). El código usa licencia MIT y el contenido de las lecciones, CC BY-SA 4.0.
