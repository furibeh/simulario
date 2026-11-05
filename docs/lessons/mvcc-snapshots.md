# Lesson spec: MVCC and snapshot isolation

| Field          | Value                                           |
| -------------- | ----------------------------------------------- |
| Id             | `mvcc-snapshots`                                |
| Path / module  | Databases (`databases`) / 7, MVCC and snapshots |
| Engine         | `src/engines/transactions/` (level `snapshot`)  |
| Estimated time | 30 minutes                                      |
| Status         | Draft                                           |

The simulation is the **transaction board** of modules 5 and 6 with one more level: **snapshot isolation**, which is what PostgreSQL runs as `REPEATABLE READ`. Every committed write keeps its old versions, and each transaction reads from a **snapshot** taken when it starts: the versions committed before that moment. The board shows each item's chain of versions, each transaction's snapshot as the turn it started, which version every read picks, and the moment a second writer is aborted because someone changed the item after its snapshot. The learner compares the same scenarios under Read Committed, snapshot isolation and two-phase locking.

This spec adds the level `snapshot` and the operation `check` to the engine of `docs/lessons/isolation-anomalies.md` and `docs/lessons/two-phase-locking.md`. Every result listed in those specs must stay the same.

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

### New operation

`check items atLeast`: the application checks that the sum of the values this transaction last read of `items` is at least `atLeast`. If so, it goes on (`check.pass`). If not, the transaction rolls back (`check.fail`); its program counter moves past the check, so the operations after it never ran. Validation: `items` is 1–3 existing items, each read (`read` or `readForUpdate`) earlier in the script; `atLeast` is an integer −999…999. `check` takes no lock and is allowed at every level.

### Versions and snapshots (every level)

- Each item keeps its list of committed versions: value, the transaction that committed it (null for the initial one) and the step of the commit (null for the initial one). The state exposes it as `versions`.
- Each transaction records `start`, the step of its first operation (null before it runs).

### Rules under `snapshot`

- At a transaction's first operation the step starts with `snapshot` (the snapshot is taken).
- **Reads** (`read`) never take a lock and never wait. A transaction with an uncommitted value on the item reads it (`read.own`). Otherwise it reads the newest version committed at a step before its `start`. If a newer committed version exists, the key is `read.old` (with the current committed value and its committer); otherwise, if another transaction holds an uncommitted value, `read.hidden`; otherwise `read`.
- **Writes** (`write`, `writeFromRead`, `add`) and `readForUpdate` take the exclusive lock exactly as under Read Committed (waiting, FIFO handoff, deadlock detection). When the transaction gets the lock (at once or by handoff), if the item's newest committed version was committed at a step after its `start`, the operation does not run: the transaction is aborted (`serialization`, with the committer), its uncommitted values are discarded, its program counter stays on that operation, and its locks are released with the usual rule. Otherwise the operation runs as under Read Committed; `add` and `readForUpdate` then see the snapshot's value, which is also the newest committed one.
- `read.changed` and `write.stale` keep their definitions; under `snapshot` they never occur for committed transactions.
- Keys within a step, in order: `snapshot`, then the keys of module 5 and 6, with `serialization` in the place of the operation's key.

### New explanation keys

| Key             | Params                                 | Example (es)                                                                                                   | Example (en)                                                                                |
| --------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `snapshot`      | `tx`                                   | T1 empieza y toma su instantánea: verá los datos tal como están confirmados ahora.                             | T1 starts and takes its snapshot: it will see the data as it is committed now.              |
| `read.old`      | `tx`, `item`, `value`, `current`, `by` | T1 lee y = 50 en su instantánea, aunque T2 confirmó 90 después de que T1 empezara.                             | T1 reads y = 50 from its snapshot, although T2 committed 90 after T1 started.               |
| `serialization` | `tx`, `item`, `by`                     | T2 no puede escribir x: T1 la cambió y confirmó después de la instantánea de T2. La base de datos aborta a T2. | T2 cannot write x: T1 changed and committed it after T2's snapshot. The database aborts T2. |
| `check.pass`    | `tx`, `sum`, `atLeast`                 | T1 comprueba la regla: ve 2, y hace falta al menos 2. Sigue adelante.                                          | T1 checks the rule: it sees 2, and at least 2 are needed. It goes on.                       |
| `check.fail`    | `tx`, `sum`, `atLeast`                 | T2 comprueba la regla: ve 1, y hace falta al menos 2. Se deshace sin escribir.                                 | T2 checks the rule: it sees 1, and at least 2 are needed. It rolls back without writing.    |

### State

Per item, add `versions` (value, `by`, `step`); per transaction, add `start`.

## Expected results (hand-computed)

Notation of the earlier specs, plus: `snap` the snapshot, `ro` a read of an old version (`read.old`), `✓k`/`✗k` a check that passes or fails with sum k, `ser(T1)` a serialization abort because of T1's commit. Steps are indexes from 0.

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

### External cross-check

`src/engines/published-traces.test.ts` adds, transcribed from the sources:

- **Berenson et al. 1995, §4.2** (snapshot isolation):
  - H1.SI: x = y = 50; T1 `read x, writeFromRead x −40, read y, writeFromRead y +40, commit`, T2 `read x, read y, commit`; order T1 T1 T2 T2 T2 T1 T1 T1. T2 reads x 50 and y 50; both commit; final 10, 90.
  - H5 (write skew, A5B): x = y = 50; T1 `read x, read y, writeFromRead y −90, commit`, T2 `read x, read y, writeFromRead x −90, commit`; order T1 T1 T2 T2 T1 T2 T1 T2. Both commit; final x −40, y −40: x + y > 0 is violated.
  - H2 under snapshot: read skew does not happen (preset _Transferencia_, E1).
  - H4 under snapshot: order T1 T2 T2 T2 T1; T1's write at step 4 finds T2's version committed after its snapshot and is aborted. Final 120, no lost update.
- **Hermitage, PostgreSQL, Repeatable Read** (`postgres.md`), row 1 is x = 10, row 2 is y = 20:
  - P4: T1 `read x, write x 11, commit`; T2 `read x, write x 11, commit`; order T1 T2 T1 T2 T1. T2's update waits; when T1 commits, T2 fails with a serialization error. Final 11.
  - G-single (id-based): T1 `read x, read y, commit`; T2 `read x, read y, write x 12, write y 18, commit`; order T1 T2 T2 T2 T2 T2 T1 T1. T1 reads x 10 and y 20.
  - G2-item: T1 `read x, read y, write x 11, commit`; T2 `read x, read y, write y 21, commit`; order T1 T1 T2 T2 T1 T2 T1 T2. Both commit; final 11, 21.

### Edge cases

| Case                                 | Input                                                                              | Expected                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Repeatable reads                     | x = 50. T1 `read x, read x, commit`; T2 `write x 10, commit`; order T1 T2 T2 T1 T1 | Step 3: T1 reads 50 (`read.old`, current 10 by T2); `nonRepeatable` 0. Compare module 5: 10. |
| Snapshot after a commit sees it      | x = 5. T1 `write x 6, commit`; T2 `read x, commit`; order T1 T1 T2 T2              | Step 2: T2 takes its snapshot after T1's commit and reads 6 (`read`).                        |
| A writer whose holder aborts goes on | x = 5. T1 `write x 6, abort`; T2 `write x 7, commit`; order T1 T2 T1 T2            | 1 T2 W(T1) · 2 T1 a, →T2, w x 7 (no committed change after T2's snapshot) · 3 T2 c. Final 7. |
| `check` without an earlier read      | T1 `check x ≥ 1, commit`                                                           | `RangeError`.                                                                                |
| Earlier levels                       | every preset and edge case of the two earlier specs                                | unchanged (they never use `check`; `versions` and `start` are new state fields only)         |

### Properties for `src/engines/invariants.test.ts`

On seeded random inputs under `snapshot`, with random valid orders run to the end:

- `lostUpdates`, `dirtyReads` and `nonRepeatable` are 0.
- Every read of another transaction's data returns the item's committed value at the end of the step before the reader's `start` (checked against the trace's own earlier states).
- No two committed transactions whose lifetimes overlap (from `start` to commit) both wrote the same item (first updater wins).

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

## Translations

| Language | File                                        | Status      |
| -------- | ------------------------------------------- | ----------- |
| es       | `src/content/lessons/es/mvcc-snapshots.mdx` | Not started |
| en       | `src/content/lessons/en/mvcc-snapshots.mdx` | Not started |
