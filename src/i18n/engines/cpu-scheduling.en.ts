import type { Algorithm, CpuExplainParams } from "../../engines/cpu-scheduling/types";
import type { ExplainTemplates } from "./types";

export const algorithmNames: Record<Algorithm, string> = {
  fcfs: "FCFS",
  sjf: "SJF",
  srtf: "SRTF",
  priority: "Priority scheduling",
  rr: "Round Robin",
};

const units = (n: number) => (n === 1 ? "1 unit" : `${n} units`);

export const cpuSchedulingEn: ExplainTemplates<CpuExplainParams> = {
  "fcfs.pick": ({ id, arrival }) => `${id} is first in the queue (arrived at t = ${arrival}).`,
  "sjf.pick": ({ id, burst }) => `${id} has the shortest burst among ready processes (${burst}).`,
  "srtf.pick": ({ id, remaining }) =>
    `${id} has the least remaining time among ready processes (${remaining}).`,
  "srtf.preempt": ({ id, preempted, remaining, preemptedRemaining }) =>
    `${id} preempts ${preempted}: ${units(remaining)} left against ${preemptedRemaining}.`,
  "srtf.keep": ({ id, remaining }) =>
    `${id} keeps running: nobody in the queue has less remaining time (${remaining}).`,
  "priority.pick": ({ id, priority }) =>
    `${id} has the highest priority among ready processes (${priority}).`,
  "rr.pick": ({ id, quantum }) =>
    `${id}'s turn, first in the queue: it may run up to ${units(quantum)}.`,
  "rr.continue": ({ id, used, quantum }) =>
    `${id} continues: ${used} of its ${units(quantum)} of quantum used.`,
  "rr.expire": ({ id }) => `${id}'s quantum runs out: back to the end of the queue.`,
  "nonpreemptive.continue": ({ id, algorithm }) =>
    `${id} keeps running: ${algorithmNames[algorithm]} does not preempt, so it runs to completion.`,
  finish: ({ id, time }) => `${id} finishes at t = ${time}.`,
  idle: () => "CPU idle: no process is ready.",
};
