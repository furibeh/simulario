import { describe, expect, it } from "vitest";
import { simulate as translate } from "./address-translation/simulate";
import {
  simulate as boundedBuffer,
  consumerProgram,
  producerProgram,
} from "./bounded-buffer/simulate";
import { simulate as fileSystem } from "./file-system/simulate";
import { simulate as replace } from "./page-replacement/simulate";
import { simulate as race } from "./race-conditions/simulate";
import { philosophers } from "./resource-graph/presets";
import { simulate as resourceGraph } from "./resource-graph/simulate";
import { presets as txPresets } from "./transactions/presets";
import { simulate as transact } from "./transactions/simulate";
import type { Isolation, Operation as TxOperation } from "./transactions/types";

/**
 * External cross-check, operating systems: traces published in Arpaci-Dusseau and Arpaci-Dusseau, "Operating Systems:
 * Three Easy Pieces" (v1.10), transcribed from the book's figures, not from any engine output.
 * https://pages.cs.wisc.edu/~remzi/OSTEP/
 */

describe("OSTEP ch. 22, Figures 22.1, 22.2 and 22.5 (refs 0 1 2 0 1 3 0 3 1 2 1, cache of 3)", () => {
  const refs = [0, 1, 2, 0, 1, 3, 0, 3, 1, 2, 1];
  const marks = (algorithm: "opt" | "fifo" | "lru") =>
    replace({ refs, frames: 3, algorithm }).result.records.map((r) => (r.hit ? "Hit" : "Miss"));
  const evictions = (algorithm: "opt" | "fifo" | "lru") =>
    replace({ refs, frames: 3, algorithm }).result.records.flatMap((r) =>
      r.victim === null ? [] : [r.victim],
    );

  it("Figure 22.1, optimal: 6 hits; first victim 2; the second is a tie", () => {
    expect(marks("opt")).toEqual("Miss Miss Miss Hit Hit Miss Hit Hit Hit Miss Hit".split(" "));
    // At reference 10 pages 0 and 3 are never used again. The book evicts 3; the lesson's rule
    // (docs/lessons/page-replacement.md) breaks ties by the lowest slot and evicts 0. Both are
    // optimal and give the same hits and misses.
    const [first, second] = evictions("opt");
    expect(first).toBe(2);
    expect([0, 3]).toContain(second);
  });

  it("Figure 22.2, FIFO: 4 hits, evicts 0 1 2 3, queue states as printed", () => {
    const trace = replace({ refs, frames: 3, algorithm: "fifo" });
    expect(marks("fifo")).toEqual("Miss Miss Miss Hit Hit Miss Miss Hit Miss Miss Hit".split(" "));
    expect(evictions("fifo")).toEqual([0, 1, 2, 3]);
    expect(trace.steps.map((s) => s.state.queue.join(","))).toEqual([
      "0",
      "0,1",
      "0,1,2",
      "0,1,2",
      "0,1,2",
      "1,2,3",
      "2,3,0",
      "2,3,0",
      "3,0,1",
      "0,1,2",
      "0,1,2",
    ]);
  });

  it("Figure 22.5, LRU: 6 hits, evicts 2 then 0, recency states as printed", () => {
    const trace = replace({ refs, frames: 3, algorithm: "lru" });
    expect(marks("lru")).toEqual("Miss Miss Miss Hit Hit Miss Hit Hit Hit Miss Hit".split(" "));
    expect(evictions("lru")).toEqual([2, 0]);
    expect(trace.steps.map((s) => s.state.recency.join(","))).toEqual([
      "0",
      "0,1",
      "0,1,2",
      "1,2,0",
      "2,0,1",
      "0,1,3",
      "1,3,0",
      "1,0,3",
      "0,3,1",
      "3,1,2",
      "3,2,1",
    ]);
  });
});

describe("OSTEP ch. 26, Figure 26.7 (the lost update, counter shifted from 50 to 0)", () => {
  it("T1 loads and adds, is interrupted, T2 runs a whole increment, T1 stores the same value", () => {
    // The figure starts at 50: T1 mov/add (51 in its register), interrupt, T2 mov/add/mov (stores 51),
    // T1 mov (stores 51 again). One increment is lost.
    const trace = race({
      threads: 2,
      increments: 1,
      atomic: false,
      schedule: { kind: "manual", order: ["T1", "T1", "T2", "T2", "T2", "T1"] },
    });
    expect(trace.steps.map((s) => s.state.counter)).toEqual([0, 0, 0, 0, 1, 1]);
    expect(trace.result.writes.map((w) => [w.id, w.value, w.stale])).toEqual([
      ["T2", 1, false],
      ["T1", 1, true],
    ]);
    expect(trace.result.final).toBe(1);
    expect(trace.result.lost).toBe(1);
  });
});

describe("OSTEP ch. 19, §19.2 (an array of ten 4-byte ints from address 100, 16-byte pages)", () => {
  it("TLB activity: miss, hit, hit, miss, hit, hit, hit, miss, hit, hit (70%)", () => {
    // The book's array spans VPNs 6, 7 and 8 of a 256-byte space; this engine allows 8 pages, so
    // every address is shifted down by 32 bytes (two pages): VPNs 4, 5, 6, same offsets.
    const trace = translate({
      pageSize: 16,
      pages: [
        { kind: "invalid" },
        { kind: "invalid" },
        { kind: "invalid" },
        { kind: "invalid" },
        { kind: "frame", frame: 0 },
        { kind: "frame", frame: 1 },
        { kind: "frame", frame: 2 },
        { kind: "invalid" },
      ],
      frames: 4,
      tlbSize: 4,
      accesses: Array.from({ length: 10 }, (_, i) => 100 - 32 + 4 * i),
    });
    expect(trace.result.accesses.map((a) => a.outcome)).toEqual(
      "miss hit hit miss hit hit hit miss hit hit".split(" "),
    );
    expect(trace.result.accesses.map((a) => a.page + 2)).toEqual([6, 6, 6, 7, 7, 7, 7, 8, 8, 8]);
    expect(trace.result.hits / trace.result.accesses.length).toBe(0.7);
  });
});

describe("OSTEP ch. 31, Figure 31.12 and the walkthrough of §31.4 (MAX = 1)", () => {
  it("the correct program is the one in Figure 31.12", () => {
    expect(producerProgram(1, "correct")).toEqual([
      { op: "wait", sem: "empty" },
      { op: "wait", sem: "mutex" },
      { op: "put" },
      { op: "signal", sem: "mutex" },
      { op: "signal", sem: "full" },
    ]);
    expect(consumerProgram(1)).toEqual([
      { op: "wait", sem: "full" },
      { op: "wait", sem: "mutex" },
      { op: "take" },
      { op: "signal", sem: "mutex" },
      { op: "signal", sem: "empty" },
    ]);
  });

  it("a producer that keeps running blocks on empty at its second wait", () => {
    // "If the producer continues to run, it will loop around and hit Line P1 again. This time,
    // however, it would block, as the empty semaphore's value is 0."
    const trace = boundedBuffer({
      producers: 1,
      consumers: 1,
      items: 2,
      capacity: 1,
      version: "correct",
      quantum: null,
    });
    expect(trace.result.blocks[0]).toEqual({ step: 5, id: "P1", sem: "empty" });
    expect(trace.result.completed).toBe(true);
  });
});

describe("OSTEP ch. 32, Figure 32.6 (simple deadlock)", () => {
  it("T1 grabs L1, a switch lets T2 grab L2, then each waits for the other: a cycle", () => {
    const trace = resourceGraph(philosophers(2));
    expect(trace.result.deadlock).toBe(true);
    expect(trace.result.cycle).toEqual(["T2", "T1"]);
    expect(trace.steps.at(-1)?.state.resources.map((r) => r.holder)).toEqual(["T1", "T2"]);
  });

  it("'deadlock does not necessarily occur': if T2 starts later, T1 gets both locks first", () => {
    const base = philosophers(2);
    const trace = resourceGraph({
      ...base,
      threads: base.threads.map((t, i) => (i === 1 ? { ...t, delay: 2 } : t)),
    });
    expect(trace.result.deadlock).toBe(false);
    expect(trace.result.finishOrder).toEqual(["T1", "T2"]);
  });
});

describe("OSTEP ch. 39, §39.14 and §39.15 (hard and symbolic links)", () => {
  it("link counts go 1, 2, 3, 2, 1 and the last name still reads hello", () => {
    const trace = fileSystem({
      script: [
        { op: "create", name: "file" },
        { op: "write", name: "file", text: "hello" },
        { op: "link", name: "file", to: "file2" },
        { op: "link", name: "file2", to: "file3" },
        { op: "unlink", name: "file" },
        { op: "unlink", name: "file2" },
        { op: "cat", name: "file3" },
      ],
    });
    expect(trace.steps.map((s) => s.state.inodes[1]?.links)).toEqual([1, 1, 2, 3, 2, 1, 1]);
    expect(trace.result.outputs).toEqual([{ step: 6, kind: "content", content: "hello" }]);
  });

  it("a symbolic link holds the path (4 bytes for 'file') and dangles after rm file", () => {
    const trace = fileSystem({
      script: [
        { op: "create", name: "file" },
        { op: "write", name: "file", text: "hello" },
        { op: "symlink", target: "file", name: "file2" },
        { op: "cat", name: "file2" },
        { op: "unlink", name: "file" },
        { op: "cat", name: "file2" },
      ],
    });
    expect(trace.steps[2]?.state.inodes[2]).toMatchObject({ type: "symlink", size: 4 });
    expect(trace.result.outputs).toEqual([
      { step: 3, kind: "content", content: "hello" },
      { step: 5, kind: "error", content: "" },
    ]);
  });
});

/**
 * External cross-check, databases: histories published in Berenson et al., "A Critique of ANSI SQL
 * Isolation Levels" (SIGMOD 1995, MSR-TR-95-51), and Kleppmann's Hermitage tests for PostgreSQL
 * (https://github.com/ept/hermitage, postgres.md), transcribed from the sources, not from any
 * engine output. Mapping rules: docs/lessons/isolation-anomalies.md, "External cross-check".
 */

const r = (item: "x" | "y"): TxOperation => ({ op: "read", item });
const w = (item: "x" | "y", value: number): TxOperation => ({ op: "write", item, value });
const wr = (item: "x" | "y", delta: number): TxOperation => ({ op: "writeFromRead", item, delta });
const commit: TxOperation = { op: "commit" };
const abort: TxOperation = { op: "abort" };

function history(
  items: number[],
  transactions: TxOperation[][],
  order: string,
  isolation: Isolation = "read-committed",
) {
  return transact({ items, transactions, isolation, order: order.split(" ") }).result;
}
const readsOf = (result: ReturnType<typeof history>, tx: string) =>
  result.reads.filter((x) => x.tx === tx).map((x) => `${x.item}=${x.value}`);

describe("Berenson et al. 1995, histories H1, H2, H4 and P0", () => {
  const h1 = (isolation: Isolation) =>
    history(
      [50, 50],
      [
        [r("x"), wr("x", -40), r("y"), wr("y", 40), commit],
        [r("x"), r("y"), commit],
      ],
      "T1 T1 T2 T2 T2 T1 T1 T1",
      isolation,
    );

  it("H1 (§3): r1[x=50] w1[x=10] r2[x=10] r2[y=50] c2 r1[y=50] w1[y=90] c1 needs a dirty read", () => {
    expect(readsOf(h1("read-uncommitted"), "T2")).toEqual(["x=10", "y=50"]);
    expect(h1("read-uncommitted").dirtyReads).toBe(1);
    // Read Committed forbids P1: T2 sees the consistent 50 + 50.
    expect(readsOf(h1("read-committed"), "T2")).toEqual(["x=50", "y=50"]);
  });

  it("H2 (§3): r1[x=50] r2[x=50] w2[x=10] r2[y=50] w2[y=90] c2 r1[y=90] c1, allowed by Read Committed", () => {
    const result = transact(txPresets.transfer).result;
    expect(readsOf(result, "T1")).toEqual(["x=50", "y=90"]);
    expect(readsOf(result, "T2")).toEqual(["x=50", "y=50"]);
    expect(result.final).toEqual([10, 90]);
  });

  it("H4 (§4.1): r1[x=100] r2[x=100] w2[x=120] c2 w1[x=130] c1 keeps only T1's +30", () => {
    const result = history(
      [100],
      [
        [r("x"), wr("x", 30), commit],
        [r("x"), wr("x", 20), commit],
      ],
      "T1 T2 T2 T2 T1 T1",
    );
    expect(result.writes.map((x) => [x.tx, x.value])).toEqual([
      ["T2", 120],
      ["T1", 130],
    ]);
    expect(result.final).toEqual([130]);
    expect(result.lostUpdates).toBe(1);
  });

  it("P0 (§3, Table 3): a dirty write is not possible at any level; the second writer waits", () => {
    for (const isolation of ["read-uncommitted", "read-committed"] as const) {
      const result = history(
        [0],
        [
          [w("x", 1), commit],
          [w("x", 2), commit],
        ],
        "T1 T2 T1 T2",
        isolation,
      );
      expect(result.blocks).toEqual([{ step: 1, tx: "T2", item: "x", holder: "T1" }]);
      expect(result.final).toEqual([2]);
    }
  });
});

describe("Hermitage, PostgreSQL, Read Committed (row 1 is x = 10, row 2 is y = 20)", () => {
  it("G0, write cycles: T2 waits for T1; final 1 => 12, 2 => 22", () => {
    const result = history(
      [10, 20],
      [
        [w("x", 11), w("y", 21), commit],
        [w("x", 12), w("y", 22), commit],
      ],
      "T1 T2 T1 T1 T2 T2",
    );
    expect(result.blocks.map((b) => [b.tx, b.item, b.holder])).toEqual([["T2", "x", "T1"]]);
    expect(result.final).toEqual([12, 22]);
  });

  it("G1a, aborted reads: T2 sees 1 => 10 before and after T1 aborts", () => {
    const result = history(
      [10, 20],
      [
        [w("x", 101), abort],
        [r("x"), r("y"), r("x"), r("y"), commit],
      ],
      "T1 T2 T2 T1 T2 T2 T2",
    );
    expect(readsOf(result, "T2")).toEqual(["x=10", "y=20", "x=10", "y=20"]);
    expect(result.final).toEqual([10, 20]);
  });

  it("G1b, intermediate reads: T2 sees 10, then 11, never 101", () => {
    const result = history(
      [10, 20],
      [
        [w("x", 101), w("x", 11), commit],
        [r("x"), r("y"), r("x"), r("y"), commit],
      ],
      "T1 T2 T2 T1 T1 T2 T2 T2",
    );
    expect(readsOf(result, "T2")).toEqual(["x=10", "y=20", "x=11", "y=20"]);
  });

  it("G1c, circular information flow: each reads the other's row as it was", () => {
    const result = history(
      [10, 20],
      [
        [w("x", 11), r("y"), commit],
        [w("y", 22), r("x"), commit],
      ],
      "T1 T2 T1 T2 T1 T2",
    );
    expect(readsOf(result, "T1")).toEqual(["y=20"]);
    expect(readsOf(result, "T2")).toEqual(["x=10"]);
    expect(result.final).toEqual([11, 22]);
  });

  it("OTV, observed transaction vanishes: T3 sees 11, 19, then 18, 12", () => {
    const result = history(
      [10, 20],
      [
        [w("x", 11), w("y", 19), commit],
        [w("x", 12), w("y", 18), commit],
        [r("x"), r("y"), r("y"), r("x"), commit],
      ],
      "T1 T1 T2 T1 T3 T2 T3 T2 T3 T3 T3",
    );
    expect(result.blocks.map((b) => [b.tx, b.item, b.holder])).toEqual([["T2", "x", "T1"]]);
    expect(readsOf(result, "T3")).toEqual(["x=11", "y=19", "y=18", "x=12"]);
    expect(result.final).toEqual([12, 18]);
  });

  it("P4, lost update: T2 waits, then overwrites T1's 11 with its own 11", () => {
    const result = history(
      [10, 20],
      [
        [r("x"), wr("x", 1), commit],
        [r("x"), wr("x", 1), commit],
      ],
      "T1 T2 T1 T2 T1 T2",
    );
    expect(result.blocks.map((b) => [b.tx, b.item])).toEqual([["T2", "x"]]);
    expect(result.final).toEqual([11, 20]);
    expect(result.lostUpdates).toBe(1);
  });

  it("G-single, read skew: T1 sees 1 => 10 and 2 => 18", () => {
    const result = history(
      [10, 20],
      [
        [r("x"), r("y"), commit],
        [r("x"), r("y"), w("x", 12), w("y", 18), commit],
      ],
      "T1 T2 T2 T2 T2 T2 T1 T1",
    );
    expect(readsOf(result, "T1")).toEqual(["x=10", "y=18"]);
  });
});

describe("two-phase locking: Berenson et al. 1995 Table 2 and Hermitage, MySQL InnoDB, Serializable", () => {
  it("H4 cannot happen under Locking SERIALIZABLE: the lost update becomes a deadlock", () => {
    const result = history(
      [100],
      [
        [r("x"), wr("x", 30), commit],
        [r("x"), wr("x", 20), commit],
      ],
      "T1 T2 T2 T1 T2",
      "serializable-2pl",
    );
    expect(result.deadlocks.map((d) => [d.victim, d.path])).toEqual([
      ["T1", "T1 → x → T2 → x → T1"],
    ]);
    expect(result.committed).toEqual(["T2"]);
    expect(result.final).toEqual([120]);
    expect(result.lostUpdates).toBe(0);
  });

  it("P4 (mysql.md): T1's update waits, T2's update gets the deadlock error, T1 commits", () => {
    const result = history(
      [10, 20],
      [
        [r("x"), w("x", 11), commit],
        [r("x"), w("x", 11), commit],
      ],
      "T1 T2 T1 T2 T1",
      "serializable-2pl",
    );
    expect(result.blocks.map((b) => [b.tx, b.item])).toEqual([
      ["T1", "x"],
      ["T2", "x"],
    ]);
    expect(result.deadlocks.map((d) => d.victim)).toEqual(["T2"]);
    expect(result.committed).toEqual(["T1"]);
    expect(result.final).toEqual([11, 20]);
  });

  it("G2-item (mysql.md): T1's update waits, T2's update gets the deadlock error, T1 commits", () => {
    const result = history(
      [10, 20],
      [
        [r("x"), r("y"), w("x", 11), commit],
        [r("x"), r("y"), w("y", 21), commit],
      ],
      "T1 T1 T2 T2 T1 T2 T1",
      "serializable-2pl",
    );
    expect(result.blocks.map((b) => [b.tx, b.item])).toEqual([
      ["T1", "x"],
      ["T2", "y"],
    ]);
    expect(result.deadlocks.map((d) => d.victim)).toEqual(["T2"]);
    expect(result.committed).toEqual(["T1"]);
    expect(result.final).toEqual([11, 20]);
  });
});
