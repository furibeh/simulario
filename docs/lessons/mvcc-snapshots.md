# Lesson spec: MVCC and snapshot isolation

| Field              | Value                                           |
| ------------------ | ----------------------------------------------- |
| Id                 | `mvcc-snapshots`                                |
| Path / module      | Databases (`databases`) / 7, MVCC and snapshots |
| Engine             | `src/engines/transactions/` (level `snapshot`)  |
| Estimated time     | 30 minutes                                      |
| Translation review | Reviewed                                        |

The simulation is the **transaction board** of modules 5 and 6 with one more level: **snapshot isolation**, which is what PostgreSQL runs as `REPEATABLE READ`. Every committed write keeps its old versions, and each transaction reads from a **snapshot** taken when it starts: the versions committed before that moment. The board shows each item's chain of versions, each transaction's snapshot as the turn it started, which version every read picks, and the moment a second writer is aborted because someone changed the item after its snapshot. The learner compares the same scenarios under Read Committed, snapshot isolation and two-phase locking.

The engine is shared with `isolation-anomalies` and `two-phase-locking`; its spec is `docs/engines/transactions.md`.

## Learning objectives

By the end of the lesson the learner can:

1. Explain how a database keeps several versions of an item and how a snapshot decides which one a read sees.
2. Trace an interleaving under snapshot isolation: which version each read returns, when a writer waits, and when it is aborted because the item changed after its snapshot.
3. Explain why snapshot isolation prevents dirty reads, non-repeatable reads, read skew and lost updates without making readers wait.
4. Recognize write skew, the anomaly snapshot isolation still allows, and name three ways to prevent it.

## Prerequisites

- Isolation anomalies (lesson `isolation-anomalies`) and two-phase locking (lesson `two-phase-locking`).

## Misconceptions targeted

| #   | Misconception                                                                             | Where it is exposed             |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------- |
| M1  | Snapshot isolation (PostgreSQL's `REPEATABLE READ`) is serializable.                      | Predict; Run, step 10; Check C1 |
| M2  | If every transaction checks the rule before writing, the rule always holds.               | Predict; Explain; Check C2      |
| M3  | Reading old versions means a transaction can see an inconsistent mix of old and new data. | Experiment E1; Check C3         |
| M4  | With versions nobody ever waits or fails.                                                 | Experiment E2; Check C4         |
| M5  | A transaction that reads later sees changes committed after it started.                   | Experiment E1, step 7; Check C5 |

## Minimal theory (before Predict)

- **Multiversion concurrency control (MVCC)**: a write does not overwrite an item; it adds a new **version**. Committed versions stay until nobody can need them.
- **Snapshot**: when a transaction starts (its first operation), it takes a snapshot. All its reads see the versions **committed before that moment**, plus its own writes. Later commits by others are invisible to it.
- **Readers never wait**: a read just picks the right version.
- **Writers still lock**: writing an item takes its exclusive lock, as in Read Committed. If another transaction changed the item and committed **after** our snapshot, our write would be based on a version we never saw: the database aborts us with a serialization error (PostgreSQL: `could not serialize access due to concurrent update`). This is called **first updater wins**.
- One worked example: x = 100. T1 starts and reads 100. T2 writes 150 and commits. T1 reads x again: still 100, the version of its snapshot.

## Predict

- **Question**: "Two doctors, Alice (x) and Bob (y), are on call: x = 1, y = 1. The rule is that at least one must stay. Each one, in its own transaction, reads x and y, checks that x + y ≥ 2 and only then goes off call (writes 0 on its own row). Under snapshot isolation, in this order: Alice reads both, Bob reads both, both check, both write, both commit. How many doctors are on call at the end?" Options 0, 1, 2. Then "How sure are you?".
- **Setup**: preset _Guardia_, `snapshot`, order T1, T1, T2, T2, T1, T2, T1, T2, T1, T2.
- **Correct answer**: 0.
- **Naive answer and why it fails**: 1 (M1, M2). Both snapshots show two doctors on call, so both checks pass. They write different rows, so neither write conflicts with the other: nobody is aborted. Each transaction is correct on its own; together they break the rule. This is **write skew**.

## Run

- **Default setup**: _Guardia_, snapshot, the Predict order.
- **Moments to watch** (the board counts steps from 1):
  - Steps 1 and 3: each transaction takes its snapshot.
  - Steps 5–6: both checks see x + y = 2.
  - Steps 7–8: they write different rows: no lock is shared, nobody waits.
  - Steps 9–10: both commit. x = 0, y = 0.

## Explain (depth after the run)

- Contrast with the prediction: 0 doctors on call, and no error anywhere.
- **Why snapshot isolation is not serializable** (M1): in any serial order, the second doctor would see only one on call and stay. Snapshot isolation only stops two transactions from writing **the same** item; here each wrote a different one, after reading the other's (Berenson et al., §4.2, history H5 and anomaly A5B).
- **What snapshots do prevent**: dirty reads (only committed versions are visible), non-repeatable reads and read skew (every read uses the same snapshot: E1), and the lost update (first updater wins aborts the second writer: E2).
- **Readers do not block writers** (E1): the report of _Transferencia_ sees a consistent 100 while the transfer commits, and nobody waits, unlike two-phase locking.
- **But it is not free** (M4): writers of the same item still wait for each other, and the second one is aborted when the first commits. The application must retry, as with two-phase locking.
- **Preventing write skew**:
  - Two-phase locking: the shared locks of the two reads make the writes deadlock, and one transaction is aborted (E3).
  - Make the conflict visible: read the rows with `SELECT … FOR UPDATE`, so the second transaction waits and then fails, or write a shared row both must update.
  - Serializable Snapshot Isolation, PostgreSQL's `SERIALIZABLE`: it keeps snapshot reads but tracks read–write dependencies and aborts one transaction of a dangerous pair (Cahill et al., 2008; Ports and Grittner, 2012).
- **Real systems**: PostgreSQL's `REPEATABLE READ` and Oracle's `SERIALIZABLE` are snapshot isolation; MySQL InnoDB's `REPEATABLE READ` uses snapshots for plain reads but not the first-updater rule. Old versions are cleaned up later (PostgreSQL's `VACUUM`), which is why a very long transaction keeps them alive.

## Experiment

| #   | Challenge                                                                      | One valid solution                                                                               | Why it works                                                                                                          |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| E1  | Make the report of _Transferencia_ see the real total without anybody waiting. | Snapshot, the scenario's order: the report reads 50 and, at step 7, 50 again; no lock waits.     | The report's snapshot was taken at step 1; the transfer's commit at step 6 is invisible to it.                        |
| E2  | Keep both deposits of _Saldo_ under snapshot isolation.                        | Serial order T1, T1, T1, T2, T2, T2: x = 170.                                                    | Any overlap makes the second writer find a version committed after its snapshot, and it is aborted.                   |
| E3  | Keep at least one doctor on call without changing the scripts.                 | Two-phase locking (one doctor aborted, 1 on call), or a serial order under snapshot (1 on call). | Under 2PL the reads' shared locks make the writes deadlock; serially, the second check sees x + y = 1 and rolls back. |

## Check

| #   | Question                                                                                                                       | Answer                                                                                | Targets |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------- |
| C1  | Does PostgreSQL's `REPEATABLE READ` (snapshot isolation) give the same results as some serial order?                           | Not always: it allows write skew.                                                     | M1      |
| C2  | Two transactions each check a rule over two rows and then each update a different row. Can snapshot isolation break the rule?  | Yes: both checks see the old snapshot and the writes do not conflict.                 | M2      |
| C3  | A report under snapshot isolation reads two accounts while a transfer between them commits. Can it see money appear or vanish? | No: both reads come from the same snapshot.                                           | M3      |
| C4  | Two transactions under snapshot isolation read x and then both update x. What happens?                                         | The second writer waits for the first; when the first commits, the second is aborted. | M4      |
| C5  | T1 starts, T2 then commits x = 90, and later T1 reads x. Which value does T1 see?                                              | The value before T2's commit: the one in T1's snapshot.                               | M5      |

## Engine behavior

Defined in [`docs/engines/transactions.md`](../engines/transactions.md): rules, keys, state, result, edge cases and properties. This lesson uses the level `snapshot` and the operation `check`, compared with `read-committed` and `serializable-2pl`.

## Expected results (hand-computed)

Notation: see "Notation of the traces" in the engine spec. Steps are indexes from 0; the board counts from 1.

### Preset: Guardia (x = 1, y = 1)

Scripts: T1 (Alice) `read x, read y, check x+y ≥ 2, write x 0, commit`; T2 (Bob) `read x, read y, check x+y ≥ 2, write y 0, commit`.

| Variant                 | Order                         | Trace                                                                                                                         | Outcome                               |
| ----------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Snapshot (Predict, Run) | T1 T1 T2 T2 T1 T2 T1 T2 T1 T2 | 0 T1 snap, r x 1 · 1 T1 r y 1 · 2 T2 snap, r x 1 · 3 T2 r y 1 · 4 T1 ✓2 · 5 T2 ✓2 · 6 T1 w x 0 · 7 T2 w y 0 · 8 T1 c · 9 T2 c | x 0, y 0: nobody on call; both commit |
| Read Committed          | same                          | the same reads, checks and writes, without `snapshot`                                                                         | x 0, y 0                              |
| Two-phase locking (E3)  | T1 T1 T2 T2 T1 T2 T1 T2 T1    | 0–3 rs · 4 T1 ✓2 · 5 T2 ✓2 · 6 T1 WS(T2) on x · 7 T2 WS(T1) on y, ✗T2 (`T2 → y → T1 → x → T2`), →T1 x, up, w x 0 · 8 T1 c     | x 0, y 1: one on call; T2 aborted     |
| Snapshot, serial (E3)   | T1×5, T2×3                    | 0–4 T1 as above, commits at 4 · 5 T2 snap, r x 0 · 6 T2 r y 1 · 7 T2 ✗1 (rolls back)                                          | x 0, y 1                              |

### Preset: Saldo under snapshot

| Variant          | Order             | Trace                                                                                 | Outcome                                                            |
| ---------------- | ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Module 5's order | T1 T2 T1 T1 T2    | 0 T1 snap, r 100 · 1 T2 snap, r 100 · 2 T1 wc 150 · 3 T1 c · 4 T2 ser(T1)             | x 150; T2 aborted; lost 0                                          |
| T2 writes early  | T1 T2 T1 T2 T1    | 0 T1 snap, r 100 · 1 T2 snap, r 100 · 2 T1 wc 150 · 3 T2 W(T1) · 4 T1 c, →T2, ser(T1) | x 150; T2 aborted                                                  |
| Serial (E2)      | T1 T1 T1 T2 T2 T2 | 0 T1 snap, r 100 · 1 T1 wc 150 · 2 T1 c · 3 T2 snap, r 150 · 4 T2 wc 170 · 5 T2 c     | x 170                                                              |
| Atomic add       | T1 T2 T1          | 0 T1 snap, add 100→150 · 1 T2 snap, W(T1) · 2 T1 c, →T2, ser(T1)                      | x 150; T2 aborted (PostgreSQL: yes, `UPDATE x = x + 20` fails too) |

### Preset: Transferencia under snapshot (E1)

Module 5's order T1, T2, T2, T2, T2, T2, T1, T1: 0 T1 snap, r x 50 · 1 T2 snap, r x 50 · 2 T2 wc x 10 · 3 T2 r y 50 · 4 T2 wc y 90 · 5 T2 c · 6 T1 ro y 50 (current 90 by T2) · 7 T1 c. The report reads 50 + 50 = 100; no block, no abort.

## Go deeper (optional section)

- How PostgreSQL stores versions in the table itself (`xmin`, `xmax`) and why `VACUUM` exists.
- Serializable Snapshot Isolation: the "dangerous structure" of two consecutive read–write dependencies.
- Oracle's statement-level snapshots (Read Committed done with versions).
- Time travel: reading as of an old snapshot.

## References

- Berenson et al., "A Critique of ANSI SQL Isolation Levels", _SIGMOD 1995_, §4.2 (Snapshot Isolation, H1.SI, H5, A5B). Free at https://www.microsoft.com/en-us/research/publication/a-critique-of-ansi-sql-isolation-levels/
- Kleppmann, Hermitage, `postgres.md`: https://github.com/ept/hermitage
- PostgreSQL documentation, "Repeatable Read Isolation Level" and "Serializable Isolation Level": https://www.postgresql.org/docs/current/transaction-iso.html
- Cahill, Röhm and Fekete, "Serializable Isolation for Snapshot Databases", _SIGMOD 2008_.
- Ports and Grittner, "Serializable Snapshot Isolation in PostgreSQL", _VLDB 2012_.
