# Lesson spec: Threads and race conditions

| Field          | Value                                                                      |
| -------------- | -------------------------------------------------------------------------- |
| Id             | `condiciones-carrera`                                                      |
| Path / module  | Operating systems (`sistemas-operativos`) / 3, Threads and race conditions |
| Engine         | `src/engines/race-conditions/`                                             |
| Estimated time | 30 minutes                                                                 |
| Status         | Written                                                                    |

The simulation is an **interleaving board**: two or three threads run `counter++` on one shared variable, one machine instruction per turn, on a single CPU. The learner either lets a timer (round robin with a quantum counted in instructions) decide the interleaving, or builds the interleaving by hand. Each thread shows its code listing with its program counter and its private register; the shared variable sits in the middle. Every store is logged, and a store that overwrites a value the thread never saw is marked as stale.

## Learning objectives

By the end of the lesson the learner can:

1. Say what the threads of a process share (code, global variables, heap, open files) and what each thread owns (registers, program counter, stack).
2. Break `counter++` into its three machine steps (load, add, store) and trace an interleaving of several threads by hand, register by register.
3. Spot a stale store and compute the final value of a shared counter and the number of lost updates.
4. Explain why a race makes the result depend on the schedule (indeterminate), why passing tests does not prove its absence, and how an atomic instruction removes it.

## Prerequisites

- Processes, ready queue and timer interrupts (lesson `procesos-estados`).
- Round Robin and the quantum (lesson `planificador-cpu`).
- Reading a three-line pseudo-assembly listing; no programming experience needed.

## Misconceptions targeted

| #   | Misconception                                                                     | Where it is exposed                       |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------- |
| M1  | `counter++` is one indivisible step.                                              | Predict; Run, step 3; Check C1            |
| M2  | Races need several cores; on one CPU threads take turns, so they are safe.        | Theory (one CPU); Predict; Check C3       |
| M3  | A program that gives the right answer when tested has no race.                    | Experiment E1; Explain; Check C2          |
| M4  | A longer quantum (fewer interruptions) fixes the race.                            | Experiment E2; Check C2                   |
| M5  | At worst, a race loses one increment here and there.                              | Run (_Tres hilos_ ends at 2 of 6); E3; C5 |
| M6  | Each thread has its own copy of a global variable, or threads share one register. | Theory; Explain; Check C4                 |

## Minimal theory (before Predict)

- A **thread** is a sequence of instructions being executed inside a process. A process can have several threads. They **share** the process's memory (code, global variables, heap) and open files, but each one has its **own registers, program counter and stack**.
- The OS schedules threads like it schedules processes: one CPU, one thread at a time, and a timer interrupt can take the CPU away after a **quantum**. Here the quantum is counted in **instructions**.
- `counter++` on a global variable looks like one step, but the CPU runs three instructions:
  1. `load`: `reg = counter` (copy memory into the thread's register),
  2. `add`: `reg = reg + 1` (only the register changes),
  3. `store`: `counter = reg` (copy the register back to memory).
- A context switch saves the thread's registers and restores them when it runs again. Memory is not saved or restored: it is shared.
- One worked example: one thread, `counter = 5`. Load: reg 5. Add: reg 6, counter still 5. Store: counter 6.

## Predict

- **Question**: "Two threads each run `counter++` once, starting from `counter = 0`. The timer switches threads every 2 instructions. What is the value of `counter` at the end?" Options: 0, 1, 2.
- **Setup**: preset _Dos incrementos_, timer scheduler, quantum 2, split instructions.
- **Correct answer**: 1.
- **Naive answer and why it fails**: 2 (M1, M2). At step 3 the timer stops T1 after its add, with 1 in its register but `counter` still 0. T2 loads that 0. Both later store 1: T2's store (step 6) overwrites T1's increment.

## Run

- **Default setup**: _Dos incrementos_, timer, quantum 2, split.
- **Moments to watch**:
  - Step 2: T1 has 1 in its register, `counter` is still 0.
  - Step 3: T2 loads 0, a value that is already out of date.
  - Step 6: T2 stores 1 over T1's 1: stale store, one update lost.
- Below the board: the store log (who wrote, what it had read, what memory held just before) and the final tally `expected − final = lost`.

## Explain (depth after the run)

- Contrast the prediction with the run: two increments, one survives.
- **Race condition**: the result depends on the order in which the scheduler interleaves the threads. **Critical section**: the code that touches shared data and must not be interleaved with another thread's critical section on the same data, here the three instructions `load`, `add`, `store` together. **Mutual exclusion**: at most one thread inside the critical section at a time.
- **The stale store**: a thread writes a value computed from a read that is no longer current. Every increment made by others between its load and its store is erased.
- **Indeterminate**: the same program, same input, gives 1 or 2 depending on where the timer falls (M3). With quantum 3 the run is always right on _Dos incrementos_, but nothing in the code guarantees it; a different load (another thread, a page fault, an interrupt) shifts the turns.
- **Quantum and alignment** (M4): on _Tres hilos_, quantum 4 still loses 2 updates. Lowering the number of interruptions makes races rarer, not impossible.
- **How bad can it get** (M5): with two threads doing _n_ increments each (_n_ ≥ 2), the final value can be as low as 2. The worst interleaving is in Experiment E3.
- **Atomic instructions**: hardware offers read-modify-write instructions that the CPU completes without letting another thread touch that memory in between (x86 `lock xadd`, C11 `atomic_fetch_add`, C++ `std::atomic<int>::fetch_add`, Java `AtomicInteger`). With them `counter++` is one instruction, and no interleaving can split it.
- **What threads share** (M6): registers are per thread and saved on each context switch; the global `counter` exists once in memory. That is exactly why T1's 1 sits safely in its register while T2 reads the old 0.
- **Real systems**: on several cores, threads run truly in parallel and caches add more surprises (memory reordering), but the lost update already appears with one core and preemption. In C and C++ two unsynchronized accesses where one writes are a _data race_, which is undefined behavior; tools like ThreadSanitizer detect them. In Python, `counter += 1` is several bytecodes and is not atomic either, with or without the GIL; the free-threaded build (officially supported since Python 3.14, PEP 779) only makes races more frequent.

## Experiment

| #   | Challenge                                                              | One valid solution                                        | Why it works                                                                                    |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| E1  | Make _Dos incrementos_ end at 2 without making `counter++` atomic.     | Quantum 3 (or 6).                                         | Each turn holds a whole load–add–store, so no thread ever reads a stale value. Correct by luck. |
| E2  | Make _Tres hilos_ lose updates with a quantum larger than 3.           | Quantum 4 (or 5): final 4, 2 lost.                        | Turns of 4 instructions cut the second increment between load and store.                        |
| E3  | With two threads doing three increments each, make `counter` end at 2. | Manual order _Peor caso_: T1, T2×6, T1×2, T2, T1×6, T2×2. | T1's first store erases two of T2's increments, and T2's last store erases two of T1's.         |
| E4  | Make every schedule give the right answer.                             | Atomic `counter++`, any quantum or order.                 | A single indivisible instruction cannot be interleaved.                                         |

## Check

| #   | Question                                                                                                       | Answer                                                                    | Targets |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------- |
| C1  | Into how many machine instructions does `counter++` on a global variable turn here?                            | Three: load, add, store.                                                  | M1      |
| C2  | A racy program gave the right answer in 1000 test runs. What can you conclude?                                 | Nothing: another schedule can still lose updates.                         | M3, M4  |
| C3  | Can a race condition happen on a computer with a single core?                                                  | Yes: a timer interrupt can switch threads between the load and the store. | M2      |
| C4  | Two threads of the same process. Which of these do they share: the global `counter`, the registers, the stack? | Only the global `counter`.                                                | M6      |
| C5  | Two threads each do `counter++` three times from 0, with no synchronization. What is the smallest final value? | 2.                                                                        | M5      |
| C6  | Which part of `counter++` is the critical section?                                                             | The three instructions together, from the load to the store.              | Explain |

## Engine behavior

### Inputs and limits

| Field        | Range                                                                         | Default          |
| ------------ | ----------------------------------------------------------------------------- | ---------------- |
| `threads`    | 2–3, ids `T1`…`T3`                                                            | 2                |
| `increments` | 1–3 per thread (each thread runs `counter++` that many times)                 | 1                |
| `atomic`     | `false`: `load`, `add`, `store`; `true`: one `inc` instruction                | `false`          |
| `schedule`   | `{ kind: "timer", quantum }` with quantum 1–6, or `{ kind: "manual", order }` | timer, quantum 2 |

`counter` starts at 0. A manual `order` lists thread ids, one per instruction. Every id must name an existing thread that still has instructions left at that point; otherwise the engine throws a `RangeError`. The order may be shorter than the program: the trace then ends early and `complete` is `false`.

### Programs

Each thread runs `increments` copies of its increment. Split: `load, add, store` per increment (`3 × increments` instructions). Atomic: one `inc` per increment.

- `load`: `reg ← counter`, and the thread remembers the loaded value.
- `add`: `reg ← reg + 1`. Memory does not change.
- `store`: `counter ← reg`. The store is **stale** when `counter` just before it differs from the value this thread loaded for that increment.
- `inc`: `counter ← counter + 1` in one step. `reg` is not used (shown as empty).

### Timer scheduling (round robin)

- Threads form a circular ready order T1, T2, T3. T1 is dispatched first.
- The running thread executes one instruction per step. After it has executed `quantum` instructions in its turn:
  - if it has finished, the next unfinished thread in circular order is dispatched (`dispatch`), with no `preempt`;
  - if it has not finished and another unfinished thread exists, it is preempted (`preempt`) and the next unfinished thread is dispatched (`dispatch`);
  - if it is the only unfinished thread, it simply continues (its turn counter restarts, no key).
- A thread that finishes before its quantum is used up also hands the CPU to the next unfinished thread (`dispatch`).
- Context switches cost nothing and happen between instructions, so each step holds exactly one instruction.

### Manual scheduling

The thread named by `order[k]` runs instruction `k`. When it differs from the thread that ran the previous instruction (or at the first step), the step starts with `pick`.

### Steps

One step per instruction; `t` is the instruction index starting at 0. The state is the state **after** the instruction. Keys within a step, in order: `preempt` (if any), `dispatch` or `pick` (if a switch happens), the instruction key (`load`, `add`, `store`, `store.stale`, `inc`), then `finish` if that was the thread's last instruction.

### Explanation keys

| Key           | Params                            | Example (es)                                                                                                                                                 | Example (en)                                                                                                                                        |
| ------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dispatch`    | `id`                              | El planificador le da la CPU a T2.                                                                                                                           | The scheduler gives the CPU to T2.                                                                                                                  |
| `preempt`     | `id`, `quantum`                   | El temporizador interrumpe a T1 tras 2 instrucciones y guarda su registro.                                                                                   | The timer interrupts T1 after 2 instructions and saves its register.                                                                                |
| `pick`        | `id`                              | Tú le das el turno a T2.                                                                                                                                     | You give the turn to T2.                                                                                                                            |
| `load`        | `id`, `value`                     | T1 lee counter = 0 y lo copia en su registro.                                                                                                                | T1 reads counter = 0 and copies it into its register.                                                                                               |
| `add`         | `id`, `value`, `counter`          | T1 suma 1 en su registro: ahora vale 1. counter sigue en 0.                                                                                                  | T1 adds 1 in its register: it now holds 1. counter is still 0.                                                                                      |
| `store`       | `id`, `value`                     | T1 escribe 1 en counter.                                                                                                                                     | T1 writes 1 to counter.                                                                                                                             |
| `store.stale` | `id`, `value`, `loaded`, `before` | T2 escribe 1 en counter, que valía 1. Lo calculó a partir de 0, un valor que ya no estaba al día: su escritura pisa lo que otros escribieron desde entonces. | T2 writes 1 to counter, which held 1. It computed it from 0, a value that was no longer current: its write overwrites what others wrote since then. |
| `inc`         | `id`, `value`                     | T1 incrementa counter de forma atómica: ahora vale 1.                                                                                                        | T1 increments counter atomically: it now holds 1.                                                                                                   |
| `finish`      | `id`                              | T1 terminó todos sus incrementos.                                                                                                                            | T1 has finished all its increments.                                                                                                                 |

### Result

`final` (counter after the last step), `expected` (`threads × increments`), `lost = expected − final` (only meaningful when `complete`), `complete`, `instructions` (steps run), `switches` (steps that carry `dispatch` or `pick` after the first one), `writes` (one entry per `store`, `store.stale` or `inc`: step, id, value written, `loaded` (null for `inc`), `before`, `stale`), and `segments` (maximal runs of one thread, one unit per instruction, for the timeline).

## Expected results (hand-computed)

Notation: `L`, `A`, `S` for load, add, store; `L0` means "loads 0", `A1` "register becomes 1", `S1` "stores 1", `S1*` a stale store, `I1` an atomic inc that leaves 1. Turns are separated by `|`.

### Preset: Dos incrementos (2 threads × 1 increment)

| Variant           | Trace                                                | Final | Lost | Stale stores | Switches |
| ----------------- | ---------------------------------------------------- | ----- | ---- | ------------ | -------- |
| Timer, quantum 1  | T1 L0 \| T2 L0 \| T1 A1 \| T2 A1 \| T1 S1 \| T2 S1\* | 1     | 1    | 1            | 5        |
| Timer, quantum 2  | T1 L0 A1 \| T2 L0 A1 \| T1 S1 \| T2 S1\*             | 1     | 1    | 1            | 3        |
| Timer, quantum 3  | T1 L0 A1 S1 \| T2 L1 A2 S2                           | 2     | 0    | 0            | 1        |
| Timer, quantum 6  | same as quantum 3                                    | 2     | 0    | 0            | 1        |
| Atomic, quantum 1 | T1 I1 \| T2 I2                                       | 2     | 0    | 0            | 1        |

Quantum 2, keys by step:

| t   | Keys                                                           | counter | T1 reg | T2 reg |
| --- | -------------------------------------------------------------- | ------- | ------ | ------ |
| 0   | dispatch T1, load T1 (0)                                       | 0       | 0      | —      |
| 1   | add T1 (1, counter 0)                                          | 0       | 1      | —      |
| 2   | preempt T1 (2), dispatch T2, load T2 (0)                       | 0       | 1      | 0      |
| 3   | add T2 (1, counter 0)                                          | 0       | 1      | 1      |
| 4   | preempt T2 (2), dispatch T1, store T1 (1), finish T1           | 1       | 1      | 1      |
| 5   | dispatch T2, store.stale T2 (1, loaded 0, before 1), finish T2 | 1       | 1      | 1      |

Quantum 3: step 0 `dispatch T1, load T1 (0)`; step 2 `store T1 (1), finish T1` (the quantum ends with the thread, so no `preempt`); step 3 `dispatch T2, load T2 (1)`; step 5 `store T2 (2), finish T2`.

### Preset: Tres hilos (3 threads × 2 increments)

| Variant           | Trace                                                                                                            | Final | Lost | Stale stores |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | ----- | ---- | ------------ |
| Timer, quantum 1  | T1 L0, T2 L0, T3 L0, A1 ×3, T1 S1, T2 S1\*, T3 S1\*, T1 L1, T2 L1, T3 L1, A2 ×3, T1 S2, T2 S2\*, T3 S2\*         | 2     | 4    | 4            |
| Timer, quantum 2  | T1 L0 A1 \| T2 L0 A1 \| T3 L0 A1 \| T1 S1 L1 \| T2 S1\* L1 \| T3 S1\* L1 \| T1 A2 S2 \| T2 A2 S2\* \| T3 A2 S2\* | 2     | 4    | 4            |
| Timer, quantum 3  | T1 L0 A1 S1 \| T2 L1 A2 S2 \| T3 L2 A3 S3 \| T1 L3 A4 S4 \| T2 L4 A5 S5 \| T3 L5 A6 S6                           | 6     | 0    | 0            |
| Timer, quantum 4  | T1 L0 A1 S1 L1 \| T2 L1 A2 S2 L2 \| T3 L2 A3 S3 L3 \| T1 A2 S2\* \| T2 A3 S3 \| T3 A4 S4                         | 4     | 2    | 1            |
| Timer, quantum 5  | T1 L0 A1 S1 L1 A2 \| T2 L1 A2 S2 L2 A3 \| T3 L2 A3 S3 L3 A4 \| T1 S2\* \| T2 S3 \| T3 S4                         | 4     | 2    | 1            |
| Timer, quantum 6  | T1 L0 A1 S1 L1 A2 S2 \| T2 L2 … S4 \| T3 L4 … S6                                                                 | 6     | 0    | 0            |
| Atomic, quantum 2 | T1 I1 I2 \| T2 I3 I4 \| T3 I5 I6                                                                                 | 6     | 0    | 0            |

Quantum 2 has 18 steps and 8 switches. Quantum 4: T1 finishes in its second turn after 2 instructions, so T2 is reached with `dispatch`, not `preempt`. T1's stale store (loaded 1, memory held 3) erases two increments at once, T2's and T3's, so lost (2) and stale stores (1) differ: a stale store can erase several updates. T2's and T3's last stores are not stale: memory holds exactly what they loaded, although T1 had rewound it.

### Preset: Peor caso (2 threads × 3 increments, manual)

Order: T1, T2, T2, T2, T2, T2, T2, T1, T1, T2, T1, T1, T1, T1, T1, T1, T2, T2 (18 instructions).

| Steps | Who | Instructions       | counter after |
| ----- | --- | ------------------ | ------------- |
| 0     | T1  | L0                 | 0             |
| 1–6   | T2  | L0 A1 S1 L1 A2 S2  | 2             |
| 7–8   | T1  | A1 S1\* (before 2) | 1             |
| 9     | T2  | L1                 | 1             |
| 10–15 | T1  | L1 A2 S2 L2 A3 S3  | 3             |
| 16–17 | T2  | A2 S2\* (before 3) | 2             |

Final 2, expected 6, lost 4, stale stores 2, switches 5 (`pick` at steps 0, 1, 7, 9, 10, 16), complete.

### External cross-check

`src/engines/published-traces.test.ts` replays OSTEP Figure 26.7 (the lost update, shifted from 50 to 0): manual order T1, T1, T2, T2, T2, T1 ends at 1 with T1's store stale.

### Edge cases

| Case                     | Input                                        | Expected                                                                              |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------- |
| Only one thread left     | 2 threads × 2, timer, quantum 1              | Once T1 finishes (step 10), T2 runs its last instruction (step 11) with no `preempt`. |
| Short manual order       | Dos incrementos, manual order T1, T2         | 2 steps, `complete` false, final 0, T1 reg 0, T2 reg 0.                               |
| Invalid manual order     | Dos incrementos, manual order T1, T1, T1, T1 | `RangeError`: T1 has no instructions left at step 3.                                  |
| Atomic with manual order | 2 × 1 atomic, order T2, T1                   | `pick T2, inc T2 (1), finish T2`; `pick T1, inc T1 (2), finish T1`. Final 2.          |

For the first edge case (2 threads × 2 increments, quantum 1): T1 L0, T2 L0, T1 A1, T2 A1, T1 S1, T2 S1\*, T1 L1, T2 L1, T1 A2, T2 A2, T1 S2 (finish T1), T2 S2\* (finish T2, dispatched without a preempt). Final 2, lost 2.

## Go deeper (optional section)

- Locks and semaphores (next module, `mutex-semaforos`).
- Memory reordering on multicore CPUs and memory models (C11, Java).
- Check-then-act races: `if (!exists(f)) create(f)` races even when each call is atomic.
- ThreadSanitizer and other race detectors.

## References

- Arpaci-Dusseau and Arpaci-Dusseau, _Operating Systems: Three Easy Pieces_, ch. 26 "Concurrency: An Introduction", §26.3–26.4. Free at https://pages.cs.wisc.edu/~remzi/OSTEP/
- Silberschatz, Galvin and Gagne, _Operating System Concepts_, 10th ed., §4.1 "Overview" (threads) and §6.1 "Background" (race conditions).
- cppreference, "Multi-threaded executions and data races": https://en.cppreference.com/w/cpp/language/multithread
- PEP 779, "Criteria for supported status for free-threaded Python": https://peps.python.org/pep-0779/

## Translations

| Language | File                                             | Status             |
| -------- | ------------------------------------------------ | ------------------ |
| es       | `src/content/lessons/es/condiciones-carrera.mdx` | Written, in review |
| en       | `src/content/lessons/en/condiciones-carrera.mdx` | Written, in review |
