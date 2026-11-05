import { describe, expect, it } from "vitest";
import { fixBalance, presetIds, presets } from "../../engines/transactions/presets";
import { simulate } from "../../engines/transactions/simulate";
import type { TxExplainParams, TxExplanation, TxInput } from "../../engines/transactions/types";
import { transactionsEn } from "./transactions.en";
import { transactionsEs } from "./transactions.es";
import { type ExplainTemplates, renderExplanation } from "./types";

const locales: Record<string, ExplainTemplates<TxExplainParams>> = {
  es: transactionsEs,
  en: transactionsEn,
};

describe("transactions explanation templates", () => {
  it("render every explanation without placeholders", () => {
    const inputs: TxInput[] = [
      ...presetIds.flatMap((id) =>
        (["read-uncommitted", "read-committed"] as const).map((isolation) => ({
          ...presets[id],
          isolation,
        })),
      ),
      { ...presets.balance, transactions: fixBalance("atomic"), order: ["T1", "T2", "T1", "T2"] },
      { ...presets.balance, transactions: fixBalance("forUpdate") },
      // Deadlock and reading your own write (spec, "Edge cases").
      {
        items: [0, 0],
        transactions: [
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
        isolation: "read-committed",
        order: ["T1", "T2", "T1", "T2", "T1"],
      },
      {
        items: [5],
        transactions: [
          [
            { op: "read", item: "x" },
            { op: "write", item: "x", value: 7 },
            { op: "read", item: "x" },
            { op: "commit" },
          ],
          [{ op: "read", item: "x" }, { op: "read", item: "x" }, { op: "commit" }],
        ],
        isolation: "read-committed",
        order: ["T2", "T1", "T1", "T1", "T1", "T2", "T2"],
      },
    ];
    const seen = new Set<string>();
    for (const input of inputs) {
      for (const step of simulate(input).steps) {
        for (const explanation of step.explain) {
          seen.add(explanation.key);
          for (const templates of Object.values(locales)) {
            const text = renderExplanation(templates, explanation);
            expect(text.trim()).not.toBe("");
            expect(text).not.toMatch(/undefined|NaN|null|\$\{|\{\w+\}/);
          }
        }
      }
    }
    expect([...seen].sort()).toEqual(Object.keys(transactionsEs).sort());
  });

  it("renders the spec examples", () => {
    const examples: [TxExplanation, string, string][] = [
      [
        {
          key: "read.hidden",
          params: { tx: "T2", item: "x", value: 100, writer: "T1", pending: 150 },
        },
        "T2 lee x = 100. T1 ya escribió 150, pero no lo ha confirmado: Read Committed solo deja ver lo confirmado.",
        "T2 reads x = 100. T1 has written 150 but not committed it: Read Committed shows only committed values.",
      ],
      [
        { key: "read.changed", params: { tx: "T1", item: "x", before: 50, value: 10 } },
        "La última vez T1 leyó x = 50; ahora lee 10: otra transacción confirmó un cambio entre medias.",
        "Last time T1 read x = 50; now it reads 10: another transaction committed a change in between.",
      ],
      [
        {
          key: "write.computed",
          params: { tx: "T2", item: "x", value: 120, read: 100, delta: 20 },
        },
        "T2 escribe x = 120: el 100 que leyó más 20. Aún no está confirmado.",
        "T2 writes x = 120: the 100 it read plus 20. Not committed yet.",
      ],
      [
        {
          key: "write.computed",
          params: { tx: "T2", item: "x", value: 10, read: 50, delta: -40 },
        },
        "T2 escribe x = 10: el 50 que leyó menos 40. Aún no está confirmado.",
        "T2 writes x = 10: the 50 it read minus 40. Not committed yet.",
      ],
      [
        {
          key: "write.stale",
          params: { tx: "T2", item: "x", read: 100, current: 150, by: "T1" },
        },
        "Pero x ya vale 150, confirmado por T1. T2 calculó a partir de 100: al confirmar, borrará ese cambio.",
        "But x is already 150, committed by T1. T2 computed from 100: when it commits, it erases that change.",
      ],
      [
        { key: "add", params: { tx: "T2", item: "x", before: 150, delta: 20, value: 170 } },
        "T2 suma 20 a x dentro de la base de datos: 150 → 170, sin confirmar todavía.",
        "T2 adds 20 to x inside the database: 150 → 170, not committed yet.",
      ],
      [
        { key: "lock.wait", params: { tx: "T2", item: "x", holder: "T1" } },
        "T2 quiere escribir x, pero T1 lo tiene bloqueado: T2 espera a que T1 termine.",
        "T2 wants to write x, but T1 holds its lock: T2 waits for T1 to finish.",
      ],
      [
        { key: "deadlock", params: { tx: "T2", path: "T2 → x → T1 → y → T2" } },
        "Ciclo de espera: T2 → x → T1 → y → T2. La base de datos aborta a T2 para romperlo.",
        "Waiting cycle: T2 → x → T1 → y → T2. The database aborts T2 to break it.",
      ],
    ];
    for (const [explanation, es, en] of examples) {
      expect(renderExplanation(transactionsEs, explanation)).toBe(es);
      expect(renderExplanation(transactionsEn, explanation)).toBe(en);
    }
  });
});
