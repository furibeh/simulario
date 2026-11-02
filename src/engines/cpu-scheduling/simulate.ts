import {
  type CpuExplanation,
  type CpuInput,
  type CpuResult,
  type CpuStep,
  type CpuTrace,
  limits,
  type ProcessMetrics,
  type Segment,
  TIME_CAP,
} from "./types";

interface Proc {
  id: string;
  index: number;
  arrival: number;
  burst: number;
  priority: number;
  remaining: number;
  firstStart: number | null;
  finish: number | null;
}

/** Throws a RangeError describing the first invalid field. Rules: docs/lessons/planificador-cpu.md. */
export function assertValidInput(input: CpuInput): void {
  const { processes, quantum } = input;
  const inRange = (v: number, r: { min: number; max: number }) =>
    Number.isInteger(v) && v >= r.min && v <= r.max;
  if (processes.length < limits.processes.min || processes.length > limits.processes.max) {
    throw new RangeError(`Expected 2–6 processes, got ${processes.length}`);
  }
  const ids = new Set<string>();
  for (const p of processes) {
    if (ids.has(p.id)) throw new RangeError(`Duplicate process id ${p.id}`);
    ids.add(p.id);
    if (!inRange(p.arrival, limits.arrival)) throw new RangeError(`${p.id}: invalid arrival`);
    if (!inRange(p.burst, limits.burst)) throw new RangeError(`${p.id}: invalid burst`);
    if (!inRange(p.priority, limits.priority)) throw new RangeError(`${p.id}: invalid priority`);
  }
  if (!inRange(quantum, limits.quantum)) throw new RangeError("Invalid quantum");
}

/** Smallest key first; ties by earlier arrival, then input order. */
function pickBy(candidates: readonly Proc[], key: (p: Proc) => number): Proc | undefined {
  let best: Proc | undefined;
  for (const p of candidates) {
    if (
      best === undefined ||
      key(p) < key(best) ||
      (key(p) === key(best) &&
        (p.arrival < best.arrival || (p.arrival === best.arrival && p.index < best.index)))
    ) {
      best = p;
    }
  }
  return best;
}

/** Simulates CPU scheduling one time unit per step. Pure and deterministic. */
export function simulate(input: CpuInput): CpuTrace {
  assertValidInput(input);
  const { algorithm, quantum } = input;
  const procs: Proc[] = input.processes.map((p, index) => ({
    ...p,
    index,
    remaining: p.burst,
    firstStart: null,
    finish: null,
  }));

  const steps: CpuStep[] = [];
  const finished: string[] = [];
  let queue: Proc[] = [];
  let running: Proc | null = null;
  let expired: Proc | null = null;
  let used = 0;
  let t = 0;

  while (finished.length < procs.length && t < TIME_CAP) {
    // 1. Arrivals in input order. 2. RR: the process whose quantum expired goes after them.
    for (const p of procs) if (p.arrival === t) queue.push(p);
    if (expired) {
      queue.push(expired);
      expired = null;
    }

    const explain: CpuExplanation[] = [];

    // 3. Choose who runs during [t, t + 1).
    if (algorithm === "srtf") {
      const candidates = running ? [running, ...queue] : queue;
      let pick = pickBy(candidates, (p) => p.remaining);
      if (pick && running && running.remaining === pick.remaining) pick = running;
      if (pick) {
        if (!running) {
          explain.push({ key: "srtf.pick", params: { id: pick.id, remaining: pick.remaining } });
        } else if (pick !== running) {
          explain.push({
            key: "srtf.preempt",
            params: {
              id: pick.id,
              preempted: running.id,
              remaining: pick.remaining,
              preemptedRemaining: running.remaining,
            },
          });
          queue.push(running);
        } else {
          explain.push({ key: "srtf.keep", params: { id: pick.id, remaining: pick.remaining } });
        }
        const chosen: Proc = pick;
        queue = queue.filter((p) => p !== chosen);
        running = chosen;
      }
    } else if (!running && queue.length > 0) {
      let pick: Proc;
      if (algorithm === "sjf") {
        pick = pickBy(queue, (p) => p.burst) as Proc;
        explain.push({ key: "sjf.pick", params: { id: pick.id, burst: pick.burst } });
      } else if (algorithm === "priority") {
        pick = pickBy(queue, (p) => p.priority) as Proc;
        explain.push({ key: "priority.pick", params: { id: pick.id, priority: pick.priority } });
      } else {
        pick = queue[0] as Proc;
        explain.push(
          algorithm === "rr"
            ? { key: "rr.pick", params: { id: pick.id, quantum } }
            : { key: "fcfs.pick", params: { id: pick.id, arrival: pick.arrival } },
        );
      }
      queue = queue.filter((p) => p !== pick);
      running = pick;
      used = 0;
    } else if (running) {
      explain.push(
        algorithm === "rr"
          ? { key: "rr.continue", params: { id: running.id, used, quantum } }
          : { key: "nonpreemptive.continue", params: { id: running.id, algorithm } },
      );
    }

    const ranId = running?.id ?? null;
    const waiting = queue.map((p) => p.id);

    // 4. Run one unit.
    if (running) {
      running.firstStart ??= t;
      running.remaining -= 1;
      used += 1;
      if (running.remaining === 0) {
        running.finish = t + 1;
        finished.push(running.id);
        explain.push({ key: "finish", params: { id: running.id, time: t + 1 } });
        running = null;
        used = 0;
      } else if (algorithm === "rr" && used >= quantum) {
        explain.push({ key: "rr.expire", params: { id: running.id } });
        expired = running;
        running = null;
        used = 0;
      }
    } else {
      explain.push({ key: "idle", params: {} });
    }

    steps.push({
      t,
      state: {
        running: ranId,
        queue: waiting,
        finished: [...finished],
        remaining: Object.fromEntries(procs.map((p) => [p.id, p.remaining])),
      },
      explain,
    });
    t += 1;
  }

  return { steps, result: buildResult(procs, steps) };
}

function buildResult(procs: readonly Proc[], steps: readonly CpuStep[]): CpuResult {
  const metrics: ProcessMetrics[] = procs.map((p) => {
    const finish = p.finish ?? Number.NaN;
    const firstStart = p.firstStart ?? Number.NaN;
    const turnaround = finish - p.arrival;
    return {
      id: p.id,
      arrival: p.arrival,
      burst: p.burst,
      priority: p.priority,
      firstStart,
      finish,
      turnaround,
      waiting: turnaround - p.burst,
      response: firstStart - p.arrival,
    };
  });
  const mean = (k: "turnaround" | "waiting" | "response") =>
    metrics.reduce((sum, m) => sum + m[k], 0) / metrics.length;
  const finishOrder = [...metrics]
    .sort((a, b) => a.finish - b.finish || indexOf(procs, a.id) - indexOf(procs, b.id))
    .map((m) => m.id);

  return {
    processes: metrics,
    averages: {
      turnaround: mean("turnaround"),
      waiting: mean("waiting"),
      response: mean("response"),
    },
    finishOrder,
    segments: buildSegments(steps),
    makespan: steps.length,
  };
}

function indexOf(procs: readonly Proc[], id: string): number {
  return procs.findIndex((p) => p.id === id);
}

function buildSegments(steps: readonly CpuStep[]): Segment[] {
  const segments: Segment[] = [];
  let cut = false;
  for (const step of steps) {
    const last = segments.at(-1);
    if (last && last.id === step.state.running && !cut) last.end = step.t + 1;
    else segments.push({ id: step.state.running, start: step.t, end: step.t + 1 });
    cut = step.explain.some((e) => e.key === "rr.expire");
  }
  return segments;
}
