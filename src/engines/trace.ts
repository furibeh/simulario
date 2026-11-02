/** Generic trace contract shared by every engine. See docs/architecture.md, "The trace contract". */

export interface Explanation<K extends string = string> {
  key: K;
  params?: Readonly<Record<string, string | number>>;
}

export interface Step<S, E extends Explanation = Explanation> {
  /** Simulated time at the start of the step. */
  t: number;
  /** Complete state after the step, never a diff. */
  state: S;
  /** Why this step happened, in order. */
  explain: readonly E[];
}

export interface Trace<S, R, E extends Explanation = Explanation> {
  steps: readonly Step<S, E>[];
  result: R;
}

export type Engine<I, S, R, E extends Explanation = Explanation> = (input: I) => Trace<S, R, E>;
