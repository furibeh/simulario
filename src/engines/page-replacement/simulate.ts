import {
  type Algorithm,
  algorithms,
  limits,
  type RefRecord,
  type ReplacementExplanation,
  type ReplacementInput,
  type ReplacementStep,
  type ReplacementTrace,
} from "./types";

const inRange = (v: number, r: { min: number; max: number }) =>
  Number.isInteger(v) && v >= r.min && v <= r.max;

/** Throws a RangeError describing the first invalid field. Rules: docs/lessons/page-replacement.md. */
export function assertValidInput(input: ReplacementInput): void {
  if (!inRange(input.refs.length, limits.refs)) throw new RangeError("Invalid reference count");
  if (!input.refs.every((p) => inRange(p, limits.page))) throw new RangeError("Invalid page");
  if (!inRange(input.frames, limits.frames)) throw new RangeError("Invalid frame count");
  if (!(algorithms as readonly string[]).includes(input.algorithm)) {
    throw new RangeError("Invalid algorithm");
  }
}

/** 0-based index of the next reference to `page` after `from`, or null. */
function nextIndex(refs: readonly number[], page: number, from: number): number | null {
  for (let i = from + 1; i < refs.length; i++) if (refs[i] === page) return i;
  return null;
}

/** Simulates a page replacement algorithm, one reference per step. Pure. */
export function simulate(input: ReplacementInput): ReplacementTrace {
  assertValidInput(input);
  const { refs, frames, algorithm } = input;
  const slots: (number | null)[] = Array.from({ length: frames }, () => null);
  const bits: (0 | 1)[] = Array.from({ length: frames }, () => 0);
  let queue: number[] = [];
  let recency: number[] = [];
  let hand = 0;
  const steps: ReplacementStep[] = [];
  const records: RefRecord[] = [];

  refs.forEach((page, index) => {
    const explain: ReplacementExplanation[] = [];
    let slot = slots.indexOf(page);
    let victim: number | null = null;
    const hit = slot >= 0;

    if (hit) {
      explain.push({ key: "hit", params: { page, slot } });
      bits[slot] = 1;
    } else {
      const free = slots.indexOf(null);
      if (free >= 0) {
        slot = free;
        explain.push({ key: "load", params: { page, slot } });
      } else {
        slot = chooseVictim(algorithm, index);
        victim = slots[slot] as number;
      }
      slots[slot] = page;
      bits[slot] = 1;
      if (victim !== null) queue = queue.filter((p) => p !== victim);
      queue = [...queue, page];
      if (victim !== null && algorithm === "clock") hand = (slot + 1) % frames;
    }
    recency = [...recency.filter((p) => p !== page && p !== victim), page];

    records.push({ index, page, hit, slot, victim });
    steps.push({
      t: index,
      state: {
        slots: [...slots],
        queue: [...queue],
        recency: [...recency],
        bits: [...bits],
        hand,
        nextUse: slots.map((p) => {
          if (p === null) return null;
          const next = nextIndex(refs, p, index);
          return next === null ? null : next + 1;
        }),
        record: { index, page, hit, slot, victim },
      },
      explain,
    });

    function chooseVictim(algo: Algorithm, at: number): number {
      switch (algo) {
        case "fifo": {
          const v = queue[0] as number;
          const s = slots.indexOf(v);
          explain.push({ key: "evict.fifo", params: { page, victim: v, slot: s } });
          return s;
        }
        case "lru": {
          const v = recency[0] as number;
          const s = slots.indexOf(v);
          explain.push({ key: "evict.lru", params: { page, victim: v, slot: s } });
          return s;
        }
        case "opt": {
          let best = 0;
          let bestNext = -1;
          slots.forEach((p, s) => {
            const next = nextIndex(refs, p as number, at);
            const distance = next === null ? Number.POSITIVE_INFINITY : next;
            if (distance > bestNext) {
              best = s;
              bestNext = distance;
            }
          });
          const v = slots[best] as number;
          explain.push(
            bestNext === Number.POSITIVE_INFINITY
              ? { key: "evict.opt.never", params: { page, victim: v, slot: best } }
              : { key: "evict.opt", params: { page, victim: v, slot: best, next: bestNext + 1 } },
          );
          return best;
        }
        case "clock": {
          while (bits[hand] === 1) {
            bits[hand] = 0;
            explain.push({
              key: "clock.clear",
              params: { page: slots[hand] as number, slot: hand },
            });
            hand = (hand + 1) % frames;
          }
          const v = slots[hand] as number;
          explain.push({ key: "evict.clock", params: { page, victim: v, slot: hand } });
          return hand;
        }
      }
    }
  });

  const faults = records.filter((r) => !r.hit).length;
  return {
    steps,
    result: {
      records,
      faults,
      hits: records.length - faults,
      compulsory: new Set(refs).size,
    },
  };
}

/** Faults for every algorithm with 1–6 frames on the same references. */
export function faultTable(refs: readonly number[]): Record<Algorithm, number[]> {
  const table = {} as Record<Algorithm, number[]>;
  for (const algorithm of algorithms) {
    table[algorithm] = Array.from(
      { length: limits.frames.max },
      (_, i) => simulate({ refs, frames: i + 1, algorithm }).result.faults,
    );
  }
  return table;
}
