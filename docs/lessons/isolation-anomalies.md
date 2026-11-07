# Lesson spec: Transactions and isolation anomalies

| Field              | Value                                                   |
| ------------------ | ------------------------------------------------------- |
| Id                 | `isolation-anomalies`                                   |
| Path / module      | Databases (`databases`) / 5, Transactions and isolation |
| Engine             | `src/engines/transactions/`                             |
| Estimated time     | 30 minutes                                              |
| Translation review | Reviewed                                                |

The simulation is a **transaction board**: two or three transactions run short scripts of reads and writes against one to three data items, one operation per turn, in an order the lesson (or the learner) chooses. Each transaction shows its script, its program counter and the values it has read. Each item shows its committed value, the uncommitted value someone is writing (if any), who holds its write lock and who waits for it. A read log records what every read returned and what was committed at that moment, and a write computed from an out-of-date read is marked as stale.

The engine is shared with `two-phase-locking` (module 6) and `mvcc-snapshots` (module 7); its spec is `docs/engines/transactions.md`. The lessons model PostgreSQL where they can be checked with `psql`; differences are named where they occur.

## Learning objectives

By the end of the lesson the learner can:

1. Say what a transaction guarantees on its own (its writes become visible together at commit, or not at all) and what it does not (that nobody else changes what it read).
2. Trace an interleaving of two transactions under Read Uncommitted and Read Committed, saying what each read returns and what each write leaves behind.
3. Recognize and name a lost update, a dirty read, a non-repeatable read and read skew in a short history.
4. Explain why write locks held until commit do not prevent a lost update, and fix one without changing the isolation level (an atomic `UPDATE … SET x = x + d`, or `SELECT … FOR UPDATE`).

## Prerequisites

- Race conditions and the lost update between threads (lesson `race-conditions`, path Operating systems). Helpful, not required: Theory restates the idea in one sentence.
- Basic idea of a table row with a value; no SQL beyond `SELECT`, `UPDATE`, `COMMIT` and `ROLLBACK`, which Theory introduces.

## Misconceptions targeted

| #   | Misconception                                                                               | Where it is exposed                  |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| M1  | Wrapping the code in `BEGIN … COMMIT` keeps other transactions from overwriting my changes. | Predict; Run, step 5; Check C1       |
| M2  | Races are a threads problem; a database serializes everything for you.                      | Predict; Explain; Check C1           |
| M3  | The database locks the row when I update it, so a lost update is impossible.                | Run, step 5; Experiment E1; Check C4 |
| M4  | A dirty read is harmless: at worst I see a value a little early.                            | Experiment E2; Check C2              |
| M5  | Under Read Committed a transaction sees a consistent picture of the data.                   | Experiment E3; Check C3              |
| M6  | The only fix for an anomaly is a stricter isolation level.                                  | Experiment E4; Explain; Check C5     |

## Minimal theory (before Predict)

- A **transaction** groups reads and writes. It ends with **commit** (all its writes become permanent and visible together) or **abort** / `ROLLBACK` (all its writes are undone). Until it commits, its writes are **uncommitted**.
- Many transactions run at the same time, and the database interleaves their operations, as an operating system interleaves threads.
- **Write locks**: at every isolation level, a transaction that writes an item locks it until it commits or aborts. Another transaction that wants to write the same item **waits**. Reads never wait here.
- The **isolation level** decides what a read sees while others are writing:
  - **Read Uncommitted**: the newest value, even if its writer has not committed.
  - **Read Committed** (PostgreSQL's default): only committed values. A transaction always sees its own writes.
- Programs often **read a value, compute in the application and write the result** (`SELECT balance` … `UPDATE … SET balance = 150`). The database only sees the read and the write, not the computation in between.
- One worked example: one transaction, `x = 100`. It reads 100, writes 150 (uncommitted: others still read 100 under Read Committed), commits: now everyone reads 150.

## Predict

- **Question**: "`x` is a balance of 100. T1 reads `x` and writes `x + 50`; T2 reads `x` and writes `x + 20`. Both run in transactions under Read Committed, in this order: T1 reads, T2 reads, T1 writes, T1 commits, T2 writes, T2 commits. What is the final balance?" Options: 100, 120, 150, 170. Then "How sure are you?" (confidence).
- **Setup**: preset _Saldo_, Read Committed, order T1, T2, T1, T1, T2, T2.
- **Correct answer**: 120.
- **Naive answer and why it fails**: 170 (M1, M2: "transactions are isolated"), or "T2 waits for T1's lock" (M3). At step 2 both have read 100. T1 writes 150 and commits at step 4, releasing the lock, so T2's write at step 5 does not wait: it writes the 120 it computed from 100 and erases T1's +50. 150 comes from thinking T1's commit wins.

## Run

- **Default setup**: _Saldo_, Read Committed, order T1, T2, T1, T1, T2, T2.
- **Moments to watch** (the board counts steps from 1):
  - Step 3: T1 writes 150. It is uncommitted: `x` still reads 100 for everyone else, and T1 holds the lock on `x`.
  - Step 4: T1 commits; `x` is 150 and the lock is free.
  - Step 5: T2 writes 120, computed from the 100 it read at step 2: a stale write.
  - Step 6: T2 commits. Final 120; T1's +50 is lost.
- Below the board: the read log (who read what, and what was committed at that moment) and the write log with the stale write marked.

## Explain (depth after the run)

- Contrast the prediction with the run: two committed deposits, one survives.
- **Lost update** (P4 in Berenson et al.): T2 reads `x`, someone else writes and commits `x`, then T2 writes a value computed from its old read. It is the race from `race-conditions` one level up: `read`, compute, `write` are `load`, `add`, `store`, and the commit of T1 lands between T2's load and its store.
- **Why the write lock does not help** (M3): the lock only stops two **uncommitted** writes to the same item (a _dirty write_, P0, which every level forbids). T1's lock is released at its commit, before T2 writes. If T2 writes before T1 commits, T2 waits for the lock, but then still writes its stale 120 (Experiment E1).
- **Isolation levels** as the SQL standard defines them by the phenomena they forbid (Berenson et al., Table 3): Read Uncommitted allows dirty reads; Read Committed forbids them but allows non-repeatable reads, phantoms and lost updates; Repeatable Read and Serializable forbid more. Modules 6 and 7 show two ways to get there.
- **Dirty read** (M4): under Read Uncommitted a transaction can read a value whose writer later aborts, a value that never existed in the database (E2). PostgreSQL accepts `READ UNCOMMITTED` but runs it as Read Committed; MySQL and SQL Server do allow dirty reads.
- **Non-repeatable read and read skew** (M5): Read Committed decides per read, so two reads in one transaction can see different committed states. A report that reads two accounts during a transfer can add up money that never existed together (E3, Berenson's H2).
- **Fixes at Read Committed** (M6):
  - Let the database do the arithmetic: `UPDATE accounts SET balance = balance + 20`. The second writer waits for the lock, then PostgreSQL re-reads the newest committed value before applying `+ 20`: 170. This is the atomic `inc` from `race-conditions`.
  - Lock on read: `SELECT … FOR UPDATE` takes the write lock at the read, so T2's read waits until T1 commits and returns 150.
  - A stricter level: under PostgreSQL's Repeatable Read the second writer aborts with a serialization error and must retry (module 7); under two-phase locking the reads themselves hold locks (module 6).
- **Real systems**: PostgreSQL and Oracle default to Read Committed; MySQL InnoDB defaults to Repeatable Read. Applications that use an ORM often read, compute and write exactly like _Saldo_.

## Experiment

| #   | Challenge                                                                                 | One valid solution                                                     | Why it works                                                                                        |
| --- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| E1  | Make T2's write wait for T1's lock, and still lose T1's deposit.                          | _Saldo_, order T1, T2, T1, T2, T1, T2: final 120.                      | T2 waits at step 4, gets the lock when T1 commits and writes the 120 it computed from 100.          |
| E2  | Make T2 read a balance that never existed.                                                | _Lectura sucia_, Read Uncommitted: T2 reads 150, then T1 aborts.       | Read Uncommitted shows T1's uncommitted 150; T1's rollback means `x` was never 150.                 |
| E3  | Make the report see more money than there is.                                             | _Transferencia_, Read Committed: the report sees 50 + 90 = 140.        | The report read `x` before the transfer and `y` after it committed: two different committed states. |
| E4  | Keep both deposits in _Saldo_ without changing the isolation level or the order of turns. | Switch T1 and T2 to `x = x + d` (final 170), or to `FOR UPDATE` (170). | The database computes from the newest committed value, or T2's read waits until T1 has committed.   |

## Check

| #   | Question                                                                                                                                       | Answer                                                                                       | Targets |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------- |
| C1  | Two checkouts under Read Committed each read `stock = 5`, compute 4 in the application and write it, each in its own transaction. Final stock? | 4: one sale is lost.                                                                         | M1, M2  |
| C2  | Under Read Uncommitted, T2 reads a balance written by T1, then T1 rolls back. What did T2 read?                                                | A value that never existed in the database.                                                  | M4      |
| C3  | Under Read Committed, can one transaction read the same row twice and get two different values?                                                | Yes, if another transaction commits a change in between.                                     | M5      |
| C4  | The database locks `x` when T1 writes it. Why does T2 still overwrite T1's deposit?                                                            | The lock only blocks other writes until T1 commits; T2 then writes a value computed earlier. | M3      |
| C5  | Which change keeps both deposits at Read Committed?                                                                                            | `UPDATE … SET balance = balance + 20` (or reading with `FOR UPDATE`).                        | M6      |
| C6  | Under Read Uncommitted, can two transactions both have an uncommitted write on the same row?                                                   | No: every level holds write locks until commit, so the second writer waits.                  | Explain |

## Engine behavior

Defined in [`docs/engines/transactions.md`](../engines/transactions.md): rules, keys, state, result, edge cases and properties. This lesson uses the levels `read-uncommitted` and `read-committed`.

## Expected results (hand-computed)

Notation: see "Notation of the traces" in the engine spec. Steps are indexes from 0; the board counts from 1.

### Preset: Saldo (x = 100)

Scripts: T1 `read x, writeFromRead x +50, commit`; T2 `read x, writeFromRead x +20, commit`.

| Variant                              | Order             | Trace                                                                              | Final | Lost | Blocks |
| ------------------------------------ | ----------------- | ---------------------------------------------------------------------------------- | ----- | ---- | ------ |
| Read Committed (Predict, Run)        | T1 T2 T1 T1 T2 T2 | 0 T1 r 100 · 1 T2 r 100 · 2 T1 wc 150 · 3 T1 c · 4 T2 wc 120 (100+20)\* · 5 T2 c   | 120   | 1    | 0      |
| Read Committed, T2 writes early (E1) | T1 T2 T1 T2 T1 T2 | 0 T1 r 100 · 1 T2 r 100 · 2 T1 wc 150 · 3 T2 W(T1) · 4 T1 c, →T2 wc 120\* · 5 T2 c | 120   | 1    | 1      |
| Read Uncommitted                     | T1 T2 T1 T1 T2 T2 | same as Read Committed: both reads happen before any write                         | 120   | 1    | 0      |
| Serial                               | T1 T1 T1 T2 T2 T2 | 0 T1 r 100 · 1 T1 wc 150 · 2 T1 c · 3 T2 r 150 · 4 T2 wc 170 · 5 T2 c              | 170   | 0    | 0      |

At step 4 of the first variant, T2's `write.stale` has `read 100`, `current 150`, `by T1`. Its result: `committed` T1, T2; `reads` T1 100 and T2 100, both kind `committed`; `writes` T1 150 (not stale), T2 120 (stale); `lostUpdates` 1.

### Saldo, fixed (E4)

| Variant      | Scripts                                                                 | Order             | Trace                                                                              | Final |
| ------------ | ----------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------- | ----- |
| Atomic add   | T1 `add x +50, commit`; T2 `add x +20, commit`                          | T1 T2 T1 T2       | 0 T1 +x 100→150 · 1 T2 W(T1) · 2 T1 c, →T2 +x 150→170 · 3 T2 c                     | 170   |
| `FOR UPDATE` | T1 `readForUpdate x, writeFromRead x +50, commit`; T2 the same with +20 | T1 T2 T1 T1 T2 T2 | 0 T1 rl 100 · 1 T2 W(T1) · 2 T1 wc 150 · 3 T1 c, →T2 rl 150 · 4 T2 wc 170 · 5 T2 c | 170   |

Neither has a stale write. In the `FOR UPDATE` variant, the order of turns is the same as the Predict run's.

### Preset: Lectura sucia (x = 100)

Scripts: T1 `write x 150, abort`; T2 `read x, commit`. Order T1, T2, T1, T2.

| Variant          | Trace                                                    | Final | Dirty reads | Dirty aborted |
| ---------------- | -------------------------------------------------------- | ----- | ----------- | ------------- |
| Read Uncommitted | 0 T1 w 150 · 1 T2 rd 150 (writer T1) · 2 T1 a · 3 T2 c   | 100   | 1           | 1             |
| Read Committed   | 0 T1 w 150 · 1 T2 rh 100 (pending 150) · 2 T1 a · 3 T2 c | 100   | 0           | 0             |

### Preset: Transferencia (x = 50, y = 50), Berenson's H2

Scripts: T1 (report) `read x, read y, commit`; T2 (moves 40 from x to y) `read x, writeFromRead x −40, read y, writeFromRead y +40, commit`. Order T1, T2, T2, T2, T2, T2, T1, T1.

Read Committed: 0 T1 r x 50 · 1 T2 r x 50 · 2 T2 wc x 10 · 3 T2 r y 50 · 4 T2 wc y 90 · 5 T2 c · 6 T1 r y 90 · 7 T1 c. Final x 10, y 90. The report read x = 50 and y = 90: total 140, while the real total is always 100. No `read.changed` (T1 reads each item once), no stale write, no block.

Read Uncommitted: the same trace: T1's only read during T2's run is at step 0, before T2 writes.

## Go deeper (optional section)

- Phantoms: a `WHERE` that matches a row another transaction inserts later. Row locks cannot stop it; predicate or next-key locks can (modules 6 and 7 mention them; not simulated).
- Optimistic concurrency in applications: a `version` column checked in the `UPDATE`'s `WHERE`.
- Cursor Stability and Oracle's Read Consistency, two levels between Read Committed and Repeatable Read (Berenson et al., §4.1 and §4.3).
- Adya's generalized isolation definitions (G0, G1, G2), which Hermitage's test names come from.

## References

- Berenson, Bernstein, Gray, Melton, O'Neil and O'Neil, "A Critique of ANSI SQL Isolation Levels", _SIGMOD 1995_; Microsoft Research technical report MSR-TR-95-51. §2.2 (P1–P3, Table 1), §3 (P0, H1, H2, Table 3), §4.1 (P4, H4). Free at https://www.microsoft.com/en-us/research/publication/a-critique-of-ansi-sql-isolation-levels/
- Kleppmann, Hermitage: testing transaction isolation levels, `postgres.md`: https://github.com/ept/hermitage
- PostgreSQL documentation, "Transaction Isolation" (§13.2) and "Explicit Locking" (§13.3, `FOR UPDATE`): https://www.postgresql.org/docs/current/transaction-iso.html
- PostgreSQL documentation, `deadlock_timeout`: https://www.postgresql.org/docs/current/runtime-config-locks.html
