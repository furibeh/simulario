import type { GraphInput, Operation, ThreadSpec } from "./types";

export const presetIds = ["philosophers", "twoLocks"] as const;
export type PresetId = (typeof presetIds)[number];

const a = (res: number): Operation => ({ op: "acquire", res });
const r = (res: number): Operation => ({ op: "release", res });
const w: Operation = { op: "work" };

/** "Filósofos": philosopher Ti takes its left fork Ri, then its right fork R(i+1), eats, puts both down. */
export function philosophers(n: number): GraphInput {
  const threads: ThreadSpec[] = Array.from({ length: n }, (_, i) => {
    const left = i + 1;
    const right = ((i + 1) % n) + 1;
    return { delay: 0, script: [a(left), a(right), w, r(right), r(left)] };
  });
  return { resources: n, threads, ordering: "script" };
}

/** "Dos cerrojos": T1 and T2 take R1 and R2 in opposite orders; T3 only uses R3. */
export const twoLocks: GraphInput = {
  resources: 3,
  threads: [
    { delay: 0, script: [a(1), w, a(2), w, r(2), r(1)] },
    { delay: 0, script: [a(2), w, a(1), w, r(1), r(2)] },
    { delay: 0, script: [a(3), w, w, r(3)] },
  ],
  ordering: "script",
};

/** Workloads from docs/lessons/interbloqueo.md. */
export const presets: Record<PresetId, GraphInput> = {
  philosophers: philosophers(5),
  twoLocks,
};
