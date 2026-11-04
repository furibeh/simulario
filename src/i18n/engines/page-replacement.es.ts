import type { ReplacementExplainParams } from "../../engines/page-replacement/types";
import type { ExplainTemplates } from "./types";

export const pageReplacementEs: ExplainTemplates<ReplacementExplainParams> = {
  hit: ({ page, slot }) => `La página ${page} ya está en el marco ${slot}: acierto.`,
  load: ({ page, slot }) =>
    `Fallo de página: la ${page} no está en memoria y entra en el marco libre ${slot}.`,
  "evict.fifo": ({ page, victim, slot }) =>
    `Fallo de página: FIFO saca la página ${victim}, la que entró hace más tiempo, y pone la ${page} en el marco ${slot}.`,
  "evict.lru": ({ page, victim, slot }) =>
    `Fallo de página: LRU saca la página ${victim}, la que lleva más tiempo sin usarse, y pone la ${page} en el marco ${slot}.`,
  "evict.opt": ({ page, victim, slot, next }) =>
    `Fallo de página: OPT saca la página ${victim}, cuyo próximo uso es el más lejano (referencia ${next}), y pone la ${page} en el marco ${slot}.`,
  "evict.opt.never": ({ page, victim, slot }) =>
    `Fallo de página: OPT saca la página ${victim}, que no se volverá a usar, y pone la ${page} en el marco ${slot}.`,
  "clock.clear": ({ page, slot }) =>
    `El reloj apunta al marco ${slot} (página ${page}) con bit de uso 1: lo pone a 0 y avanza.`,
  "evict.clock": ({ page, victim, slot }) =>
    `El reloj encuentra la página ${victim} con bit 0 en el marco ${slot}: la saca y pone la ${page}.`,
};
