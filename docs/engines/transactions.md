# Engine spec: transactions

Code: `src/engines/transactions/`.

| Lesson                | Levels it uses                                   | What it adds                               |
| --------------------- | ------------------------------------------------ | ------------------------------------------ |
| `isolation-anomalies` | `read-uncommitted`, `read-committed`             | The core: scripts, write locks, versions   |
| `two-phase-locking`   | `read-committed`, `serializable-2pl`             | Shared locks, upgrades, the wait-for graph |
| `mvcc-snapshots`      | `read-committed`, `serializable-2pl`, `snapshot` | Versions by step, snapshots, `check`       |

This spec holds the rules, keys and cases of the engine. Each lesson spec holds its teaching plan and the expected results of its scenarios; tests assert both. The lessons model PostgreSQL where they can be checked with `psql`; differences are named where they occur.

**Adding a level or an operation must not change any result listed for the others.** `check`, `versions`, `start` and `readers` were added this way: earlier scripts never use `check`, `versions` and `start` are new state fields only, and `readers` is always empty outside `serializable-2pl`.

## Inputs and limits

| Field          | Range                                                                                      | Default        |
| -------------- | ------------------------------------------------------------------------------------------ | -------------- |
| `items`        | 1–3 items with ids `x`, `y`, `z` (in that order), each with an integer initial value 0–999 | `x = 100`      |
| `transactions` | 2–3 transactions `T1`…`T3`, each with a script of 1–6 operations                           | _Saldo_        |
| `isolation`    | `read-uncommitted`, `read-committed`, `serializable-2pl` or `snapshot`                     | read-committed |
| `order`        | list of at most 30 transaction ids, one per step                                           | preset order   |

Operations (`d` an integer −999…999, `v` an integer 0–999):

| Operation              | SQL it stands for                                      |
| ---------------------- | ------------------------------------------------------ |
| `read item`            | `SELECT value … WHERE id = item`                       |
| `readForUpdate item`   | `SELECT value … WHERE id = item FOR UPDATE`            |
| `write item v`         | `UPDATE … SET value = v` (v computed elsewhere)        |
| `writeFromRead item d` | `UPDATE … SET value = r + d`, r the value it read      |
| `add item d`           | `UPDATE … SET value = value + d`                       |
| `check items atLeast`  | An application-side rule (see "The `check` operation") |
| `commit`, `abort`      | `COMMIT`, `ROLLBACK`                                   |

Validation (`RangeError`): ids and counts in range; every operation names an existing item; a script ends with exactly one `commit` or `abort`, as its last operation; `writeFromRead item` appears only after a `read` or `readForUpdate` of the same item in the same script. During the run, an `order` entry that names a finished (committed or aborted) or blocked transaction throws. A shorter `order` ends the trace early with `complete: false`.

## Versions

Each item has a **committed value** and at most one **uncommitted value** (write locks make a second one impossible). Every write creates a new version identified by the step that made it; the initial value is version `init`. At commit, the transaction's uncommitted value becomes the committed version.

- Each item keeps its list of committed versions: value, the transaction that committed it (null for the initial one) and the step of the commit (null for the initial one). The state exposes it as `versions`.
- Each transaction records `start`, the step of its first operation (null before it runs).

## Core rules

These apply at every level unless a later section changes them.

- One step per `order` entry: the named transaction runs its next operation. `t` is the step index from 0.
- **Plain read** by T of item:
  - If T has an uncommitted value on the item, it reads it (`read.own`).
  - Otherwise, under `read-uncommitted`, if another transaction U has an uncommitted value, T reads it (`read.dirty`).
  - Otherwise T reads the committed value: `read.hidden` if another transaction has an uncommitted value it cannot see, `read` if not.
  - If T read the item before, neither read was of its own write, and the version differs from the one it read last time, the step adds `read.changed` (a non-repeatable read).
- **Locks**: `write`, `writeFromRead`, `add` and `readForUpdate` need the item's write lock. A transaction keeps every lock it takes until it commits or aborts. If another transaction holds the lock, T blocks (`lock.wait`, with the holder), joins the item's FIFO queue, and its operation stays pending.
- With the lock held:
  - `write item v`: T's uncommitted value becomes v (`write`).
  - `writeFromRead item d`: value = (the value T last read of the item) + d (`write.computed`). If that read returned a committed version and the item's committed version is now a different one, the step adds `write.stale` (the write erases a committed change T never saw).
  - `add item d`: base = T's uncommitted value if any, otherwise the committed value **at this moment**; value = base + d (`add`).
  - `readForUpdate item`: reads like a plain read while holding the lock, so it returns T's own value or the newest committed value (`read.lock`), and adds `read.changed` under the same rule as a plain read.
- **Commit** (`commit`): every uncommitted value of T becomes committed. **Abort** (`abort`): they are discarded.
- **Releasing locks**, after commit or abort, item by item in id order: if the queue is empty the lock is free (no key); otherwise its first waiter gets it (`handoff`) and its pending operation runs **within the same step**, with that operation's keys. The waiter becomes ready again.
- **Deadlock**: after a `lock.wait`, the engine follows "waits for item, held by U" from T. If it returns to T, T is the victim: its uncommitted values are discarded, its program counter stays on the operation it was waiting for (that one and the rest never ran), it ends as aborted (`deadlock`, with the path written `T → item → U → … → T`), and its locks are released with the rule above. PostgreSQL finds the cycle only after `deadlock_timeout` (1 s) and aborts the transaction whose check runs first, and InnoDB picks the transaction that changed the fewest rows; the lesson's rule (the transaction that closed the cycle) is a deterministic simplification.
- **Keys within a step**, in order: `lock.wait` or the operation's key, then `read.changed` or `write.stale`, then `deadlock`, then for each released item `handoff` followed by the waiter's operation keys.
- The trace ends when the order runs out (`complete` is true only if every transaction has committed or aborted).

## The `check` operation

`check items atLeast`: the application checks that the sum of the values this transaction last read of `items` is at least `atLeast`. If so, it goes on (`check.pass`). If not, the transaction rolls back (`check.fail`); its program counter moves past the check, so the operations after it never ran. Validation: `items` is 1–3 existing items, each read (`read` or `readForUpdate`) earlier in the script; `atLeast` is an integer −999…999. `check` takes no lock and is allowed at every level.

## Rules under `serializable-2pl`

### Locks

Each item has an exclusive holder (`holder`, at most one) and a set of shared holders (`readers`, kept in id order). Under the other levels `readers` is always empty.

- **Requested mode**: `read` asks for S; `write`, `writeFromRead`, `add` and `readForUpdate` ask for X.
- **Granted at once** if compatible with the current holders other than the requester: S needs no other X holder; X needs no other holder of any mode. The queue does not delay a compatible request (a simplification: InnoDB also queues a request behind waiting ones).
- A transaction that already holds X needs nothing more. One that holds S and asks for S needs nothing more. One that holds S and gets X **upgrades** (`lock.upgrade`) and leaves `readers`.
- **Waiting**: an incompatible request blocks the transaction and joins the item's FIFO queue. A blocked S request waits for the X holder (`lock.wait`). A blocked X request waits for the other shared holders (`lock.wait.shared`, with `holders` written as ids joined by ", " in id order) or, if another transaction holds X, for it (`lock.wait`).
- **Releasing**, after commit or abort, item by item in id order: the transaction leaves `holder` and `readers`; then, while the queue's first waiter is compatible with the remaining holders, it gets its lock (`handoff`, then `lock.upgrade` if it held S and got X, then the keys of its pending operation) and leaves the queue. The first incompatible waiter stops the item's queue.
- **Deadlock**: after a block, the engine searches the wait-for graph from the blocked transaction T. T waits for every incompatible holder of the item it asked for; it does not wait for others in the queue. Holders are visited in id order, depth first; the first path that returns to T is the cycle, written `T → item → U → … → T`. T is the victim, exactly as under the core rules.

### Reads

- A read that takes a new S lock reads the committed value (`read.shared`).
- A read by a transaction that already holds S or X on the item takes no new lock: `read.own` if it has an uncommitted value there, `read` otherwise.
- `read.changed`, `write.stale`, dirty reads: same definitions as in the core rules. Strict 2PL makes all three impossible for committed transactions (see "Properties").

## Rules under `snapshot`

- At a transaction's first operation the step starts with `snapshot` (the snapshot is taken).
- **Reads** (`read`) never take a lock and never wait. A transaction with an uncommitted value on the item reads it (`read.own`). Otherwise it reads the newest version committed at a step before its `start`. If a newer committed version exists, the key is `read.old` (with the current committed value and its committer); otherwise, if another transaction holds an uncommitted value, `read.hidden`; otherwise `read`.
- **Writes** (`write`, `writeFromRead`, `add`) and `readForUpdate` take the exclusive lock exactly as under Read Committed (waiting, FIFO handoff, deadlock detection). When the transaction gets the lock (at once or by handoff), if the item's newest committed version was committed at a step after its `start`, the operation does not run: the transaction is aborted (`serialization`, with the committer), its uncommitted values are discarded, its program counter stays on that operation, and its locks are released with the usual rule. Otherwise the operation runs as under Read Committed; `add` and `readForUpdate` then see the snapshot's value, which is also the newest committed one.
- `read.changed` and `write.stale` keep their definitions; under `snapshot` they never occur for committed transactions.
- Keys within a step, in order: `snapshot`, then the keys of the other levels, with `serialization` in the place of the operation's key.

## Explanation keys

| Key                | Params                                     | Example (es)                                                                                                   | Example (en)                                                                                           |
| ------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `read`             | `tx`, `item`, `value`                      | T1 lee x = 100.                                                                                                | T1 reads x = 100.                                                                                      |
| `read.hidden`      | `tx`, `item`, `value`, `writer`, `pending` | T2 lee x = 100. T1 ya escribió 150, pero no lo ha confirmado: Read Committed solo deja ver lo confirmado.      | T2 reads x = 100. T1 has written 150 but not committed it: Read Committed shows only committed values. |
| `read.dirty`       | `tx`, `item`, `value`, `writer`            | T2 lee x = 150, un valor que T1 aún no ha confirmado: una lectura sucia.                                       | T2 reads x = 150, a value T1 has not committed yet: a dirty read.                                      |
| `read.own`         | `tx`, `item`, `value`                      | T1 lee x = 150: su propia escritura, aún sin confirmar.                                                        | T1 reads x = 150: its own write, not committed yet.                                                    |
| `read.changed`     | `tx`, `item`, `before`, `value`            | La última vez T1 leyó x = 50; ahora lee 10: otra transacción confirmó un cambio entre medias.                  | Last time T1 read x = 50; now it reads 10: another transaction committed a change in between.          |
| `read.lock`        | `tx`, `item`, `value`                      | T1 lee x = 100 y lo bloquea para escribirlo después (FOR UPDATE).                                              | T1 reads x = 100 and locks it to write it later (FOR UPDATE).                                          |
| `write`            | `tx`, `item`, `value`                      | T1 escribe x = 11, sin confirmar todavía.                                                                      | T1 writes x = 11, not committed yet.                                                                   |
| `write.computed`   | `tx`, `item`, `value`, `read`, `delta`     | T2 escribe x = 120: el 100 que leyó más 20. Aún no está confirmado.                                            | T2 writes x = 120: the 100 it read plus 20. Not committed yet.                                         |
| `write.stale`      | `tx`, `item`, `read`, `current`, `by`      | Pero x ya vale 150, confirmado por T1. T2 calculó a partir de 100: al confirmar, borrará ese cambio.           | But x is already 150, committed by T1. T2 computed from 100: when it commits, it erases that change.   |
| `add`              | `tx`, `item`, `before`, `delta`, `value`   | T2 suma 20 a x dentro de la base de datos: 150 → 170, sin confirmar todavía.                                   | T2 adds 20 to x inside the database: 150 → 170, not committed yet.                                     |
| `lock.wait`        | `tx`, `item`, `holder`                     | T2 quiere escribir x, pero T1 lo tiene bloqueado: T2 espera a que T1 termine.                                  | T2 wants to write x, but T1 holds its lock: T2 waits for T1 to finish.                                 |
| `handoff`          | `tx`, `item`, `to`                         | T1 libera x y T2, que esperaba, lo bloquea y continúa.                                                         | T1 releases x, and T2, which was waiting, locks it and goes on.                                        |
| `commit`           | `tx`                                       | T1 confirma: sus escrituras ya son visibles para todos.                                                        | T1 commits: its writes are now visible to everyone.                                                    |
| `abort`            | `tx`                                       | T1 se deshace (ROLLBACK): sus escrituras desaparecen.                                                          | T1 rolls back: its writes disappear.                                                                   |
| `deadlock`         | `tx`, `path`                               | Ciclo de espera: T2 → x → T1 → y → T2. La base de datos aborta a T2 para romperlo.                             | Waiting cycle: T2 → x → T1 → y → T2. The database aborts T2 to break it.                               |
| `read.shared`      | `tx`, `item`, `value`                      | T1 lee x = 100 y toma un bloqueo compartido: nadie podrá escribir x hasta que T1 termine.                      | T1 reads x = 100 and takes a shared lock: nobody can write x until T1 finishes.                        |
| `lock.wait.shared` | `tx`, `item`, `holders`                    | T1 quiere escribir x, pero T2 lo está leyendo con un bloqueo compartido: T1 espera.                            | T1 wants to write x, but T2 holds a shared lock to read it: T1 waits.                                  |
| `lock.upgrade`     | `tx`, `item`                               | T1 ya tenía un bloqueo compartido de x y lo convierte en exclusivo.                                            | T1 already had a shared lock on x and turns it into an exclusive one.                                  |
| `snapshot`         | `tx`                                       | T1 empieza y toma su instantánea: verá los datos tal como están confirmados ahora.                             | T1 starts and takes its snapshot: it will see the data as it is committed now.                         |
| `read.old`         | `tx`, `item`, `value`, `current`, `by`     | T1 lee y = 50 en su instantánea, aunque T2 confirmó 90 después de que T1 empezara.                             | T1 reads y = 50 from its snapshot, although T2 committed 90 after T1 started.                          |
| `serialization`    | `tx`, `item`, `by`                         | T2 no puede escribir x: T1 lo cambió y confirmó después de la instantánea de T2. La base de datos aborta a T2. | T2 cannot write x: T1 changed and committed it after T2's snapshot. The database aborts T2.            |
| `check.pass`       | `tx`, `sum`, `atLeast`                     | T1 comprueba la regla: ve 2, y hace falta al menos 2. Sigue adelante.                                          | T1 checks the rule: it sees 2, and at least 2 are needed. It goes on.                                  |
| `check.fail`       | `tx`, `sum`, `atLeast`                     | T2 comprueba la regla: ve 1, y hace falta al menos 2. Se deshace sin escribir.                                 | T2 checks the rule: it sees 1, and at least 2 are needed. It rolls back without writing.               |

## State

Per step, the state after the step: per item (`id`, committed value and version, the transaction that committed it, uncommitted value and writer, exclusive lock holder, shared holders `readers`, FIFO queue, committed `versions`); per transaction (`id`, status `active | blocked | committed | aborted`, program counter, item it waits for, `start`, and for each item the value and version it read last); the transaction that ran.

## Result

`final` (committed value per item), `committed` and `aborted` (in the order they ended), `complete`, `steps`, `reads` (step, transaction, item, value returned, kind `committed | dirty | own`, committed value at that moment), `writes` (step, transaction, item, value, `stale`), `lostUpdates` (stale writes whose transaction committed), `dirtyReads` and `dirtyAborted` (dirty reads whose writer later aborted), `nonRepeatable` (steps with `read.changed`), `blocks` (step, transaction, item, holder), `deadlocks` (step, victim, path) and `segments` (maximal runs of steps by one transaction, for the timeline).

## Notation of the traces

Used here and in the lesson specs. Steps are indexes from 0; the board counts from 1.

- **Every level**: `r x=100` a read returning 100, `rh` a hidden read, `rd` a dirty read, `rl` a `FOR UPDATE` read, `w x=150` a write, `wc x=120 (100+20)` a computed write, `*` a stale write, `+x 150→170` an atomic add, `W(T1)` a block on a lock held by T1, `→T2` a handoff, `c`/`a` commit and abort, `✗T2` the deadlock victim.
- **Serializable (2PL)**: `rs` a read that takes a shared lock, `up` an upgrade, `WS(T2)` a wait for T2's shared lock.
- **Snapshot**: `snap` the snapshot, `ro` a read of an old version (`read.old`), `✓k`/`✗k` a check that passes or fails with sum k, `ser(T1)` a serialization abort because of T1's commit.

## External cross-check

`src/engines/published-traces.test.ts` replays these, transcribed from the sources, not from the engine.

### Read Uncommitted and Read Committed

**Berenson et al. 1995**, §3 and §4.1 (single-valued histories, Read Committed unless noted):

| History | Setup and scripts                                                                                              | Order                   | Expected                                                                                        |
| ------- | -------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| H1      | x = y = 50. T1 `read x, writeFromRead x −40, read y, writeFromRead y +40, commit`; T2 `read x, read y, commit` | T1 T1 T2 T2 T2 T1 T1 T1 | Read Uncommitted: T2 reads x 10 (dirty) and y 50, total 60. Read Committed: T2 reads 50 and 50. |
| H2      | preset _Transferencia_                                                                                         | the preset's order      | T1 reads x 50 and y 90 (total 140).                                                             |
| H4      | x = 100. T1 `read x, writeFromRead x +30, commit`; T2 `read x, writeFromRead x +20, commit`                    | T1 T2 T2 T2 T1 T1       | T2 writes 120 and commits; T1 writes 130, stale; final 130 ("only the increment of 30").        |
| P0      | x = 0. T1 `write x 1, commit`; T2 `write x 2, commit`                                                          | T1 T2 T1 T2             | T2 blocks on T1 at step 1 (no dirty write at any level); final 2.                               |

**Hermitage, PostgreSQL, Read Committed** (github.com/ept/hermitage, `postgres.md`). Row 1 is item `x` (10), row 2 is `y` (20); `select *` is `read x, read y`; Hermitage's constant updates are `write`, except P4, whose 11 is the application's 10 + 1 (`writeFromRead +1`). G0's `select` by T1 after its commit is outside any transaction and is left out.

| Test     | Scripts                                                                                                               | Order                            | Expected                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| G0       | T1 `write x 11, write y 21, commit`; T2 `write x 12, write y 22, commit`                                              | T1 T2 T1 T1 T2 T2                | T2 blocks at step 1 until T1 commits at step 3; final x 12, y 22.                       |
| G1a      | T1 `write x 101, abort`; T2 `read x, read y, read x, read y, commit`                                                  | T1 T2 T2 T1 T2 T2 T2             | T2 reads x 10, y 20 both times; final x 10.                                             |
| G1b      | T1 `write x 101, write x 11, commit`; T2 `read x, read y, read x, read y, commit`                                     | T1 T2 T2 T1 T1 T2 T2 T2          | T2 reads x 10 then 11 (never 101); final x 11.                                          |
| G1c      | T1 `write x 11, read y, commit`; T2 `write y 22, read x, commit`                                                      | T1 T2 T1 T2 T1 T2                | T1 reads y 20, T2 reads x 10; final x 11, y 22.                                         |
| OTV      | T1 `write x 11, write y 19, commit`; T2 `write x 12, write y 18, commit`; T3 `read x, read y, read y, read x, commit` | T1 T1 T2 T1 T3 T2 T3 T2 T3 T3 T3 | T2 blocks until T1 commits; T3 reads x 11, y 19, then y 18, x 12; final x 12, y 18.     |
| P4       | T1 `read x, writeFromRead x +1, commit`; T2 `read x, writeFromRead x +1, commit`                                      | T1 T2 T1 T2 T1 T2                | T2 blocks, then writes 11 over T1's committed 11 (stale); final 11, one increment lost. |
| G-single | T1 `read x, read y, commit`; T2 `read x, read y, write x 12, write y 18, commit`                                      | T1 T2 T2 T2 T2 T2 T1 T1          | T1 reads x 10 and y 18.                                                                 |

Hand trace of OTV (the longest): 0 T1 w x 11 · 1 T1 w y 19 · 2 T2 W(T1) on x · 3 T1 c, →T2 w x 12 · 4 T3 rh x 11 (pending 12) · 5 T2 w y 18 · 6 T3 rh y 19 (pending 18) · 7 T2 c · 8 T3 r y 18, `read.changed` 19 → 18 · 9 T3 r x 12, `read.changed` 11 → 12 · 10 T3 c.

### Serializable (2PL)

- **Berenson et al. 1995**, Table 2: Locking SERIALIZABLE holds long read and write locks, which is `serializable-2pl`. H4 (`r1[x=100] r2[x=100] w2[x=120] c2 w1[x=130] c1`) cannot run under it: with order T1, T2, T2, T1, T2 the engine reaches step 2 with T2 waiting for T1's shared lock; at step 3 T1's write closes the cycle (`T1 → x → T2 → x → T1`), T1 is aborted and T2 upgrades and writes 120; T2 commits at step 4. Final 120, no lost update.
- **Hermitage, MySQL InnoDB, Serializable** (`mysql.md`), row 1 is x = 10, row 2 is y = 20:
  - P4: T1 `read x, write x 11, commit`; T2 `read x, write x 11, commit`; order T1, T2, T1, T2, T1. T1's update waits; T2's update gets the deadlock error; T1 commits. Final x 11, aborted T2.
  - G2-item: T1 `read x, read y, write x 11, commit`; T2 `read x, read y, write y 21, commit`; order T1, T1, T2, T2, T1, T2, T1. T1's update waits; T2's update gets the deadlock error; T1 commits. Final x 11, y 20.
  - Left out: G-single (its `delete … where value = 20` is a predicate write), PMP and G2 (predicates and inserts), and Fekete's G2 example, where InnoDB picks a different victim than the lesson's rule.

### Snapshot isolation

- **Berenson et al. 1995, §4.2** (snapshot isolation):
  - H1.SI: x = y = 50; T1 `read x, writeFromRead x −40, read y, writeFromRead y +40, commit`, T2 `read x, read y, commit`; order T1 T1 T2 T2 T2 T1 T1 T1. T2 reads x 50 and y 50; both commit; final 10, 90.
  - H5 (write skew, A5B): x = y = 50; T1 `read x, read y, writeFromRead y −90, commit`, T2 `read x, read y, writeFromRead x −90, commit`; order T1 T1 T2 T2 T1 T2 T1 T2. Both commit; final x −40, y −40: x + y > 0 is violated.
  - H2 under snapshot: read skew does not happen (preset _Transferencia_, E1).
  - H4 under snapshot: order T1 T2 T2 T2 T1; T1's write at step 4 finds T2's version committed after its snapshot and is aborted. Final 120, no lost update.
- **Hermitage, PostgreSQL, Repeatable Read** (`postgres.md`), row 1 is x = 10, row 2 is y = 20:
  - P4: T1 `read x, write x 11, commit`; T2 `read x, write x 11, commit`; order T1 T2 T1 T2 T1. T2's update waits; when T1 commits, T2 fails with a serialization error. Final 11.
  - G-single (id-based): T1 `read x, read y, commit`; T2 `read x, read y, write x 12, write y 18, commit`; order T1 T2 T2 T2 T2 T2 T1 T1. T1 reads x 10 and y 20.
  - G2-item: T1 `read x, read y, write x 11, commit`; T2 `read x, read y, write y 21, commit`; order T1 T1 T2 T2 T1 T2 T1 T2. Both commit; final 11, 21.

## Edge cases

### Read Uncommitted and Read Committed

| Case                         | Input                                                                                                 | Expected                                                                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Deadlock                     | x = y = 0. T1 `write x 1, write y 1, commit`; T2 `write y 2, write x 2, commit`; order T1 T2 T1 T2 T1 | 0 T1 w x 1 · 1 T2 w y 2 · 2 T1 W(T2) on y · 3 T2 W(T1) on x, `deadlock` T2 (`T2 → x → T1 → y → T2`), →T1 w y 1 · 4 T1 c. Final x 1, y 1; committed T1, aborted T2. |
| Non-repeatable read          | x = 50. T1 `read x, read x, commit`; T2 `write x 10, commit`; order T1 T2 T2 T1 T1                    | Step 3: T1 reads 10 with `read.changed` (before 50). `nonRepeatable` 1.                                                                                            |
| Own write is not a change    | x = 5. T1 `read x, write x 7, read x, commit`; T2 `read x, commit`; order T1 T1 T1 T2 T1 T2           | Step 2 `read.own` 7, no `read.changed`. Step 3 T2 `read.hidden` 5 (pending 7).                                                                                     |
| Short order                  | _Saldo_, order T1 T2                                                                                  | 2 steps, `complete` false, final 100.                                                                                                                              |
| Order names a blocked tx     | _Saldo_, order T1 T2 T1 T2 T2                                                                         | `RangeError` at step 4: T2 is waiting for x.                                                                                                                       |
| Order names a finished tx    | _Saldo_, order T1 T1 T1 T1                                                                            | `RangeError` at step 3: T1 has committed.                                                                                                                          |
| `writeFromRead` without read | T1 `writeFromRead x +1, commit`                                                                       | `RangeError` (no earlier read of x).                                                                                                                               |
| Script without an end        | T1 `read x`                                                                                           | `RangeError` (must end with commit or abort).                                                                                                                      |

### Serializable (2PL)

| Case                      | Input                                                                                         | Expected                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Three readers, one writer | x = 1. T1 `read x, commit`; T2 `read x, commit`; T3 `write x 9, commit`; order T1 T2 T3 T1 T2 | 2 T3 WS on x with holders "T1, T2" · 3 T1 c (T3 still waits for T2) · 4 T2 c, →T3, w x 9. T3 has not committed; `complete` false. |
| Re-read under a held lock | x = 5. T1 `read x, read x, commit`; T2 `commit`; order T1 T1 T1 T2                            | Step 0 `read.shared`, step 1 `read` (no new lock), no `read.changed`.                                                             |
| Writer blocks a reader    | x = 5. T1 `write x 6, commit`; T2 `read x, commit`; order T1 T2 T1 T2                         | 1 T2 W(T1) · 2 T1 c, →T2 rs 6 · 3 T2 c.                                                                                           |

### Snapshot isolation

| Case                                 | Input                                                                              | Expected                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Repeatable reads                     | x = 50. T1 `read x, read x, commit`; T2 `write x 10, commit`; order T1 T2 T2 T1 T1 | Step 3: T1 reads 50 (`read.old`, current 10 by T2); `nonRepeatable` 0. Under Read Committed it reads 10. |
| Snapshot after a commit sees it      | x = 5. T1 `write x 6, commit`; T2 `read x, commit`; order T1 T1 T2 T2              | Step 2: T2 takes its snapshot after T1's commit and reads 6 (`read`).                                    |
| A writer whose holder aborts goes on | x = 5. T1 `write x 6, abort`; T2 `write x 7, commit`; order T1 T2 T1 T2            | 1 T2 W(T1) · 2 T1 a, →T2, w x 7 (no committed change after T2's snapshot) · 3 T2 c. Final 7.             |
| `check` without an earlier read      | T1 `check x ≥ 1, commit`                                                           | `RangeError`.                                                                                            |

## Properties for `src/engines/invariants.test.ts`

### Every level

On seeded random inputs (2–3 transactions, 1–3 items, random valid orders run to completion):

- No item ever has two uncommitted values (no dirty write), at any level.
- Under `read-committed`, every read of another transaction's data returns a committed value (`dirtyReads` is 0).
- Final values equal replaying, in commit order, each committed transaction's last value per item (aborted transactions leave no trace).
- A serial order (each transaction runs all its operations before the next starts) never blocks and shows no lost update, dirty read or non-repeatable read, at any level.
- No step ends with a cycle in the wait-for graph, and every random order can be run to the end (deadlocks are always broken, so nobody waits forever).

### Serializable (2PL)

On seeded random inputs under `serializable-2pl`, with random valid orders run to the end:

- `lostUpdates`, `dirtyReads` and `nonRepeatable` are 0.
- The final values equal running the committed transactions' scripts **one after another in commit order** from the initial values, computed by a small interpreter in the test (independent of the engine).
- No item ever has an exclusive holder together with a shared holder other than itself.

### Snapshot isolation

On seeded random inputs under `snapshot`, with random valid orders run to the end:

- `lostUpdates`, `dirtyReads` and `nonRepeatable` are 0.
- Every read of another transaction's data returns the item's committed value at the end of the step before the reader's `start` (checked against the trace's own earlier states).
- No two committed transactions whose lifetimes overlap (from `start` to commit) both wrote the same item (first updater wins).

## References

Listed in each lesson spec.
