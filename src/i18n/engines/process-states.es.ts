import type { ProcessStatesExplainParams } from "../../engines/process-states/types";
import type { ExplainTemplates } from "./types";

const units = (n: number) => (n === 1 ? "1 unidad" : `${n} unidades`);

export const processStatesEs: ExplainTemplates<ProcessStatesExplainParams> = {
  admit: ({ id }) => `Llega ${id}: el sistema lo crea y entra en la cola de listos.`,
  dispatch: ({ id }) => `El planificador le da la CPU a ${id}, el primero de la cola de listos.`,
  continue: ({ id, remaining }) =>
    `${id} sigue en la CPU: le ${remaining === 1 ? "queda" : "quedan"} ${units(remaining)} de esta ráfaga.`,
  block: ({ id, duration, until }) =>
    `${id} pide E/S y se bloquea durante ${units(duration)} (hasta t = ${until}).`,
  wakeup: ({ id }) => `Termina la E/S de ${id}: vuelve a la cola de listos, no a la CPU.`,
  timeout: ({ id, quantum }) =>
    `Se agota el cuanto de ${id} (${units(quantum)}): vuelve al final de la cola.`,
  exit: ({ id, time }) => `${id} termina su última ráfaga y sale en t = ${time}.`,
  "idle.io": () => "CPU ociosa: los procesos que quedan esperan E/S.",
  "idle.arrivals": () => "CPU ociosa: todavía no ha llegado ningún proceso listo.",
};
