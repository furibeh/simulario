/**
 * DOM events that connect islands with the static lesson page.
 * Dispatched on `document`; they carry no data.
 */
export const RUN_FINISHED_EVENT = "simulario:run-finished";

export function announceRunFinished(): void {
  document.dispatchEvent(new CustomEvent(RUN_FINISHED_EVENT));
}
