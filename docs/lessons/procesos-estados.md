# Lesson spec: Process states

| Field          | Value                                                                     |
| -------------- | ------------------------------------------------------------------------- |
| Id             | `procesos-estados`                                                        |
| Path / module  | Operating systems (`sistemas-operativos`) / 1, Processes and their states |
| Engine         | `src/engines/process-states/`                                             |
| Estimated time | 25–30 minutes                                                             |
| Status         | Draft                                                                     |

This is the first lesson of the path. `planificador-cpu` already lists it as a prerequisite, so this lesson must leave the learner fluent in _ready_, _running_ and _blocked_.

## Learning objectives

By the end of the lesson the learner can:

1. Name the five states of a process (new, ready, running, blocked, terminated) and say what each one is waiting for, if anything.
2. Tell which transitions between states are possible, and which event causes each one (dispatch, I/O request, I/O completion, timer interrupt, exit).
3. Trace the state of every process instant by instant for a workload of CPU and I/O bursts on one CPU.
4. Explain why multiprogramming finishes a set of processes sooner than running them one after another, and compute CPU utilization.

## Prerequisites

- None inside Simulario. Knowing that a program is a file and a running program uses the CPU and memory is enough.
- Reading a timeline left to right. No programming needed.

## Misconceptions targeted

| #   | Misconception                                                                       | Where it is exposed                        |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------ |
| M1  | A process waiting for I/O keeps the CPU, or the CPU waits with it.                  | Predict (t = 3); Run, t = 2; Experiment E2 |
| M2  | When its I/O finishes, a process goes straight back to the CPU.                     | Predict (t = 5); Run, t = 5; Check C1      |
| M3  | Ready and blocked are the same "waiting" state.                                     | Explain; Check C4                          |
| M4  | A process can move between any two states (ready → blocked, blocked → running…).    | Explain (transition diagram); Check C5     |
| M5  | Running several processes together takes as long as running them one after another. | Explain (9 vs 14); Experiment E3; Check C3 |
| M6  | A process the OS lists as "running" (`R` in `ps`) is using a CPU at that moment.    | Explain (real systems); Check C6           |

## Minimal theory (before Predict)

- A **process** is a program in execution. The OS keeps a record of each one (the **process control block**, PCB) with its state, among other things.
- A process alternates **CPU bursts** (it computes) and **I/O bursts** (it waits for a disk, the network, the keyboard). It always starts and ends with a CPU burst.
- One CPU, one process on it at a time. Time is discrete (units). Switching processes costs nothing in this simulator.
- **States**:
  - **New**: being created. In this simulator it lasts zero time: an arriving process is admitted at once.
  - **Ready**: could use the CPU right now; waits in the **ready queue** for its turn.
  - **Running**: has the CPU.
  - **Blocked**: waits for an I/O operation to finish. Giving it the CPU would be useless.
  - **Terminated**: finished its last burst.
- The **scheduler** gives the CPU to the first process in the ready queue (first come, first served) whenever the CPU is free.
- I/O devices work in parallel with the CPU and with each other: every process has its own device here, so I/O never queues.
- One worked example: P1 (CPU 1, I/O 2, CPU 1) alone. Running 0–1, blocked 1–3, ready and immediately running again 3–4, terminated at 4. The CPU is idle from 1 to 3.

## Predict

- **Question**: "What state is each process in at t = 3? And at t = 5?" The learner picks a state for P1, P2 and P3 at each instant (a 3 × 2 grid).
- **Setup**: preset _Esperando al disco_, no quantum.
- **Correct answer**:
  - t = 3: P1 blocked, P2 running, P3 ready.
  - t = 5: P1 ready, P2 terminated, P3 running.
- **Naive answers and why they fail**:
  - t = 3, P1 running (M1): P1 asked for I/O at t = 2; the run shows it leaving the CPU for the blocked zone and P2 being dispatched in the same instant.
  - t = 5, P1 running (M2): P1's I/O ends at t = 5, but it joins the ready queue behind P3, which has been waiting since t = 1. The scheduler dispatches P3.

States in the prediction (and in the board) are the states **after** the transitions of that instant, that is, during the unit that starts there.

## Run

- **Default setup**: _Esperando al disco_, quantum off.
- **Moments to watch**:
  - t = 2: P1 requests I/O (running → blocked) and P2 is dispatched in the same instant. The CPU never waits for the disk (M1).
  - t = 5: three transitions at once. P2 exits, P1's I/O ends (blocked → ready, behind P3) and P3 is dispatched (M2).
  - t = 8: P3's I/O ends and it is dispatched in the same instant. It still passes through ready, for zero time.
- Below the board: a per-process table (CPU time, I/O time, time in ready) and the CPU utilization so far.

## Explain (depth after the run)

- Contrast the prediction grid with the run, cell by cell.
- **The transition diagram**: six legal transitions and who causes each one.
  - new → ready (admit): the OS finishes creating the process.
  - ready → running (dispatch): the scheduler.
  - running → blocked (I/O request): the process itself, through a system call.
  - blocked → ready (I/O completion): an interrupt from the device.
  - running → ready (timeout): a timer interrupt. Only in preemptive systems (quantum on).
  - running → terminated (exit): the process itself.
  - Nothing else is legal (M4): a ready process cannot block because it is not executing anything that could ask for I/O; a blocked process cannot run because the scheduler only picks from the ready queue.
- **Ready vs blocked** (M3): both wait, but for different things. A ready process waits only for the CPU; a blocked one waits for an event and would not use the CPU if it got it.
- **Multiprogramming** (M5): on _Esperando al disco_ the CPU is busy all 9 units, while running the three processes one after another would take 2 + 3 + 2 + 3 + 1 + 2 + 1 = 14. The gain comes from overlapping one process's I/O with another's CPU burst. CPU utilization = busy units / total time.
- **The PCB and the context switch**: on every dispatch the OS saves the registers of the outgoing process in its PCB and loads the incoming one's. Free here; a few microseconds in reality.
- **Real systems** (M6): Linux reports `R` for both running and runnable (ready) processes, `S` and `D` for blocked (interruptible and uninterruptible sleep), `T` for stopped and `Z` for zombie: terminated but not yet collected by its parent. `ps -o pid,stat,cmd` and `top` show them.

## Experiment

| #   | Challenge                                                                          | One valid solution                                                           | Why it works                                                                               |
| --- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| E1  | Make a process go from running back to ready without finishing its burst.          | _Esperando al disco_, quantum 2: P2 at t = 4.                                | The timer interrupt takes the CPU away when the quantum is used up: running → ready.       |
| E2  | Make the CPU sit idle while some processes have not finished yet.                  | _Todos en E/S_: idle from 2 to 5.                                            | Every unfinished process is blocked, and blocked processes cannot use the CPU.             |
| E3  | Finish all the work in less than half the time it takes one process after another. | Three processes P1–P3, all arriving at 0 with CPU 1, I/O 6, CPU 1: 10 vs 24. | Their I/O waits overlap, so the total time is far below the sum even with 60% utilization. |
| E4  | Make a process spend more time ready than running and blocked together.            | P1 arrives at 0 with CPU 6; P2 arrives at 1 with CPU 1.                      | P2 waits in the queue from 1 to 6 (5 units) for a 1-unit burst.                            |

## Check

| #   | Question                                                                                           | Answer                                                                  | Targets |
| --- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------- |
| C1  | P1's disk read finishes. Which state does it move to?                                              | Ready. It needs the scheduler to dispatch it before it runs again.      | M2      |
| C2  | Which transition only happens in a preemptive system?                                              | Running → ready (the quantum runs out).                                 | Explain |
| C3  | On _Esperando al disco_ the processes finish at t = 9. How long would they take one after another? | 14 units.                                                               | M5      |
| C4  | A ready process and a blocked process are both waiting. What is each one waiting for?              | The ready one waits for the CPU; the blocked one for its I/O to finish. | M3      |
| C5  | Which transition is impossible: ready → running, blocked → ready, ready → blocked?                 | Ready → blocked.                                                        | M4      |
| C6  | `ps` shows a process with state `R`. Is it necessarily using a CPU right now?                      | No. `R` means running or runnable (ready).                              | M6      |

## Engine behavior

### Inputs and limits

| Field     | Range                                                                       | Default                     |
| --------- | --------------------------------------------------------------------------- | --------------------------- |
| Processes | 1–5, ids `P1`…`P5` in input order                                           | preset _Esperando al disco_ |
| `arrival` | integer 0–10                                                                | —                           |
| `bursts`  | 1, 3 or 5 integers, each 1–8, alternating CPU and I/O and starting with CPU | —                           |
| `quantum` | `null` (off, non-preemptive) or integer 1–6                                 | `null`                      |

Safety cap: the engine stops at t = 200 even if processes remain. Valid inputs never reach it.

### States

`absent` (not arrived yet), `ready`, `running`, `blocked`, `terminated`. **New** is never a state of a step: admission is instantaneous and shows up only as the `admit` key. A step at instant `t` holds the state of each process **after** the transitions at `t`, which is its state during the unit `[t, t + 1)`. The last step is at the instant the last process exits and holds no unit.

### Rules and tie-breaking

At each instant `t` the engine:

1. Ends the unit `[t − 1, t)` for the process that ran in it, if any:
   - If its CPU burst is over and it has no more bursts: running → terminated (`exit`).
   - If its CPU burst is over and an I/O burst follows: running → blocked until `t + d`, where `d` is that I/O burst (`block`).
   - Otherwise, **quantum on only**, if it has run `quantum` consecutive units since its dispatch: running → ready (`timeout`). It is queued in step 4.
   - Otherwise it keeps the CPU. A burst that ends exactly when the quantum runs out is an `exit` or `block`, never a `timeout`.
2. Admits the processes arriving at `t`, appending them to the ready queue in input order (`admit`).
3. Wakes the processes whose I/O ends at `t`, appending them to the ready queue in input order (`wakeup`).
4. Appends the process that timed out in step 1, if any.
5. If the CPU is free and the queue is not empty, dispatches the head of the queue (`dispatch`). If a process kept the CPU, it continues (`continue`). If the CPU is free and the queue is empty: `idle.io` when some process is blocked, otherwise `idle.arrivals`. When every process has terminated, nothing is added and the trace ends.
6. Runs the running process for one unit.

Queue order is therefore: arrivals, then I/O completions, then the timed-out process. The keys of a step are emitted in the order of steps 1, 2, 3 and 5 (`timeout` appears first although the process is queued last).

Metrics per process: `finish` (instant of `exit`), `turnaround = finish − arrival`, `cpu` (sum of CPU bursts), `io` (sum of I/O bursts), `ready` (units spent in the ready queue). Invariant: `turnaround = cpu + io + ready`. Global metrics: `makespan` (instant of the last `exit`, counted from t = 0), `busy` (units with a running process), `utilization = busy / makespan`, `serialTime` (sum of `cpu + io` over all processes: the time to run them one after another with no gaps).

### Explanation keys

| Key             | Params                    | Example (es)                                                        | Example (en)                                                     |
| --------------- | ------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `admit`         | `id`                      | Llega P3: el sistema lo crea y entra en la cola de listos.          | P3 arrives: the system creates it and it joins the ready queue.  |
| `dispatch`      | `id`                      | El planificador le da la CPU a P2, el primero de la cola de listos. | The scheduler gives the CPU to P2, first in the ready queue.     |
| `continue`      | `id`, `remaining`         | P2 sigue en la CPU: le quedan 2 unidades de esta ráfaga.            | P2 stays on the CPU: 2 units left in this burst.                 |
| `block`         | `id`, `duration`, `until` | P1 pide E/S y se bloquea durante 3 unidades (hasta t = 5).          | P1 requests I/O and blocks for 3 units (until t = 5).            |
| `wakeup`        | `id`                      | Termina la E/S de P1: vuelve a la cola de listos, no a la CPU.      | P1's I/O finishes: it goes back to the ready queue, not the CPU. |
| `timeout`       | `id`, `quantum`           | Se agota el cuanto de P2 (2 unidades): vuelve al final de la cola.  | P2's quantum (2 units) runs out: back to the end of the queue.   |
| `exit`          | `id`, `time`              | P2 termina su última ráfaga y sale en t = 5.                        | P2 finishes its last burst and exits at t = 5.                   |
| `idle.io`       | —                         | CPU ociosa: los procesos que quedan esperan E/S.                    | CPU idle: the remaining processes are waiting for I/O.           |
| `idle.arrivals` | —                         | CPU ociosa: todavía no ha llegado ningún proceso listo.             | CPU idle: no ready process has arrived yet.                      |

`remaining` in `continue` counts the units left in the current CPU burst at instant `t`, before the unit runs.

## Expected results (hand-computed)

Bursts are written `C` (CPU) and `I` (I/O), e.g. `C2 I3 C2`. CPU schedules list maximal runs as `Pn a–b`; turns cut by a timeout are listed separately. State columns use R = running, Q = ready, B = blocked, T = terminated, — = absent.

### Preset: Esperando al disco

| Process | Arrival | Bursts   |
| ------- | ------- | -------- |
| P1      | 0       | C2 I3 C2 |
| P2      | 0       | C3       |
| P3      | 1       | C1 I2 C1 |

#### Quantum off

CPU: P1 0–2, P2 2–5, P3 5–6, P1 6–8, P3 8–9. I/O: P1 2–5, P3 6–8.

| t   | P1  | P2  | P3  | Keys                                |
| --- | --- | --- | --- | ----------------------------------- |
| 0   | R   | Q   | —   | admit P1, admit P2, dispatch P1     |
| 1   | R   | Q   | Q   | admit P3, continue P1 (1)           |
| 2   | B   | R   | Q   | block P1 (3, until 5), dispatch P2  |
| 3   | B   | R   | Q   | continue P2 (2)                     |
| 4   | B   | R   | Q   | continue P2 (1)                     |
| 5   | Q   | T   | R   | exit P2 (5), wakeup P1, dispatch P3 |
| 6   | R   | T   | B   | block P3 (2, until 8), dispatch P1  |
| 7   | R   | T   | B   | continue P1 (1)                     |
| 8   | T   | T   | R   | exit P1 (8), wakeup P3, dispatch P3 |
| 9   | T   | T   | T   | exit P3 (9)                         |

| Process | Finish | Turnaround | CPU | I/O | Ready |
| ------- | ------ | ---------- | --- | --- | ----- |
| P1      | 8      | 8          | 4   | 3   | 1     |
| P2      | 5      | 5          | 3   | 0   | 2     |
| P3      | 9      | 8          | 2   | 2   | 4     |

Makespan 9, busy 9, utilization 1 (100%), serial time 14.

#### Quantum 2

CPU: P1 0–2, P2 2–4, P3 4–5, P2 5–6, P1 6–8, P3 8–9. I/O: P1 2–5, P3 5–7.

| t   | P1  | P2  | P3  | Keys                                          |
| --- | --- | --- | --- | --------------------------------------------- |
| 0   | R   | Q   | —   | admit P1, admit P2, dispatch P1               |
| 1   | R   | Q   | Q   | admit P3, continue P1 (1)                     |
| 2   | B   | R   | Q   | block P1 (3, until 5), dispatch P2            |
| 3   | B   | R   | Q   | continue P2 (2)                               |
| 4   | B   | Q   | R   | timeout P2 (2), dispatch P3                   |
| 5   | Q   | R   | B   | block P3 (2, until 7), wakeup P1, dispatch P2 |
| 6   | R   | T   | B   | exit P2 (6), dispatch P1                      |
| 7   | R   | T   | Q   | wakeup P3, continue P1 (1)                    |
| 8   | T   | T   | R   | exit P1 (8), dispatch P3                      |
| 9   | T   | T   | T   | exit P3 (9)                                   |

| Process | Finish | Turnaround | CPU | I/O | Ready |
| ------- | ------ | ---------- | --- | --- | ----- |
| P1      | 8      | 8          | 4   | 3   | 1     |
| P2      | 6      | 6          | 3   | 0   | 3     |
| P3      | 9      | 8          | 2   | 2   | 4     |

Makespan 9, busy 9, utilization 1, serial time 14.

Notes: at t = 2, P1 has used 2 units, equal to the quantum, but its burst is over, so it blocks instead of timing out. At t = 5 the queue is P2 (timed out at 4, already queued) then P1 (woken at 5). At t = 8, P1 again ends its burst exactly at the quantum: `exit`, not `timeout`.

### Preset: Todos en E/S

| Process | Arrival | Bursts   |
| ------- | ------- | -------- |
| P1      | 0       | C1 I4 C1 |
| P2      | 0       | C1 I3 C1 |

Quantum off (the quantum changes nothing: no CPU burst is longer than 1). CPU: P1 0–1, P2 1–2, idle 2–5, P1 5–6, P2 6–7. I/O: P1 1–5, P2 2–5.

| t   | P1  | P2  | Keys                               |
| --- | --- | --- | ---------------------------------- |
| 0   | R   | Q   | admit P1, admit P2, dispatch P1    |
| 1   | B   | R   | block P1 (4, until 5), dispatch P2 |
| 2   | B   | B   | block P2 (3, until 5), idle.io     |
| 3   | B   | B   | idle.io                            |
| 4   | B   | B   | idle.io                            |
| 5   | R   | Q   | wakeup P1, wakeup P2, dispatch P1  |
| 6   | T   | R   | exit P1 (6), dispatch P2           |
| 7   | T   | T   | exit P2 (7)                        |

| Process | Finish | Turnaround | CPU | I/O | Ready |
| ------- | ------ | ---------- | --- | --- | ----- |
| P1      | 6      | 6          | 2   | 4   | 0     |
| P2      | 7      | 7          | 2   | 3   | 2     |

Makespan 7, busy 4, utilization 4/7 (≈ 57%), serial time 11.

### Experiment workloads

| Case | Input                          | Expected                                                                                                                                             |
| ---- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| E3   | P1, P2, P3 at 0, each C1 I6 C1 | CPU P1 0–1, P2 1–2, P3 2–3, idle 3–7, P1 7–8, P2 8–9, P3 9–10. Finish 8, 9, 10. Ready 0, 1, 2. Makespan 10, busy 6, utilization 0.6, serial time 24. |
| E4   | P1 at 0 C6; P2 at 1 C1         | CPU P1 0–6, P2 6–7. P2: ready 5, CPU 1, I/O 0, turnaround 6.                                                                                         |

### Edge cases

| Case                           | Input                                   | Expected                                                                                                                             |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Single process, CPU only       | P1 at 0 C3                              | Running 0–3, `exit` at 3. Ready 0, I/O 0. Never blocked.                                                                             |
| Worked example from Theory     | P1 at 0 C1 I2 C1                        | Running 0–1, blocked 1–3, at t = 3 `wakeup` and `dispatch` in the same step, exit at 4. Steps 1, 2 carry `idle.io`. Utilization 2/4. |
| Idle before the first arrival  | P1 at 2 C1                              | Steps 0 and 1 carry `idle.arrivals` and show P1 absent. P1 runs 2–3. Makespan 3, utilization 1/3.                                    |
| Arrival and I/O completion tie | P1 at 0 C1 I1 C1; P2 at 2 C1            | At t = 2 the queue is P2 (arrival) then P1 (wakeup): P2 2–3, P1 3–4. CPU idle 1–2 with `idle.io`.                                    |
| I/O completion and timeout tie | quantum 1; P1 at 0 C1 I1 C1; P2 at 0 C2 | P1 0–1, blocks until 2; P2 1–2. At t = 2 the queue is P1 (wakeup) then P2 (timeout): P1 2–3, P2 3–4.                                 |
| Burst ends with the quantum    | quantum 2; P1 at 0 C2 I1 C1             | At t = 2 the key is `block`, not `timeout`.                                                                                          |

## Go deeper (optional section)

- Suspended states (ready-suspended, blocked-suspended) and swapping to disk.
- The long-term scheduler: holding processes in New to cap the degree of multiprogramming.
- `fork()`, `exec()`, `wait()` and zombie processes on Unix.
- I/O devices with their own queues: what changes when two processes need the same disk.

## References

- Silberschatz, Galvin and Gagne, _Operating System Concepts_, 10th ed., ch. 3 "Processes", §3.1 "Process Concept".
- Arpaci-Dusseau and Arpaci-Dusseau, _Operating Systems: Three Easy Pieces_, ch. 4 "The Abstraction: The Process". Free at https://pages.cs.wisc.edu/~remzi/OSTEP/
- Stallings, _Operating Systems: Internals and Design Principles_, 9th ed., §3.2 "Process States".
- `ps(1)` manual, section "PROCESS STATE CODES": https://man7.org/linux/man-pages/man1/ps.1.html

## Translations

| Language | File                                          | Status      |
| -------- | --------------------------------------------- | ----------- |
| es       | `src/content/lessons/es/procesos-estados.mdx` | Not started |
| en       | `src/content/lessons/en/procesos-estados.mdx` | Not started |
