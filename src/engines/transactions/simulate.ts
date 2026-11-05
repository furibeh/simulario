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
  queue: string[];
}

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
  const items: Item[] = input.items.map((value, i) => ({
    id: itemIds[i] as ItemId,
    committed: value,
    version: "init",
    committedBy: null,
    pending: null,
    holder: null,
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

    const readItem = (x: Tx, it: Item, locked: boolean) => {
      const p = it.pending;
      let value: number;
      let version: VersionId;
      let kind: ReadKind;
      if (p && p.tx === x.id) {
        ({ value, version } = p);
        kind = "own";
        explain.push({
          key: locked ? "read.lock" : "read.own",
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
        if (locked) explain.push({ key: "read.lock", params: { tx: x.id, item: it.id, value } });
        else if (p) {
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

    /** Runs a locking operation once its transaction holds the item's lock. */
    const perform = (x: Tx, op: Operation) => {
      if (op.op === "commit" || op.op === "abort" || op.op === "read") return;
      const it = item(op.item);
      const own = it.pending?.tx === x.id ? it.pending : null;
      const version = `w${t}`;
      switch (op.op) {
        case "readForUpdate":
          readItem(x, it, true);
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

    /** Releases every lock of x in item order; each first waiter gets it and runs its operation. */
    const release = (x: Tx) => {
      for (const it of items) {
        if (it.holder !== x.id) continue;
        const next = it.queue.shift();
        if (next === undefined) {
          it.holder = null;
          continue;
        }
        const waiter = tx(next);
        it.holder = waiter.id;
        waiter.status = "active";
        waiter.waitsFor = null;
        explain.push({ key: "handoff", params: { tx: x.id, item: it.id, to: waiter.id } });
        perform(waiter, waiter.script[waiter.pc] as Operation);
        waiter.pc++;
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

    /** Follows "waits for item, held by U" from x; returns the path if it comes back to x. */
    const cycleFrom = (x: Tx): string | null => {
      const parts = [x.id];
      let current = x;
      for (let hops = 0; hops < txs.length; hops++) {
        if (current.waitsFor === null) return null;
        const it = item(current.waitsFor);
        if (it.holder === null) return null;
        parts.push(it.id, it.holder);
        if (it.holder === x.id) return parts.join(" → ");
        current = tx(it.holder);
      }
      return null;
    };

    const op = self.script[self.pc] as Operation;
    switch (op.op) {
      case "read":
        readItem(self, item(op.item), false);
        self.pc++;
        break;
      case "commit":
        self.pc++;
        explain.push({ key: "commit", params: { tx: self.id } });
        end(self, "committed");
        break;
      case "abort":
        self.pc++;
        explain.push({ key: "abort", params: { tx: self.id } });
        end(self, "aborted");
        break;
      default: {
        const it = item(op.item);
        if (it.holder !== null && it.holder !== self.id) {
          explain.push({
            key: "lock.wait",
            params: { tx: self.id, item: it.id, holder: it.holder },
          });
          blocks.push({ step: t, tx: self.id, item: it.id, holder: it.holder });
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
        } else {
          it.holder = self.id;
          perform(self, op);
          self.pc++;
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
