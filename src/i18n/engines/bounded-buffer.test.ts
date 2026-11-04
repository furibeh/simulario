import { describe, expect, it } from "vitest";
import { presetIds, presets } from "../../engines/bounded-buffer/presets";
import { simulate } from "../../engines/bounded-buffer/simulate";
import type { BufferExplainParams, BufferExplanation } from "../../engines/bounded-buffer/types";
import { boundedBufferEn } from "./bounded-buffer.en";
import { boundedBufferEs } from "./bounded-buffer.es";
import { type ExplainTemplates, renderExplanation } from "./types";

const locales: Record<string, ExplainTemplates<BufferExplainParams>> = {
  es: boundedBufferEs,
  en: boundedBufferEn,
};

describe("bounded-buffer explanation templates", () => {
  it("render every explanation without placeholders", () => {
    const seen = new Set<string>();
    for (const id of presetIds) {
      for (const quantum of [null, 1, 2]) {
        for (const step of simulate({ ...presets[id], quantum }).steps) {
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
    }
    expect([...seen].sort()).toEqual(Object.keys(boundedBufferEs).sort());
  });

  it("renders the spec examples", () => {
    const examples: [BufferExplanation, string, string][] = [
      [
        { key: "preempt", params: { id: "P1", quantum: 1 } },
        "Se agota el cuanto de P1 (1 operación): vuelve al final de la cola de listos.",
        "P1's quantum (1 operation) runs out: back to the end of the ready queue.",
      ],
      [
        { key: "wait.pass", params: { id: "P1", sem: "empty", value: 1 } },
        "P1 hace wait(empty): empty baja a 1 y P1 sigue.",
        "P1 does wait(empty): empty drops to 1 and P1 continues.",
      ],
      [
        { key: "wait.block", params: { id: "P1", sem: "empty" } },
        "P1 hace wait(empty), pero empty vale 0: se bloquea en su cola y suelta la CPU.",
        "P1 does wait(empty), but empty is 0: it blocks in its queue and gives up the CPU.",
      ],
      [
        { key: "signal.wake", params: { id: "C1", sem: "empty", woken: "P1" } },
        "C1 hace signal(empty): despierta a P1, que pasa a listo con el permiso. empty no cambia.",
        "C1 does signal(empty): it wakes P1, which becomes ready holding the permit. empty does not change.",
      ],
      [
        { key: "stuck", params: { id: "P1", sem: "empty" } },
        "P1 espera en empty para siempre.",
        "P1 waits on empty forever.",
      ],
    ];
    for (const [explanation, es, en] of examples) {
      expect(renderExplanation(boundedBufferEs, explanation)).toBe(es);
      expect(renderExplanation(boundedBufferEn, explanation)).toBe(en);
    }
  });
});
