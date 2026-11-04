import { describe, expect, it } from "vitest";
import { presetIds, presets } from "../../engines/page-replacement/presets";
import { simulate } from "../../engines/page-replacement/simulate";
import {
  algorithms,
  type ReplacementExplainParams,
  type ReplacementExplanation,
} from "../../engines/page-replacement/types";
import { pageReplacementEn } from "./page-replacement.en";
import { pageReplacementEs } from "./page-replacement.es";
import { type ExplainTemplates, renderExplanation } from "./types";

const locales: Record<string, ExplainTemplates<ReplacementExplainParams>> = {
  es: pageReplacementEs,
  en: pageReplacementEn,
};

describe("page-replacement explanation templates", () => {
  it("render every explanation without placeholders", () => {
    const seen = new Set<string>();
    for (const id of presetIds) {
      for (const algorithm of algorithms) {
        for (const frames of [3, 4]) {
          for (const step of simulate({ refs: presets[id], frames, algorithm }).steps) {
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
    }
    expect([...seen].sort()).toEqual(Object.keys(pageReplacementEs).sort());
  });

  it("renders the spec examples", () => {
    const examples: [ReplacementExplanation, string, string][] = [
      [
        { key: "evict.fifo", params: { page: 5, victim: 1, slot: 0 } },
        "Fallo de página: FIFO saca la página 1, la que entró hace más tiempo, y pone la 5 en el marco 0.",
        "Page fault: FIFO evicts page 1, the one loaded longest ago, and puts page 5 in frame 0.",
      ],
      [
        { key: "evict.opt", params: { page: 4, victim: 3, slot: 2, next: 10 } },
        "Fallo de página: OPT saca la página 3, cuyo próximo uso es el más lejano (referencia 10), y pone la 4 en el marco 2.",
        "Page fault: OPT evicts page 3, whose next use is the farthest (reference 10), and puts page 4 in frame 2.",
      ],
      [
        { key: "clock.clear", params: { page: 1, slot: 0 } },
        "El reloj apunta al marco 0 (página 1) con bit de uso 1: lo pone a 0 y avanza.",
        "The hand points to frame 0 (page 1) with use bit 1: it clears it and moves on.",
      ],
    ];
    for (const [explanation, es, en] of examples) {
      expect(renderExplanation(pageReplacementEs, explanation)).toBe(es);
      expect(renderExplanation(pageReplacementEn, explanation)).toBe(en);
    }
  });
});
