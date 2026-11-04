import { describe, expect, it } from "vitest";
import { philosophers, twoLocks } from "../../engines/resource-graph/presets";
import { simulate } from "../../engines/resource-graph/simulate";
import type {
  GraphExplainParams,
  GraphExplanation,
  GraphInput,
} from "../../engines/resource-graph/types";
import { resourceGraphEn } from "./resource-graph.en";
import { resourceGraphEs } from "./resource-graph.es";
import { type ExplainTemplates, renderExplanation } from "./types";

const locales: Record<string, ExplainTemplates<GraphExplainParams>> = {
  es: resourceGraphEs,
  en: resourceGraphEn,
};

describe("resource-graph explanation templates", () => {
  it("render every explanation without placeholders", () => {
    const inputs: GraphInput[] = [
      philosophers(5),
      { ...philosophers(5), ordering: "global" },
      twoLocks,
      {
        ...twoLocks,
        threads: twoLocks.threads.map((th, i) => (i === 1 ? { ...th, delay: 2 } : th)),
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
    expect([...seen].sort()).toEqual(Object.keys(resourceGraphEs).sort());
  });

  it("renders the spec examples", () => {
    const examples: [GraphExplanation, string, string][] = [
      [
        { key: "block", params: { id: "T2", res: "R1", holder: "T1" } },
        "T2 pide R1, pero lo tiene T1: T2 se bloquea esperándolo.",
        "T2 asks for R1, but T1 holds it: T2 blocks waiting for it.",
      ],
      [
        { key: "handoff", params: { id: "T1", res: "R2", to: "T2" } },
        "T1 suelta R2 y se lo entrega a T2, que despierta.",
        "T1 releases R2 and hands it to T2, which wakes up.",
      ],
      [
        { key: "cycle", params: { path: "T2 → R1 → T1 → R2 → T2" } },
        "Se cerró un ciclo: T2 → R1 → T1 → R2 → T2. Cada hilo espera algo que tiene el siguiente: ninguno podrá avanzar.",
        "A cycle closed: T2 → R1 → T1 → R2 → T2. Each thread waits for something the next one holds: none can move.",
      ],
      [
        { key: "stalled", params: { count: 2 } },
        "No queda ningún hilo listo: 2 hilos están bloqueados para siempre.",
        "No thread is ready: 2 threads are blocked forever.",
      ],
      [
        { key: "stalled", params: { count: 1 } },
        "No queda ningún hilo listo: 1 hilo está bloqueado para siempre.",
        "No thread is ready: 1 thread is blocked forever.",
      ],
    ];
    for (const [explanation, es, en] of examples) {
      expect(renderExplanation(resourceGraphEs, explanation)).toBe(es);
      expect(renderExplanation(resourceGraphEn, explanation)).toBe(en);
    }
  });
});
