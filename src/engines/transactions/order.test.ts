import { describe, expect, it } from "vitest";
import { fitOrder } from "./order";
import { fixBalance, presets } from "./presets";
import type { Isolation, TxInput } from "./types";

/**
 * The board fits each preset's order to the chosen level. These expectations are the orders
 * traced by hand in docs/lessons/isolation-anomalies.md, two-phase-locking.md and mvcc-snapshots.md.
 */
const fitted = (base: TxInput, isolation: Isolation) => fitOrder({ ...base, isolation }).join(" ");

describe("fitOrder gives the orders of the specs", () => {
  it("keeps every preset's own order at its own level", () => {
    for (const p of Object.values(presets)) expect(fitOrder(p)).toEqual(p.order);
  });

  it("Saldo", () => {
    expect(fitted(presets.balance, "read-uncommitted")).toBe("T1 T2 T1 T1 T2 T2");
    expect(fitted(presets.balance, "serializable-2pl")).toBe("T1 T2 T1 T2 T1");
    expect(fitted(presets.balance, "snapshot")).toBe("T1 T2 T1 T1 T2");
  });

  it("Saldo with the fixes of module 5", () => {
    const atomic = { ...presets.balance, transactions: fixBalance("atomic") };
    const forUpdate = { ...presets.balance, transactions: fixBalance("forUpdate") };
    expect(fitted(atomic, "read-committed")).toBe("T1 T2 T1 T2");
    expect(fitted(atomic, "snapshot")).toBe("T1 T2 T1");
    expect(fitted(forUpdate, "serializable-2pl")).toBe("T1 T2 T1 T1 T2 T2");
  });

  it("Transferencia, Transferencias cruzadas and Guardia", () => {
    expect(fitted(presets.transfer, "serializable-2pl")).toBe("T1 T2 T2 T1 T1 T2 T2 T2");
    expect(fitted(presets.transfer, "snapshot")).toBe("T1 T2 T2 T2 T2 T2 T1 T1");
    expect(fitted(presets.crossTransfers, "read-committed")).toBe("T1 T2 T1 T2 T1 T2 T1 T2 T1");
    expect(fitted(presets.onCall, "read-committed")).toBe("T1 T1 T2 T2 T1 T2 T1 T2 T1 T2");
    expect(fitted(presets.onCall, "serializable-2pl")).toBe("T1 T1 T2 T2 T1 T2 T1 T2 T1");
  });

  it("finishes an order that stops early, and fixes one that names a waiting transaction", () => {
    expect(fitOrder({ ...presets.balance, order: [] }).join(" ")).toBe("T1 T1 T1 T2 T2 T2");
    expect(fitOrder({ ...presets.balance, order: ["T1", "T2", "T1", "T2", "T2"] }).join(" ")).toBe(
      "T1 T2 T1 T2 T1 T2",
    );
  });
});
