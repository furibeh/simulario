import { describe, expect, it } from "vitest";
import { presetIds, presets } from "../../engines/address-translation/presets";
import { simulate } from "../../engines/address-translation/simulate";
import type {
  TranslationExplainParams,
  TranslationExplanation,
} from "../../engines/address-translation/types";
import { addressTranslationEn } from "./address-translation.en";
import { addressTranslationEs } from "./address-translation.es";
import { type ExplainTemplates, renderExplanation } from "./types";

const locales: Record<string, ExplainTemplates<TranslationExplainParams>> = {
  es: addressTranslationEs,
  en: addressTranslationEn,
};

describe("address-translation explanation templates", () => {
  it("render every explanation without placeholders", () => {
    const seen = new Set<string>();
    for (const id of presetIds) {
      for (const tlbSize of [0, 1, 2]) {
        for (const step of simulate({ ...presets[id], tlbSize }).steps) {
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
    expect([...seen].sort()).toEqual(Object.keys(addressTranslationEs).sort());
  });

  it("renders the spec examples", () => {
    const examples: [TranslationExplanation, string, string][] = [
      [
        { key: "split", params: { addr: 70, page: 4, offset: 6 } },
        "La dirección virtual 70 es la página 4, desplazamiento 6.",
        "Virtual address 70 is page 4, offset 6.",
      ],
      [
        { key: "evict", params: { page: 0, frame: 0 } },
        "No hay marcos libres: la página 0 sale del marco 0 y vuelve al disco.",
        "No free frames: page 0 leaves frame 0 and goes back to disk.",
      ],
      [
        { key: "access", params: { frame: 1, offset: 6, pageSize: 16, phys: 22 } },
        "Dirección física: marco 1 × 16 + 6 = 22.",
        "Physical address: frame 1 × 16 + 6 = 22.",
      ],
      [
        { key: "segfault", params: { page: 5 } },
        "La página 5 no pertenece al programa: el sistema operativo termina el programa (violación de segmento).",
        "Page 5 is not part of the program: the operating system kills the program (segmentation fault).",
      ],
    ];
    for (const [explanation, es, en] of examples) {
      expect(renderExplanation(addressTranslationEs, explanation)).toBe(es);
      expect(renderExplanation(addressTranslationEn, explanation)).toBe(en);
    }
  });
});
