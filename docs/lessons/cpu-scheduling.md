# Lesson spec: CPU scheduler

| Field          | Value                                                       |
| -------------- | ----------------------------------------------------------- |
| Id             | `cpu-scheduling`                                            |
| Path / module  | Operating systems (`operating-systems`) / 2, CPU scheduling |
| Engine         | `src/engines/cpu-scheduling/`                               |
| Estimated time | 30–40 minutes                                               |
| Status         | Written                                                     |

Origin: the single-file prototype _Planificador de CPU_ (claude.ai artifact). This spec fixes its behavior so the engine port can be tested against hand-computed values.

## Learning objectives

By the end of the lesson the learner can:

1. Build the Gantt chart of a workload by hand for FCFS, SJF, SRTF, non-preemptive priority and Round Robin.
2. Compute finish, turnaround, waiting and response times per process and their averages.
3. Tell preemptive from non-preemptive algorithms and predict when a preemption happens.
4. Explain the convoy effect, starvation and the role of the quantum in Round Robin.
5. Choose an algorithm for a workload and justify the choice with metrics.

## Prerequisites

- What a process is, and the ready and running states (lesson `process-states`, module 1). Until that lesson exists, Theory covers it in two sentences and links nowhere.
- Reading a timeline left to right. No programming needed.

## Misconceptions targeted

| #   | Misconception                                                                | Where it is exposed                    |
| --- | ---------------------------------------------------------------------------- | -------------------------------------- |
| M1  | Short processes always finish first, whatever the algorithm.                 | Predict (FCFS on _Efecto convoy_)      |
| M2  | Any algorithm interrupts a long process when a shorter one arrives.          | Run, step t = 1 → 2; Check C3          |
| M3  | Round Robin always gives the lowest average waiting time because it is fair. | Experiment E3 (_Ráfagas parecidas_)    |
| M4  | Response time and waiting time are the same thing.                           | Explain; Check C4                      |
| M5  | A higher priority number means more priority.                                | Theory (convention stated); Check C5   |
| M6  | SJF can be implemented exactly, because the OS knows each burst.             | Explain / Go deeper (burst estimation) |

## Minimal theory (before Predict)

- A **process** needs the CPU for a **burst** of time units. It **arrives** at some instant and waits in the **ready queue** until the scheduler gives it the CPU.
- One CPU, one process at a time. Time is discrete (units). Switching processes costs nothing in this simulator.
- **Non-preemptive** algorithms let the running process finish its burst. **Preemptive** ones can take the CPU away.
- Rules:
  - **FCFS**: first in the ready queue goes first. Non-preemptive.
  - **SJF**: shortest burst among ready processes. Non-preemptive.
  - **SRTF**: shortest remaining time. Preemptive: a newcomer with less remaining time takes the CPU.
  - **Priority**: lowest number first (1 is the most urgent). Non-preemptive in this lesson.
  - **Round Robin**: queue order, but each turn lasts at most one quantum. Then the process goes to the back of the queue.
- Metrics:
  - turnaround = finish − arrival
  - waiting = turnaround − burst
  - response = first time on the CPU − arrival
- One worked example: two processes, P1 (arrives 0, burst 3) and P2 (arrives 1, burst 1), with FCFS. P1 runs 0–3 and P2 runs 3–4. P2 waits 2.

## Predict

- **Question**: "In what order will the processes finish?" The learner arranges P1–P4.
- **Setup**: preset _Efecto convoy_, FCFS.
- **Correct answer**: P1, P2, P3, P4.
- **Naive answer and why it fails**: P3, P2, P4, P1 (shortest first, M1). In the run, P1 holds the CPU from 0 to 10 although P2 (t = 1) and P3 (t = 2) are shorter; FCFS never looks at burst length.

The prediction widget is available for every algorithm and preset (as in the prototype), but the lesson text asks for this one first.

## Run

- **Default setup**: _Efecto convoy_, FCFS, quantum 2 (hidden until RR is chosen).
- **Moments to watch**:
  - t = 1 and t = 2: P2 and P3 arrive and wait. Nothing happens to P1 (M2).
  - t = 10: P1 finishes and P2 starts after waiting 9 units for a 2-unit job.
- The comparison panel (average waiting time per algorithm for the current workload) stays visible during the run.

## Explain (depth after the run)

- Contrast the prediction with the result, position by position.
- **Convoy effect**: one long CPU-bound process ahead of short ones inflates everyone's waiting time. FCFS average waiting on the preset is 7.25; SRTF brings it to 2.
- **SJF is optimal** for average waiting time among non-preemptive schedules when all processes are available at once. Exchange argument: swapping a longer job ahead of a shorter one never decreases the total wait.
- **SRTF** is the preemptive counterpart. It minimizes average waiting time but needs to know remaining times and can starve long processes.
- **Starvation and aging**: priority and SJF can postpone a process indefinitely. Aging raises the priority of waiting processes over time.
- **Response vs waiting** (M4): they match in non-preemptive algorithms. With preemption a process can respond early and still wait a lot overall (P1 under RR on _Efecto convoy_: response 0, waiting 6).
- **Round Robin and the quantum**: large quantum → FCFS; tiny quantum → many context switches (free here, costly in reality). Rule of thumb: about 80% of bursts should fit in one quantum.
- **Real systems**: Linux used CFS (fair share by virtual runtime) from 2.6.23 and replaced it with EEVDF in 6.6. Neither is one of the classic five, but both build on the same trade-offs.

## Experiment

| #   | Challenge                                                                           | One valid solution                                                                                                        | Why it works                                                                    |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| E1  | Make Round Robin behave exactly like FCFS.                                          | _Ráfagas parecidas_, quantum 5 or 6.                                                                                      | When every burst fits in one quantum, no turn is ever cut, so RR is FCFS.       |
| E2  | Find a workload where SJF and SRTF produce different schedules.                     | _Efecto convoy_.                                                                                                          | P2 arrives while P1 runs; only SRTF preempts (P1 0–1, P2 1–3…).                 |
| E3  | Find a workload where Round Robin has a higher average waiting time than FCFS.      | _Ráfagas parecidas_, quantum 2: RR 9.5 vs FCFS 5.75.                                                                      | Similar bursts interleaved by RR all finish late; FCFS finishes some early.     |
| E4  | Make the process with priority 9 wait as long as possible with priority scheduling. | Give it the earliest arrival after t = 0 and keep adding processes with priority 1–2 that arrive before the CPU frees up. | Non-preemptive priority always picks the others first: starvation in miniature. |
| E5  | Get an average waiting time of 0 with any algorithm.                                | Arrivals spaced so each process arrives after the previous one finishes (e.g. P1 0/2, P2 2/3, P3 5/1).                    | Nobody ever waits in the queue.                                                 |

## Check

| #   | Question                                                                         | Answer                                  | Targets |
| --- | -------------------------------------------------------------------------------- | --------------------------------------- | ------- |
| C1  | With FCFS on _Efecto convoy_, what is the average waiting time?                  | 7.25                                    | Metrics |
| C2  | Among non-preemptive algorithms, which minimizes average waiting time?           | SJF                                     | Explain |
| C3  | P1 (burst 8) is running under SJF and P2 (burst 1) arrives. When does P2 start?  | When P1 finishes; SJF does not preempt. | M2      |
| C4  | Under RR on _Efecto convoy_, P1 has response time 0. Is its waiting time also 0? | No, it is 6.                            | M4      |
| C5  | Processes A (priority 1) and B (priority 4) are ready. Which runs first?         | A.                                      | M5      |

## Engine behavior

### Inputs and limits

| Field       | Range                                   | Default                |
| ----------- | --------------------------------------- | ---------------------- |
| Processes   | 2–6, ids `P1`…`P6` in input order       | preset _Efecto convoy_ |
| `arrival`   | integer 0–20                            | —                      |
| `burst`     | integer 1–12                            | —                      |
| `priority`  | integer 1–9 (1 = most urgent)           | —                      |
| `algorithm` | `fcfs`, `sjf`, `srtf`, `priority`, `rr` | `fcfs`                 |
| `quantum`   | integer 1–6, only used by `rr`          | 2                      |

Safety cap: the engine stops at t = 400 even if processes remain. Valid inputs never reach it.

### Rules and tie-breaking

At each time unit `t` the engine:

1. Appends processes arriving at `t` to the ready queue, in input order.
2. **RR only**: appends the process whose quantum expired at the end of the previous unit, after the arrivals of step 1.
3. Chooses who runs during `[t, t + 1)`:
   - **FCFS / RR**: if the CPU is free, the head of the queue.
   - **SJF / priority**: if the CPU is free, the ready process with the smallest burst / priority number.
   - **SRTF**: every unit, among the running process and the queue, the smallest remaining time. **On a tie the running process keeps the CPU.** If another process wins, the running one goes back to the end of the queue.
   - Ties between ready processes are broken by earlier arrival, then by input order.
4. Runs the chosen process for one unit. If its remaining time reaches 0 it finishes at `t + 1`. **RR only**: if it used `quantum` consecutive units without finishing, it is preempted and re-queued in step 2 of the next unit.
5. If no process is ready, the CPU is idle for that unit.

Metrics: `finish` is the end of the last unit; `turnaround = finish − arrival`; `waiting = turnaround − burst`; `response = firstStart − arrival`. Averages are arithmetic means over all processes. The finish order is sorted by finish time, then by input order.

### Explanation keys

| Key                      | Params                                               | Example (es)                                                       | Example (en)                                                       |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `fcfs.pick`              | `id`, `arrival`                                      | P2 es el primero en la cola (llegó en t = 1).                      | P2 is first in the queue (arrived at t = 1).                       |
| `sjf.pick`               | `id`, `burst`                                        | P3 tiene la ráfaga más corta entre los listos (1).                 | P3 has the shortest burst among ready processes (1).               |
| `srtf.pick`              | `id`, `remaining`                                    | P3 tiene el menor tiempo restante entre los listos (1).            | P3 has the least remaining time among ready processes (1).         |
| `srtf.preempt`           | `id`, `preempted`, `remaining`, `preemptedRemaining` | P2 expropia a P1: le quedan 2 unidades contra 9.                   | P2 preempts P1: 2 units left against 9.                            |
| `srtf.keep`              | `id`, `remaining`                                    | Sigue P1: nadie en la cola tiene menos tiempo restante (3).        | P1 keeps running: nobody in the queue has less remaining time (3). |
| `priority.pick`          | `id`, `priority`                                     | P2 tiene la prioridad más alta entre los listos (1).               | P2 has the highest priority among ready processes (1).             |
| `rr.pick`                | `id`, `quantum`                                      | Turno de P1, el primero de la cola: puede correr hasta 2 unidades. | P1's turn, first in the queue: it may run up to 2 units.           |
| `rr.continue`            | `id`, `used`, `quantum`                              | P1 continúa: lleva 1 de 2 unidades de su cuanto.                   | P1 continues: 1 of its 2 units of quantum used.                    |
| `rr.expire`              | `id`                                                 | Se agota el cuanto de P1: vuelve al final de la cola.              | P1's quantum runs out: back to the end of the queue.               |
| `nonpreemptive.continue` | `id`, `algorithm`                                    | Sigue P1: FCFS no expropia, así que corre hasta terminar.          | P1 keeps running: FCFS does not preempt, so it runs to completion. |
| `finish`                 | `id`, `time`                                         | P2 termina en t = 12.                                              | P2 finishes at t = 12.                                             |
| `idle`                   | —                                                    | CPU ociosa: no hay ningún proceso listo.                           | CPU idle: no process is ready.                                     |

## Expected results (hand-computed)

Schedules list maximal runs as `Pn a–b` (from instant a to b). In RR, consecutive turns of the same process are listed separately when a quantum expired between them. Metric columns: finish / turnaround / waiting / response per process, then averages.

### Preset: Efecto convoy

| Process | Arrival | Burst | Priority |
| ------- | ------- | ----- | -------- |
| P1      | 0       | 10    | 3        |
| P2      | 1       | 2     | 1        |
| P3      | 2       | 1     | 2        |
| P4      | 3       | 3     | 2        |

| Algorithm | Schedule                                                                      | Finish         | Turnaround     | Waiting      | Response     | Avg TAT | Avg wait | Avg resp | Finish order   |
| --------- | ----------------------------------------------------------------------------- | -------------- | -------------- | ------------ | ------------ | ------- | -------- | -------- | -------------- |
| FCFS      | P1 0–10, P2 10–12, P3 12–13, P4 13–16                                         | 10, 12, 13, 16 | 10, 11, 11, 13 | 0, 9, 10, 10 | 0, 9, 10, 10 | 11.25   | 7.25     | 7.25     | P1, P2, P3, P4 |
| SJF       | P1 0–10, P3 10–11, P2 11–13, P4 13–16                                         | 10, 13, 11, 16 | 10, 12, 9, 13  | 0, 10, 8, 10 | 0, 10, 8, 10 | 11      | 7        | 7        | P1, P3, P2, P4 |
| SRTF      | P1 0–1, P2 1–3, P3 3–4, P4 4–7, P1 7–16                                       | 16, 3, 4, 7    | 16, 2, 2, 4    | 6, 0, 1, 1   | 0, 0, 1, 1   | 6       | 2        | 0.5      | P2, P3, P4, P1 |
| Priority  | P1 0–10, P2 10–12, P3 12–13, P4 13–16                                         | 10, 12, 13, 16 | 10, 11, 11, 13 | 0, 9, 10, 10 | 0, 9, 10, 10 | 11.25   | 7.25     | 7.25     | P1, P2, P3, P4 |
| RR q = 2  | P1 0–2, P2 2–4, P3 4–5, P1 5–7, P4 7–9, P1 9–11, P4 11–12, P1 12–14, P1 14–16 | 16, 4, 5, 12   | 16, 3, 3, 9    | 6, 1, 2, 6   | 0, 1, 2, 4   | 7.75    | 3.75     | 1.75     | P2, P3, P4, P1 |

Notes: in SRTF at t = 2, P2 (remaining 1) and the newly arrived P3 (remaining 1) tie and P2 keeps the CPU. In Priority, P3 and P4 tie at priority 2 and P3 wins by earlier arrival.

### Preset: Llegadas escalonadas

| Process | Arrival | Burst | Priority |
| ------- | ------- | ----- | -------- |
| P1      | 0       | 6     | 3        |
| P2      | 2       | 4     | 1        |
| P3      | 4       | 2     | 4        |
| P4      | 6       | 5     | 2        |
| P5      | 8       | 1     | 1        |

| Algorithm | Schedule                                                                                  | Finish            | Turnaround      | Waiting        | Response       | Avg TAT | Avg wait | Avg resp | Finish order       |
| --------- | ----------------------------------------------------------------------------------------- | ----------------- | --------------- | -------------- | -------------- | ------- | -------- | -------- | ------------------ |
| FCFS      | P1 0–6, P2 6–10, P3 10–12, P4 12–17, P5 17–18                                             | 6, 10, 12, 17, 18 | 6, 8, 8, 11, 10 | 0, 4, 6, 6, 9  | 0, 4, 6, 6, 9  | 8.6     | 5        | 5        | P1, P2, P3, P4, P5 |
| SJF       | P1 0–6, P3 6–8, P5 8–9, P2 9–13, P4 13–18                                                 | 6, 13, 8, 18, 9   | 6, 11, 4, 12, 1 | 0, 7, 2, 7, 0  | 0, 7, 2, 7, 0  | 6.8     | 3.2      | 3.2      | P1, P3, P5, P2, P4 |
| SRTF      | P1 0–6, P3 6–8, P5 8–9, P2 9–13, P4 13–18                                                 | 6, 13, 8, 18, 9   | 6, 11, 4, 12, 1 | 0, 7, 2, 7, 0  | 0, 7, 2, 7, 0  | 6.8     | 3.2      | 3.2      | P1, P3, P5, P2, P4 |
| Priority  | P1 0–6, P2 6–10, P5 10–11, P4 11–16, P3 16–18                                             | 6, 10, 18, 16, 11 | 6, 8, 14, 10, 3 | 0, 4, 12, 5, 2 | 0, 4, 12, 5, 2 | 8.2     | 4.6      | 4.6      | P1, P2, P5, P4, P3 |
| RR q = 2  | P1 0–2, P2 2–4, P1 4–6, P3 6–8, P2 8–10, P4 10–12, P1 12–14, P5 14–15, P4 15–17, P4 17–18 | 14, 10, 8, 18, 15 | 14, 8, 4, 12, 7 | 8, 4, 2, 7, 6  | 0, 0, 2, 4, 6  | 9       | 5.4      | 2.4      | P3, P2, P1, P5, P4 |

Notes: in SRTF, P2 (t = 2) and P3 (t = 4) arrive with remaining time equal to P1's, so P1 keeps the CPU both times; the schedule matches SJF. In SJF at t = 6, P4 arrives in the same unit and is a candidate (it loses to P3). In RR at t = 6, the queue is P3, P2, P4, P1: P4 arrives at 6 and enters before P1, whose quantum expired at the end of unit 5.

### Preset: Ráfagas parecidas

| Process | Arrival | Burst | Priority |
| ------- | ------- | ----- | -------- |
| P1      | 0       | 4     | 2        |
| P2      | 0       | 5     | 1        |
| P3      | 1       | 4     | 3        |
| P4      | 2       | 5     | 2        |

| Algorithm | Schedule                                                                                  | Finish         | Turnaround     | Waiting      | Response    | Avg TAT | Avg wait | Avg resp | Finish order   |
| --------- | ----------------------------------------------------------------------------------------- | -------------- | -------------- | ------------ | ----------- | ------- | -------- | -------- | -------------- |
| FCFS      | P1 0–4, P2 4–9, P3 9–13, P4 13–18                                                         | 4, 9, 13, 18   | 4, 9, 12, 16   | 0, 4, 8, 11  | 0, 4, 8, 11 | 10.25   | 5.75     | 5.75     | P1, P2, P3, P4 |
| SJF       | P1 0–4, P3 4–8, P2 8–13, P4 13–18                                                         | 4, 13, 8, 18   | 4, 13, 7, 16   | 0, 8, 3, 11  | 0, 8, 3, 11 | 10      | 5.5      | 5.5      | P1, P3, P2, P4 |
| SRTF      | P1 0–4, P3 4–8, P2 8–13, P4 13–18                                                         | 4, 13, 8, 18   | 4, 13, 7, 16   | 0, 8, 3, 11  | 0, 8, 3, 11 | 10      | 5.5      | 5.5      | P1, P3, P2, P4 |
| Priority  | P2 0–5, P1 5–9, P4 9–14, P3 14–18                                                         | 9, 5, 18, 14   | 9, 5, 17, 12   | 5, 0, 13, 7  | 5, 0, 13, 7 | 10.75   | 6.25     | 6.25     | P2, P1, P4, P3 |
| RR q = 2  | P1 0–2, P2 2–4, P3 4–6, P4 6–8, P1 8–10, P2 10–12, P3 12–14, P4 14–16, P2 16–17, P4 17–18 | 10, 17, 14, 18 | 10, 17, 13, 16 | 6, 12, 9, 11 | 0, 2, 3, 4  | 14      | 9.5      | 2.25     | P1, P3, P2, P4 |

Notes: P1 and P2 arrive together and enter the queue in input order. In SJF and SRTF at t = 8, P2 and P4 tie at 5 and P2 wins by earlier arrival. In Priority at t = 5, P1 and P4 tie at 2 and P1 wins by earlier arrival. RR with quantum 5 or 6 reproduces the FCFS row (E1).

### Edge cases

| Case                           | Input                    | Expected                                                                           |
| ------------------------------ | ------------------------ | ---------------------------------------------------------------------------------- |
| Idle CPU                       | FCFS; P1 0/2, P2 5/1     | P1 0–2, idle 2–5, P2 5–6. Steps at t = 2, 3, 4 carry the `idle` key. Waiting 0, 0. |
| Simultaneous arrivals          | FCFS; P1 0/3, P2 0/1     | Input order: P1 0–3, P2 3–4.                                                       |
| SRTF tie keeps the runner      | SRTF; P1 0/3, P2 1/2     | At t = 1 both have 2 left; P1 keeps the CPU: P1 0–3, P2 3–5.                       |
| Quantum 1                      | RR q = 1; P1 0/2, P2 0/2 | P1 0–1, P2 1–2, P1 2–3, P2 3–4. Finish 3, 4. Response 0, 1.                        |
| RR expiry vs arrival           | RR q = 2; P1 0/3, P2 2/1 | At t = 2, P2 (arrival) is queued before P1 (expired): P1 0–2, P2 2–3, P1 3–4.      |
| Last process with quantum left | RR q = 4; P1 0/2, P2 5/1 | P1 0–2, finishes at 2 with no `rr.expire` (P2 only makes the input valid).         |

## Go deeper (optional section)

- Estimating the next burst with exponential averaging: τₙ₊₁ = α·tₙ + (1 − α)·τₙ, typically α = 0.5.
- Multilevel feedback queues: how real schedulers approximate SJF without knowing bursts.
- Context-switch cost: why a tiny quantum hurts throughput.
- Linux CFS and EEVDF: virtual runtime, fairness and latency.

## References

- Silberschatz, Galvin and Gagne, _Operating System Concepts_, 10th ed., ch. 5 "CPU Scheduling".
- Arpaci-Dusseau and Arpaci-Dusseau, _Operating Systems: Three Easy Pieces_, ch. 7 "Scheduling: Introduction" and ch. 8 "Multi-level Feedback Queue". Free at https://pages.cs.wisc.edu/~remzi/OSTEP/
- Tanenbaum and Bos, _Modern Operating Systems_, 4th ed., §2.4 "Scheduling".
- Linux kernel documentation, "EEVDF Scheduler": https://docs.kernel.org/scheduler/sched-eevdf.html

## Translations

| Language | File                                        | Status             |
| -------- | ------------------------------------------- | ------------------ |
| es       | `src/content/lessons/es/cpu-scheduling.mdx` | Written, in review |
| en       | `src/content/lessons/en/cpu-scheduling.mdx` | Written, in review |
