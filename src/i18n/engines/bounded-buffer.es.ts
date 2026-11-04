import type { BufferExplainParams } from "../../engines/bounded-buffer/types";
import type { ExplainTemplates } from "./types";

export const boundedBufferEs: ExplainTemplates<BufferExplainParams> = {
  dispatch: ({ id }) => `El planificador le da la CPU a ${id}.`,
  preempt: ({ id, quantum }) =>
    `Se agota el cuanto de ${id} (${quantum === 1 ? "1 operación" : `${quantum} operaciones`}): vuelve al final de la cola de listos.`,
  "wait.pass": ({ id, sem, value }) =>
    `${id} hace wait(${sem}): ${sem} baja a ${value} y ${id} sigue.`,
  "wait.block": ({ id, sem }) =>
    `${id} hace wait(${sem}), pero ${sem} vale 0: se bloquea en su cola y suelta la CPU.`,
  "signal.inc": ({ id, sem, value }) =>
    `${id} hace signal(${sem}): nadie espera, así que ${sem} sube a ${value}.`,
  "signal.wake": ({ id, sem, woken }) =>
    `${id} hace signal(${sem}): despierta a ${woken}, que pasa a listo con el permiso. ${sem} no cambia.`,
  put: ({ id, item, slot }) => `${id} deja ${item} en la casilla ${slot}.`,
  take: ({ id, item, slot }) => `${id} saca ${item} de la casilla ${slot}.`,
  finish: ({ id }) => `${id} terminó su trabajo.`,
  deadlock: () =>
    "Todos los hilos que quedan están bloqueados y ninguno puede despertar a otro: interbloqueo.",
  stuck: ({ id, sem }) => `${id} espera en ${sem} para siempre.`,
};
