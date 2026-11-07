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

## Teaching method

Every lesson runs Predict → Run → Explain, followed by Experiment and Check. This section explains why the loop works, what it needs from each lesson, and how to design a simulation so that the board, not the prose, carries the understanding. The sources are listed under [References](#references).

### Why this loop

- **Watching alone teaches little.** Crouch et al. (2004) ran seven physics demonstrations under four conditions. Students who only watched understood the concept no better than students who never saw the demonstration; students who predicted the outcome first understood significantly more. A meta-study of 24 algorithm visualization experiments (Hundhausen et al., 2002) reached the same conclusion: what learners _do_ with a visualization matters more than what it shows them.
- **Engagement has levels.** The engagement taxonomy of Naps et al. (2002) goes from _no viewing_ to _viewing_, _responding_ (answering questions about it), _changing_ (modifying inputs and watching the effect), _constructing_ and _presenting_. A Simulario lesson is designed to reach at least _responding_ (Predict, Check) and _changing_ (Experiment). The Run stage on its own is only _viewing_.
- **Trying first, being told later.** Across 53 studies, attempting a problem before instruction beat instruction first (Sinha and Kapur, 2021, g = 0.36, higher when done carefully). The effect reversed for young children and for domain-general skills. Our audience is university students learning specific mechanisms, the case where it helps.
- **Confident errors stick the correction.** Errors made with high confidence are corrected more often after feedback than low-confidence ones (the hypercorrection effect, Butterfield and Metcalfe, 2001). A prediction that feels right and turns out wrong is the most useful moment in a lesson.
- **Explaining to yourself works.** Prompting learners to explain why a step follows from the previous one improves learning (Chi et al., 1994; meta-analysis by Bisra et al., 2018, g = 0.55).

### What every lesson needs

1. **The prediction targets a misconception.** Each Predict question exposes at least one row of the spec's "Misconceptions targeted" table. If most learners would answer it correctly, change the question: no surprise, no learning.
2. **The learner can reason the answer.** Theory gives the names and rules needed to work it out (Mayer's pretraining principle), never the answer. If the only way to answer is to guess, the theory is missing something.
3. **The prediction is short.** It should take under two minutes and about six answers at most. A larger grid is an exercise, not a prediction.
4. **Commit before seeing.** The guess is locked when the run starts (the `onfirstplay` hook).
5. **Explain contrasts the guess with the result.** It starts with the correct answer. Then, for each likely wrong answer, it names the belief behind it and the step of the run that contradicts it ("If you put P1 in running at t = 3, you imagined…").
6. **Experiment asks the learner to make something happen** ("Make…", "Find a workload where…"), which is the _changing_ level. Check uses new cases, never a repeat of the run.

### Keeping the loop fresh across a path

The same loop repeated over many lessons turns into a routine that learners skip. To prevent it:

- **Vary the form of the prediction**: the state of each entity at an instant, a number (waiting time, faults), which of two setups is better, yes or no ("will it deadlock?"), the order of events, or the step where something first goes wrong.
- **Ask for confidence** when the prediction UI supports it ("How sure are you?"). It costs one click and makes a confident error visible, which is when the correction lands best.
- **Use predictions to recall earlier lessons.** A paging lesson can ask what state the process is in during a page fault. This connects the modules of a path instead of leaving them as separate topics.
- **Fade guidance as the path advances.** Detailed guidance helps novices but gets in the way of learners who already know the material (the expertise reversal effect, Kalyuga et al., 2003). Later lessons in a path can use shorter Theory and lean on earlier lessons; "I already know the theory" lets experienced learners skip ahead.

### Designing the simulation

Animation is not better than a static diagram by default. Reviews found mixed results (Tversky et al., 2002), and meta-analyses find a small-to-medium advantage overall (Höffler and Leutner, 2007, d = 0.37; smaller in Berney and Bétrancourt, 2016). The advantage is clearer when the animation shows exactly the change the learner has to understand (Ploetzner et al., 2021). Animations fail in two ways: they are too fast or too busy to perceive, and learners watch what stands out visually instead of what matters (Lowe and Boucheix). Interactivity and cueing are the known remedies. Simulations therefore follow these rules:

1. **Animate only the change the lesson is about.** Everything else stays still. This is principle 5, "Motion shows a move", applied to teaching.
2. **The step is the unit, and the learner sets the pace.** Each step is one event with one explanation (Mayer's segmenting principle). Play is a convenience; previous and next step are the primary controls. When several events share an instant and their order matters to the lesson, show them as separate steps or explain them in causal order.
3. **Make the relevant thing stand out, at the moment it changes.** Highlight the token that moves, the cell that changed or the arrow that appeared, in sync with the event. Cues that show a relation (this interrupt causes this state change) work better than cues that only point at an entity (Boucheix et al., 2013).
4. **Make hidden state visible.** Most misconceptions about a system concern what cannot be seen from outside: registers versus memory, the TLB, a link count, a semaphore queue. Program visualization research calls this the _notional machine_ (Sorva, 2013). The board's job is to draw that machine.
5. **Show the state, not only the motion.** When paused, the board alone answers "where is everything now?". A history (the timeline, the "So far" table) lets the learner compare before and after without remembering it.
6. **Put the words next to the picture, at the same time.** The step explanation sits beside the board and changes with the step (Mayer's contiguity principles). It is short and names entities by id and shape.
7. **Keep one visual vocabulary across lessons.** A ready queue, a lock or a blocked entity looks the same in every lesson, so each lesson builds on what earlier boards taught.
8. **Go up and down the ladder of abstraction** (Victor, 2011). Run shows one concrete case. Experiment varies one parameter at a time. The metrics table and comparison views summarize many cases. Two setups side by side that differ in one detail (contrasting cases, Schwartz and Bransford, 1998) prepare the learner for the explanation that follows.
9. **Meaning never depends on motion.** With reduced motion, tokens jump. The highlight and the explanation must still say what changed.

### Adapting the loop to other paths

The loop fits best when a topic has a deterministic outcome a learner can compute: networking (TCP congestion control, routing, DNS resolution), databases (isolation anomalies, B-trees, query plans, write-ahead logging), distributed systems (Raft, logical clocks, with seeded randomness so predictions stay checkable), computer architecture (caches, pipelines), data structures and Git.

It fits poorly in three cases:

| Case                                                    | Example                                                                                          | Adaptation                                                                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No single right answer                                  | Software design and architecture, good practices                                                 | Predict becomes **choose and see the consequences**: the learner picks a design and predicts which one breaks first under a given change or load, and the simulation applies it. |
| Only part of the topic is deterministic                 | Security: SQL injection, buffer overflows and authentication flows fit; threat modeling does not | Use the loop for the mechanisms and plain prose or worked examples for the judgment-based parts.                                                                                 |
| Mostly vocabulary or concepts, no misconception to test | Definitions, taxonomies, history                                                                 | The topic probably belongs inside another lesson's Theory or Explain rather than as a lesson of its own.                                                                         |

Today every lesson must have all stages in a fixed order (`src/components/lesson/stages.ts`, `AGENTS.md`), and the stepper always shows all of them. A path where most topics fall into the cases above would need a structural variant of the lesson: skipping Predict, several Predict → Run cycles, or a different stage set. Design that variant with the first real lesson that needs it, and update `AGENTS.md`, `stages.ts` and `Lesson.astro` together.

### References

- Berney, S. and Bétrancourt, M. (2016). Does animation enhance learning? A meta-analysis. _Computers & Education_ 101, 150–167.
- Bisra, K., Liu, Q., Nesbit, J. C., Salimi, F. and Winne, P. H. (2018). Inducing self-explanation: a meta-analysis. _Educational Psychology Review_ 30, 703–725. [doi:10.1007/s10648-018-9434-x](https://doi.org/10.1007/s10648-018-9434-x)
- Boucheix, J.-M., Lowe, R. K., Putri, D. K. and Groff, J. (2013). Cueing animations: dynamic signaling aids information extraction and comprehension. _Learning and Instruction_ 25, 71–84.
- Butterfield, B. and Metcalfe, J. (2001). Errors committed with high confidence are hypercorrected. _Journal of Experimental Psychology: Learning, Memory, and Cognition_ 27(6), 1491–1494.
- Chi, M. T. H., de Leeuw, N., Chiu, M.-H. and LaVancher, C. (1994). Eliciting self-explanations improves understanding. _Cognitive Science_ 18(3), 439–477.
- Crouch, C. H., Fagen, A. P., Callan, J. P. and Mazur, E. (2004). Classroom demonstrations: learning tools or entertainment? _American Journal of Physics_ 72(6), 835–838.
- Höffler, T. N. and Leutner, D. (2007). Instructional animation versus static pictures: a meta-analysis. _Learning and Instruction_ 17(6), 722–738.
- Hundhausen, C. D., Douglas, S. A. and Stasko, J. T. (2002). A meta-study of algorithm visualization effectiveness. _Journal of Visual Languages & Computing_ 13(3), 259–290.
- Kalyuga, S., Ayres, P., Chandler, P. and Sweller, J. (2003). The expertise reversal effect. _Educational Psychologist_ 38(1), 23–31.
- Mayer, R. E. (2020). _Multimedia Learning_, 3rd ed. Cambridge University Press.
- Naps, T. L. et al. (2002). Exploring the role of visualization and engagement in computer science education. _ITiCSE Working Group Reports_, 131–152.
- Ploetzner, R., Berney, S. and Bétrancourt, M. (2021). When learning from animations is more successful than learning from static pictures: learning the specifics of change. _Instructional Science_ 49. [doi:10.1007/s11251-021-09541-w](https://doi.org/10.1007/s11251-021-09541-w)
- Schwartz, D. L. and Bransford, J. D. (1998). A time for telling. _Cognition and Instruction_ 16(4), 475–522.
- Sinha, T. and Kapur, M. (2021). When problem solving followed by instruction works: evidence for productive failure. _Review of Educational Research_ 91(5), 761–798.
- Sorva, J., Karavirta, V. and Malmi, L. (2013). A review of generic program visualization systems for introductory programming education. _ACM Transactions on Computing Education_ 13(4), article 15.
- Tversky, B., Morrison, J. B. and Bétrancourt, M. (2002). Animation: can it facilitate? _International Journal of Human-Computer Studies_ 57(4), 247–262.
- Victor, B. (2011). _Up and Down the Ladder of Abstraction_ and _Explorable Explanations_. [worrydream.com](https://worrydream.com/LadderOfAbstraction/)

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

Every pair passes WCAG AA (4.5:1) for its label text. Lightness does not separate every adjacent pair (slots 1–2 and 5–6 are nearly equal), so shape is what keeps them apart. Hollow shapes (outline tokens, planned spaces on the PathMap) draw their line with `--entity-<slot>-line`, the entity color mixed 65% with ink, which keeps at least 3:1 on ground, surface and slot in both themes. Shapes are defined once in `src/components/token/shapes.ts` as 24×24 SVG paths.

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
- **Radii** encode hierarchy: board 22, zones and cards 16–18, fields (number inputs, quiz options) 12, entity bars 10, controls fully rounded (pills and circles). Thin rules and lines are fully rounded too.
- **Outlines**: 2.5px solid ink on interactive containers (board, cards, buttons, selects). 2.5px dashed muted ink on zones where things wait (queues, ready lists).
- **Depth**: one solid offset shadow, `0 6px 0 var(--color-ink)`, only on the board and on the page's primary surface. The primary button uses `0 4px 0 var(--color-action)`. No other shadows.

## Components

These are design roles, not necessarily separate files. Some live inside a larger view today (the CPU board draws its own zones, prediction card and metrics table, and the stepper is part of `Lesson.astro`); `architecture.md` lists where each one is.

| Component        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Token`          | Shape + color + id. Sizes 22 (inline, timeline), 34 (lists), 54 (zones), 84 (CPU slot). Variants: filled (active), outline (finished). Always has an accessible name, e.g. "P2, cuadrado".                                                                                                                                                                                                                                                                                       |
| `Board`          | Primary surface for a simulation: heading, rule line ("Regla: FCFS…"), zones, timeline and player.                                                                                                                                                                                                                                                                                                                                                                               |
| `Zone`           | A place on the board where tokens sit. _Waiting_ uses a dashed outline; _resource_ (CPU, frame, lock) is a recessed slot; _finished_ sits on the ground color with outline tokens.                                                                                                                                                                                                                                                                                               |
| `Timeline`       | Gantt-style track. Entity bars carry a small shape icon plus the id; a 4px ink playhead marks the current instant; tabular axis below.                                                                                                                                                                                                                                                                                                                                           |
| `Player`         | Round buttons for start, previous turn, next turn ("Siguiente turno" / "Next turn") and end; a pill primary button that plays and pauses ("Ejecutar", "Pausar", "Continuar", "Repetir"); speed select. Keyboard: Space plays/pauses, ←/→ step, Home/End jump.                                                                                                                                                                                                                    |
| `Stepper`        | The lesson's track. On wide screens (≥ 1080px) it is a sticky vertical path beside the text: one space per stage joined by a line, like the PathMap; the stage in view is a filled ink space with a bold label, gated stages are dashed spaces with a lock until unlocked. On narrow screens it becomes a sticky row of pills. Below it: "Ya conozco la teoría" and the "Mostrar todas las etapas" text button. It is an ordered list, because the stages really are a sequence. |
| `PredictionCard` | Learner's guess as a row of tokens, then the verdict in words with a good/bad icon.                                                                                                                                                                                                                                                                                                                                                                                              |
| `Explanation`    | The "why" of the current turn: plain paragraph, entities named by id and shape.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `DataTable`      | Metrics and inputs. Row header holds the entity token. Numbers are tabular and right-aligned.                                                                                                                                                                                                                                                                                                                                                                                    |
| `PathMap`        | On a path page, modules are spaces along a winding board path. Each space shows module number, title and status (locked text, in progress, done).                                                                                                                                                                                                                                                                                                                                |
| `LanguageSwitch` | Pill group "es / en" that keeps the current page.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Search`         | Pill link "Buscar" / "Search" with a magnifier in the nav (icon only, 44×44, under 600px). It opens a dialog drawn like a board: surface, ink outline, board radius and offset shadow over a dimmed backdrop. Inside: the field, the count, results grouped by path under small bold muted headings, each result an outlined card with title, module breadcrumb and excerpt. Matches are `<mark>`: a `--color-slot` band plus bold, so they never depend on color alone.         |
| `ThemeToggle`    | Round button. It cycles system → light → dark; its label states the next mode.                                                                                                                                                                                                                                                                                                                                                                                                   |

## Page layouts

All pages share the nav (logo token cluster, Rutas, Acerca, search, language switch, theme toggle) and a 1180px max-width column with 24px gutters (16px on phones).

The 404 pages reuse the logo cluster with its fourth token missing: the diamond is drawn as an empty, dashed slot (`--color-ink-muted`), the same "waiting" outline used on the boards. The share card (`docs/assets/og.svg`, rendered to `public/og.png`) is a board on the ground color: the logo cluster, the wordmark in Lexend 600 and the six entity shapes, all in the light theme's entity colors with ink outlines and the offset board shadow.

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
- **Lesson page**: on wide screens a two-column grid, the track (12.5rem) beside the main column. Prose keeps its 65-character measure, left-aligned; the board and wide tables use the whole main column. The board is the loud element. Theory before it and explanation after it are plain prose. Explain, Experiment and Check start closed, each showing a dashed note with a lock ("This stage opens when you run the simulation to the end") and a link back to the board; they open with a short fade when the run ends.

## Accessibility

- Text contrast ≥ 4.5:1 (3:1 for 24px+). Verified for every token pair above.
- Focus: `outline: 3px solid var(--color-action); outline-offset: 2px` on every interactive element.
- Touch targets ≥ 44×44px.
- Every simulation is fully operable by keyboard. Each turn's explanation is announced through an `aria-live="polite"` region.
- Tokens have accessible names; decorative SVGs are `aria-hidden`.
- `prefers-reduced-motion` disables token travel, playhead easing and the search dialog's rise.
- Search opens with `/` (outside editable fields, so it never steals a prediction input) or Ctrl+K / ⌘K; the boards only use Space, arrows, Home and End with focus inside them. The dialog is a native modal `<dialog>`: the page behind is inert, focus starts in the field and returns to whatever opened it, Escape or the close button closes it. ↓ moves from the field into the results, ↑/↓ between them and Tab works as usual; the number of results is announced in a status region.
- `lang` is set per page (`es` / `en`).

## Dark mode

Dark mode follows `prefers-color-scheme` by default, and the theme toggle can force light or dark (stored per browser). Every token above has a dark value. Entity colors get lighter and their labels switch to the dark ground color. The offset shadow stays ink-colored, which becomes light in dark mode and keeps the tactile edge.

## Voice

- Address the learner as _tú_ in Spanish and _you_ in English.
- Sentence case, active verbs, no filler, no exclamation marks except to celebrate a perfect prediction.
- Errors and empty states say what happened and what to do next.
