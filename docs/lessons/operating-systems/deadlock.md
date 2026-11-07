# Lesson spec: Deadlock

| Field              | Value                                                 |
| ------------------ | ----------------------------------------------------- |
| Id                 | `deadlock`                                            |
| Path / module      | Operating systems (`operating-systems`) / 5, Deadlock |
| Engine             | `src/engines/resource-graph/`                         |
| Estimated time     | 30 minutes                                            |
| Translation review | Reviewed, 2026-11-04                                  |

The simulation is a **resource-allocation graph** drawn live. Threads sit on an outer ring and single-instance resources (locks, forks) on an inner ring. A solid arrow from a resource to a thread means "holds"; a dashed arrow from a thread to a resource means "waits for". Threads run a short script of `acquire`, `release` and `work` operations, one operation per turn. When the arrows close a cycle, the cycle is highlighted and named, and the threads on it never move again, while threads outside it keep running. The learner can change the number of philosophers, delay a thread's start, and switch on a global lock order.

## Learning objectives

By the end of the lesson the learner can:

1. Draw and read a resource-allocation graph: assignment edges, request edges and the wait-for chain they form.
2. State the four Coffman conditions and say which one a given fix breaks.
3. Decide whether a state is deadlocked by finding a cycle (single-instance resources), and tell a deadlock from a long wait.
4. Explain why acquiring locks in one global order prevents deadlock, while adjusting timing only makes it less likely.
5. Compare prevention, avoidance, detection with recovery, and ignoring the problem, with one real system for each.

## Prerequisites

- Mutexes, blocking and waking up (lesson `mutex-semaphores`).
- Ready queue and blocked state (lesson `process-states`, which `mutex-semaphores` already requires).

## Misconceptions targeted

| #   | Misconception                                                                     | Where it is exposed                           |
| --- | --------------------------------------------------------------------------------- | --------------------------------------------- |
| M1  | Given time, someone will eventually get the resources: a deadlock is a long wait. | Predict; Run, step 10; Check C1               |
| M2  | A deadlock freezes the whole system.                                              | Run _Dos cerrojos_ (T3 finishes); Check C2    |
| M3  | Several threads waiting at once means a deadlock.                                 | Experiment E2 (four waiting, no cycle); C3    |
| M4  | Fixing the timing (making one thread start later) fixes the deadlock.             | Experiment E3 (delay 1 vs 2); Check C4        |
| M5  | To prevent deadlock every thread must change its code.                            | Experiment E1 (only T5 reorders); Explain; C5 |
| M6  | The operating system detects and breaks deadlocks between application locks.      | Explain (real systems); Check C6              |

## Minimal theory (before Predict)

- A **resource** here has a single instance: a lock, a file, a printer, a fork. A thread **acquires** it (or blocks until its holder releases it), uses it and **releases** it. When it is released and someone is waiting, the first waiter gets it.
- **Resource-allocation graph**: a solid arrow R → T means "T holds R"; a dashed arrow T → R means "T waits for R".
- A **deadlock** is a set of threads where each one waits for a resource held by another one in the set. None can continue, so none will ever release what it holds.
- With single-instance resources, **deadlock ⇔ a cycle in the graph**.
- The **dining philosophers**: _n_ philosophers around a table, one fork between each pair. To eat, a philosopher needs both neighboring forks. Each one takes the left fork, then the right one, eats, and puts both down. In the simulator philosopher T_i's left fork is R_i and its right fork is R_(i+1) (R_1 for the last one).
- One CPU, one operation per turn, turns in a circle (quantum of one operation).
- One worked example: T1 holds R1 and waits for R2; T2 holds R2. That is a chain T1 → R2 → T2, not a cycle: when T2 releases R2, T1 continues.

## Predict

- **Question**: "Five philosophers sit down at the same time. Each one takes the left fork, then the right one, eats once and puts both down. How many of them get to eat?" Options 0–5.
- **Setup**: preset _Filósofos_, 5 threads, no delays, each thread in its own order.
- **Correct answer**: 0.
- **Naive answer and why it fails**: "at least one" or "all five, taking turns" (M1). In the first five turns every philosopher takes its left fork. In the next five, each asks for its right fork, which is its neighbor's left fork. At step 10 the last request closes the cycle T5 → R1 → T1 → R2 → T2 → R3 → T3 → R4 → T4 → R5 → T5 and nobody can move.

## Run

- **Default setup**: _Filósofos_, 5 threads.
- **Moments to watch**:
  - Step 5: every fork has an owner; no arrow is dashed yet.
  - Steps 6–9: one dashed arrow per turn; still a chain, not a cycle.
  - Step 10: the fifth dashed arrow closes the cycle.
- Below the graph: a table with what each thread holds, what it waits for and its state.

## Explain (depth after the run)

- **The four Coffman conditions** (all four are needed): mutual exclusion (a fork has one owner), hold and wait (each holds its left fork while asking for the right one), no preemption (nobody takes a fork away), circular wait (the cycle). Breaking any one prevents deadlock.
- **Prevention by lock ordering** (M5): number the resources and acquire them in increasing order. A cycle would need someone to hold a higher resource while waiting for a lower one, which the order forbids. On the table only philosopher T5 changes: it takes R1 before R5. Everyone else already takes the lower fork first.
- **Waiting is not deadlock** (M3): with the global order, at step 8 four philosophers are blocked at once, but the arrows form a chain that ends at T4, which holds R4 and finds R5 free: it takes R5 on its next turn and eats. The chain unwinds one philosopher at a time.
- **Partial deadlock** (M2): in _Dos cerrojos_, T1 and T2 deadlock at step 8 but T3, which uses only R3, finishes normally. The system keeps running; the deadlocked threads simply never return.
- **Timing is not a fix** (M4): delaying T2 by 2 turns lets T1 take both locks first, so _Dos cerrojos_ finishes; a delay of 1 still deadlocks. A slower disk or a different load can bring the bad timing back.
- **The four strategies**:
  - Prevention: break a Coffman condition by design (lock ordering, acquire everything at once, try-lock and back off).
  - Avoidance: grant a request only if the system stays in a safe state (Dijkstra's banker's algorithm). Requires knowing maximum needs in advance; rare in general-purpose OSes.
  - Detection and recovery: look for cycles in the wait-for graph and abort a victim. Databases do this: PostgreSQL runs its deadlock check when a lock wait exceeds `deadlock_timeout` (1 s by default) and aborts one transaction with an error.
  - Ignoring it (the "ostrich algorithm"): general-purpose OSes do not detect deadlocks between application locks (M6); the program hangs and the user kills it.
- **Tools**: Linux's `lockdep` records the order in which kernel locks are taken and warns the first time two locks are taken in opposite orders, before the deadlock ever happens.
- **Multiple instances**: if a resource type has several instances, a cycle means a deadlock is possible but not certain; detection then needs an algorithm like the banker's safety check.

## Experiment

| #   | Challenge                                                                 | One valid solution                           | Why it works                                                                                           |
| --- | ------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| E1  | Make all five philosophers eat, changing only how forks are ordered.      | Switch on the global order.                  | Only T5 changes (R1 before R5), and circular wait becomes impossible. Eating order T4, T3, T2, T1, T5. |
| E2  | Find a moment when four threads wait at the same time without a deadlock. | Global order, step 8.                        | The dashed arrows form a chain that ends at T4, which holds R4 and can still take R5.                  |
| E3  | Make _Dos cerrojos_ finish without changing the lock order.               | Delay T2 by 2 (or more) turns.               | T1 gets R2 before T2 asks for it. With delay 1 the cycle still forms, at step 10.                      |
| E4  | Make a deadlock with the fewest threads possible.                         | _Filósofos_ with 2 threads: cycle at step 4. | Two threads, two locks taken in opposite orders.                                                       |

## Check

| #   | Question                                                                                                 | Answer                                                             | Targets |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------- |
| C1  | Five philosophers each hold their left fork and wait for the right one. What happens if you wait longer? | Nothing: no one can release a fork, so they wait forever.          | M1      |
| C2  | T1 and T2 are deadlocked. Can T3, which uses other resources, keep running?                              | Yes. Deadlock affects only the threads in the cycle.               | M2      |
| C3  | Four threads are blocked waiting for locks, but the graph has no cycle. Is it a deadlock?                | No: the chain ends at a thread that can run, and it unwinds.       | M3      |
| C4  | Adding a short delay before T2 makes the deadlock disappear in tests. Is the program fixed?              | No: another timing can bring it back. Fix the order instead.       | M4      |
| C5  | Which Coffman condition does a global lock order break?                                                  | Circular wait.                                                     | M5      |
| C6  | Two threads of your program deadlock on two mutexes. What does Linux do?                                 | Nothing: the threads stay blocked until someone kills the process. | M6      |

## Engine behavior

### Inputs and limits

| Field       | Range                                              | Default         |
| ----------- | -------------------------------------------------- | --------------- |
| `resources` | 2–5, ids `R1`…`R5`                                 | 5               |
| `threads`   | 2–5, ids `T1`…`T5`, each `{ delay, script }`       | _Filósofos_ (5) |
| `delay`     | 0–4 turns of `think` before the script             | 0               |
| `script`    | 1–8 operations: `acquire Rk`, `release Rk`, `work` | —               |
| `ordering`  | `script` (as written) or `global`                  | `script`        |

With `global`, each thread's acquires keep their positions in the script but take the thread's resources in increasing order (the _k_-th acquire takes the _k_-th smallest resource the script acquires). Releases do not change. The **effective script** must be valid: a thread never acquires a resource it holds, only releases resources it holds, and holds nothing at the end. Otherwise the engine throws a `RangeError`.

### Rules and tie-breaking

- One ready queue, initially T1…Tn. Each step the head of the queue runs **one** operation; if it is still ready afterwards it goes to the end of the queue.
- `think` and `work` change nothing but time.
- `acquire R`: if R is free, the thread holds it (`acquire`). Otherwise the thread joins R's FIFO queue and blocks (`block`, with the current holder).
- `release R`: if R's queue is not empty, its first thread now holds R, its acquire completes and it is appended to the ready queue (`handoff`); otherwise R becomes free (`release`).
- Threads woken during a step are appended **before** the thread that ran is re-appended.
- After an operation that ends the script: `finish`.
- **Cycle**: after a `block`, if following "waits for R, held by U" from the blocked thread comes back to it, the step gets `cycle` with the path written `T → R → T → … → T`, starting at the thread that just blocked. Each cycle is reported once.
- **Stall**: if after a step the ready queue is empty and some thread has not finished, the step gets `stalled` with the number of blocked threads, and the trace ends. If every thread finished, the trace ends after the last `finish`.
- Keys within a step: the operation key, then `finish`, `cycle`, `stalled`.

### Explanation keys

| Key       | Params                | Example (es)                                                                                                    | Example (en)                                                                                               |
| --------- | --------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `acquire` | `id`, `res`           | T1 toma R1.                                                                                                     | T1 takes R1.                                                                                               |
| `block`   | `id`, `res`, `holder` | T2 pide R1, pero lo tiene T1: T2 se bloquea esperándolo.                                                        | T2 asks for R1, but T1 holds it: T2 blocks waiting for it.                                                 |
| `release` | `id`, `res`           | T1 suelta R2, que queda libre.                                                                                  | T1 releases R2, which is now free.                                                                         |
| `handoff` | `id`, `res`, `to`     | T1 suelta R2 y se lo entrega a T2, que despierta.                                                               | T1 releases R2 and hands it to T2, which wakes up.                                                         |
| `work`    | `id`                  | T1 trabaja con los recursos que tiene.                                                                          | T1 works with the resources it holds.                                                                      |
| `think`   | `id`                  | T1 todavía no pide recursos: hace otra cosa.                                                                    | T1 does not ask for resources yet: it does something else.                                                 |
| `finish`  | `id`                  | T1 terminó y no tiene ningún recurso.                                                                           | T1 has finished and holds no resources.                                                                    |
| `cycle`   | `path`                | Se cerró un ciclo: T2 → R1 → T1 → R2 → T2. Cada hilo espera algo que tiene el siguiente: ninguno podrá avanzar. | A cycle closed: T2 → R1 → T1 → R2 → T2. Each thread waits for something the next one holds: none can move. |
| `stalled` | `count`               | No queda ningún hilo listo: 2 hilos están bloqueados para siempre.                                              | No thread is ready: 2 threads are blocked forever.                                                         |

### Result

`deadlock` (a cycle formed), `cycle` (thread ids in path order, or null), `cycleStep`, `stalled`, `finishOrder`, `worked` (threads that executed `work`, in order of their first `work`), `blocks` (step, thread, resource, holder), `steps`, and `segments` (one unit per step, maximal runs of one thread).

## Expected results (hand-computed)

Notation: `a1` acquire R1, `r1` release R1, `w` work, `k` think; `→ X` a handoff to X; `B(U)` a block on a resource held by U. Steps are indexes from 0; the board counts from 1.

### Preset: Filósofos (5 threads, script order)

Scripts: T_i = `a_i a_(i+1) w r_(i+1) r_i` (T5: `a5 a1 w r1 r5`).

| Step | Thread | Operation | Notes                                                                     |
| ---- | ------ | --------- | ------------------------------------------------------------------------- |
| 0–4  | T1…T5  | a1…a5     | each takes its left fork                                                  |
| 5    | T1     | a2 B(T2)  |                                                                           |
| 6    | T2     | a3 B(T3)  |                                                                           |
| 7    | T3     | a4 B(T4)  |                                                                           |
| 8    | T4     | a5 B(T5)  |                                                                           |
| 9    | T5     | a1 B(T1)  | `cycle` T5 → R1 → T1 → R2 → T2 → R3 → T3 → R4 → T4 → R5 → T5; `stalled` 5 |

10 steps. Deadlock, cycle step 9, worked: none (0 philosophers eat).

### Filósofos, global order (5 threads)

Only T5 changes: `a1 a5 w r1 r5`.

| Step | Op          | Step | Op                 | Step | Op                 |
| ---- | ----------- | ---- | ------------------ | ---- | ------------------ |
| 0    | T1 a1       | 9    | T4 w               | 18   | T1 w               |
| 1    | T2 a2       | 10   | T4 r5              | 19   | T1 r2              |
| 2    | T3 a3       | 11   | T4 r4 → T3, finish | 20   | T1 r1 → T5, finish |
| 3    | T4 a4       | 12   | T3 w               | 21   | T5 a5              |
| 4    | T5 a1 B(T1) | 13   | T3 r4              | 22   | T5 w               |
| 5    | T1 a2 B(T2) | 14   | T3 r3 → T2, finish | 23   | T5 r1              |
| 6    | T2 a3 B(T3) | 15   | T2 w               | 24   | T5 r5, finish      |
| 7    | T3 a4 B(T4) | 16   | T2 r3              |      |                    |
| 8    | T4 a5       | 17   | T2 r2 → T1, finish |      |                    |

25 steps, no cycle. Finish order and worked: T4, T3, T2, T1, T5. After step 7, T5, T1, T2 and T3 are blocked (four at once) and T4 is the only ready thread.

### Preset: Dos cerrojos (3 threads, 3 resources)

Scripts: T1 `a1 w a2 w r2 r1`; T2 `a2 w a1 w r1 r2`; T3 `a3 w w r3`.

| Variant                  | Trace                                                                                                                           | Outcome                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Script order             | T1 a1, T2 a2, T3 a3, T1 w, T2 w, T3 w, T1 a2 B(T2), T2 a1 B(T1), T3 w, T3 r3                                                    | 10 steps. Cycle at 7: T2 → R1 → T1 → R2 → T2. T3 finishes at 9; `stalled` 2 at 9. Worked T1, T2, T3. |
| Global order             | T1 a1, T2 a1 B(T1), T3 a3, T1 w, T3 w, T1 a2, T3 w, T1 w, T3 r3, T1 r2, T1 r1 → T2, T2 w, T2 a2, T2 w, T2 r1, T2 r2             | 16 steps, no cycle. Finish T3 (8), T1 (10), T2 (15). T2's script becomes `a1 w a2 w r1 r2`.          |
| Script order, T2 delay 1 | T1 a1, T2 k, T3 a3, T1 w, T2 a2, T3 w, T1 a2 B(T2), T2 w, T3 w, T2 a1 B(T1), T3 r3                                              | 11 steps. Cycle at 9: T2 → R1 → T1 → R2 → T2. `stalled` 2 at 10.                                     |
| Script order, T2 delay 2 | T1 a1, T2 k, T3 a3, T1 w, T2 k, T3 w, T1 a2, T2 a2 B(T1), T3 w, T1 w, T3 r3, T1 r2 → T2, T2 w, T1 r1, T2 a1, T2 w, T2 r1, T2 r2 | 18 steps, no cycle. Finish T3 (10), T1 (13), T2 (17).                                                |

In the delay-2 run, at step 11 the ready queue becomes T2 then T1: the woken T2 is queued before T1 is re-appended.

### External cross-check

`src/engines/published-traces.test.ts` replays OSTEP Figure 32.6: T1 grabs L1, a switch lets T2 grab L2, and each waits for the other (a cycle). It also checks the book's remark that the deadlock does not necessarily occur: with T2 starting two turns later, T1 takes both locks first.

### Edge cases

| Case                  | Input                                              | Expected                                                                                             |
| --------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Two philosophers (E4) | Filósofos, 2 threads                               | T1 a1, T2 a2, T1 a2 B(T2), T2 a1 B(T1). Cycle at 3: T2 → R1 → T1 → R2 → T2. 4 steps.                 |
| Chain, not cycle      | Theory example: T1 `a1 a2 w r2 r1`, T2 `a2 w w r2` | T1 a1, T2 a2, T1 a2 B(T2), T2 w, T2 w, T2 r2 → T1, finish T2, T1 w, T1 r2, T1 r1. 9 steps, no cycle. |
| Invalid script        | T1 `a1 a1`                                         | `RangeError` (acquires a resource it holds).                                                         |
| Unreleased resource   | T1 `a1 w`                                          | `RangeError` (holds R1 at the end).                                                                  |

## Go deeper (optional section)

- The banker's algorithm and safe states, step by step.
- Livelock: philosophers that all put their fork down and retry at the same time.
- Try-lock with random backoff, and why it trades deadlock for possible livelock.
- Deadlock detection in databases: wait-for graphs and victim selection.

## References

- Coffman, Elphick and Shoshani, "System Deadlocks", _ACM Computing Surveys_ 3(2), 1971.
- Arpaci-Dusseau and Arpaci-Dusseau, _Operating Systems: Three Easy Pieces_, ch. 32 "Common Concurrency Problems", §32.3 "Deadlock Bugs", and ch. 31 §31.6 "The Dining Philosophers". Free at https://pages.cs.wisc.edu/~remzi/OSTEP/
- Silberschatz, Galvin and Gagne, _Operating System Concepts_, 10th ed., ch. 8 "Deadlocks".
- Linux kernel documentation, "Runtime locking correctness validator" (lockdep): https://docs.kernel.org/locking/lockdep-design.html
- PostgreSQL documentation, `deadlock_timeout`: https://www.postgresql.org/docs/current/runtime-config-locks.html
