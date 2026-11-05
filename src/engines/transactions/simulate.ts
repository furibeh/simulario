import {
  type BlockRecord,
  type DeadlockRecord,
  type ItemId,
  isolationLevels,
  itemIds,
  type LastRead,
  limits,
  type Operation,
  type ReadKind,
  type ReadRecord,
  type Segment,
  type TxExplanation,
  type TxInput,
  type TxStep,
  type TxTrace,
  type VersionId,
  type WriteRecord,
} from "./types";

interface Item {
  id: ItemId;
  committed: number;
  version: VersionId;
  committedBy: string | null;
  pending: { tx: string; value: number; version: VersionId } | null;
  holder: string | null;
  /** Shared lock holders, kept in id order. */
  readers: string[];
  queue: string[];
}

type Mode = "S" | "X";

interface Tx {
  id: string;
  script: readonly Operation[];
  status: "active" | "blocked" | "committed" | "aborted";
  pc: number;
  waitsFor: ItemId | null;
  lastReads: Map<ItemId, LastRead>;
}

const inRange = (v: number, r: { min: number; max: number }) =>
  Number.isInteger(v) && v >= r.min && v <= r.max;

/** Throws a RangeError describing the first invalid field. Rules: docs/lessons/isolation-anomalies.md. */
export function assertValidInput(input: TxInput): void {
  if (!inRange(input.items.length, limits.items)) throw new RangeError("Invalid item count");
  if (!input.items.every((v) => inRange(v, limits.value))) {
    throw new RangeError("Invalid initial value");
  }
  if (!inRange(input.transactions.length, limits.transactions)) {
    throw new RangeError("Invalid transaction count");
  }
  if (!(isolationLevels as readonly string[]).includes(input.isolation)) {
    throw new RangeError("Invalid isolation level");
  }
  if (!inRange(input.order.length, limits.order)) throw new RangeError("Invalid order length");
  const known = itemIds.slice(0, input.items.length) as readonly string[];
  input.transactions.forEach((script, i) => {
    const id = `T${i + 1}`;
    if (!inRange(script.length, limits.script))
      throw new RangeError(`${id}: invalid script length`);
    const read = new Set<string>();
    script.forEach((op, k) => {
      const last = k === script.length - 1;
      if (op.op === "commit" || op.op === "abort") {
        if (!last) throw new RangeError(`${id}: ${op.op} before the end of the script`);
        return;
      }
      if (last) throw new RangeError(`${id}: the script must end with commit or abort`);
      if (!known.includes(op.item)) throw new RangeError(`${id}: unknown item ${op.item}`);
      if (op.op === "write" && !inRange(op.value, limits.value)) {
        throw new RangeError(`${id}: invalid value`);
      }
      if ((op.op === "writeFromRead" || op.op === "add") && !inRange(op.delta, limits.delta)) {
        throw new RangeError(`${id}: invalid delta`);
      }
      if (op.op === "writeFromRead" && !read.has(op.item)) {
        throw new RangeError(`${id}: writeFromRead ${op.item} without an earlier read`);
      }
      if (op.op === "read" || op.op === "readForUpdate") read.add(op.item);
    });
  });
}

/** Simulates transactions on a few data items, one operation per step. Pure. */
export function simulate(input: TxInput): TxTrace {
  assertValidInput(input);
  const twoPhase = input.isolation === "serializable-2pl";
  const items: Item[] = input.items.map((value, i) => ({
    id: itemIds[i] as ItemId,
    committed: value,
    version: "init",
    committedBy: null,
    pending: null,
    holder: null,
    readers: [],
    queue: [],
  }));
  const txs: Tx[] = input.transactions.map((script, i) => ({
    id: `T${i + 1}`,
    script,
    status: "active",
    pc: 0,
    waitsFor: null,
    lastReads: new Map(),
  }));
  const item = (id: ItemId) => items.find((it) => it.id === id) as Item;
  const tx = (id: string) => txs.find((x) => x.id === id) as Tx;
  const finished = (x: Tx) => x.status === "committed" || x.status === "aborted";
  const byId = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

  /** Lock an operation needs: reads lock only under two-phase locking. */
  const modeFor = (op: Operation): Mode | null =>
    op.op === "commit" || op.op === "abort"
      ? null
      : op.op === "read"
        ? twoPhase
          ? "S"
          : null
        : "X";
  /** Other transactions whose locks on the item conflict with x asking for mode, in id order. */
  const conflicts = (x: Tx, it: Item, mode: Mode): string[] => {
    const others = it.holder !== null && it.holder !== x.id ? [it.holder] : [];
    if (mode === "X") others.push(...it.readers.filter((r) => r !== x.id));
    return others.sort(byId);
  };
  const holds = (x: Tx, it: Item, mode: Mode) =>
    it.holder === x.id || (mode === "S" && it.readers.includes(x.id));

  const steps: TxStep[] = [];
  const reads: ReadRecord[] = [];
  const writes: WriteRecord[] = [];
  const blocks: BlockRecord[] = [];
  const deadlocks: DeadlockRecord[] = [];
  const committed: string[] = [];
  const aborted: string[] = [];
  let nonRepeatable = 0;

  input.order.forEach((id, t) => {
    const self = txs.find((x) => x.id === id);
    if (!self) throw new RangeError(`Step ${t}: unknown transaction ${id}`);
    if (finished(self)) throw new RangeError(`Step ${t}: ${id} has already ended`);
    if (self.status === "blocked") throw new RangeError(`Step ${t}: ${id} is waiting for a lock`);
    const explain: TxExplanation[] = [];

    /** how: "plain" a read with no new lock, "shared" one that just took S, "lock" FOR UPDATE. */
    const readItem = (x: Tx, it: Item, how: "plain" | "shared" | "lock") => {
      const p = it.pending;
      let value: number;
      let version: VersionId;
      let kind: ReadKind;
      if (p && p.tx === x.id) {
        ({ value, version } = p);
        kind = "own";
        explain.push({
          key: how === "lock" ? "read.lock" : "read.own",
          params: { tx: x.id, item: it.id, value },
        });
      } else if (p && input.isolation === "read-uncommitted") {
        ({ value, version } = p);
        kind = "dirty";
        explain.push({ key: "read.dirty", params: { tx: x.id, item: it.id, value, writer: p.tx } });
      } else {
        value = it.committed;
        version = it.version;
        kind = "committed";
        if (how === "lock") {
          explain.push({ key: "read.lock", params: { tx: x.id, item: it.id, value } });
        } else if (how === "shared") {
          explain.push({ key: "read.shared", params: { tx: x.id, item: it.id, value } });
        } else if (p) {
          explain.push({
            key: "read.hidden",
            params: { tx: x.id, item: it.id, value, writer: p.tx, pending: p.value },
          });
        } else explain.push({ key: "read", params: { tx: x.id, item: it.id, value } });
      }
      const prev = x.lastReads.get(it.id);
      if (prev && prev.kind !== "own" && kind !== "own" && prev.version !== version) {
        nonRepeatable++;
        explain.push({
          key: "read.changed",
          params: { tx: x.id, item: it.id, before: prev.value, value },
        });
      }
      x.lastReads.set(it.id, { item: it.id, value, version, kind });
      reads.push({
        step: t,
        tx: x.id,
        item: it.id,
        value,
        kind,
        committed: it.committed,
        writer: kind === "dirty" && p ? p.tx : null,
      });
    };

    /** Runs an operation whose lock (if any) is held; `took` is the lock it just acquired. */
    const perform = (x: Tx, op: Operation, took: Mode | null) => {
      if (op.op === "commit" || op.op === "abort") return;
      const it = item(op.item);
      const own = it.pending?.tx === x.id ? it.pending : null;
      const version = `w${t}`;
      switch (op.op) {
        case "read":
          readItem(x, it, took === "S" ? "shared" : "plain");
          return;
        case "readForUpdate":
          readItem(x, it, "lock");
          return;
        case "write":
          explain.push({ key: "write", params: { tx: x.id, item: it.id, value: op.value } });
          it.pending = { tx: x.id, value: op.value, version };
          writes.push({ step: t, tx: x.id, item: it.id, value: op.value, stale: false });
          return;
        case "writeFromRead": {
          const last = x.lastReads.get(it.id) as LastRead;
          const value = last.value + op.delta;
          explain.push({
            key: "write.computed",
            params: { tx: x.id, item: it.id, value, read: last.value, delta: op.delta },
          });
          const stale = last.kind === "committed" && last.version !== it.version;
          if (stale) {
            explain.push({
              key: "write.stale",
              params: {
                tx: x.id,
                item: it.id,
                read: last.value,
                current: it.committed,
                by: it.committedBy ?? "",
              },
            });
          }
          it.pending = { tx: x.id, value, version };
          writes.push({ step: t, tx: x.id, item: it.id, value, stale });
          return;
        }
        case "add": {
          const before = own ? own.value : it.committed;
          const value = before + op.delta;
          explain.push({
            key: "add",
            params: { tx: x.id, item: it.id, before, delta: op.delta, value },
          });
          it.pending = { tx: x.id, value, version };
          writes.push({ step: t, tx: x.id, item: it.id, value, stale: false });
          return;
        }
      }
    };

    /** Gives x the lock (upgrading S to X if needed) and runs its operation. */
    const grant = (x: Tx, it: Item, op: Operation, mode: Mode) => {
      if (mode === "X") {
        if (it.readers.includes(x.id)) {
          it.readers = it.readers.filter((r) => r !== x.id);
          explain.push({ key: "lock.upgrade", params: { tx: x.id, item: it.id } });
        }
        it.holder = x.id;
      } else it.readers = [...it.readers, x.id].sort(byId);
      perform(x, op, mode);
    };

    /** Releases every lock of x in item order; compatible waiters at the head get theirs. */
    const release = (x: Tx) => {
      for (const it of items) {
        if (it.holder !== x.id && !it.readers.includes(x.id)) continue;
        if (it.holder === x.id) it.holder = null;
        it.readers = it.readers.filter((r) => r !== x.id);
        for (;;) {
          const next = it.queue[0];
          if (next === undefined) break;
          const waiter = tx(next);
          const op = waiter.script[waiter.pc] as Operation;
          const mode = modeFor(op) as Mode;
          if (conflicts(waiter, it, mode).length > 0) break;
          it.queue.shift();
          waiter.status = "active";
          waiter.waitsFor = null;
          explain.push({ key: "handoff", params: { tx: x.id, item: it.id, to: waiter.id } });
          grant(waiter, it, op, mode);
          waiter.pc++;
        }
      }
    };

    const end = (x: Tx, outcome: "committed" | "aborted") => {
      for (const it of items) {
        if (it.pending?.tx !== x.id) continue;
        if (outcome === "committed") {
          it.committed = it.pending.value;
          it.version = it.pending.version;
          it.committedBy = x.id;
        }
        it.pending = null;
      }
      x.status = outcome;
      (outcome === "committed" ? committed : aborted).push(x.id);
      release(x);
    };

    /**
     * Depth-first search of the wait-for graph from x: each blocked transaction waits for every
     * conflicting holder of the item it asked for, visited in id order. Returns the first path
     * that comes back to x, written "x → item → U → … → x".
     */
    const cycleFrom = (x: Tx): string | null => {
      const visit = (u: Tx, path: string[], seen: Set<string>): string | null => {
        if (u.waitsFor === null) return null;
        const it = item(u.waitsFor);
        const op = u.script[u.pc] as Operation;
        for (const b of conflicts(u, it, modeFor(op) as Mode)) {
          if (b === x.id) return [...path, it.id, b].join(" → ");
          if (seen.has(b)) continue;
          seen.add(b);
          const found = visit(tx(b), [...path, it.id, b], seen);
          if (found) return found;
        }
        return null;
      };
      return visit(x, [x.id], new Set([x.id]));
    };

    const op = self.script[self.pc] as Operation;
    const mode = modeFor(op);
    if (op.op === "commit" || op.op === "abort") {
      self.pc++;
      explain.push({ key: op.op, params: { tx: self.id } });
      end(self, op.op === "commit" ? "committed" : "aborted");
    } else if (mode === null || holds(self, item(op.item), mode)) {
      perform(self, op, null);
      self.pc++;
    } else {
      const it = item(op.item);
      const others = conflicts(self, it, mode);
      if (others.length === 0) {
        grant(self, it, op, mode);
        self.pc++;
      } else {
        if (it.holder !== null && it.holder !== self.id) {
          explain.push({
            key: "lock.wait",
            params: { tx: self.id, item: it.id, holder: it.holder },
          });
        } else {
          explain.push({
            key: "lock.wait.shared",
            params: { tx: self.id, item: it.id, holders: others.join(", ") },
          });
        }
        blocks.push({ step: t, tx: self.id, item: it.id, holder: others.join(", ") });
        self.status = "blocked";
        self.waitsFor = it.id;
        it.queue.push(self.id);
        const path = cycleFrom(self);
        if (path !== null) {
          it.queue = it.queue.filter((q) => q !== self.id);
          self.waitsFor = null;
          explain.push({ key: "deadlock", params: { tx: self.id, path } });
          deadlocks.push({ step: t, victim: self.id, path });
          self.pc = self.script.length;
          end(self, "aborted");
        }
      }
    }

    steps.push({
      t,
      state: {
        items: items.map((it) => ({
          id: it.id,
          committed: it.committed,
          version: it.version,
          committedBy: it.committedBy,
          pending: it.pending ? { tx: it.pending.tx, value: it.pending.value } : null,
          holder: it.holder,
          readers: [...it.readers],
          queue: [...it.queue],
        })),
        transactions: txs.map((x) => ({
          id: x.id,
          status: x.status,
          pc: x.pc,
          waitsFor: x.waitsFor,
          lastReads: itemIds.flatMap((i) => {
            const r = x.lastReads.get(i);
            return r ? [{ ...r }] : [];
          }),
        })),
        ran: self.id,
      },
      explain,
    });
  });

  const segments: Segment[] = [];
  steps.forEach((s, t) => {
    const last = segments.at(-1);
    if (last && last.id === s.state.ran && last.end === t) last.end = t + 1;
    else segments.push({ id: s.state.ran, start: t, end: t + 1 });
  });

  return {
    steps,
    result: {
      final: items.map((it) => it.committed),
      committed,
      aborted,
      complete: txs.every(finished),
      steps: steps.length,
      reads,
      writes,
      lostUpdates: writes.filter((w) => w.stale && committed.includes(w.tx)).length,
      dirtyReads: reads.filter((r) => r.kind === "dirty").length,
      dirtyAborted: reads.filter((r) => r.kind === "dirty" && aborted.includes(r.writer ?? ""))
        .length,
      nonRepeatable,
      blocks,
      deadlocks,
      segments,
    },
  };
}
