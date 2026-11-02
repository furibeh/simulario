<script lang="ts">
import type { Snippet } from "svelte";
import { actionForKey, initialPlayerState, type PlayerAction, playerReducer } from "./state";

export interface PlayerLabels {
  region: string;
  run: string;
  pause: string;
  resume: string;
  replay: string;
  stepBack: string;
  stepForward: string;
  toStart: string;
  toEnd: string;
  speed: string;
  slow: string;
  normal: string;
  fast: string;
}

interface Props {
  /** Number of steps in the trace. */
  total: number;
  /** Any value that changes when the trace changes; the player rewinds when it does. */
  traceKey?: unknown;
  labels: PlayerLabels;
  /** Text announced to screen readers for the current cursor. */
  announce: (cursor: number) => string;
  /** Called once before the first step is shown (e.g. to lock a prediction). */
  onfirstplay?: () => void;
  /** Draws the simulation for the current cursor (0 = before the first step). */
  board: Snippet<[number]>;
}

let { total, traceKey, labels, announce, onfirstplay, board }: Props = $props();

const speeds = [
  { ms: 900, key: "slow" },
  { ms: 550, key: "normal" },
  { ms: 220, key: "fast" },
] as const;

let playback = $state(initialPlayerState(0));
let speed = $state(550);
let started = false;

$effect.pre(() => {
  void traceKey;
  playback = initialPlayerState(total);
  started = false;
});

function dispatch(action: PlayerAction) {
  const moving =
    action.type === "play" ||
    action.type === "toggle" ||
    action.type === "stepForward" ||
    action.type === "toEnd";
  if (!started && moving) {
    started = true;
    onfirstplay?.();
  }
  playback = playerReducer(playback, action);
}

$effect(() => {
  if (playback.status !== "playing") return;
  const id = setInterval(() => dispatch({ type: "tick" }), speed);
  return () => clearInterval(id);
});

function onkeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, select, textarea")) return;
  const action = actionForKey(event.key);
  if (!action) return;
  if (event.key === " " && target?.closest("button")) return;
  event.preventDefault();
  dispatch(action);
}

const primaryLabel = $derived(
  playback.status === "playing"
    ? labels.pause
    : playback.status === "ended"
      ? labels.replay
      : playback.cursor === 0
        ? labels.run
        : labels.resume,
);
</script>

<!-- Shortcuts complement the focusable buttons inside; key events bubble up from them. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="player" role="group" aria-label={labels.region} tabindex="-1" {onkeydown}>
  {@render board(playback.cursor)}

  <div class="controls">
    <button type="button" class="round" aria-label={labels.toStart} title={labels.toStart} onclick={() => dispatch({ type: "toStart" })}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 5v14M18 5l-8 7 8 7" /></svg>
    </button>
    <button type="button" class="round" aria-label={labels.stepBack} title={labels.stepBack} onclick={() => dispatch({ type: "stepBack" })}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
    </button>
    <button type="button" class="primary" onclick={() => dispatch({ type: "toggle" })}>{primaryLabel}</button>
    <button type="button" class="round" aria-label={labels.stepForward} title={labels.stepForward} onclick={() => dispatch({ type: "stepForward" })}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
    </button>
    <button type="button" class="round" aria-label={labels.toEnd} title={labels.toEnd} onclick={() => dispatch({ type: "toEnd" })}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 5v14M6 5l8 7-8 7" /></svg>
    </button>
    <label class="speed">
      {labels.speed}
      <select bind:value={speed}>
        {#each speeds as option (option.ms)}
          <option value={option.ms}>{labels[option.key]}</option>
        {/each}
      </select>
    </label>
  </div>

  <p class="visually-hidden" aria-live="polite">{announce(playback.cursor)}</p>
</div>

<style>
  .player {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .player:focus {
    outline: none;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }

  .round {
    width: 52px;
    height: 52px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: var(--outline);
    background: var(--color-surface);
    color: var(--color-ink);
    cursor: pointer;
  }

  .primary {
    min-height: 52px;
    min-width: 168px;
    padding: 0 var(--space-6);
    border-radius: var(--radius-pill);
    border: var(--outline);
    background: var(--color-ink);
    color: var(--color-on-ink);
    font-weight: 800;
    font-size: 1.125rem;
    cursor: pointer;
    box-shadow: var(--shadow-primary);
  }

  .primary:active,
  .round:active {
    transform: translateY(2px);
  }

  .speed {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .speed select {
    min-height: var(--target-min);
    padding: 0 var(--space-4);
    border-radius: var(--radius-pill);
    border: var(--outline);
    background: var(--color-surface);
  }

  @media (prefers-reduced-motion: reduce) {
    .primary:active,
    .round:active {
      transform: none;
    }
  }
</style>
