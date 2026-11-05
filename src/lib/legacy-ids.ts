/**
 * Ids that were published under another name. The site moved from Spanish to English slugs on
 * 2026-11-04. `public/_redirects` sends the old URLs to the new ones (checked by
 * legacy-ids.test.ts), and progress.ts renames stored progress kept under an old lesson id.
 */

/** Old path id → new path id. */
export const legacyPathIds: Readonly<Record<string, string>> = {
  "sistemas-operativos": "operating-systems",
};

/** Old lesson slug → new lesson slug. */
export const legacyLessonIds: Readonly<Record<string, string>> = {
  "procesos-estados": "process-states",
  "planificador-cpu": "cpu-scheduling",
  "condiciones-carrera": "race-conditions",
  "mutex-semaforos": "mutex-semaphores",
  interbloqueo: "deadlock",
  paginacion: "paging",
  "reemplazo-paginas": "page-replacement",
  "inodos-enlaces": "inodes-links",
};

/** Old standalone page slug → new slug. */
export const legacyPageIds: Readonly<Record<string, string>> = {
  acerca: "about",
};
