/** Templates for an engine's explanation keys: one function per key, typed by its params. */
export type ExplainTemplates<P> = { [K in keyof P]: (params: P[K]) => string };

/** Renders an explanation with its matching template. */
export function renderExplanation<P, K extends keyof P>(
  templates: ExplainTemplates<P>,
  explanation: { key: K; params: P[K] },
): string {
  return templates[explanation.key](explanation.params);
}
