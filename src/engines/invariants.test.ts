import { describe, expect, it } from "vitest";
import { simulate as translate } from "./address-translation/simulate";
import type { PageEntry } from "./address-translation/types";
import { simulate as boundedBuffer } from "./bounded-buffer/simulate";
import { simulate as fileSystem } from "./file-system/simulate";
import type { Operation as FsOperation } from "./file-system/types";
import { simulate as replace } from "./page-replacement/simulate";
import { algorithms } from "./page-replacement/types";
import { programFor, simulate as race } from "./race-conditions/simulate";
import { simulate as resourceGraph } from "./resource-graph/simulate";
import type { Operation as GraphOperation } from "./resource-graph/types";
import { simulate as transact } from "./transactions/simulate";
import {
  type ItemId,
  isolationLevels,
  itemIds,
  type TxInput,
  type Operation as TxOperation,
  type TxTrace,
} from "./transactions/types";

/**
 * Properties each topic guarantees in theory, checked on many seeded random inputs.
 * They do not come from any engine output: each one is a statement from the lesson specs
 * (docs/lessons/*.md) or a textbook result, and some use an independent brute-force oracle.
 */

/** Small deterministic generator (mulberry32), so failures are reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(list: readonly T[]) => list[int(0, list.length - 1)] as T;
  const shuffle = <T>(list: T[]) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = int(0, i);
      [list[i], list[j]] = [list[j] as T, list[i] as T];
    }
    return list;
  };
  return { int, pick, shuffle };
}

const RUNS = 300;

describe("race conditions (race-conditions)", () => {
  it("any interleaving: every store writes loaded + 1, and the result never exceeds the request", () => {
    const r = rng(1);
    for (let run = 0; run < RUNS; run++) {
      const threads = r.int(2, 3);
      const increments = r.int(1, 3);
      const length = programFor(increments, false).length;
      const order = r.shuffle(
        Array.from({ length: threads }, (_, i) => Array<string>(length).fill(`T${i + 1}`)).flat(),
      );
      const trace = race({
        threads,
        increments,
        atomic: false,
        schedule: { kind: "manual", order },
      });
      const { result } = trace;
      expect(result.complete).toBe(true);
      for (const w of result.writes) expect(w.value).toBe((w.loaded ?? 0) + 1);
      expect(result.final).toBeLessThanOrEqual(result.expected);
      expect(result.final).toBeGreaterThanOrEqual(increments >= 2 ? 2 : 1);
      // No stale store means no lost update (OSTEP §26.4).
      if (result.writes.every((w) => !w.stale)) expect(result.final).toBe(result.expected);
      // Atomic increments never lose an update, whatever the order.
      const atomicOrder = r.shuffle(
        Array.from({ length: threads }, (_, i) =>
          Array<string>(increments).fill(`T${i + 1}`),
        ).flat(),
      );
      const atomic = race({
        threads,
        increments,
        atomic: true,
        schedule: { kind: "manual", order: atomicOrder },
      });
      expect(atomic.result.final).toBe(atomic.result.expected);
    }
  });
});

describe("bounded buffer (mutex-semaphores)", () => {
  it("the correct version never deadlocks and keeps the semaphore invariants", () => {
    const r = rng(2);
    for (let run = 0; run < RUNS; run++) {
      const input = {
        producers: r.int(1, 2),
        consumers: r.int(1, 2),
        items: r.int(1, 4),
        capacity: r.int(1, 4),
        version: "correct" as const,
        quantum: r.pick([null, 1, 2, 3, 4, 5, 6]),
      };
      const trace = boundedBuffer(input);
      expect(trace.result.deadlock).toBe(false);
      expect(trace.result.completed).toBe(true);
      expect(trace.result.finalSems).toEqual({ empty: input.capacity, full: 0, mutex: 1 });
      expect(trace.result.consumed).toHaveLength(input.producers * input.items);
      for (const { state } of trace.steps) {
        const filled = state.buffer.filter((b) => b !== null).length;
        expect(filled).toBeLessThanOrEqual(input.capacity);
        expect(state.sems.mutex.value).toBeLessThanOrEqual(1);
        // Counters never hide slots: free + filled permits never exceed the capacity.
        expect(state.sems.empty.value + state.sems.full.value).toBeLessThanOrEqual(input.capacity);
        for (const s of Object.values(state.sems)) expect(s.value).toBeGreaterThanOrEqual(0);
      }
      // With one producer, items are consumed in the order they were produced (FIFO buffer).
      if (input.producers === 1) {
        expect(trace.result.consumed.map((c) => c.item)).toEqual(
          Array.from({ length: input.items }, (_, j) => `P1.${j + 1}`),
        );
      }
    }
  });

  it("when the swapped version deadlocks, a producer holds mutex while blocked on empty", () => {
    const r = rng(3);
    let deadlocks = 0;
    for (let run = 0; run < RUNS; run++) {
      const trace = boundedBuffer({
        producers: r.int(1, 2),
        consumers: r.int(1, 2),
        items: r.int(1, 4),
        capacity: r.int(1, 4),
        version: "swapped",
        quantum: r.pick([null, 1, 2, 3]),
      });
      if (!trace.result.deadlock) continue;
      deadlocks++;
      const last = trace.steps.at(-1)?.state;
      expect(last?.sems.mutex.value).toBe(0);
      expect(last?.threads.some((t) => t.role === "producer" && t.blockedOn === "empty")).toBe(
        true,
      );
    }
    expect(deadlocks).toBeGreaterThan(0);
  });
});

describe("resource graph (deadlock)", () => {
  function randomScript(r: ReturnType<typeof rng>, resources: number): GraphOperation[] {
    const want = r
      .shuffle(Array.from({ length: resources }, (_, i) => i + 1))
      .slice(0, r.int(1, 3));
    // acquires + releases + one work take 2·want + 1 slots; spare slots get optional work.
    let spare = 8 - (2 * want.length + 1);
    const ops: GraphOperation[] = [];
    for (const res of want) {
      ops.push({ op: "acquire", res });
      if (spare > 0 && r.int(0, 1)) {
        ops.push({ op: "work" });
        spare--;
      }
    }
    ops.push({ op: "work" });
    for (const res of r.shuffle([...want])) ops.push({ op: "release", res });
    return ops;
  }

  it("with single-instance resources, a stall happens exactly when a cycle formed", () => {
    const r = rng(4);
    let cycles = 0;
    for (let run = 0; run < RUNS; run++) {
      const resources = r.int(2, 5);
      const threads = Array.from({ length: r.int(2, 5) }, () => ({
        delay: r.int(0, 4),
        script: randomScript(r, resources),
      }));
      const trace = resourceGraph({ resources, threads, ordering: "script" });
      expect(trace.result.stalled).toBe(trace.result.deadlock);
      if (trace.result.deadlock) cycles++;
      // A global lock order breaks circular wait: it never deadlocks (Coffman).
      const ordered = resourceGraph({ resources, threads, ordering: "global" });
      expect(ordered.result.deadlock).toBe(false);
      expect(ordered.result.finishOrder).toHaveLength(threads.length);
    }
    expect(cycles).toBeGreaterThan(0);
  });
});

describe("address translation (paging)", () => {
  it("keeps the offset, the page table, the frames and the TLB consistent", () => {
    const r = rng(5);
    for (let run = 0; run < RUNS; run++) {
      const pageSize = r.pick([8, 16, 32, 64]);
      const frames = r.int(2, 6);
      const pageCount = r.int(2, 8);
      const freeFrames = r.shuffle(Array.from({ length: frames }, (_, i) => i));
      const pages: PageEntry[] = Array.from({ length: pageCount }, () => {
        const kind = r.pick(["frame", "disk", "disk", "invalid"] as const);
        const frame = kind === "frame" ? freeFrames.pop() : undefined;
        return frame === undefined
          ? { kind: kind === "frame" ? "disk" : kind }
          : { kind: "frame", frame };
      });
      const tlbSize = r.int(0, 4);
      const accesses = Array.from({ length: r.int(1, 10) }, () =>
        r.int(0, pageCount * pageSize - 1),
      );
      const trace = translate({ pageSize, pages, frames, tlbSize, accesses });
      const seen = new Set<number>();
      for (const { state } of trace.steps) {
        const a = state.access;
        expect(a.page).toBe(Math.floor(a.address / pageSize));
        if (a.phys !== null && a.frame !== null) {
          expect(a.phys % pageSize).toBe(a.address % pageSize);
          expect(state.frames[a.frame]).toBe(a.page);
        }
        if (a.outcome === "hit") expect(seen.has(a.page)).toBe(true);
        if (tlbSize === 0) expect(a.outcome).not.toBe("hit");
        expect(state.tlb.length).toBeLessThanOrEqual(tlbSize);
        // Every TLB entry and every page-table frame agree with what the frame holds.
        for (const e of state.tlb) expect(state.frames[e.frame]).toBe(e.page);
        state.pages.forEach((p, i) => {
          if (p.kind === "frame") expect(state.frames[p.frame]).toBe(i);
        });
        const held = state.frames.filter((p) => p !== null);
        expect(new Set(held).size).toBe(held.length);
        seen.add(a.page);
      }
    }
  });
});

describe("page replacement (page-replacement)", () => {
  /** Independent oracle: the fewest faults over every possible victim choice (exhaustive search). */
  function minimumFaults(refs: readonly number[], frames: number): number {
    const memo = new Map<string, number>();
    const go = (i: number, resident: number[]): number => {
      if (i === refs.length) return 0;
      const key = `${i}|${[...resident].sort().join(",")}`;
      const cached = memo.get(key);
      if (cached !== undefined) return cached;
      const page = refs[i] as number;
      let best: number;
      if (resident.includes(page)) best = go(i + 1, resident);
      else if (resident.length < frames) best = 1 + go(i + 1, [...resident, page]);
      else {
        best = Number.POSITIVE_INFINITY;
        for (const victim of resident) {
          best = Math.min(best, 1 + go(i + 1, [...resident.filter((p) => p !== victim), page]));
        }
      }
      memo.set(key, best);
      return best;
    };
    return go(0, []);
  }

  it("OPT matches the brute-force optimum and no algorithm beats it", () => {
    const r = rng(6);
    for (let run = 0; run < RUNS; run++) {
      const refs = Array.from({ length: r.int(1, 12) }, () => r.int(0, 5));
      const frames = r.int(1, 4);
      const opt = replace({ refs, frames, algorithm: "opt" }).result.faults;
      expect(opt).toBe(minimumFaults(refs, frames));
      for (const algorithm of algorithms) {
        const { faults, compulsory } = replace({ refs, frames, algorithm }).result;
        expect(faults).toBeGreaterThanOrEqual(opt);
        expect(faults).toBeGreaterThanOrEqual(compulsory);
      }
    }
  });

  it("LRU and OPT are stack algorithms: more frames never add faults", () => {
    const r = rng(7);
    for (let run = 0; run < RUNS; run++) {
      const refs = Array.from({ length: r.int(1, 20) }, () => r.int(0, 9));
      for (const algorithm of ["lru", "opt"] as const) {
        const faults = [1, 2, 3, 4, 5, 6].map(
          (frames) => replace({ refs, frames, algorithm }).result.faults,
        );
        for (let k = 1; k < faults.length; k++) {
          expect(faults[k]).toBeLessThanOrEqual(faults[k - 1] as number);
        }
      }
      const distinct = new Set(refs).size;
      if (distinct <= 6) {
        for (const algorithm of algorithms) {
          expect(replace({ refs, frames: 6, algorithm }).result.faults).toBe(distinct);
        }
      }
    }
  });
});

describe("file system (inodes-links)", () => {
  it("link counts, bitmaps and contents stay consistent under any script", () => {
    const r = rng(8);
    const names = ["a", "b", "c", "d"];
    for (let run = 0; run < RUNS; run++) {
      const script: FsOperation[] = Array.from({ length: r.int(1, 12) }, () => {
        const name = r.pick(names);
        switch (r.int(0, 9)) {
          case 0:
            return { op: "create", name };
          case 1:
            return { op: "write", name, text: "abcdefghijkl".slice(0, r.int(0, 12)) };
          case 2:
            return { op: "link", name, to: r.pick(names) };
          case 3:
            return { op: "symlink", target: r.pick(names), name };
          case 4:
            return { op: "unlink", name };
          case 5:
            return { op: "open", name };
          case 6:
            return { op: "close", fd: r.int(3, 5) };
          case 7:
            return { op: "cat", name };
          case 8:
            return { op: "read", fd: r.int(3, 5) };
          default:
            return { op: "rename", name, to: r.pick(names) };
        }
      });
      const trace = fileSystem({ script });
      const written = new Map<number, string>();
      trace.steps.forEach(({ state, explain }, t) => {
        const inodes = state.inodes;
        inodes.forEach((node, i) => {
          if (!node || node.type === "dir") return;
          // The link count is the number of directory entries naming the inode.
          expect(node.links).toBe(state.entries.filter((e) => e.inode === i).length);
          // An inode with no names survives only while it is open.
          if (node.links === 0) expect(node.open).toBeGreaterThan(0);
          expect(node.open).toBe(state.fds.filter((f) => f.inode === i).length);
          // Size matches the data stored in its blocks.
          expect(node.blocks.map((b) => state.blocks[b] ?? "").join("").length).toBe(
            node.type === "symlink" ? 0 : node.size,
          );
        });
        // Every used data block belongs to exactly one inode, and no free block is referenced.
        const owned = inodes.flatMap((n) => (n && n.type !== "dir" ? n.blocks : []));
        expect(new Set(owned).size).toBe(owned.length);
        state.blocks.forEach((b, i) => {
          if (i > 0) expect(b !== null).toBe(owned.includes(i));
        });
        for (const e of state.entries) expect(inodes[e.inode]).not.toBeNull();
        // Reads return the last text written to that inode.
        for (const e of explain) {
          if (e.key === "write") written.set(e.params.inode, (script[t] as { text: string }).text);
          if (e.key === "cat" || e.key === "cat.via" || e.key === "read") {
            expect(e.params.content).toBe(written.get(e.params.inode) ?? "");
          }
          if (e.key === "unlink.free" || e.key === "close.free" || e.key === "unlink.symlink") {
            written.delete(e.params.inode);
          }
        }
      });
    }
  });
});

describe("transactions (isolation-anomalies)", () => {
  function randomScript(r: ReturnType<typeof rng>, items: number): TxOperation[] {
    const ops: TxOperation[] = [];
    const read = new Set<ItemId>();
    const length = r.int(0, 4);
    for (let k = 0; k < length; k++) {
      const item = itemIds[r.int(0, items - 1)] as ItemId;
      const kind = r.int(0, read.has(item) ? 4 : 3);
      if (kind === 0 || kind === 1) {
        ops.push({ op: kind === 0 ? "read" : "readForUpdate", item });
        read.add(item);
      } else if (kind === 2) ops.push({ op: "write", item, value: r.int(0, 999) });
      else if (kind === 3) ops.push({ op: "add", item, delta: r.int(-9, 9) });
      else ops.push({ op: "writeFromRead", item, delta: r.int(-9, 9) });
    }
    ops.push({ op: r.int(0, 4) === 0 ? "abort" : "commit" });
    return ops;
  }

  /** Grows the order one turn at a time, choosing among transactions neither ended nor blocked. */
  function runToEnd(r: ReturnType<typeof rng>, base: Omit<TxInput, "order">): TxTrace {
    const order: string[] = [];
    for (;;) {
      const trace = transact({ ...base, order });
      const last = trace.steps.at(-1)?.state.transactions;
      const ready = last
        ? last.filter((x) => x.status === "active").map((x) => x.id)
        : base.transactions.map((_, i) => `T${i + 1}`);
      if (ready.length === 0) return trace;
      order.push(r.pick(ready));
    }
  }

  function randomInput(r: ReturnType<typeof rng>): Omit<TxInput, "order"> {
    const items = r.int(1, 3);
    return {
      items: Array.from({ length: items }, () => r.int(0, 999)),
      transactions: Array.from({ length: r.int(2, 3) }, () => randomScript(r, items)),
      isolation: r.pick(isolationLevels),
    };
  }

  it("always runs to the end: no dirty write, no leftover cycle, no stall", () => {
    const r = rng(7);
    let deadlocks = 0;
    for (let run = 0; run < RUNS; run++) {
      const trace = runToEnd(r, randomInput(r));
      // Every transaction ended: deadlocks are always broken, so the generator never got stuck.
      expect(trace.result.complete).toBe(true);
      deadlocks += trace.result.deadlocks.length;
      for (const { state } of trace.steps) {
        for (const it of state.items) {
          // An uncommitted value belongs to the lock holder: no second writer (P0).
          if (it.pending) expect(it.pending.tx).toBe(it.holder);
        }
        // No cycle in the wait-for graph survives a step.
        for (const start of state.transactions) {
          let current = start;
          for (let hops = 0; hops <= state.transactions.length; hops++) {
            const holder = state.items.find((it) => it.id === current.waitsFor)?.holder;
            const next = state.transactions.find((x) => x.id === holder);
            if (!next) break;
            expect(next.id).not.toBe(start.id);
            current = next;
          }
        }
      }
    }
    expect(deadlocks).toBeGreaterThan(0);
  });

  it("Read Committed never returns another transaction's uncommitted value", () => {
    const r = rng(8);
    for (let run = 0; run < RUNS; run++) {
      const trace = runToEnd(r, { ...randomInput(r), isolation: "read-committed" });
      expect(trace.result.dirtyReads).toBe(0);
      for (const read of trace.result.reads) {
        if (read.kind === "committed") expect(read.value).toBe(read.committed);
      }
    }
  });

  it("final values come only from committed transactions, the last committer of each item winning", () => {
    const r = rng(9);
    for (let run = 0; run < RUNS; run++) {
      const input = randomInput(r);
      const { result } = runToEnd(r, input);
      const expected = [...input.items];
      for (const tx of result.committed) {
        for (const write of result.writes.filter((x) => x.tx === tx)) {
          expected[itemIds.indexOf(write.item)] = write.value;
        }
      }
      expect(result.final).toEqual(expected);
    }
  });

  it("a serial order (one transaction at a time) shows no anomaly at any level", () => {
    const r = rng(10);
    for (let run = 0; run < RUNS; run++) {
      const input = randomInput(r);
      const order = r
        .shuffle(input.transactions.map((_, i) => i))
        .flatMap((i) => Array<string>(input.transactions[i]?.length ?? 0).fill(`T${i + 1}`));
      const { result } = transact({ ...input, order });
      expect(result.complete).toBe(true);
      expect(result.blocks).toEqual([]);
      expect(result.lostUpdates + result.dirtyReads + result.nonRepeatable).toBe(0);
    }
  });

  /** Runs scripts one after another from the initial values: an oracle independent of the engine. */
  function serially(initial: readonly number[], scripts: readonly (readonly TxOperation[])[]) {
    let values = [...initial];
    for (const script of scripts) {
      const read = new Map<ItemId, number>();
      // Each script works on a copy, kept only if it reaches COMMIT (a failed check rolls back).
      const draft = [...values];
      let keep = true;
      for (const op of script) {
        if (op.op === "commit" || op.op === "abort") {
          keep = keep && op.op === "commit";
          break;
        }
        if (op.op === "check") {
          const sum = op.items.reduce((acc, i) => acc + (read.get(i) ?? 0), 0);
          if (sum < op.atLeast) {
            keep = false;
            break;
          }
          continue;
        }
        const k = itemIds.indexOf(op.item);
        const now = draft[k] ?? 0;
        if (op.op === "read" || op.op === "readForUpdate") read.set(op.item, now);
        else if (op.op === "write") draft[k] = op.value;
        else if (op.op === "add") draft[k] = now + op.delta;
        else draft[k] = (read.get(op.item) ?? 0) + op.delta;
      }
      if (keep) values = draft;
    }
    return values;
  }

  it("two-phase locking: no anomaly, and the result equals running the committed ones serially in commit order", () => {
    const r = rng(11);
    let aborts = 0;
    for (let run = 0; run < RUNS; run++) {
      const input = { ...randomInput(r), isolation: "serializable-2pl" as const };
      const trace = runToEnd(r, input);
      const { result } = trace;
      expect(result.complete).toBe(true);
      expect(result.lostUpdates + result.dirtyReads + result.nonRepeatable).toBe(0);
      const scripts = result.committed.map(
        (id) => input.transactions[Number(id.slice(1)) - 1] as readonly TxOperation[],
      );
      expect(result.final).toEqual(serially(input.items, scripts));
      aborts += result.aborted.length;
      for (const { state } of trace.steps) {
        for (const it of state.items) {
          // An exclusive holder never shares the item with another reader.
          if (it.holder) expect(it.readers.filter((x) => x !== it.holder)).toEqual([]);
        }
      }
    }
    expect(aborts).toBeGreaterThan(0);
  });

  it("snapshot: reads see the state before the reader started, and concurrent writers never both commit the same item", () => {
    const r = rng(12);
    for (let run = 0; run < RUNS; run++) {
      const input = { ...randomInput(r), isolation: "snapshot" as const };
      const trace = runToEnd(r, input);
      const { result } = trace;
      expect(result.complete).toBe(true);
      expect(result.lostUpdates + result.dirtyReads + result.nonRepeatable).toBe(0);
      const startOf = (tx: string) =>
        trace.steps.at(-1)?.state.transactions.find((x) => x.id === tx)?.start ?? 0;
      const committedAt = (step: number, item: ItemId) => {
        const k = itemIds.indexOf(item);
        return step < 0 ? (input.items[k] ?? 0) : trace.steps[step]?.state.items[k]?.committed;
      };
      for (const read of result.reads) {
        if (read.kind === "committed") {
          expect(read.value).toBe(committedAt(startOf(read.tx) - 1, read.item));
        }
      }
      // First updater wins: committed transactions with overlapping lives wrote different items.
      const commitStep = new Map<string, number>();
      trace.steps.forEach((s, k) => {
        for (const e of s.explain) if (e.key === "commit") commitStep.set(e.params.tx, k);
      });
      const wrote = (tx: string) =>
        new Set(result.writes.filter((w) => w.tx === tx).map((w) => w.item));
      for (const a of result.committed) {
        for (const b of result.committed) {
          if (a >= b) continue;
          const overlap =
            startOf(a) < (commitStep.get(b) ?? 0) && startOf(b) < (commitStep.get(a) ?? 0);
          if (!overlap) continue;
          const shared = [...wrote(a)].filter((i) => wrote(b).has(i));
          expect(shared).toEqual([]);
        }
      }
    }
  });
});
