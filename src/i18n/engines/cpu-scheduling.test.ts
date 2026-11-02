import { describe, expect, it } from "vitest";
import { presetIds, presets } from "../../engines/cpu-scheduling/presets";
import { simulate } from "../../engines/cpu-scheduling/simulate";
import { algorithms, type CpuExplainParams } from "../../engines/cpu-scheduling/types";
import { cpuSchedulingEn } from "./cpu-scheduling.en";
import { cpuSchedulingEs } from "./cpu-scheduling.es";
import { type ExplainTemplates, renderExplanation } from "./types";

const locales: Record<string, ExplainTemplates<CpuExplainParams>> = {
  es: cpuSchedulingEs,
  en: cpuSchedulingEn,
};

describe("cpu-scheduling explanation templates", () => {
  it("render every explanation of every preset and algorithm without placeholders", () => {
    const seen = new Set<string>();
    for (const preset of presetIds) {
      for (const algorithm of algorithms) {
        for (const quantum of [1, 2, 6]) {
          const { steps } = simulate({ processes: presets[preset], algorithm, quantum });
          for (const step of steps) {
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
      }
    }
    // The presets exercise every key except "idle", covered below.
    expect(seen.size).toBe(Object.keys(cpuSchedulingEs).length - 1);
  });

  it("renders the spec examples", () => {
    expect(
      renderExplanation(cpuSchedulingEs, { key: "finish", params: { id: "P2", time: 12 } }),
    ).toBe("P2 termina en t = 12.");
    expect(
      renderExplanation(cpuSchedulingEn, {
        key: "srtf.preempt",
        params: { id: "P2", preempted: "P1", remaining: 2, preemptedRemaining: 9 },
      }),
    ).toBe("P2 preempts P1: 2 units left against 9.");
    expect(renderExplanation(cpuSchedulingEn, { key: "idle", params: {} })).toBe(
      "CPU idle: no process is ready.",
    );
  });
});
