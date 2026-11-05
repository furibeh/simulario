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
    case "read.shared":
      return `rs ${e.params.tx} ${e.params.item} ${e.params.value}`;
    case "lock.wait.shared":
      return `WS ${e.params.tx} ${e.params.item} (${e.params.holders})`;
    case "lock.upgrade":
      return `up ${e.params.tx} ${e.params.item}`;
    case "snapshot":
      return `snap ${e.params.tx}`;
    case "read.old":
      return `ro ${e.params.tx} ${e.params.item} ${e.params.value} (current ${e.params.current} by ${e.params.by})`;
    case "serialization":
      return `ser ${e.params.tx} ${e.params.item} (${e.params.by})`;
    case "check.pass":
      return `check ${e.params.tx} ✓${e.params.sum}`;
    case "check.fail":
      return `check ${e.params.tx} ✗${e.params.sum}`;
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

/** docs/lessons/two-phase-locking.md, "Expected results". */
describe("serializable-2pl", () => {
  const twoPl = (base: TxInput, o: string): TxInput => ({
    ...base,
    isolation: "serializable-2pl",
    order: order(o),
  });

  it("Saldo, Predict: both read, both want to upgrade, T2 closes the cycle and is aborted", () => {
    const trace = simulate(twoPl(presets.balance, "T1 T2 T1 T2 T1"));
    expect(rows(trace)).toEqual([
      "rs T1 x 100",
      "rs T2 x 100",
      "WS T1 x (T2)",
      "WS T2 x (T1), deadlock T2 T2 → x → T1 → x → T2, → T2 x T1, up T1 x, wc T1 x 150 (100+50)",
      "c T1",
    ]);
    const { result } = trace;
    expect(result.final).toEqual([150]);
    expect(result.committed).toEqual(["T1"]);
    expect(result.aborted).toEqual(["T2"]);
    expect(result.lostUpdates).toBe(0);
    expect(result.complete).toBe(true);
  });

  it("Saldo, T2 reads after T1 writes: T2 waits and both commit (E2)", () => {
    const trace = simulate(twoPl(presets.balance, "T1 T1 T2 T1 T2 T2"));
    expect(rows(trace)).toEqual([
      "rs T1 x 100",
      "up T1 x, wc T1 x 150 (100+50)",
      "W T2 x (T1)",
      "c T1, → T1 x T2, rs T2 x 150",
      "up T2 x, wc T2 x 170 (150+20)",
      "c T2",
    ]);
    expect(trace.result.final).toEqual([170]);
  });

  it("Saldo with FOR UPDATE gives module 5's trace (E2)", () => {
    const forUpdate = { ...presets.balance, transactions: fixBalance("forUpdate") };
    expect(rows(simulate(twoPl(forUpdate, "T1 T2 T1 T1 T2 T2")))).toEqual(
      rows(simulate({ ...forUpdate, order: order("T1 T2 T1 T1 T2 T2") })),
    );
    expect(simulate(twoPl(forUpdate, "T1 T2 T1 T1 T2 T2")).result.final).toEqual([170]);
  });

  it("Saldo, serial order: no waits", () => {
    const trace = simulate(twoPl(presets.balance, "T1 T1 T1 T2 T2 T2"));
    expect(rows(trace)).toEqual([
      "rs T1 x 100",
      "up T1 x, wc T1 x 150 (100+50)",
      "c T1",
      "rs T2 x 150",
      "up T2 x, wc T2 x 170 (150+20)",
      "c T2",
    ]);
    expect(trace.result.blocks).toEqual([]);
  });

  it("module 5's order cannot run: T1 is waiting at step 3", () => {
    expect(() => simulate(twoPl(presets.balance, "T1 T2 T1 T1 T2 T2"))).toThrow(
      /Step 3: T1 is waiting/,
    );
  });

  it("Transferencia: the transfer waits for the report, which sees 100 (E1)", () => {
    const trace = simulate(twoPl(presets.transfer, "T1 T2 T2 T1 T1 T2 T2 T2"));
    expect(rows(trace)).toEqual([
      "rs T1 x 50",
      "rs T2 x 50",
      "WS T2 x (T1)",
      "rs T1 y 50",
      "c T1, → T1 x T2, up T2 x, wc T2 x 10 (50-40)",
      "rs T2 y 50",
      "up T2 y, wc T2 y 90 (50+40)",
      "c T2",
    ]);
    expect(trace.result.final).toEqual([10, 90]);
    expect(trace.result.reads.filter((r) => r.tx === "T1").map((r) => r.value)).toEqual([50, 50]);
    expect(trace.result.deadlocks).toEqual([]);
  });

  it("Transferencias cruzadas: deadlock at step 5 under 2PL", () => {
    const trace = simulate(presets.crossTransfers);
    expect(rows(trace)).toEqual([
      "rs T1 x 100",
      "rs T2 y 100",
      "up T1 x, wc T1 x 90 (100-10)",
      "up T2 y, wc T2 y 90 (100-10)",
      "W T1 y (T2)",
      "W T2 x (T1), deadlock T2 T2 → x → T1 → y → T2, → T2 y T1, rs T1 y 100",
      "up T1 y, wc T1 y 110 (100+10)",
      "c T1",
    ]);
    expect(trace.result.final).toEqual([90, 110]);
    expect(trace.result.committed).toEqual(["T1"]);
    expect(trace.result.aborted).toEqual(["T2"]);
  });

  it("Transferencias cruzadas: deadlock at step 7 under Read Committed", () => {
    const trace = simulate({
      ...presets.crossTransfers,
      isolation: "read-committed",
      order: order("T1 T2 T1 T2 T1 T2 T1 T2 T1"),
    });
    expect(rows(trace)).toEqual([
      "r T1 x 100",
      "r T2 y 100",
      "wc T1 x 90 (100-10)",
      "wc T2 y 90 (100-10)",
      "rh T1 y 100 (pending 90 by T2)",
      "rh T2 x 100 (pending 90 by T1)",
      "W T1 y (T2)",
      "W T2 x (T1), deadlock T2 T2 → x → T1 → y → T2, → T2 y T1, wc T1 y 110 (100+10)",
      "c T1",
    ]);
    expect(trace.result.final).toEqual([90, 110]);
    expect(trace.result.lostUpdates).toBe(0);
  });

  it("Transferencias cruzadas, serial: both commit at either level (E4)", () => {
    for (const isolation of ["read-committed", "serializable-2pl"] as const) {
      const { result } = simulate({
        ...presets.crossTransfers,
        isolation,
        order: order("T1 T1 T1 T1 T1 T2 T2 T2 T2 T2"),
      });
      expect(result.final).toEqual([100, 100]);
      expect(result.committed).toEqual(["T1", "T2"]);
      expect(result.blocks).toEqual([]);
    }
  });

  describe("edge cases", () => {
    const run = (items: number[], transactions: Operation[][], o: string) =>
      simulate({ items, transactions, isolation: "serializable-2pl", order: order(o) });

    it("a writer waits for two readers and gets the lock when the last one commits", () => {
      const trace = run(
        [1],
        [
          [{ op: "read", item: "x" }, { op: "commit" }],
          [{ op: "read", item: "x" }, { op: "commit" }],
          [{ op: "write", item: "x", value: 9 }, { op: "commit" }],
        ],
        "T1 T2 T3 T1 T2",
      );
      expect(rows(trace)).toEqual([
        "rs T1 x 1",
        "rs T2 x 1",
        "WS T3 x (T1, T2)",
        "c T1",
        "c T2, → T2 x T3, w T3 x 9",
      ]);
      expect(trace.steps[3]?.state.items[0]?.queue).toEqual(["T3"]);
      expect(trace.result.complete).toBe(false);
    });

    it("re-reading under a held lock takes no new lock and is not a change", () => {
      const trace = run(
        [5],
        [
          [{ op: "read", item: "x" }, { op: "read", item: "x" }, { op: "commit" }],
          [{ op: "commit" }],
        ],
        "T1 T1 T1 T2",
      );
      expect(rows(trace).slice(0, 2)).toEqual(["rs T1 x 5", "r T1 x 5"]);
      expect(trace.result.nonRepeatable).toBe(0);
    });

    it("a writer blocks a reader", () => {
      const trace = run(
        [5],
        [
          [{ op: "write", item: "x", value: 6 }, { op: "commit" }],
          [{ op: "read", item: "x" }, { op: "commit" }],
        ],
        "T1 T2 T1 T2",
      );
      expect(rows(trace)).toEqual([
        "w T1 x 6",
        "W T2 x (T1)",
        "c T1, → T1 x T2, rs T2 x 6",
        "c T2",
      ]);
    });
  });
});

/** docs/lessons/mvcc-snapshots.md, "Expected results". */
describe("snapshot", () => {
  const snap = (base: TxInput, o: string): TxInput => ({
    ...base,
    isolation: "snapshot",
    order: order(o),
  });

  it("Guardia, Predict: both checks see 2, both go off call, nobody is left (write skew)", () => {
    const trace = simulate(presets.onCall);
    expect(rows(trace)).toEqual([
      "snap T1, r T1 x 1",
      "r T1 y 1",
      "snap T2, r T2 x 1",
      "r T2 y 1",
      "check T1 ✓2",
      "check T2 ✓2",
      "w T1 x 0",
      "w T2 y 0",
      "c T1",
      "c T2",
    ]);
    expect(trace.result.final).toEqual([0, 0]);
    expect(trace.result.committed).toEqual(["T1", "T2"]);
    expect(trace.result.blocks).toEqual([]);
  });

  it("Guardia under Read Committed: the same outcome, without snapshots", () => {
    const trace = simulate({ ...presets.onCall, isolation: "read-committed" });
    expect(rows(trace)).toEqual(
      rows(simulate(presets.onCall)).map((r) => r.replace(/snap T\d, /, "")),
    );
    expect(trace.result.final).toEqual([0, 0]);
  });

  it("Guardia under two-phase locking: the writes deadlock and one doctor stays (E3)", () => {
    const trace = simulate({
      ...presets.onCall,
      isolation: "serializable-2pl",
      order: order("T1 T1 T2 T2 T1 T2 T1 T2 T1"),
    });
    expect(rows(trace)).toEqual([
      "rs T1 x 1",
      "rs T1 y 1",
      "rs T2 x 1",
      "rs T2 y 1",
      "check T1 ✓2",
      "check T2 ✓2",
      "WS T1 x (T2)",
      "WS T2 y (T1), deadlock T2 T2 → y → T1 → x → T2, → T2 x T1, up T1 x, w T1 x 0",
      "c T1",
    ]);
    expect(trace.result.final).toEqual([0, 1]);
    expect(trace.result.aborted).toEqual(["T2"]);
  });

  it("Guardia, serial under snapshot: the second check sees 1 and rolls back (E3)", () => {
    const trace = simulate(snap(presets.onCall, "T1 T1 T1 T1 T1 T2 T2 T2"));
    expect(rows(trace).slice(5)).toEqual(["snap T2, r T2 x 0", "r T2 y 1", "check T2 ✗1"]);
    expect(trace.result.final).toEqual([0, 1]);
    expect(trace.result.aborted).toEqual(["T2"]);
    expect(trace.steps.at(-1)?.state.transactions[1]?.pc).toBe(3);
    expect(trace.result.complete).toBe(true);
  });

  it("Saldo, module 5's order: the second updater is aborted", () => {
    const trace = simulate(snap(presets.balance, "T1 T2 T1 T1 T2"));
    expect(rows(trace)).toEqual([
      "snap T1, r T1 x 100",
      "snap T2, r T2 x 100",
      "wc T1 x 150 (100+50)",
      "c T1",
      "ser T2 x (T1)",
    ]);
    expect(trace.result.final).toEqual([150]);
    expect(trace.result.aborted).toEqual(["T2"]);
    expect(trace.result.lostUpdates).toBe(0);
    expect(trace.steps.at(-1)?.state.transactions[1]?.pc).toBe(1);
  });

  it("Saldo, T2 writes early: it waits, then is aborted when T1 commits", () => {
    const trace = simulate(snap(presets.balance, "T1 T2 T1 T2 T1"));
    expect(rows(trace)).toEqual([
      "snap T1, r T1 x 100",
      "snap T2, r T2 x 100",
      "wc T1 x 150 (100+50)",
      "W T2 x (T1)",
      "c T1, → T1 x T2, ser T2 x (T1)",
    ]);
    expect(trace.result.final).toEqual([150]);
  });

  it("Saldo, serial: both deposits are kept (E2)", () => {
    const trace = simulate(snap(presets.balance, "T1 T1 T1 T2 T2 T2"));
    expect(rows(trace)).toEqual([
      "snap T1, r T1 x 100",
      "wc T1 x 150 (100+50)",
      "c T1",
      "snap T2, r T2 x 150",
      "wc T2 x 170 (150+20)",
      "c T2",
    ]);
  });

  it("Saldo, atomic add: UPDATE x = x + 20 also fails after a concurrent commit", () => {
    const trace = simulate(
      snap({ ...presets.balance, transactions: fixBalance("atomic") }, "T1 T2 T1"),
    );
    expect(rows(trace)).toEqual([
      "snap T1, add T1 x 100→150",
      "snap T2, W T2 x (T1)",
      "c T1, → T1 x T2, ser T2 x (T1)",
    ]);
    expect(trace.result.final).toEqual([150]);
  });

  it("Transferencia: the report reads its snapshot, 100 in total, and nobody waits (E1)", () => {
    const trace = simulate({ ...presets.transfer, isolation: "snapshot" });
    expect(rows(trace)).toEqual([
      "snap T1, r T1 x 50",
      "snap T2, r T2 x 50",
      "wc T2 x 10 (50-40)",
      "r T2 y 50",
      "wc T2 y 90 (50+40)",
      "c T2",
      "ro T1 y 50 (current 90 by T2)",
      "c T1",
    ]);
    expect(trace.result.reads.filter((r) => r.tx === "T1").map((r) => r.value)).toEqual([50, 50]);
    expect(trace.result.blocks).toEqual([]);
  });

  describe("edge cases", () => {
    const run = (items: number[], transactions: Operation[][], o: string) =>
      simulate({ items, transactions, isolation: "snapshot", order: order(o) });

    it("repeatable reads: the second read still sees the snapshot", () => {
      const trace = run(
        [50],
        [
          [{ op: "read", item: "x" }, { op: "read", item: "x" }, { op: "commit" }],
          [{ op: "write", item: "x", value: 10 }, { op: "commit" }],
        ],
        "T1 T2 T2 T1 T1",
      );
      expect(rows(trace)[3]).toBe("ro T1 x 50 (current 10 by T2)");
      expect(trace.result.nonRepeatable).toBe(0);
    });

    it("a snapshot taken after a commit sees it", () => {
      const trace = run(
        [5],
        [
          [{ op: "write", item: "x", value: 6 }, { op: "commit" }],
          [{ op: "read", item: "x" }, { op: "commit" }],
        ],
        "T1 T1 T2 T2",
      );
      expect(rows(trace)[2]).toBe("snap T2, r T2 x 6");
    });

    it("a writer whose lock holder aborts goes on", () => {
      const trace = run(
        [5],
        [
          [{ op: "write", item: "x", value: 6 }, { op: "abort" }],
          [{ op: "write", item: "x", value: 7 }, { op: "commit" }],
        ],
        "T1 T2 T1 T2",
      );
      expect(rows(trace)).toEqual([
        "snap T1, w T1 x 6",
        "snap T2, W T2 x (T1)",
        "a T1, → T1 x T2, w T2 x 7",
        "c T2",
      ]);
      expect(trace.result.final).toEqual([7]);
    });

    it("check without an earlier read throws", () => {
      expect(() =>
        run(
          [1],
          [[{ op: "check", items: ["x"], atLeast: 1 }, { op: "commit" }], [{ op: "commit" }]],
          "T1",
        ),
      ).toThrow(RangeError);
    });
  });
});
