# Lesson spec: Synchronization: mutexes and semaphores

| Field          | Value                                                                                |
| -------------- | ------------------------------------------------------------------------------------ |
| Id             | `mutex-semaphores`                                                                   |
| Path / module  | Operating systems (`operating-systems`) / 4, Synchronization: mutexes and semaphores |
| Engine         | `src/engines/bounded-buffer/`                                                        |
| Estimated time | 35 minutes                                                                           |
| Status         | Published                                                                            |

The simulation is the **bounded buffer** (producer–consumer) board. Producers put items into a circular buffer of a few slots; consumers take them out. Three semaphores coordinate them: `empty` (free slots), `full` (filled slots) and `mutex` (one thread at a time touches the buffer indexes). Each semaphore is drawn as a counter with its own waiting line. One CPU runs one operation per step; the learner can pick the code version (correct or with the two waits of the producer swapped), the buffer size, the workload and the quantum.

## Learning objectives

By the end of the lesson the learner can:

1. Describe a semaphore as a counter plus a queue of blocked threads, and trace `wait` and `signal`, including blocking and waking up.
2. Explain the job of each semaphore in the bounded buffer (`empty`, `full`, `mutex`) and give their initial values for a buffer of _N_ slots.
3. Trace a producer–consumer run by hand: who blocks, on which semaphore, and the value of each counter.
4. Explain why the producer must wait on `empty` before `mutex`, and why the swapped version deadlocks only under some schedules.
5. Tell a mutex (owned lock for mutual exclusion) from a counting semaphore (permits, signaled by any thread).

## Prerequisites

- Race conditions, critical sections and mutual exclusion (lesson `race-conditions`).
- Ready queue, blocked state and quantum (lessons `process-states` and `cpu-scheduling`).

## Misconceptions targeted

| #   | Misconception                                                                                              | Where it is exposed                        |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| M1  | A thread that cannot continue keeps the CPU, checking in a loop, or the producer overwrites a full buffer. | Theory; Predict Q1; Run, step 11; Check C1 |
| M2  | `signal` always adds 1 to the counter.                                                                     | Predict Q2; Run, step 16; Check C4         |
| M3  | The order of the two `wait` calls does not matter: both are needed anyway.                                 | Experiment E1; Explain; Check C3           |
| M4  | A program that ran many times without hanging cannot deadlock.                                             | Experiment E2; Check C5                    |
| M5  | One mutex is enough for producer–consumer.                                                                 | Explain; Experiment E3                     |
| M6  | A mutex and a binary semaphore are the same thing.                                                         | Explain; Check C6                          |

## Minimal theory (before Predict)

- A **semaphore** is an integer counter that can never go below 0, plus a queue of blocked threads. Two operations, each indivisible:
  - `wait(s)`: if `s > 0`, subtract 1 and continue. If `s = 0`, the thread **blocks** in the queue of `s` and gives up the CPU.
  - `signal(s)`: if a thread is blocked on `s`, wake the first one: its `wait` completes and it goes to the ready queue; the counter does not change. Otherwise add 1.
- Think of the counter as a number of permits. `wait` takes one or waits for one; `signal` returns one, handing it straight to a waiting thread if there is one.
- A semaphore that starts at 1 and is always used as `wait … signal` around a critical section gives **mutual exclusion**: a **mutex**.
- The **bounded buffer**: _N_ slots used in a circle. Producers write at `in`, consumers read at `out`; both indexes advance by one and wrap around. Writing a slot and advancing `in` is a critical section, as in `counter++`.
- The solution uses three semaphores:

  | Semaphore | Counts                          | Starts at |
  | --------- | ------------------------------- | --------- |
  | `empty`   | free slots                      | _N_       |
  | `full`    | filled slots                    | 0         |
  | `mutex`   | permission to touch the indexes | 1         |

  ```
  producer:            consumer:
    wait(empty)          wait(full)
    wait(mutex)          wait(mutex)
    put item             take item
    signal(mutex)        signal(mutex)
    signal(full)         signal(empty)
  ```

- One worked example: `s = 1`, thread A does `wait(s)`: `s = 0`, A continues. Thread B does `wait(s)`: B blocks. A does `signal(s)`: B wakes up holding the permit, `s` stays 0.

## Predict

- **Setup**: preset _Productor rápido_: one producer P1 with 3 items, one consumer C1, buffer of 2 slots, correct code, no quantum (a thread keeps the CPU until it blocks or finishes). P1 runs first.
- **Questions** (two, multiple choice):
  - Q1: "Which thread blocks first, and on which semaphore?" Options: P1 on `empty`, P1 on `mutex`, C1 on `full`, C1 on `mutex`, nobody blocks. **Answer**: P1 on `empty`.
  - Q2: "What is the value of `empty` right after C1's first `signal(empty)`?" Options 0, 1, 2. **Answer**: 0.
- **Naive answers and why they fail**:
  - Q1, C1 on `full` (the buffer starts empty, so "the consumer waits first"): C1 never gets the CPU until P1 blocks. P1 fills both slots and blocks on its third `wait(empty)` at step 11 (M1: it does not spin, it does not overwrite).
  - Q2, 1 (M2): P1 is blocked on `empty`, so C1's `signal(empty)` at step 16 wakes P1 and hands it the permit; the counter stays at 0.

## Run

- **Default setup**: _Productor rápido_.
- **Moments to watch**:
  - Step 11: P1's `wait(empty)` finds 0. P1 moves to the queue of `empty` and C1 gets the CPU.
  - Step 16: C1's `signal(empty)` wakes P1; `empty` stays at 0.
  - Step 22: C1 finds `full` at 0 and blocks; P1 runs again.
- Below the board: the consumed items in order and the list of blocks (step, thread, semaphore).

## Explain (depth after the run)

- **No busy waiting**: a blocked thread is off the CPU and costs nothing until someone signals. The CPU goes to a thread that can make progress.
- **Two kinds of waiting**: `empty` and `full` make threads wait for a **condition** (room or data); `mutex` makes them wait for **exclusive access**. One mutex alone (M5) protects the indexes but cannot make a producer wait for room: it would have to release the lock, check again and again, and spin.
- **The order of the waits** (M3): with `wait(mutex)` first, a producer that finds the buffer full blocks **while holding the mutex**. The consumer that would free a slot needs the mutex first and blocks too: nobody can ever signal. That is a **deadlock**. Rule: wait for the condition first, then take the mutex; hold the mutex as briefly as possible.
- **Schedule-dependent bugs** (M4): the swapped version finishes with quantum 1, because the consumer happens to empty a slot before the producer takes the mutex on a full buffer. Like a race, a deadlock that depends on timing can hide for thousands of runs.
- **Hand-off and POSIX** (M2): in this simulator `signal` hands the permit straight to the first waiter. POSIX `sem_post` adds 1 and wakes a waiter, which then subtracts 1; after the waiter runs, the counter is the same. Either way the counter is never "free permits plus waiters".
- **Mutex vs semaphore** (M6): a mutex has an owner. Only the thread that locked it may unlock it, which lets the system detect errors and apply priority inheritance. A semaphore has no owner: any thread may `signal`, which is what makes `full` and `empty` work as signals between producer and consumer.
- **Real systems**: POSIX `sem_wait`/`sem_post` and `pthread_mutex_lock`/`unlock`; Java `java.util.concurrent.Semaphore`; Python `threading.Semaphore` and `queue.Queue` (a bounded buffer ready to use). On Linux both mutexes and semaphores are built on the `futex` system call: when nobody contends, locking and unlocking stay in user space without entering the kernel.

## Experiment

| #   | Challenge                                                  | One valid solution                                             | Why it works                                                                                       |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| E1  | Make the program get stuck forever.                        | _Orden invertido_ (swapped, no quantum): deadlock at step 14.  | P1 blocks on `empty` holding `mutex`; C1 blocks on `mutex`.                                        |
| E2  | Make the swapped version finish without changing its code. | _Orden invertido_ with quantum 1: completes in 30 steps.       | Turns of one operation let C1 free a slot before P1 takes `mutex` with the buffer full.            |
| E3  | Make the producer never block in _Productor rápido_.       | Buffer of 3 slots.                                             | `empty` starts at 3, one permit per item. C1 never blocks either: `full` reaches 3 before it runs. |
| E4  | Make a producer block on `mutex`.                          | _Dos productores_ (quantum 1): P2 blocks on `mutex` at step 5. | P1 holds `mutex` while it puts its item.                                                           |

## Check

| #   | Question                                                                                         | Answer                                                               | Targets |
| --- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------- |
| C1  | A semaphore is at 0 and a thread calls `wait` on it. What happens?                               | The thread blocks in the semaphore's queue and gives up the CPU.     | M1      |
| C2  | Initial values of `empty`, `full` and `mutex` for a buffer of 5 slots?                           | 5, 0, 1.                                                             | Theory  |
| C3  | The producer does `wait(mutex)` and then `wait(empty)`, and the buffer is full. What can happen? | It blocks holding `mutex`; the consumer blocks on `mutex`: deadlock. | M3      |
| C4  | A thread calls `signal(empty)` while another is blocked on `empty`. What happens to the counter? | It stays the same: the blocked thread is woken and takes the permit. | M2      |
| C5  | The swapped version ran 100 times without hanging. Is it correct?                                | No: another schedule deadlocks.                                      | M4      |
| C6  | What can a semaphore do that a mutex does not allow?                                             | Be signaled by a thread other than the one that waited (no owner).   | M6      |

## Engine behavior

### Inputs and limits

| Field       | Range                                                               | Default   |
| ----------- | ------------------------------------------------------------------- | --------- |
| `producers` | 1–2, ids `P1`, `P2`                                                 | 1         |
| `consumers` | 1–2, ids `C1`, `C2`                                                 | 1         |
| `items`     | 1–4 items per producer                                              | 3         |
| `capacity`  | 1–4 slots                                                           | 2         |
| `version`   | `correct` or `swapped` (producer waits on `mutex` first)            | `correct` |
| `quantum`   | `null` (keep the CPU until blocking or finishing) or 1–6 operations | `null`    |

Consumers share the `producers × items` items: consumer _k_ (0-based) takes `floor(total / consumers)`, plus one if `k < total mod consumers`. A consumer whose share is 0 (one producer with one item and two consumers) starts finished, never enters the ready queue and has no `finish` key. Producer `Pk`'s _j_-th item is named `Pk.j`.

### Programs

Repeated once per item:

- Producer, `correct`: `wait(empty)`, `wait(mutex)`, `put`, `signal(mutex)`, `signal(full)`.
- Producer, `swapped`: `wait(mutex)`, `wait(empty)`, `put`, `signal(mutex)`, `signal(full)`.
- Consumer (both versions): `wait(full)`, `wait(mutex)`, `take`, `signal(mutex)`, `signal(empty)`.

Initial values: `empty = capacity`, `full = 0`, `mutex = 1`. `in = out = 0`.

### Rules and tie-breaking

- One step per operation. A thread runs the operation at its program counter:
  - `wait(s)`: if `s > 0`, `s − 1` and advance (`wait.pass`). Else append the thread to the queue of `s`, mark it blocked and free the CPU, without advancing (`wait.block`).
  - `signal(s)`: if the queue of `s` is not empty, remove its first thread, advance its program counter past its `wait` and append it to the ready queue (`signal.wake`); `s` does not change. Else `s + 1` (`signal.inc`). Then advance.
  - `put`: write the item at `in`, `in ← (in + 1) mod capacity` (`put`). `take`: read and clear the slot at `out`, `out ← (out + 1) mod capacity` (`take`).
  - After the operation, if the program is over: `finish`, the CPU is free.
- **Scheduling**: one ready queue, initially P1, P2, C1, C2 (those that exist). At the start of each step:
  - if a thread holds the CPU, `quantum` is set, it has run `quantum` operations in this turn and the ready queue is not empty: it is preempted to the end of the queue (`preempt`). If the queue is empty it keeps running and its turn count restarts;
  - if the CPU is free, the head of the ready queue is dispatched (`dispatch`).
- Threads woken during a step are queued in that step, so they go ahead of a thread preempted at the start of the next step.
- **Deadlock**: if after an operation the CPU is free, the ready queue is empty and some thread has not finished, every remaining thread is blocked. The same step gets `deadlock` and one `stuck` per blocked thread (in id order P1, P2, C1, C2), and the trace ends.
- Keys within a step: `preempt`, `dispatch`, the operation key, `finish`, then `deadlock` and `stuck`.

### Explanation keys

| Key           | Params               | Example (es)                                                                                | Example (en)                                                                                       |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `dispatch`    | `id`                 | El planificador le da la CPU a C1.                                                          | The scheduler gives the CPU to C1.                                                                 |
| `preempt`     | `id`, `quantum`      | Se agota el cuanto de P1 (1 operación): vuelve al final de la cola de listos.               | P1's quantum (1 operation) runs out: back to the end of the ready queue.                           |
| `wait.pass`   | `id`, `sem`, `value` | P1 hace wait(empty): empty baja a 1 y P1 sigue.                                             | P1 does wait(empty): empty drops to 1 and P1 continues.                                            |
| `wait.block`  | `id`, `sem`          | P1 hace wait(empty), pero empty vale 0: se bloquea en su cola y suelta la CPU.              | P1 does wait(empty), but empty is 0: it blocks in its queue and gives up the CPU.                  |
| `signal.inc`  | `id`, `sem`, `value` | C1 hace signal(mutex): nadie espera, así que mutex sube a 1.                                | C1 does signal(mutex): nobody is waiting, so mutex rises to 1.                                     |
| `signal.wake` | `id`, `sem`, `woken` | C1 hace signal(empty): despierta a P1, que pasa a listo con el permiso. empty no cambia.    | C1 does signal(empty): it wakes P1, which becomes ready holding the permit. empty does not change. |
| `put`         | `id`, `item`, `slot` | P1 deja P1.2 en la casilla 1.                                                               | P1 puts P1.2 in slot 1.                                                                            |
| `take`        | `id`, `item`, `slot` | C1 saca P1.1 de la casilla 0.                                                               | C1 takes P1.1 from slot 0.                                                                         |
| `finish`      | `id`                 | P1 terminó su trabajo.                                                                      | P1 has finished its work.                                                                          |
| `deadlock`    | —                    | Todos los hilos que quedan están bloqueados y ninguno puede despertar a otro: interbloqueo. | Every remaining thread is blocked and none can wake another: deadlock.                             |
| `stuck`       | `id`, `sem`          | P1 espera en empty para siempre.                                                            | P1 waits on empty forever.                                                                         |

### Result

`completed` (every thread finished), `deadlock`, `steps`, `consumed` (items in the order they were taken, with consumer and step), `blocks` (every `wait.block`: step, thread, semaphore), `finishOrder`, the final value of each semaphore, and `segments` (maximal runs of one thread, one unit per step; a preemption or a dispatch starts a new one).

## Expected results (hand-computed)

Step numbers in these tables are indexes from 0. The board and the lesson text count from 1, so "step 11" in prose is index 10 here.

Notation: `We`, `Wf`, `Wm` for `wait(empty|full|mutex)`, `Se`, `Sf`, `Sm` for signals. `pass n` / `inc n` give the counter after the operation, `block` a blocking wait, `wake X` a signal that wakes X. Steps start at 0.

### Preset: Productor rápido (P1 × 3 items, C1, capacity 2, correct, no quantum)

| Step | Thread | Operation          | empty | full | mutex | Notes                    |
| ---- | ------ | ------------------ | ----- | ---- | ----- | ------------------------ |
| 0    | P1     | We pass 1          | 1     | 0    | 1     | `dispatch P1` first      |
| 1    | P1     | Wm pass 0          | 1     | 0    | 0     |                          |
| 2    | P1     | put P1.1 → slot 0  | 1     | 0    | 0     |                          |
| 3    | P1     | Sm inc 1           | 1     | 0    | 1     |                          |
| 4    | P1     | Sf inc 1           | 1     | 1    | 1     |                          |
| 5    | P1     | We pass 0          | 0     | 1    | 1     |                          |
| 6    | P1     | Wm pass 0          | 0     | 1    | 0     |                          |
| 7    | P1     | put P1.2 → slot 1  | 0     | 1    | 0     |                          |
| 8    | P1     | Sm inc 1           | 0     | 1    | 1     |                          |
| 9    | P1     | Sf inc 2           | 0     | 2    | 1     |                          |
| 10   | P1     | We block           | 0     | 2    | 1     | first block              |
| 11   | C1     | Wf pass 1          | 0     | 1    | 1     | `dispatch C1` first      |
| 12   | C1     | Wm pass 0          | 0     | 1    | 0     |                          |
| 13   | C1     | take P1.1 ← slot 0 | 0     | 1    | 0     |                          |
| 14   | C1     | Sm inc 1           | 0     | 1    | 1     |                          |
| 15   | C1     | Se wake P1         | 0     | 1    | 1     | `empty` stays 0          |
| 16   | C1     | Wf pass 0          | 0     | 0    | 1     |                          |
| 17   | C1     | Wm pass 0          | 0     | 0    | 0     |                          |
| 18   | C1     | take P1.2 ← slot 1 | 0     | 0    | 0     |                          |
| 19   | C1     | Sm inc 1           | 0     | 0    | 1     |                          |
| 20   | C1     | Se inc 1           | 1     | 0    | 1     | P1 is ready, not waiting |
| 21   | C1     | Wf block           | 1     | 0    | 1     |                          |
| 22   | P1     | Wm pass 0          | 1     | 0    | 0     | `dispatch P1` first      |
| 23   | P1     | put P1.3 → slot 0  | 1     | 0    | 0     |                          |
| 24   | P1     | Sm inc 1           | 1     | 0    | 1     |                          |
| 25   | P1     | Sf wake C1         | 1     | 0    | 1     | then `finish P1`         |
| 26   | C1     | Wm pass 0          | 1     | 0    | 0     | `dispatch C1` first      |
| 27   | C1     | take P1.3 ← slot 0 | 1     | 0    | 0     |                          |
| 28   | C1     | Sm inc 1           | 1     | 0    | 1     |                          |
| 29   | C1     | Se inc 2           | 2     | 0    | 1     | then `finish C1`         |

30 steps, completed. Consumed P1.1, P1.2, P1.3. Blocks: (10, P1, empty), (21, C1, full). Finish order P1, C1. Final: empty 2, full 0, mutex 1. Predict: Q1 P1 on `empty`; Q2 `empty` = 0 after step 15 (the learner's "step 16", counting from 1).

### Preset: Orden invertido (same workload, swapped, no quantum)

| Step | Thread | Operation         | empty | full | mutex |
| ---- | ------ | ----------------- | ----- | ---- | ----- |
| 0    | P1     | Wm pass 0         | 2     | 0    | 0     |
| 1    | P1     | We pass 1         | 1     | 0    | 0     |
| 2    | P1     | put P1.1 → slot 0 | 1     | 0    | 0     |
| 3    | P1     | Sm inc 1          | 1     | 0    | 1     |
| 4    | P1     | Sf inc 1          | 1     | 1    | 1     |
| 5    | P1     | Wm pass 0         | 1     | 1    | 0     |
| 6    | P1     | We pass 0         | 0     | 1    | 0     |
| 7    | P1     | put P1.2 → slot 1 | 0     | 1    | 0     |
| 8    | P1     | Sm inc 1          | 0     | 1    | 1     |
| 9    | P1     | Sf inc 2          | 0     | 2    | 1     |
| 10   | P1     | Wm pass 0         | 0     | 2    | 0     |
| 11   | P1     | We block          | 0     | 2    | 0     |
| 12   | C1     | Wf pass 1         | 0     | 1    | 0     |
| 13   | C1     | Wm block          | 0     | 1    | 0     |

14 steps. Step 13 keys: `wait.block C1 mutex`, `deadlock`, `stuck P1 empty`, `stuck C1 mutex`. Not completed, deadlock. Consumed nothing. Blocks: (11, P1, empty), (13, C1, mutex).

### Orden invertido with quantum 1

Each turn is one operation; the ready queue alternates whenever both threads are ready.

| Step | Keys (operation part)                    | Step | Keys (operation part)                    |
| ---- | ---------------------------------------- | ---- | ---------------------------------------- |
| 0    | dispatch P1, P1 Wm pass 0                | 15   | P1 Sf wake C1                            |
| 1    | preempt P1, dispatch C1, C1 Wf block     | 16   | preempt P1, dispatch C1, C1 Wm pass 0    |
| 2    | dispatch P1, P1 We pass 1                | 17   | preempt C1, dispatch P1, P1 Wm block     |
| 3    | P1 put P1.1 → 0                          | 18   | dispatch C1, C1 take P1.2 ← 1            |
| 4    | P1 Sm inc 1                              | 19   | C1 Sm wake P1                            |
| 5    | P1 Sf wake C1                            | 20   | preempt C1, dispatch P1, P1 We pass 0    |
| 6    | preempt P1, dispatch C1, C1 Wm pass 0    | 21   | preempt P1, dispatch C1, C1 Se inc 1     |
| 7    | preempt C1, dispatch P1, P1 Wm block     | 22   | preempt C1, dispatch P1, P1 put P1.3 → 0 |
| 8    | dispatch C1, C1 take P1.1 ← 0            | 23   | preempt P1, dispatch C1, C1 Wf block     |
| 9    | C1 Sm wake P1                            | 24   | dispatch P1, P1 Sm inc 1                 |
| 10   | preempt C1, dispatch P1, P1 We pass 0    | 25   | P1 Sf wake C1, finish P1                 |
| 11   | preempt P1, dispatch C1, C1 Se inc 1     | 26   | dispatch C1, C1 Wm pass 0                |
| 12   | preempt C1, dispatch P1, P1 put P1.2 → 1 | 27   | C1 take P1.3 ← 0                         |
| 13   | preempt P1, dispatch C1, C1 Wf block     | 28   | C1 Sm inc 1                              |
| 14   | dispatch P1, P1 Sm inc 1                 | 29   | C1 Se inc 2, finish C1                   |

30 steps, completed, no deadlock. Blocks: (1, C1, full), (7, P1, mutex), (13, C1, full), (17, P1, mutex), (23, C1, full). Consumed P1.1, P1.2, P1.3. Final: empty 2, full 0, mutex 1.

### Preset: Dos productores (P1, P2 × 2 items, C1 takes 4, capacity 2, correct, quantum 1)

| Step | Operation (thread first) | Step | Operation              |
| ---- | ------------------------ | ---- | ---------------------- |
| 0    | P1 We pass 1             | 20   | C1 Wm block            |
| 1    | P2 We pass 0             | 21   | P1 Sm wake C1          |
| 2    | C1 Wf block              | 22   | C1 take P2.1 ← 1       |
| 3    | P1 Wm pass 0             | 23   | P1 Sf inc 1, finish P1 |
| 4    | P2 Wm block              | 24   | C1 Sm inc 1            |
| 5    | P1 put P1.1 → 0          | 25   | C1 Se wake P2          |
| 6    | P1 Sm wake P2            | 26   | P2 Wm pass 0           |
| 7    | P2 put P2.1 → 1          | 27   | C1 Wf pass 0           |
| 8    | P1 Sf wake C1            | 28   | P2 put P2.2 → 1        |
| 9    | P2 Sm inc 1              | 29   | C1 Wm block            |
| 10   | C1 Wm pass 0             | 30   | P2 Sm wake C1          |
| 11   | P1 We block              | 31   | C1 take P1.2 ← 0       |
| 12   | P2 Sf inc 1              | 32   | P2 Sf inc 1, finish P2 |
| 13   | C1 take P1.1 ← 0         | 33   | C1 Sm inc 1            |
| 14   | P2 We block              | 34   | C1 Se inc 1            |
| 15   | C1 Sm inc 1              | 35   | C1 Wf pass 0           |
| 16   | C1 Se wake P1            | 36   | C1 Wm pass 0           |
| 17   | P1 Wm pass 0             | 37   | C1 take P2.2 ← 1       |
| 18   | C1 Wf pass 0             | 38   | C1 Sm inc 1            |
| 19   | P1 put P1.2 → 0          | 39   | C1 Se inc 2, finish C1 |

40 steps, completed. Consumed P1.1, P2.1, P1.2, P2.2. Blocks: (2, C1, full), (4, P2, mutex), (11, P1, empty), (14, P2, empty), (20, C1, mutex), (29, C1, mutex). Finish order P1, P2, C1. Final: empty 2, full 0, mutex 1. At step 16 the queue of `empty` is P1 then P2, so P1 is woken first.

### External cross-check

`src/engines/published-traces.test.ts` checks that the correct program is OSTEP's Figure 31.12 line by line, and replays the §31.4 walkthrough with MAX = 1: a producer that keeps running blocks on `empty` at its second `wait`. OSTEP's semaphores let the counter go negative to count waiters; this engine hands the permit over instead, which gives the same blocking and waking.

### Edge cases

| Case                             | Input                                    | Expected                                                                                         |
| -------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Buffer as large as the work (E3) | Productor rápido with capacity 3         | No blocks. P1 runs steps 0–14 and finishes; C1 runs 15–29. Final: empty 3, full 0, mutex 1.      |
| Consumer shares                  | P1, P2 × 3 items, C1, C2                 | C1 takes 3 items, C2 takes 3.                                                                    |
| Uneven shares                    | P1 × 3 items, C1, C2                     | C1 takes 2 items, C2 takes 1.                                                                    |
| A consumer with nothing to do    | P1 × 1 item, C1, C2, correct, no quantum | C2 takes 0 items and never runs. P1 runs steps 0–4, C1 steps 5–9; 10 steps; finish order P1, C1. |
| Invalid input                    | capacity 0, 3 producers, quantum 0       | `RangeError`.                                                                                    |

## Go deeper (optional section)

- Condition variables and monitors: `pthread_cond_wait` and Java `synchronized`/`wait`/`notify` as an alternative to counting semaphores.
- Readers–writers locks, and the dining philosophers (next module, deadlock).
- Priority inversion and priority inheritance (Mars Pathfinder, 1997).
- Futexes: how Linux keeps uncontended locks out of the kernel.

## References

- Arpaci-Dusseau and Arpaci-Dusseau, _Operating Systems: Three Easy Pieces_, ch. 31 "Semaphores", §31.4 "The Producer/Consumer (Bounded Buffer) Problem". Free at https://pages.cs.wisc.edu/~remzi/OSTEP/
- Silberschatz, Galvin and Gagne, _Operating System Concepts_, 10th ed., §6.5–6.6 (mutex locks, semaphores) and §7.1.1 (the bounded-buffer problem).
- Dijkstra, E. W., "Cooperating sequential processes" (EWD 123), 1965: https://www.cs.utexas.edu/~EWD/transcriptions/EWD01xx/EWD123.html
- `sem_overview(7)` and `futex(7)` manual pages: https://man7.org/linux/man-pages/man7/sem_overview.7.html

## Translations

| Language | File                                          | Status               |
| -------- | --------------------------------------------- | -------------------- |
| es       | `src/content/lessons/es/mutex-semaphores.mdx` | Reviewed, 2026-11-04 |
| en       | `src/content/lessons/en/mutex-semaphores.mdx` | Reviewed, 2026-11-04 |
