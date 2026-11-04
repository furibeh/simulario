import { describe, expect, it } from "vitest";
import { presetIds, presets } from "../../engines/process-states/presets";
import { simulate } from "../../engines/process-states/simulate";
import type {
  ProcessStatesExplainParams,
  ProcessStatesExplanation,
  ProcessStatesInput,
} from "../../engines/process-states/types";
import { processStatesEn } from "./process-states.en";
import { processStatesEs } from "./process-states.es";
import { type ExplainTemplates, renderExplanation } from "./types";

const locales: Record<string, ExplainTemplates<ProcessStatesExplainParams>> = {
  es: processStatesEs,
  en: processStatesEn,
};

describe("process-states explanation templates", () => {
  it("render every explanation without placeholders", () => {
    const inputs: ProcessStatesInput[] = presetIds.flatMap((preset) =>
      [null, 1, 2, 6].map((quantum) => ({ processes: presets[preset], quantum })),
    );
    // The presets start at t = 0; this workload covers "idle.arrivals".
    inputs.push({ processes: [{ id: "P1", arrival: 2, bursts: [1] }], quantum: null });

    const seen = new Set<string>();
    for (const input of inputs) {
      for (const step of simulate(input).steps) {
        for (const explanation of step.explain) {
          seen.add(explanation.key);
          for (const templates of Object.values(locales)) {
            const text = renderExplanation(templates, explanation);
            expect(text.trim()).not.toBe("");
            expect(text).not.toMatch(/undefined|NaN|\$\{|\{\w+\}/);
          }
        }
      }
    }
    expect([...seen].sort()).toEqual(Object.keys(processStatesEs).sort());
  });

  it("renders the spec examples", () => {
    const examples: [ProcessStatesExplanation, string, string][] = [
      [
        { key: "admit", params: { id: "P3" } },
        "Llega P3: el sistema lo crea y entra en la cola de listos.",
        "P3 arrives: the system creates it and it joins the ready queue.",
      ],
      [
        { key: "continue", params: { id: "P2", remaining: 2 } },
        "P2 sigue en la CPU: le quedan 2 unidades de esta ráfaga.",
        "P2 stays on the CPU: 2 units left in this burst.",
      ],
      [
        { key: "block", params: { id: "P1", duration: 3, until: 5 } },
        "P1 pide E/S y se bloquea durante 3 unidades (hasta t = 5).",
        "P1 requests I/O and blocks for 3 units (until t = 5).",
      ],
      [
        { key: "wakeup", params: { id: "P1" } },
        "Termina la E/S de P1: vuelve a la cola de listos, no a la CPU.",
        "P1's I/O finishes: it goes back to the ready queue, not the CPU.",
      ],
      [
        { key: "timeout", params: { id: "P2", quantum: 2 } },
        "Se agota el cuanto de P2 (2 unidades): vuelve al final de la cola.",
        "P2's quantum (2 units) runs out: back to the end of the queue.",
      ],
      [
        { key: "exit", params: { id: "P2", time: 5 } },
        "P2 termina su última ráfaga y sale en t = 5.",
        "P2 finishes its last burst and exits at t = 5.",
      ],
      [
        { key: "idle.io", params: {} },
        "CPU ociosa: los procesos que quedan esperan E/S.",
        "CPU idle: the remaining processes are waiting for I/O.",
      ],
    ];
    for (const [explanation, es, en] of examples) {
      expect(renderExplanation(processStatesEs, explanation)).toBe(es);
      expect(renderExplanation(processStatesEn, explanation)).toBe(en);
    }
  });

  it("uses the singular for one unit", () => {
    expect(
      renderExplanation(processStatesEs, { key: "continue", params: { id: "P1", remaining: 1 } }),
    ).toBe("P1 sigue en la CPU: le queda 1 unidad de esta ráfaga.");
    expect(
      renderExplanation(processStatesEn, { key: "continue", params: { id: "P1", remaining: 1 } }),
    ).toBe("P1 stays on the CPU: 1 unit left in this burst.");
  });
});
