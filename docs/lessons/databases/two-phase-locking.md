# Lesson spec: Two-phase locking and deadlocks

| Field              | Value                                                  |
| ------------------ | ------------------------------------------------------ |
| Id                 | `two-phase-locking`                                    |
| Path / module      | Databases (`databases`) / 6, Two-phase locking         |
| Engine             | `src/engines/transactions/` (level `serializable-2pl`) |
| Estimated time     | 30 minutes                                             |
| Translation review | Reviewed                                               |

The simulation is the **transaction board** of `isolation-anomalies`, with one more level: **Serializable by strict two-phase locking**. Reads now take a **shared** lock and keep it until the end, so each item can have several readers or one writer. The board shows every lock with its mode and owners, who waits for whom, and the moment a wait closes a cycle and the database aborts a victim. The same scenarios as module 5 can be replayed under Read Committed and under two-phase locking side by side.

The engine is shared with `isolation-anomalies` and `mvcc-snapshots`; its spec is `docs/engines/transactions.md`.

## Learning objectives

By the end of the lesson the learner can:

1. State the two rules of strict two-phase locking (shared locks to read, exclusive locks to write, all held until commit) and say which lock requests are compatible.
2. Trace a short interleaving under two-phase locking: who gets each lock, who waits, and when a wait closes a cycle.
3. Explain why two-phase locking prevents the lost update and the read skew of module 5, and what it costs: waits, deadlocks and aborted transactions that the application must retry.
4. Tell a deadlock in a database from a deadlock between application threads: the database detects the cycle and aborts one transaction.

## Prerequisites

- Transactions, isolation levels, the lost update and read skew (lesson `isolation-anomalies`).
- Deadlock as a cycle of waits (lesson `deadlock`, path Operating systems). Helpful, not required.

## Misconceptions targeted

| #   | Misconception                                                                          | Where it is exposed                        |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------ |
| M1  | A deadlock needs at least two resources taken in opposite orders.                      | Predict; Run, step 4; Check C1             |
| M2  | A deadlock in a database leaves the transactions stuck forever, like the philosophers. | Predict; Run, step 4; Check C2             |
| M3  | Serializable never fails: it only makes things slower.                                 | Predict; Explain; Check C3                 |
| M4  | Readers never block writers.                                                           | Experiment E1; Check C4                    |
| M5  | The write locks of Read Committed are already enough to serialize transactions.        | Explain (contrast with module 5); Check C5 |
| M6  | "Two-phase" means a read phase followed by a write phase.                              | Theory; Explain; Check C6                  |

## Minimal theory (before Predict)

- Under **two-phase locking** every access takes a lock first:
  - to **read** an item, a **shared** lock (S); several transactions can share it;
  - to **write** it, an **exclusive** lock (X); nobody else can hold any lock on the item.
  - A transaction that holds S and wants to write asks to **upgrade** it to X, which needs every other reader to be gone.
- **Strict** two-phase locking keeps every lock until commit or rollback. The two phases are a **growing** phase, in which the transaction only takes locks, and a **shrinking** phase, in which it only releases them; strict 2PL releases them all at once, at the end.
- A request that conflicts with someone else's lock **waits**. If the waits form a cycle, the database **detects** it and **aborts** one transaction (the victim) so the others can go on. The application gets an error and must retry the victim.
- Compatibility table: S with S yes; S with X no; X with anything no.
- One worked example: T1 reads x (S on x). T2 reads x too (now two readers). T2 then wants to write x: it needs X, but T1 still reads, so T2 waits until T1 commits.

## Predict

- **Question**: "The _Saldo_ scenario again: x = 100, T1 reads x and writes x + 50, T2 reads x and writes x + 20. Now under two-phase locking, in this order: T1 reads, T2 reads, T1 writes, T2 writes. What will happen to the two deposits?" Options: (a) both commit and both deposits are kept; (b) both commit, but a deposit is lost; (c) the database aborts one of them; (d) both wait forever. Then "How sure are you?". The board classifies a finished run as (c) if any transaction was aborted, (b) if a stale write committed, (a) otherwise; (d) never happens, because every cycle is broken.
- **Setup**: preset _Saldo_, `serializable-2pl`, order T1, T2, T1, T2, T1.
- **Correct answer**: (c): T2 is aborted and x ends at 150.
- **Naive answers and why they fail**:
  - (d), M1 and M2: there is only one item, but each transaction holds a shared lock the other needs gone before it can write. At step 4, T2's request closes the cycle T2 → x → T1 → x → T2, and the database aborts T2 instead of waiting.
  - (a), M3: locks do not make both transactions succeed; one of them pays with an abort. Retried afterwards, T2 would read 150 and the total would be 170.
  - (b), M5: the lost update of module 5 needs T2 to write from a value it read before T1's change. Under 2PL its shared lock forbids that change until T2 ends.

## Run

- **Default setup**: _Saldo_, Serializable (2PL), order T1, T2, T1, T2, T1.
- **Moments to watch** (the board counts steps from 1):
  - Steps 1–2: both read 100 and both hold a shared lock on x.
  - Step 3: T1 wants to write and waits for T2's shared lock.
  - Step 4: T2 wants to write and would wait for T1's: a cycle. The database aborts T2, which releases its lock; T1 upgrades to X and writes 150.
  - Step 5: T1 commits. x = 150; T2 must be retried.

## Explain (depth after the run)

- Contrast with the prediction: one transaction commits, the other is aborted with an error, and x = 150. Nothing is lost silently: the application learns that T2 failed and retries it.
- **Why it is serializable**: a transaction's shared locks keep what it read from changing until it ends, and its exclusive locks keep others from seeing what it wrote. Every conflict between two committed transactions therefore goes in the same direction, so the result equals running them one after another in commit order (Eswaran et al., 1976).
- **What module 5's anomalies become**: the lost update turns into a deadlock and an abort (this run); the read skew of _Transferencia_ turns into a wait, because the transfer cannot write x while the report holds it (E1).
- **The cost**: readers block writers and writers block readers (M4); upgrades from S to X deadlock even on one item (M1); throughput drops and some transactions are aborted. Applications that run at this level must catch the error and retry (M3).
- **Avoiding the upgrade deadlock**: read with `SELECT … FOR UPDATE`, which takes X from the start, so the second transaction waits at its read instead of deadlocking at its write (E2).
- **Deadlocks in databases versus threads** (M2): an operating system does not break deadlocks between application locks, but a database does. PostgreSQL checks for a cycle after `deadlock_timeout` (1 s) and aborts the transaction whose check finds it; MySQL InnoDB detects it at once and aborts the transaction that has changed fewer rows. The lesson's rule (abort the transaction whose request closed the cycle) is a deterministic simplification.
- **Two phases** (M6): growing, then shrinking. Plain 2PL may release locks before commit once it stops taking new ones; strict 2PL waits until commit so that nobody reads uncommitted data and a rollback can never force others to roll back too.
- **Which systems use it**: SQL Server and MySQL InnoDB implement Serializable with locks like these (InnoDB turns plain `SELECT` into locking reads). PostgreSQL's Serializable uses a different technique, Serializable Snapshot Isolation, built on the versions of module 7.

## Experiment

| #   | Challenge                                                                                                   | One valid solution                                                                                             | Why it works                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| E1  | Under two-phase locking, make the report of _Transferencia_ see the real total.                             | Order T1, T2, T2, T1, T1, T2, T2, T2: the report sees 50 + 50 = 100.                                           | The transfer's write of x waits for the report's shared lock; it can only change x once the report has committed.              |
| E2  | Make both deposits of _Saldo_ commit under two-phase locking.                                               | Order T1, T1, T2, T1, T2, T2 (x = 170), or switch to _Lee con FOR UPDATE_ with the Predict order.              | T2's read waits until T1 commits and then reads 150, so nobody has to upgrade against another reader.                          |
| E3  | Find the step where _Transferencias cruzadas_ deadlocks under two-phase locking, then under Read Committed. | 2PL: step 6 (T2 reads x). Read Committed: step 8 (T2 writes x), with order T1, T2, T1, T2, T1, T2, T1, T2, T1. | Under 2PL reads already wait for the other's exclusive lock; under Read Committed only writes wait, so the cycle closes later. |
| E4  | Make both transfers of _Transferencias cruzadas_ commit.                                                    | Serial order: T1 five times, then T2 five times. x = 100, y = 100.                                             | With no overlap, nobody waits for anybody, so no cycle can form.                                                               |

## Check

| #   | Question                                                                                                             | Answer                                                                                    | Targets |
| --- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------- |
| C1  | Two transactions read the same row under two-phase locking and then both try to update it. Can they deadlock?        | Yes: each waits for the other's shared lock to go before it can upgrade.                  | M1      |
| C2  | Two transactions deadlock inside a database. What happens next?                                                      | The database detects the cycle and aborts one of them; the other goes on.                 | M2      |
| C3  | Your application runs at Serializable. What must it do that it did not need at Read Committed?                       | Catch serialization or deadlock errors and retry the aborted transaction.                 | M3      |
| C4  | Under two-phase locking, a long report is reading table rows. Can a transaction update one of the rows it has read?  | Not until the report commits: the report's shared lock blocks the writer.                 | M4      |
| C5  | Read Committed also locks rows when writing. Why does it still allow lost updates, while two-phase locking does not? | Its reads take no lock, so another transaction can change what you read before you write. | M5      |
| C6  | What are the two phases of two-phase locking?                                                                        | Growing (only taking locks) and shrinking (only releasing them).                          | M6      |

## Engine behavior

Defined in [`docs/engines/transactions.md`](../../engines/transactions.md): rules, keys, state, result, edge cases and properties. This lesson uses the level `serializable-2pl`, compared with `read-committed`.

## Expected results (hand-computed)

Notation: see "Notation of the traces" in the engine spec. Steps are indexes from 0; the board counts from 1.

### Preset: Saldo under Serializable (2PL)

| Variant                       | Order             | Trace                                                                                                                          | Outcome                                   |
| ----------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Predict, Run                  | T1 T2 T1 T2 T1    | 0 T1 rs 100 · 1 T2 rs 100 · 2 T1 WS(T2) · 3 T2 WS(T1), ✗T2 (`T2 → x → T1 → x → T2`), →T1, up, wc 150 (100+50) · 4 T1 c         | x = 150; committed T1; aborted T2; lost 0 |
| T2 reads after T1 writes (E2) | T1 T1 T2 T1 T2 T2 | 0 T1 rs 100 · 1 T1 up, wc 150 · 2 T2 W(T1) · 3 T1 c, →T2 rs 150 · 4 T2 up, wc 170 (150+20) · 5 T2 c                            | x = 170; both commit                      |
| `FOR UPDATE` (E2)             | T1 T2 T1 T1 T2 T2 | identical to module 5's `FOR UPDATE` trace: 0 T1 rl 100 · 1 T2 W(T1) · 2 T1 wc 150 · 3 T1 c, →T2 rl 150 · 4 T2 wc 170 · 5 T2 c | x = 170; both commit                      |
| Serial                        | T1 T1 T1 T2 T2 T2 | 0 T1 rs 100 · 1 T1 up, wc 150 · 2 T1 c · 3 T2 rs 150 · 4 T2 up, wc 170 · 5 T2 c                                                | x = 170; no waits                         |
| Module 5's order              | T1 T2 T1 T1 …     | `RangeError` at step 3: T1 is waiting for T2's shared lock.                                                                    | —                                         |

In the Predict trace, step 3's keys are, in order: `lock.wait.shared` (T2, x, holders "T1"), `deadlock` (T2), `handoff` (T2, x, to T1), `lock.upgrade` (T1, x), `write.computed` (T1, x, 150, read 100, delta 50).

### Preset: Transferencia under Serializable (2PL) (E1)

Order T1, T2, T2, T1, T1, T2, T2, T2: 0 T1 rs x 50 · 1 T2 rs x 50 · 2 T2 WS(T1) on x · 3 T1 rs y 50 · 4 T1 c, →T2 x, up, wc x 10 (50−40) · 5 T2 rs y 50 · 6 T2 up, wc y 90 · 7 T2 c. Final x 10, y 90; the report read 50 and 50 (total 100). No deadlock, no stale write.

### Preset: Transferencias cruzadas (x = 100, y = 100)

Scripts: T1 `read x, writeFromRead x −10, read y, writeFromRead y +10, commit`; T2 `read y, writeFromRead y −10, read x, writeFromRead x +10, commit`.

| Variant              | Order                      | Trace                                                                                                                                                                                  | Outcome                               |
| -------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Serializable (2PL)   | T1 T2 T1 T2 T1 T2 T1 T1    | 0 T1 rs x 100 · 1 T2 rs y 100 · 2 T1 up, wc x 90 · 3 T2 up, wc y 90 · 4 T1 W(T2) on y · 5 T2 W(T1) on x, ✗T2 (`T2 → x → T1 → y → T2`), →T1 y, rs y 100 · 6 T1 up, wc y 110 · 7 T1 c    | x 90, y 110; committed T1; aborted T2 |
| Read Committed       | T1 T2 T1 T2 T1 T2 T1 T2 T1 | 0 T1 r x 100 · 1 T2 r y 100 · 2 T1 wc x 90 · 3 T2 wc y 90 · 4 T1 rh y 100 (pending 90) · 5 T2 rh x 100 (pending 90) · 6 T1 W(T2) on y · 7 T2 W(T1) on x, ✗T2, →T1 y, wc y 110 · 8 T1 c | x 90, y 110; committed T1; aborted T2 |
| Serial, either level | T1×5, T2×5                 | no waits                                                                                                                                                                               | x 100, y 100; both commit             |

In the Read Committed variant, T1's write at step 7 is not stale: T2's 90 on y was never committed.

## Go deeper (optional section)

- Lock granularity and intention locks (IS, IX), so a table lock and row locks can coexist.
- Predicate and next-key locks, which stop phantoms (module 5's Go deeper).
- Deadlock prevention instead of detection: wait-die and wound-wait, using transaction timestamps.
- Serializable Snapshot Isolation (Cahill et al., 2008), PostgreSQL's Serializable.

## References

- Eswaran, Gray, Lorie and Traiger, "The Notions of Consistency and Predicate Locks in a Database System", _Communications of the ACM_ 19(11), 1976.
- Berenson et al., "A Critique of ANSI SQL Isolation Levels", _SIGMOD 1995_, §2.3 and Table 2. Free at https://www.microsoft.com/en-us/research/publication/a-critique-of-ansi-sql-isolation-levels/
- Kleppmann, Hermitage, `mysql.md`: https://github.com/ept/hermitage
- MySQL documentation, "Transaction Isolation Levels" (SERIALIZABLE) and "Deadlock Detection": https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html
- PostgreSQL documentation, "Serializable Isolation Level" and `deadlock_timeout`: https://www.postgresql.org/docs/current/transaction-iso.html
