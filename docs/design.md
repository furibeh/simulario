# Design

Simulario's visual language is **Tokens** (in Spanish, _Fichas_): every thing a simulation moves around (a process, a thread, a page frame, a packet) is a game token with its own **shape and color**, and every simulation is a **board** the learner plays turn by turn. The site around the simulations borrows the same vocabulary: a learning path is a board path, a module is a space on it, a lesson is a game.

This direction was chosen on 2026-11-01 from six explorations on the design canvas (_Simulario — direcciones visuales_, board 6). It is the global style for the whole site, not only for lessons.

## Why this direction

- **Shape + color identity is accessible by construction.** Tokens stay distinguishable for color-blind learners, in grayscale prints and in high-contrast modes, because shape carries identity on its own.
- **It matches the pedagogy.** Predict → Run → Explain is a game loop: guess the move, play the turn, see why. A board makes "state" tangible: where each entity is right now.
- **It is friendly without being childish.** The audience is university students starting systems engineering. Chunky outlines and plain language lower the intimidation of OS internals; precise data (tables, timelines, formulas) keeps it rigorous.

## Principles

1. **Entities are tokens.** An entity always appears with its shape and color, and with its id in text or `aria-label`. Never use color alone to carry meaning.
2. **Color belongs to entities.** UI chrome is ink on a lilac-tinted ground. Entity colors are not used for decoration, buttons or links.
3. **One loud thing per screen.** The board (or, on non-lesson pages, the path map or a live mini-board) gets the outline, the offset shadow and the space. Everything else stays quiet: plain text, thin structure.
4. **Tactile, not glossy.** Thick ink outlines and a solid offset shadow make primary surfaces feel like pieces on a table. No gradients, no blurred drop shadows, no glass.
5. **Motion shows a move.** Animation happens only when state changes: a token travels from the waiting row to the CPU slot. It never decorates. With `prefers-reduced-motion: reduce`, tokens jump instantly.
6. **Say the move.** Copy names what happens: "Siguiente turno" / "Next turn", not "Submit". Explanations say why in one or two sentences, naming entities by id.

## Color

All colors are CSS custom properties defined in `src/styles/tokens.css`. Components never use literal colors.

### Interface

| Token               | Light     | Dark      | Use                                               |
| ------------------- | --------- | --------- | ------------------------------------------------- |
| `--color-ground`    | `#efedf9` | `#1b1730` | Page background                                   |
| `--color-surface`   | `#ffffff` | `#262040` | Board, cards, inputs                              |
| `--color-slot`      | `#e0dcf5` | `#332b57` | Recessed zones (CPU slot), completed step pills   |
| `--color-ink`       | `#231d3d` | `#f1eefc` | Text, outlines, primary buttons                   |
| `--color-ink-muted` | `#5a5475` | `#b4adcf` | Secondary text, dashed zone outlines, axis labels |
| `--color-action`    | `#7b6cf0` | `#7b6cf0` | Primary button offset shadow, focus ring          |
| `--color-on-ink`    | `#efedf9` | `#1b1730` | Text on ink-filled controls                       |

Feedback (correct / incorrect prediction) is expressed with an icon and words first. Color only reinforces it:

| Token          | Light     | Dark      |
| -------------- | --------- | --------- |
| `--color-good` | `#1d7a46` | `#5fd394` |
| `--color-bad`  | `#b42318` | `#ff8a7a` |

### Entities

Six entity slots. Simulations assign slots by entity index (P1 → slot 1). A seventh entity reuses slot 1 with a numeric badge. Text on an entity uses its `on` color.

| Slot | Shape    | Light     | On (light) | Dark      | On (dark) |
| ---- | -------- | --------- | ---------- | --------- | --------- |
| 1    | Circle   | `#c93d27` | `#ffffff`  | `#ff8268` | `#1b1730` |
| 2    | Square   | `#11806f` | `#ffffff`  | `#3cc9b2` | `#1b1730` |
| 3    | Triangle | `#e0a100` | `#231d3d`  | `#ffc93d` | `#1b1730` |
| 4    | Diamond  | `#4b3fc4` | `#ffffff`  | `#9d93ff` | `#1b1730` |
| 5    | Hexagon  | `#b2327a` | `#ffffff`  | `#ff8fc8` | `#1b1730` |
| 6    | Pentagon | `#3f7d20` | `#ffffff`  | `#9ad66b` | `#1b1730` |

Every pair passes WCAG AA (4.5:1) for its label text. Adjacent slots also differ in lightness, not only in hue. Shapes are defined once in `src/components/token/shapes.ts` as 24×24 SVG paths.

## Typography

One family, **Lexend**, designed to improve reading fluency, at four weights. A monospace face is used only for code blocks.

| Role                       | Face                                         | Size / line height                   | Weight  |
| -------------------------- | -------------------------------------------- | ------------------------------------ | ------- |
| Display (page title)       | Lexend                                       | 60 / 1.05, `letter-spacing: -0.02em` | 800     |
| Heading 2 (board, section) | Lexend                                       | 26 / 1.25                            | 800     |
| Heading 3                  | Lexend                                       | 22 / 1.3                             | 800     |
| Body                       | Lexend                                       | 17 / 1.55                            | 400     |
| Small (meta, hints)        | Lexend                                       | 15 / 1.5                             | 500     |
| Data (tables, axis)        | Lexend, `font-variant-numeric: tabular-nums` | 14–17                                | 400–700 |
| Code                       | JetBrains Mono                               | 15 / 1.5                             | 400     |

- Prose is set left-aligned, ragged right, at most 65 characters per line.
- Sentence case everywhere. No all-caps labels, no eyebrow labels above headings.
- Display size scales down with `clamp()` to 40px on phones.

## Space, shape and depth

- **Spacing scale** (px): 4, 8, 12, 16, 20, 24, 32, 48, 64. Sections are separated by 32; board internals by 20–22.
- **Radii** encode hierarchy: board 22, zones and cards 16–18, entity bars 10, controls fully rounded (pills and circles).
- **Outlines**: 2.5px solid ink on interactive containers (board, cards, buttons, selects). 2.5px dashed muted ink on zones where things wait (queues, ready lists).
- **Depth**: one solid offset shadow, `0 6px 0 var(--color-ink)`, only on the board and on the page's primary surface. The primary button uses `0 4px 0 var(--color-action)`. No other shadows.

## Components

| Component        | Description                                                                                                                                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Token`          | Shape + color + id. Sizes 22 (inline, timeline), 34 (lists), 54 (zones), 84 (CPU slot). Variants: filled (active), outline (finished). Always has an accessible name, e.g. "P2, cuadrado".                                                                                                     |
| `Board`          | Primary surface for a simulation: heading, rule line ("Regla: FCFS…"), zones, timeline and player.                                                                                                                                                                                             |
| `Zone`           | A place on the board where tokens sit. _Waiting_ uses a dashed outline; _resource_ (CPU, frame, lock) is a recessed slot; _finished_ sits on the ground color with outline tokens.                                                                                                             |
| `Timeline`       | Gantt-style track. Entity bars carry a small shape icon plus the id; a 4px ink playhead marks the current instant; tabular axis below.                                                                                                                                                         |
| `Player`         | Round buttons for start, previous turn, next turn ("Siguiente turno" / "Next turn") and end; a pill primary button that plays and pauses ("Ejecutar", "Pausar", "Continuar", "Repetir"); speed select. Keyboard: Space plays/pauses, ←/→ step, Home/End jump.                                  |
| `Stepper`        | The lesson's PEE stages as pills linking to each stage. The stage in view is ink-filled; gated stages show a lock and a dashed outline until unlocked. A text button, "Mostrar todas las etapas", opens them without running. It is an ordered list, because the stages really are a sequence. |
| `PredictionCard` | Learner's guess as a row of tokens, then the verdict in words with a good/bad icon.                                                                                                                                                                                                            |
| `Explanation`    | The "why" of the current turn: plain paragraph, entities named by id and shape.                                                                                                                                                                                                                |
| `DataTable`      | Metrics and inputs. Row header holds the entity token. Numbers are tabular and right-aligned.                                                                                                                                                                                                  |
| `PathMap`        | On a path page, modules are spaces along a winding board path. Each space shows module number, title and status (locked text, in progress, done).                                                                                                                                              |
| `LanguageSwitch` | Pill group "es / en" that keeps the current page.                                                                                                                                                                                                                                              |
| `ThemeToggle`    | Round button. It cycles system → light → dark; its label states the next mode.                                                                                                                                                                                                                 |

## Page layouts

All pages share the nav (logo token cluster, Rutas, Acerca, language switch, theme toggle) and a 1180px max-width column with 24px gutters (16px on phones).

```
Home                         Path page                     Lesson page
┌──────────────────────┐     ┌──────────────────────┐      ┌──────────────────────┐
│ nav                  │     │ nav                  │      │ nav                  │
│ Title + one line     │     │ Path title + summary │      │ module link          │
│ ┌──────────────────┐ │     │ ┌──────────────────┐ │      │ Lesson title         │
│ │ live mini-board  │ │     │ │ PathMap          │ │      │ Stepper (6 pills)    │
│ │ (one RR demo)    │ │     │ │ ○─□─△─◇─⬡─⬠─○─□  │ │      │ Theory (prose)       │
│ └──────────────────┘ │     │ └──────────────────┘ │      │ ┌──────────────────┐ │
│ Paths list           │     │ Module list (text)   │      │ │ Board            │ │
│ How a lesson works   │     │                      │      │ └──────────────────┘ │
└──────────────────────┘     └──────────────────────┘      │ Why  │ Prediction    │
                                                           │ Metrics table        │
                                                           │ Check, Go deeper     │
                                                           └──────────────────────┘
```

- **Home**: the hero is a small playable board, the most characteristic thing the site does, not a marketing banner.
- **Path page**: the PathMap is the loud element; the module list underneath repeats it as plain accessible text.
- **Lesson page**: the board is the loud element. Theory before it and explanation after it are plain prose. Explain, Experiment and Check start closed, each showing a dashed note with a lock ("This stage opens when you run the simulation to the end") and a link back to the board; they open with a short fade when the run ends.

## Accessibility

- Text contrast ≥ 4.5:1 (3:1 for 24px+). Verified for every token pair above.
- Focus: `outline: 3px solid var(--color-action); outline-offset: 2px` on every interactive element.
- Touch targets ≥ 44×44px.
- Every simulation is fully operable by keyboard. Each turn's explanation is announced through an `aria-live="polite"` region.
- Tokens have accessible names; decorative SVGs are `aria-hidden`.
- `prefers-reduced-motion` disables token travel and playhead easing.
- `lang` is set per page (`es` / `en`).

## Dark mode

Dark mode follows `prefers-color-scheme` by default, and the theme toggle can force light or dark (stored per browser). Every token above has a dark value. Entity colors get lighter and their labels switch to the dark ground color. The offset shadow stays ink-colored, which becomes light in dark mode and keeps the tactile edge.

## Voice

- Address the learner as _tú_ in Spanish and _you_ in English.
- Sentence case, active verbs, no filler, no exclamation marks except to celebrate a perfect prediction.
- Errors and empty states say what happened and what to do next.
