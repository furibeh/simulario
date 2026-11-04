import type { TranslationExplainParams } from "../../engines/address-translation/types";
import type { ExplainTemplates } from "./types";

export const addressTranslationEs: ExplainTemplates<TranslationExplainParams> = {
  split: ({ addr, page, offset }) =>
    `La dirección virtual ${addr} es la página ${page}, desplazamiento ${offset}.`,
  "tlb.hit": ({ page, frame }) =>
    `La TLB ya sabe dónde está la página ${page}: marco ${frame}. No hace falta leer la tabla de páginas.`,
  "tlb.miss": ({ page }) =>
    `La página ${page} no está en la TLB: hay que leer la tabla de páginas.`,
  "pt.hit": ({ page, frame }) =>
    `La tabla de páginas dice que la página ${page} está en el marco ${frame}.`,
  fault: ({ page }) =>
    `Fallo de página: la página ${page} es válida pero está en disco. El sistema operativo la carga.`,
  evict: ({ page, frame }) =>
    `No hay marcos libres: la página ${page} sale del marco ${frame} y vuelve al disco.`,
  "tlb.drop": ({ page }) => `La TLB olvida la página ${page}: su marco ya es de otra página.`,
  load: ({ page, frame }) =>
    `La página ${page} se carga en el marco ${frame} y la tabla de páginas se actualiza.`,
  segfault: ({ page }) =>
    `La página ${page} no pertenece al programa: el sistema operativo termina el programa (violación de segmento).`,
  "tlb.evict": ({ page }) =>
    `La TLB está llena: olvida la página ${page}, la usada hace más tiempo.`,
  "tlb.fill": ({ page, frame }) => `La TLB guarda la traducción página ${page} → marco ${frame}.`,
  access: ({ frame, offset, pageSize, phys }) =>
    `Dirección física: marco ${frame} × ${pageSize} + ${offset} = ${phys}.`,
};
