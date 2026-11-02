/** PEE lesson stages, in reading order. See docs/architecture.md, "Content model". */
export const stageIds = [
  "prerequisites",
  "theory",
  "predict",
  "run",
  "explain",
  "experiment",
  "check",
  "deeper",
] as const;

export type StageId = (typeof stageIds)[number];

/** Stages shown in the lesson stepper (the core loop). */
export const stepperStages = [
  "theory",
  "predict",
  "run",
  "explain",
  "experiment",
  "check",
] as const satisfies readonly StageId[];
