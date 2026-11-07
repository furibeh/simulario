import {
  limits,
  type ProcessMetrics,
  type ProcessStatesExplanation,
  type ProcessStatesInput,
  type ProcessStatesResult,
  type ProcessStatesStep,
  type ProcessStatesTrace,
  type ProcessStatus,
  type Segment,
  TIME_CAP,
} from "./types";

interface Proc {
  id: string;
  arrival: number;
  bursts: readonly number[];
  status: ProcessStatus;
  burst: number;
  remaining: number;
  ioUntil: number | null;
  cpu: number;
  io: number;
  ready: number;
  finish: number | null;
}

/** Throws a RangeError describing the first invalid field. Rules: docs/lessons/operating-systems/process-states.md. */
export function assertValidInput(input: ProcessStatesInput): void {
  const { processes, quantum } = input;
  const inRange = (v: number, r: { min: number; max: number }) =>
    Number.isInteger(v) && v >= r.min && v <= r.max;
  if (processes.length < limits.processes.min || processes.length > limits.processes.max) {
    throw new RangeError(
      `Expected ${limits.processes.min}–${limits.processes.max} processes, got ${processes.length}`,
    );
  }
  const ids = new Set<string>();
  for (const p of processes) {
    if (ids.has(p.id)) throw new RangeError(`Duplicate process id ${p.id}`);
    ids.add(p.id);
    if (!inRange(p.arrival, limits.arrival)) throw new RangeError(`${p.id}: invalid arrival`);
    if (!(limits.burstCounts as readonly number[]).includes(p.bursts.length)) {
      throw new RangeError(`${p.id}: expected ${limits.burstCounts.join(", ")} bursts`);
    }
    if (!p.bursts.every((b) => inRange(b, limits.burst))) {
      throw new RangeError(`${p.id}: invalid burst`);
    }
  }
  if (quantum !== null && !inRange(quantum, limits.quantum))
    throw new RangeError("Invalid quantum");
}

/** Simulates process states one instant per step. Pure and deterministic. */
export function simulate(input: ProcessStatesInput): ProcessStatesTrace {
  assertValidInput(input);
  const { quantum } = input;
  const procs: Proc[] = input.processes.map((p) => ({
    id: p.id,
    arrival: p.arrival,
    bursts: p.bursts,
    status: "absent",
    burst: 0,
    remaining: p.bursts[0] ?? 0,
    ioUntil: null,
    cpu: 0,
    io: 0,
    ready: 0,
    finish: null,
  }));

  const steps: ProcessStatesStep[] = [];
  let queue: Proc[] = [];
  let running: Proc | null = null;
  let used = 0;
  let busy = 0;

  for (let t = 0; t <= TIME_CAP; t++) {
    const explain: ProcessStatesExplanation[] = [];
    let timedOut: Proc | null = null;

    // 1. End the unit [t − 1, t) for the process that ran in it.
    if (running && running.remaining === 0) {
      running.burst += 1;
      const io = running.bursts[running.burst];
      if (io === undefined) {
        running.status = "terminated";
        running.finish = t;
        explain.push({ key: "exit", params: { id: running.id, time: t } });
      } else {
        running.status = "blocked";
        running.remaining = io;
        running.ioUntil = t + io;
        explain.push({ key: "block", params: { id: running.id, duration: io, until: t + io } });
      }
      running = null;
    } else if (running && quantum !== null && used >= quantum) {
      running.status = "ready";
      explain.push({ key: "timeout", params: { id: running.id, quantum } });
      timedOut = running;
      running = null;
    }

    // 2. Admissions, in input order.
    for (const p of procs) {
      if (p.status === "absent" && p.arrival === t) {
        p.status = "ready";
        queue.push(p);
        explain.push({ key: "admit", params: { id: p.id } });
      }
    }

    // 3. I/O completions, in input order.
    for (const p of procs) {
      if (p.status === "blocked" && p.ioUntil === t) {
        p.status = "ready";
        p.burst += 1;
        p.remaining = p.bursts[p.burst] ?? 0;
        p.ioUntil = null;
        queue.push(p);
        explain.push({ key: "wakeup", params: { id: p.id } });
      }
    }

    // 4. The timed-out process goes last.
    if (timedOut) queue.push(timedOut);

    // 5. Choose who runs during [t, t + 1).
    const done = procs.every((p) => p.status === "terminated");
    if (!done) {
      if (running) {
        explain.push({ key: "continue", params: { id: running.id, remaining: running.remaining } });
      } else {
        const head = queue[0];
        if (head) {
          queue = queue.slice(1);
          head.status = "running";
          running = head;
          used = 0;
          explain.push({ key: "dispatch", params: { id: head.id } });
        } else if (procs.some((p) => p.status === "blocked")) {
          explain.push({ key: "idle.io", params: {} });
        } else {
          explain.push({ key: "idle.arrivals", params: {} });
        }
      }
    }

    steps.push({
      t,
      state: {
        processes: procs.map((p) => ({
          id: p.id,
          status: p.status,
          burst: p.burst,
          remaining: p.remaining,
          ioUntil: p.ioUntil,
          cpu: p.cpu,
          io: p.io,
          ready: p.ready,
        })),
        running: running?.id ?? null,
        queue: queue.map((p) => p.id),
        busy,
      },
      explain,
    });
    if (done) break;

    // 6. Run one unit.
    if (running) {
      running.remaining -= 1;
      running.cpu += 1;
      used += 1;
      busy += 1;
    }
    for (const p of procs) {
      if (p.status === "blocked") {
        p.remaining -= 1;
        p.io += 1;
      }
    }
    for (const p of queue) p.ready += 1;
  }

  return { steps, result: buildResult(procs, steps, busy) };
}

function buildResult(
  procs: readonly Proc[],
  steps: readonly ProcessStatesStep[],
  busy: number,
): ProcessStatesResult {
  const metrics: ProcessMetrics[] = procs.map((p) => {
    const finish = p.finish ?? Number.NaN;
    return {
      id: p.id,
      arrival: p.arrival,
      bursts: p.bursts,
      finish,
      turnaround: finish - p.arrival,
      cpu: p.bursts.reduce((sum, b, i) => (i % 2 === 0 ? sum + b : sum), 0),
      io: p.bursts.reduce((sum, b, i) => (i % 2 === 1 ? sum + b : sum), 0),
      ready: p.ready,
    };
  });
  const finishOrder = metrics
    .map((m, index) => ({ m, index }))
    .sort((a, b) => a.m.finish - b.m.finish || a.index - b.index)
    .map(({ m }) => m.id);
  const makespan = Math.max(...metrics.map((m) => m.finish));

  return {
    processes: metrics,
    finishOrder,
    cpuSegments: buildCpuSegments(steps),
    ioSegments: buildIoSegments(steps),
    makespan,
    busy,
    utilization: busy / makespan,
    serialTime: metrics.reduce((sum, m) => sum + m.cpu + m.io, 0),
  };
}

/** Every step but the last holds one unit; a timeout always starts a new turn. */
function buildCpuSegments(steps: readonly ProcessStatesStep[]): Segment[] {
  const segments: Segment[] = [];
  for (const step of steps.slice(0, -1)) {
    const last = segments.at(-1);
    const cut = step.explain.some((e) => e.key === "timeout");
    if (last && last.id === step.state.running && !cut) last.end = step.t + 1;
    else segments.push({ id: step.state.running, start: step.t, end: step.t + 1 });
  }
  return segments;
}

function buildIoSegments(steps: readonly ProcessStatesStep[]): Segment[] {
  return steps.flatMap((step) =>
    step.explain.flatMap((e) =>
      e.key === "block" ? [{ id: e.params.id, start: step.t, end: e.params.until }] : [],
    ),
  );
}
