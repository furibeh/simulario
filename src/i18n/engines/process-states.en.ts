import type { ProcessStatesExplainParams } from "../../engines/process-states/types";
import type { ExplainTemplates } from "./types";

const units = (n: number) => (n === 1 ? "1 unit" : `${n} units`);

export const processStatesEn: ExplainTemplates<ProcessStatesExplainParams> = {
  admit: ({ id }) => `${id} arrives: the system creates it and it joins the ready queue.`,
  dispatch: ({ id }) => `The scheduler gives the CPU to ${id}, first in the ready queue.`,
  continue: ({ id, remaining }) =>
    `${id} stays on the CPU: ${units(remaining)} left in this burst.`,
  block: ({ id, duration, until }) =>
    `${id} requests I/O and blocks for ${units(duration)} (until t = ${until}).`,
  wakeup: ({ id }) => `${id}'s I/O finishes: it goes back to the ready queue, not the CPU.`,
  timeout: ({ id, quantum }) =>
    `${id}'s quantum (${units(quantum)}) runs out: back to the end of the queue.`,
  exit: ({ id, time }) => `${id} finishes its last burst and exits at t = ${time}.`,
  "idle.io": () => "CPU idle: the remaining processes are waiting for I/O.",
  "idle.arrivals": () => "CPU idle: no ready process has arrived yet.",
};
