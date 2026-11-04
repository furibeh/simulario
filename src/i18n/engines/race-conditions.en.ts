import type { RaceExplainParams } from "../../engines/race-conditions/types";
import type { ExplainTemplates } from "./types";

export const raceConditionsEn: ExplainTemplates<RaceExplainParams> = {
  dispatch: ({ id }) => `The scheduler gives the CPU to ${id}.`,
  preempt: ({ id, quantum }) =>
    `The timer interrupts ${id} after ${quantum === 1 ? "1 instruction" : `${quantum} instructions`} and saves its register.`,
  pick: ({ id }) => `You give the turn to ${id}.`,
  load: ({ id, value }) => `${id} reads counter = ${value} and copies it into its register.`,
  add: ({ id, value, counter }) =>
    `${id} adds 1 in its register: it now holds ${value}. counter is still ${counter}.`,
  store: ({ id, value }) => `${id} writes ${value} to counter.`,
  "store.stale": ({ id, value, loaded, before }) =>
    `${id} writes ${value} to counter, which already held ${before}. It computed it from ${loaded}: it erases what others added since then.`,
  inc: ({ id, value }) => `${id} increments counter atomically: it now holds ${value}.`,
  finish: ({ id }) => `${id} has finished all its increments.`,
};
