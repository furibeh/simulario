import type { Algorithm, CpuExplainParams } from "../../engines/cpu-scheduling/types";
import type { ExplainTemplates } from "./types";

export const algorithmNames: Record<Algorithm, string> = {
  fcfs: "FCFS",
  sjf: "SJF",
  srtf: "SRTF",
  priority: "La planificación por prioridad",
  rr: "Round Robin",
};

const units = (n: number) => (n === 1 ? "1 unidad" : `${n} unidades`);

export const cpuSchedulingEs: ExplainTemplates<CpuExplainParams> = {
  "fcfs.pick": ({ id, arrival }) => `${id} es el primero en la cola (llegó en t = ${arrival}).`,
  "sjf.pick": ({ id, burst }) => `${id} tiene la ráfaga más corta entre los listos (${burst}).`,
  "srtf.pick": ({ id, remaining }) =>
    `${id} tiene el menor tiempo restante entre los listos (${remaining}).`,
  "srtf.preempt": ({ id, preempted, remaining, preemptedRemaining }) =>
    `${id} expropia a ${preempted}: le quedan ${units(remaining)} contra ${preemptedRemaining}.`,
  "srtf.keep": ({ id, remaining }) =>
    `Sigue ${id}: nadie en la cola tiene menos tiempo restante (${remaining}).`,
  "priority.pick": ({ id, priority }) =>
    `${id} tiene la prioridad más alta entre los listos (${priority}).`,
  "rr.pick": ({ id, quantum }) =>
    `Turno de ${id}, el primero de la cola: puede correr hasta ${units(quantum)}.`,
  "rr.continue": ({ id, used, quantum }) =>
    `${id} continúa: lleva ${used} de ${units(quantum)} de su cuanto.`,
  "rr.expire": ({ id }) => `Se agota el cuanto de ${id}: vuelve al final de la cola.`,
  "nonpreemptive.continue": ({ id, algorithm }) =>
    `Sigue ${id}: ${algorithmNames[algorithm]} no expropia, así que corre hasta terminar.`,
  finish: ({ id, time }) => `${id} termina en t = ${time}.`,
  idle: () => "CPU ociosa: no hay ningún proceso listo.",
};
