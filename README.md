# Simulario

Interactive learning paths for systems and software engineering, in Spanish and English. Every lesson follows **Predict → Run → Explain**: guess what the system will do, watch it happen step by step, then understand why.

The first path is **Operating systems**, with one lesson per module, each built around its own simulation:

| Module                         | Lesson id             | Simulation                                                                    |
| ------------------------------ | --------------------- | ----------------------------------------------------------------------------- |
| 1. Processes and their states  | `procesos-estados`    | Processes moving between the ready queue, the CPU and I/O, instant by instant |
| 2. CPU scheduling              | `planificador-cpu`    | FCFS, SJF, SRTF, priority and Round Robin on your own workload                |
| 3. Threads and race conditions | `condiciones-carrera` | Interleaving `load`/`add`/`store` of a shared counter, by timer or by hand    |
| 4. Mutexes and semaphores      | `mutex-semaforos`     | A bounded buffer with `empty`, `full` and `mutex`, and the swapped-wait bug   |
| 5. Deadlock                    | `interbloqueo`        | A live resource-allocation graph: dining philosophers and lock ordering       |
| 6. Virtual memory and paging   | `paginacion`          | Address translation through a TLB, a page table and page faults               |
| 7. Page replacement            | `reemplazo-paginas`   | FIFO, LRU, OPT and Clock, with Belady's anomaly                               |
| 8. File systems                | `inodos-enlaces`      | Directory, inodes and blocks under `link`, `symlink`, `unlink` and open files |

Each lesson has a spec in [`docs/lessons/`](docs/lessons/) with its objectives, misconceptions and hand-computed expected results.

> Status: Phase 1 content complete (all 8 modules of Operating systems). Live at **[simulario.pages.dev](https://simulario.pages.dev)**.

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

Simulario es un sitio gratuito de rutas de aprendizaje interactivas de ingeniería de sistemas y software, en español e inglés. Está publicado en **[simulario.pages.dev](https://simulario.pages.dev)**. Cada lección sigue el método **Predecir → Ejecutar → Explicar**: anticipas qué hará el sistema, lo ves ocurrir paso a paso y luego entiendes por qué.

La primera ruta es **Sistemas operativos**: ocho módulos, cada uno con una lección y su propia simulación (estados de procesos, planificación de CPU, condiciones de carrera, semáforos, interbloqueo, paginación, reemplazo de páginas e inodos y enlaces).

Para correrlo localmente necesitas Node (versión en `.nvmrc`) y pnpm:

```sh
pnpm install
pnpm dev
```

La documentación técnica está en inglés: [`docs/architecture.md`](docs/architecture.md), [`docs/design.md`](docs/design.md) y [`AGENTS.md`](AGENTS.md). El código usa licencia MIT y el contenido de las lecciones, CC BY-SA 4.0.
