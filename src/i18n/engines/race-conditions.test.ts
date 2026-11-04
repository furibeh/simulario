import { describe, expect, it } from "vitest";
import { presetIds, presets } from "../../engines/race-conditions/presets";
import { simulate } from "../../engines/race-conditions/simulate";
import type {
  RaceExplainParams,
  RaceExplanation,
  RaceInput,
} from "../../engines/race-conditions/types";
import { raceConditionsEn } from "./race-conditions.en";
import { raceConditionsEs } from "./race-conditions.es";
import { type ExplainTemplates, renderExplanation } from "./types";

const locales: Record<string, ExplainTemplates<RaceExplainParams>> = {
  es: raceConditionsEs,
  en: raceConditionsEn,
};

describe("race-conditions explanation templates", () => {
  it("render every explanation without placeholders", () => {
    const inputs: RaceInput[] = presetIds.flatMap((preset) =>
      [false, true].flatMap((atomic) =>
        presets[preset].schedule.kind === "manual"
          ? atomic
            ? []
            : [presets[preset]]
          : [1, 2, 4].map((quantum) => ({
              ...presets[preset],
              atomic,
              schedule: { kind: "timer" as const, quantum },
            })),
      ),
    );
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
    expect([...seen].sort()).toEqual(Object.keys(raceConditionsEs).sort());
  });

  it("renders the spec examples", () => {
    const examples: [RaceExplanation, string, string][] = [
      [
        { key: "preempt", params: { id: "T1", quantum: 2 } },
        "El temporizador interrumpe a T1 tras 2 instrucciones y guarda su registro.",
        "The timer interrupts T1 after 2 instructions and saves its register.",
      ],
      [
        { key: "add", params: { id: "T1", value: 1, counter: 0 } },
        "T1 suma 1 en su registro: ahora vale 1. counter sigue en 0.",
        "T1 adds 1 in its register: it now holds 1. counter is still 0.",
      ],
      [
        { key: "store.stale", params: { id: "T2", value: 1, loaded: 0, before: 1 } },
        "T2 escribe 1 en counter, que valía 1. Lo calculó a partir de 0, un valor que ya no estaba al día: su escritura pisa lo que otros escribieron desde entonces.",
        "T2 writes 1 to counter, which held 1. It computed it from 0, a value that was no longer current: its write overwrites what others wrote since then.",
      ],
      [
        { key: "preempt", params: { id: "T2", quantum: 1 } },
        "El temporizador interrumpe a T2 tras 1 instrucción y guarda su registro.",
        "The timer interrupts T2 after 1 instruction and saves its register.",
      ],
    ];
    for (const [explanation, es, en] of examples) {
      expect(renderExplanation(raceConditionsEs, explanation)).toBe(es);
      expect(renderExplanation(raceConditionsEn, explanation)).toBe(en);
    }
  });
});
