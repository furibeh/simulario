import { describe, expect, it } from "vitest";
import { fixBalance, presets } from "./presets";
import { simulate } from "./simulate";
import type { Operation, TxExplanation, TxInput, TxTrace } from "./types";

/**
 * Expected values are hand-computed in docs/lessons/isolation-anomalies.md ("Expected results").
 * Never regenerate them from the engine's output.
 */

const signed = (d: number) => (d >= 0 ? `+${d}` : `${d}`);

function fmt(e: TxExplanation): string {
  const p = e.params;
  switch (e.key) {
    case "read":
      return `r ${e.params.tx} ${e.params.item} ${e.params.value}`;
    case "read.hidden":
      return `rh ${e.params.tx} ${e.params.item} ${e.params.value} (pending ${e.params.pending} by ${e.params.writer})`;
    case "read.dirty":
      return `rd ${e.params.tx} ${e.params.item} ${e.params.value} (by ${e.params.writer})`;
    case "read.own":
      return `ro ${e.params.tx} ${e.params.item} ${e.params.value}`;
    case "read.changed":
      return `changed ${e.params.tx} ${e.params.item} ${e.params.before}→${e.params.value}`;
    case "read.lock":
      return `rl ${e.params.tx} ${e.params.item} ${e.params.value}`;
    case "write":
      return `w ${e.params.tx} ${e.params.item} ${e.params.value}`;
    case "write.computed":
      return `wc ${e.params.tx} ${e.params.item} ${e.params.value} (${e.params.read}${signed(e.params.delta)})`;
    case "write.stale":
      return `stale ${e.params.tx} ${e.params.item} ${e.params.read}→${e.params.current} by ${e.params.by}`;
    case "add":
      return `add ${e.params.tx} ${e.params.item} ${e.params.before}→${e.params.value}`;
    case "lock.wait":
      return `W ${e.params.tx} ${e.params.item} (${e.params.holder})`;
    case "handoff":
      return `→ ${e.params.tx} ${e.params.item} ${e.params.to}`;
    case "deadlock":
      return `deadlock ${e.params.tx} ${e.params.path}`;
    default:
      return `${e.key === "commit" ? "c" : "a"} ${p.tx}`;
  }
}

const rows = (trace: TxTrace) => trace.steps.map((s) => s.explain.map(fmt).join(", "));

const with_ = (base: TxInput, patch: Partial<TxInput>): TxInput => ({ ...base, ...patch });
const order = (s: string) => s.split(" ");

describe("preset: balance (Saldo)", () => {
  it("Read Committed loses T1's deposit: final 120 (Predict, Run)", () => {
    const trace = simulate(presets.balance);
    expect(rows(trace)).toEqual([
      "r T1 x 100",
      "r T2 x 100",
      "wc T1 x 150 (100+50)",
      "c T1",
      "wc T2 x 120 (100+20), stale T2 x 100→150 by T1",
      "c T2",
    ]);
    const { result } = trace;
    expect(result.final).toEqual([120]);
    expect(result.committed).toEqual(["T1", "T2"]);
    expect(result.lostUpdates).toBe(1);
    expect(result.blocks).toEqual([]);
    expect(result.reads.map((r) => [r.tx, r.value, r.kind])).toEqual([
      ["T1", 100, "committed"],
      ["T2", 100, "committed"],
    ]);
    expect(result.writes.map((w) => [w.tx, w.value, w.stale])).toEqual([
      ["T1", 150, false],
      ["T2", 120, true],
    ]);
    expect(result.complete).toBe(true);
  });

  it("T2 writing before T1 commits waits, then still loses the deposit (E1)", () => {
    const trace = simulate(with_(presets.balance, { order: order("T1 T2 T1 T2 T1 T2") }));
    expect(rows(trace)).toEqual([
      "r T1 x 100",
      "r T2 x 100",
      "wc T1 x 150 (100+50)",
      "W T2 x (T1)",
      "c T1, → T1 x T2, wc T2 x 120 (100+20), stale T2 x 100→150 by T1",
      "c T2",
    ]);
    expect(trace.result.final).toEqual([120]);
    expect(trace.result.lostUpdates).toBe(1);
    expect(trace.result.blocks).toEqual([{ step: 3, tx: "T2", item: "x", holder: "T1" }]);
  });

  it("Read Uncommitted gives the same result: both reads come before any write", () => {
    const trace = simulate(with_(presets.balance, { isolation: "read-uncommitted" }));
    expect(rows(trace)).toEqual(rows(simulate(presets.balance)));
    expect(trace.result.final).toEqual([120]);
  });

  it("serial order keeps both deposits", () => {
    const trace = simulate(with_(presets.balance, { order: order("T1 T1 T1 T2 T2 T2") }));
    expect(rows(trace)).toEqual([
      "r T1 x 100",
      "wc T1 x 150 (100+50)",
      "c T1",
      "r T2 x 150",
      "wc T2 x 170 (150+20)",
      "c T2",
    ]);
    expect(trace.result.lostUpdates).toBe(0);
  });
});

describe("balance, fixed (E4)", () => {
  it("atomic add waits for the lock and adds to the newest committed value: 170", () => {
    const trace = simulate(
      with_(presets.balance, { transactions: fixBalance("atomic"), order: order("T1 T2 T1 T2") }),
    );
    expect(rows(trace)).toEqual([
      "add T1 x 100→150",
      "W T2 x (T1)",
      "c T1, → T1 x T2, add T2 x 150→170",
      "c T2",
    ]);
    expect(trace.result.final).toEqual([170]);
    expect(trace.result.lostUpdates).toBe(0);
  });

  it("FOR UPDATE makes T2's read wait, with the Predict order of turns: 170", () => {
    const trace = simulate(with_(presets.balance, { transactions: fixBalance("forUpdate") }));
    expect(rows(trace)).toEqual([
      "rl T1 x 100",
      "W T2 x (T1)",
      "wc T1 x 150 (100+50)",
      "c T1, → T1 x T2, rl T2 x 150",
      "wc T2 x 170 (150+20)",
      "c T2",
    ]);
    expect(trace.result.final).toEqual([170]);
    expect(trace.result.writes.some((w) => w.stale)).toBe(false);
  });
});

describe("preset: dirtyRead (Lectura sucia)", () => {
  it("Read Uncommitted reads 150, a value that never existed", () => {
    const trace = simulate(presets.dirtyRead);
    expect(rows(trace)).toEqual(["w T1 x 150", "rd T2 x 150 (by T1)", "a T1", "c T2"]);
    expect(trace.result.final).toEqual([100]);
    expect(trace.result.dirtyReads).toBe(1);
    expect(trace.result.dirtyAborted).toBe(1);
    expect(trace.result.aborted).toEqual(["T1"]);
  });

  it("Read Committed hides T1's uncommitted 150", () => {
    const trace = simulate(with_(presets.dirtyRead, { isolation: "read-committed" }));
    expect(rows(trace)).toEqual(["w T1 x 150", "rh T2 x 100 (pending 150 by T1)", "a T1", "c T2"]);
    expect(trace.result.dirtyReads).toBe(0);
    expect(trace.result.dirtyAborted).toBe(0);
  });
});

describe("preset: transfer (Transferencia), Berenson's H2", () => {
  for (const isolation of ["read-committed", "read-uncommitted"] as const) {
    it(`${isolation}: the report reads x 50 and y 90, a total of 140`, () => {
      const trace = simulate(with_(presets.transfer, { isolation }));
      expect(rows(trace)).toEqual([
        "r T1 x 50",
        "r T2 x 50",
        "wc T2 x 10 (50-40)",
        "r T2 y 50",
        "wc T2 y 90 (50+40)",
        "c T2",
        "r T1 y 90",
        "c T1",
      ]);
      expect(trace.result.final).toEqual([10, 90]);
      expect(trace.result.reads.filter((r) => r.tx === "T1").map((r) => r.value)).toEqual([50, 90]);
      expect(trace.result.nonRepeatable).toBe(0);
      expect(trace.result.lostUpdates).toBe(0);
      expect(trace.result.blocks).toEqual([]);
    });
  }
});

describe("edge cases", () => {
  const base = (items: number[], transactions: Operation[][], o: string): TxInput => ({
    items,
    transactions,
    isolation: "read-committed",
    order: order(o),
  });

  it("deadlock: the transaction that closes the cycle is aborted, the other goes on", () => {
    const trace = simulate(
      base(
        [0, 0],
        [
          [
            { op: "write", item: "x", value: 1 },
            { op: "write", item: "y", value: 1 },
            { op: "commit" },
          ],
          [
            { op: "write", item: "y", value: 2 },
            { op: "write", item: "x", value: 2 },
            { op: "commit" },
          ],
        ],
        "T1 T2 T1 T2 T1",
      ),
    );
    expect(rows(trace)).toEqual([
      "w T1 x 1",
      "w T2 y 2",
      "W T1 y (T2)",
      "W T2 x (T1), deadlock T2 T2 → x → T1 → y → T2, → T2 y T1, w T1 y 1",
      "c T1",
    ]);
    expect(trace.result.final).toEqual([1, 1]);
    expect(trace.result.committed).toEqual(["T1"]);
    expect(trace.result.aborted).toEqual(["T2"]);
    expect(trace.result.deadlocks).toEqual([
      { step: 3, victim: "T2", path: "T2 → x → T1 → y → T2" },
    ]);
    expect(trace.result.complete).toBe(true);
  });

  it("non-repeatable read", () => {
    const trace = simulate(
      base(
        [50],
        [
          [{ op: "read", item: "x" }, { op: "read", item: "x" }, { op: "commit" }],
          [{ op: "write", item: "x", value: 10 }, { op: "commit" }],
        ],
        "T1 T2 T2 T1 T1",
      ),
    );
    expect(rows(trace)[3]).toBe("r T1 x 10, changed T1 x 50→10");
    expect(trace.result.nonRepeatable).toBe(1);
  });

  it("reading your own write is not a change", () => {
    const trace = simulate(
      base(
        [5],
        [
          [
            { op: "read", item: "x" },
            { op: "write", item: "x", value: 7 },
            { op: "read", item: "x" },
            { op: "commit" },
          ],
          [{ op: "read", item: "x" }, { op: "commit" }],
        ],
        "T1 T1 T1 T2 T1 T2",
      ),
    );
    expect(rows(trace)[2]).toBe("ro T1 x 7");
    expect(rows(trace)[3]).toBe("rh T2 x 5 (pending 7 by T1)");
    expect(trace.result.nonRepeatable).toBe(0);
  });

  it("a short order ends early", () => {
    const trace = simulate(with_(presets.balance, { order: order("T1 T2") }));
    expect(trace.steps).toHaveLength(2);
    expect(trace.result.complete).toBe(false);
    expect(trace.result.final).toEqual([100]);
  });

  it("an order that names a blocked transaction throws", () => {
    expect(() => simulate(with_(presets.balance, { order: order("T1 T2 T1 T2 T2") }))).toThrow(
      /Step 4: T2 is waiting/,
    );
  });

  it("an order that names a finished transaction throws", () => {
    expect(() => simulate(with_(presets.balance, { order: order("T1 T1 T1 T1") }))).toThrow(
      /Step 3: T1 has already ended/,
    );
  });

  it("writeFromRead without an earlier read throws", () => {
    expect(() =>
      simulate(
        base(
          [1],
          [[{ op: "writeFromRead", item: "x", delta: 1 }, { op: "commit" }], [{ op: "commit" }]],
          "T1",
        ),
      ),
    ).toThrow(RangeError);
  });

  it("a script without commit or abort throws", () => {
    expect(() =>
      simulate(base([1], [[{ op: "read", item: "x" }], [{ op: "commit" }]], "T1")),
    ).toThrow(RangeError);
  });
});
