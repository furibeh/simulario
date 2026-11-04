import type { RaceExplainParams } from "../../engines/race-conditions/types";
import type { ExplainTemplates } from "./types";

export const raceConditionsEs: ExplainTemplates<RaceExplainParams> = {
  dispatch: ({ id }) => `El planificador le da la CPU a ${id}.`,
  preempt: ({ id, quantum }) =>
    `El temporizador interrumpe a ${id} tras ${quantum === 1 ? "1 instrucción" : `${quantum} instrucciones`} y guarda su registro.`,
  pick: ({ id }) => `Tú le das el turno a ${id}.`,
  load: ({ id, value }) => `${id} lee counter = ${value} y lo copia en su registro.`,
  add: ({ id, value, counter }) =>
    `${id} suma 1 en su registro: ahora vale ${value}. counter sigue en ${counter}.`,
  store: ({ id, value }) => `${id} escribe ${value} en counter.`,
  "store.stale": ({ id, value, loaded, before }) =>
    `${id} escribe ${value} en counter, que ya valía ${before}. Lo calculó a partir de ${loaded}: borra lo que otros sumaron desde entonces.`,
  inc: ({ id, value }) => `${id} incrementa counter de forma atómica: ahora vale ${value}.`,
  finish: ({ id }) => `${id} terminó todos sus incrementos.`,
};
