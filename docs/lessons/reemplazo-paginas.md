# Lesson spec: Page replacement algorithms

| Field          | Value                                                                      |
| -------------- | -------------------------------------------------------------------------- |
| Id             | `reemplazo-paginas`                                                        |
| Path / module  | Operating systems (`sistemas-operativos`) / 7, Page replacement algorithms |
| Engine         | `src/engines/page-replacement/`                                            |
| Estimated time | 30 minutes                                                                 |
| Status         | Written                                                                    |

The simulation is a **frame grid**: one column per page reference, one row per frame, filled as the run advances, with every fault marked and every victim crossed out. Beside it, the selected algorithm shows its own bookkeeping: the FIFO queue, the LRU recency list, OPT's next use of each page, or the Clock dial with its hand and use bits. Below, a comparison table runs every algorithm with 1 to 6 frames on the same reference string, so Belady's anomaly shows up as a number that goes up instead of down.

## Learning objectives

By the end of the lesson the learner can:

1. Trace FIFO, LRU, OPT and Clock by hand on a reference string and count page faults.
2. Explain what each algorithm assumes about the future, and why OPT is a benchmark rather than an algorithm an OS can run.
3. Recognize Belady's anomaly: with FIFO, more frames can mean more faults; with LRU or OPT, never.
4. Explain why real systems approximate LRU with a hardware use bit (Clock and its descendants).
5. Separate compulsory faults (first reference to a page) from the faults an algorithm could avoid.

## Prerequisites

- Pages, frames, page faults and eviction (lesson `paginacion`).

## Misconceptions targeted

| #   | Misconception                                              | Where it is exposed                                       |
| --- | ---------------------------------------------------------- | --------------------------------------------------------- |
| M1  | More frames always mean fewer (or equal) page faults.      | Predict; comparison table; Check C2                       |
| M2  | FIFO evicts the page that has gone unused the longest.     | Run, reference 7 (FIFO evicts page 1 just used); Check C1 |
| M3  | OPT is the algorithm the OS should use.                    | Explain; Check C3                                         |
| M4  | Exact LRU is cheap: the OS just looks at the times.        | Explain (Clock); Check C5                                 |
| M5  | A hit changes the FIFO order.                              | Run (hits at references 5 and 6); Check C4                |
| M6  | With enough cleverness an algorithm can avoid every fault. | Experiment E4 (compulsory faults); Check C6               |

## Minimal theory (before Predict)

- A process references pages in some order, the **reference string**. Memory has a fixed number of **frames**. A reference to a page already in a frame is a **hit**; otherwise it is a **page fault**. If no frame is free, the algorithm picks a **victim** to evict.
- **FIFO**: evict the page that was **loaded** first. Hits do not change the order.
- **LRU** (least recently used): evict the page whose last **use** is the oldest. Every hit refreshes the page.
- **OPT** (optimal, Belady's algorithm): evict the page whose next use is **farthest in the future**, or that will never be used again. It needs to know the future.
- **Clock** (second chance): frames form a circle with a **use bit** each, set to 1 whenever the page is loaded or referenced. On a fault the hand looks at the frame it points to: bit 1 → clear it and move on; bit 0 → evict that page, load the new one there with bit 1, and move the hand one step.
- Free frames are filled in order (frame 0 first). The first reference to each page always faults.

## Predict

- **Setup**: reference string `1 2 3 4 1 2 5 1 2 3 4 5` (preset _Belady_). With FIFO and 3 frames it causes **9** page faults (given in the prompt).
- **Question**: "With FIFO and 4 frames, how many page faults?" The board asks for a number from 1 to 12.
- **Correct answer**: 10.
- **Naive answer and why it fails**: 9 or fewer (M1). FIFO with 4 frames keeps pages 1–4 until page 5 arrives at reference 7, then evicts 1, 2, 3, 4 and 5 in turn exactly before each one is needed again: references 7 to 12 all fault.

## Run

- **Default setup**: _Belady_, FIFO, 4 frames.
- **Moments to watch**:
  - References 5 and 6 (pages 1 and 2): hits; the FIFO queue does not move (M5).
  - Reference 7 (page 5): FIFO evicts page 1, used two references ago (M2).
  - References 8–12: each eviction removes the page needed next.
- Comparison table: FIFO row, 9 faults with 3 frames and 10 with 4.

## Explain (depth after the run)

- **Belady's anomaly** (M1): with FIFO, the set of pages kept with 4 frames is not always a superset of the set kept with 3. LRU and OPT are **stack algorithms**: with _n + 1_ frames they always keep what they would keep with _n_, plus one more page, so faults never increase. On _Belady_, LRU goes 10 → 8 and OPT 7 → 6 when frames go from 3 to 4.
- **What each one bets on**: FIFO ignores use; LRU assumes the recent past predicts the near future (locality); OPT reads the future, which is only possible after the fact (M3). It is the yardstick: no algorithm can fault less.
- **Classic string** (`7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1`, 3 frames): OPT 9, LRU 12, Clock 14, FIFO 15.
- **Why Clock** (M4): exact LRU would need to update a timestamp or move a list node on every memory access, billions per second. Hardware instead sets a use (accessed) bit in the page-table entry; Clock reads and clears these bits only when it needs a victim. If every bit is 1, Clock clears them all and behaves like FIFO, which is why it also shows the anomaly on _Belady_.
- **Compulsory faults** (M6): the first reference to each page always faults. _Belady_ has 5 distinct pages, so 5 faults is the floor for any algorithm; with 5 or more frames every algorithm reaches it.
- **Real systems**: Linux approximates LRU with active and inactive lists driven by the accessed bit, and since 6.1 includes the multi-generational LRU (MGLRU), enabled by default in distributions such as Fedora and Arch. Windows trims per-process working sets. All of them are LRU approximations, not FIFO and not OPT.

## Experiment

| #   | Challenge                                                            | One valid solution                                 | Why it works                                                                           |
| --- | -------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| E1  | Find an algorithm and frame count where adding a frame adds faults.  | FIFO (or Clock) on _Belady_: 3 → 4 frames, 9 → 10. | Neither keeps a superset of its pages when given more frames.                          |
| E2  | Show that LRU does not suffer the anomaly on _Belady_.               | LRU, frames 1–6: 12, 12, 10, 8, 5, 5.              | LRU is a stack algorithm: more frames never hurt.                                      |
| E3  | Rank the four algorithms on _Clásica_ with 3 frames.                 | OPT 9, LRU 12, Clock 14, FIFO 15.                  | Clock's second chances save one fault over FIFO; LRU's exact recency saves three more. |
| E4  | Make all four algorithms fault the same number of times on _Belady_. | 5 or 6 frames: 5 faults each.                      | Every page fits; only compulsory faults remain.                                        |

## Check

| #   | Question                                                                                                         | Answer                                                      | Targets |
| --- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------- |
| C1  | FIFO, 3 frames hold pages 4, 1, 2, loaded in that order; page 1 was just used. Page 5 faults. Which page leaves? | Page 4, the first one loaded.                               | M2      |
| C2  | Can giving FIFO more frames increase page faults?                                                                | Yes: Belady's anomaly (9 → 10 on the lesson's string).      | M1      |
| C3  | Why do operating systems not use OPT?                                                                            | It needs to know future references.                         | M3      |
| C4  | FIFO: a page already in memory is referenced again. What happens to the FIFO queue?                              | Nothing; only loads change it.                              | M5      |
| C5  | Clock: the hand points to a frame whose use bit is 1. What does it do?                                           | Clears the bit and moves on: the page gets a second chance. | M4      |
| C6  | A string references 5 different pages. What is the fewest page faults any algorithm can have, starting empty?    | 5.                                                          | M6      |

## Engine behavior

### Inputs and limits

| Field       | Range                         | Default  |
| ----------- | ----------------------------- | -------- |
| `refs`      | 1–20 page numbers, each 0–9   | _Belady_ |
| `frames`    | 1–6                           | 4        |
| `algorithm` | `fifo`, `lru`, `opt`, `clock` | `fifo`   |

### Rules

- One step per reference (`t` = reference index from 0). Frames are slots 0…frames − 1, all empty at the start.
- **Hit** (page in a slot): FIFO: nothing changes. LRU: the page becomes the most recently used. OPT: nothing. Clock: the slot's use bit becomes 1. Key `hit`.
- **Fault with a free slot**: load into the lowest free slot (`load`). FIFO: the page joins the end of the queue. LRU: most recently used. Clock: use bit 1; the hand does not move.
- **Fault without a free slot**: choose a victim, replace it in its slot.
  - FIFO: the page at the head of the queue (`evict.fifo`); the new page joins the end.
  - LRU: the least recently used page (`evict.lru`).
  - OPT: for every resident page, find its next reference after the current one. Evict the page never used again (`evict.opt.never`) or else the one with the farthest next use (`evict.opt`, with `next` = 1-based position of that use). Ties (several pages never used again) go to the lowest slot.
  - Clock: while the slot under the hand has use bit 1, clear it (`clock.clear`) and advance the hand (wrapping). Then evict that slot's page (`evict.clock`), load the new page there with use bit 1 and advance the hand one slot.
- Keys in a step: `hit`, or `load`, or the `clock.clear` keys (in order) followed by one eviction key.

### Explanation keys

| Key               | Params                           | Example (es)                                                                                                         | Example (en)                                                                                              |
| ----------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `hit`             | `page`, `slot`                   | La página 2 ya está en el marco 1: acierto.                                                                          | Page 2 is already in frame 1: a hit.                                                                      |
| `load`            | `page`, `slot`                   | Fallo de página: la 3 no está en memoria y entra en el marco libre 2.                                                | Page fault: page 3 is not in memory and goes into free frame 2.                                           |
| `evict.fifo`      | `page`, `victim`, `slot`         | Fallo de página: FIFO saca la página 1, la que entró hace más tiempo, y pone la 5 en el marco 0.                     | Page fault: FIFO evicts page 1, the one loaded longest ago, and puts page 5 in frame 0.                   |
| `evict.lru`       | `page`, `victim`, `slot`         | Fallo de página: LRU saca la página 3, la que lleva más tiempo sin usarse, y pone la 5 en el marco 2.                | Page fault: LRU evicts page 3, unused for the longest time, and puts page 5 in frame 2.                   |
| `evict.opt`       | `page`, `victim`, `slot`, `next` | Fallo de página: OPT saca la página 3, cuyo próximo uso es el más lejano (referencia 10), y pone la 4 en el marco 2. | Page fault: OPT evicts page 3, whose next use is the farthest (reference 10), and puts page 4 in frame 2. |
| `evict.opt.never` | `page`, `victim`, `slot`         | Fallo de página: OPT saca la página 1, que no se volverá a usar, y pone la 3 en el marco 0.                          | Page fault: OPT evicts page 1, which will never be used again, and puts page 3 in frame 0.                |
| `clock.clear`     | `page`, `slot`                   | El reloj apunta al marco 0 (página 1) con bit de uso 1: lo pone a 0 y avanza.                                        | The hand points to frame 0 (page 1) with use bit 1: it clears it and moves on.                            |
| `evict.clock`     | `page`, `victim`, `slot`         | El reloj encuentra la página 2 con bit 0 en el marco 1: la saca y pone la 5.                                         | The hand finds page 2 with bit 0 in frame 1: it evicts it and puts page 5 there.                          |

### Result

`faults`, `hits`, per reference `{ page, hit, slot, victim }`, and `compulsory` (number of distinct pages). A helper `faultTable(refs)` returns faults for every algorithm and frame count 1–6.

## Expected results (hand-computed)

References are numbered from 1. Frame contents are listed by slot; `F` marks a fault, `·` a hit.

### Preset: Belady (`1 2 3 4 1 2 5 1 2 3 4 5`)

| Algorithm | Frames | Per reference (F/·)     | Faults | Final frames | Victims in order    |
| --------- | ------ | ----------------------- | ------ | ------------ | ------------------- |
| FIFO      | 3      | F F F F F F F · · F F · | 9      | 5 3 4        | 1, 2, 3, 4, 1, 2    |
| FIFO      | 4      | F F F F · · F F F F F F | 10     | 4 5 2 3      | 1, 2, 3, 4, 5, 1    |
| LRU       | 3      | F F F F F F F · · F F F | 10     | 3 4 5        | 1, 2, 3, 4, 5, 1, 2 |
| LRU       | 4      | F F F F · · F · · F F F | 8      | 5 2 4 3      | 3, 4, 5, 1          |
| OPT       | 3      | F F F F · · F · · F F · | 7      | 4 2 5        | 3, 4, 1, 3          |
| OPT       | 4      | F F F F · · F · · · F · | 6      | 4 2 3 5      | 4, 1                |
| Clock     | 3      | F F F F F F F · · F F · | 9      | 5 3 4        | 1, 2, 3, 4, 1, 2    |
| Clock     | 4      | F F F F · · F F F F F F | 10     | 4 5 2 3      | 1, 2, 3, 4, 5, 1    |

Details:

- FIFO 4, reference 7 (page 5): queue 1 2 3 4, victim 1 in slot 0; references 5 and 6 left the queue unchanged.
- LRU 4, reference 7 (page 5): recency (least recent first) 3 4 1 2, victim 3 in slot 2.
- OPT 3, reference 4 (page 4): next uses: 1 at reference 5, 2 at 6, 3 at 10 → `evict.opt` page 3, slot 2, next 10. Reference 7 (page 5): next uses 1 at 8, 2 at 9, 4 at 11 → evict 4 (slot 2, next 11). Reference 10 (page 3): 1 and 2 never used again, 5 at 12 → `evict.opt.never` page 1 (slot 0, lowest of the tie). Reference 11 (page 4): 3 and 2 never again → evict 3 (slot 0).
- Clock 3, reference 4 (page 4): all bits are 1: `clock.clear` for slots 0, 1, 2, then `evict.clock` page 1 in slot 0; hand → 1, bits 1 0 0. Reference 5 (page 1): slot 1 has bit 0 → evict 2 immediately; hand → 2. Reference 10 (page 3): hand at 1, bits 1 1 1 → clears 1, 2, 0, evicts page 1 in slot 1; hand → 2.

Faults by frame count (comparison table):

| Algorithm | 1   | 2   | 3   | 4   | 5   | 6   |
| --------- | --- | --- | --- | --- | --- | --- |
| FIFO      | 12  | 12  | 9   | 10  | 5   | 5   |
| LRU       | 12  | 12  | 10  | 8   | 5   | 5   |

### Preset: Clásica (`7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1`, 3 frames)

FIFO 15 (traced by hand), LRU 12 and OPT 9 (the values published in Silberschatz, Galvin and Gagne, §10.4).

Clock 3, traced by hand: faults at references 1, 2, 3, 4, 6, 8, 9, 11, 12, 14, 15, 16, 18, 20; hits at 5, 7, 10, 13, 17, 19. 14 faults. Final frames 0 7 1.

### Edge cases

| Case            | Input                                  | Expected                                    |
| --------------- | -------------------------------------- | ------------------------------------------- |
| One frame       | `1 1 2 1`, any algorithm               | F · F F: 3 faults.                          |
| Everything fits | Belady, 5 frames, any                  | 5 faults, all compulsory; `compulsory` = 5. |
| Invalid input   | page 10, or 0 frames, or 21 references | `RangeError`.                               |

## Go deeper (optional section)

- Working sets and thrashing: what happens when the frames given to a process are below its working set.
- Enhanced Clock with the dirty bit: prefer clean pages, which need no write-back.
- Linux active/inactive lists and MGLRU in more detail.
- Stack algorithms: why the inclusion property rules out Belady's anomaly.

## References

- Belady, L. A., "A study of replacement algorithms for a virtual-storage computer", _IBM Systems Journal_ 5(2), 1966.
- Belady, Nelson and Shedler, "An anomaly in space-time characteristics of certain programs running in a paging machine", _Communications of the ACM_ 12(6), 1969.
- Arpaci-Dusseau and Arpaci-Dusseau, _Operating Systems: Three Easy Pieces_, ch. 22 "Beyond Physical Memory: Policies". Free at https://pages.cs.wisc.edu/~remzi/OSTEP/
- Silberschatz, Galvin and Gagne, _Operating System Concepts_, 10th ed., §10.4 "Page Replacement".
- Linux kernel documentation, "Multi-Gen LRU": https://docs.kernel.org/admin-guide/mm/multigen_lru.html

## Translations

| Language | File                                           | Status             |
| -------- | ---------------------------------------------- | ------------------ |
| es       | `src/content/lessons/es/reemplazo-paginas.mdx` | Written, in review |
| en       | `src/content/lessons/en/reemplazo-paginas.mdx` | Written, in review |
