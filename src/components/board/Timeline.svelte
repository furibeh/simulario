<script lang="ts">
import { type Slot, slotForId } from "../token/shapes";
import Token from "../token/Token.svelte";

export interface TimelineSegment {
  id: string | null;
  start: number;
  end: number;
}

interface Props {
  segments: readonly TimelineSegment[];
  /** Length of the whole axis. */
  total: number;
  /** Segments are drawn up to this instant. */
  cursor: number;
  /** Accessible summary of what is drawn. */
  label: string;
  /** Entity slot for an id; defaults to the number at the end of the id. */
  slotOf?: (id: string) => Slot;
}

let { segments, total, cursor, label, slotOf = slotForId }: Props = $props();

const span = $derived(Math.max(total, 1));
const pct = (v: number) => `${(v / span) * 100}%`;
const visible = $derived(
  segments
    .filter((s) => s.id !== null && s.start < cursor)
    .map((s) => ({ ...s, shownEnd: Math.min(s.end, cursor) })),
);
const tickStep = $derived(total > 24 ? 4 : total > 12 ? 2 : 1);
const ticks = $derived(
  Array.from({ length: Math.floor(total / tickStep) + 1 }, (_, i) => i * tickStep),
);
</script>

<figure class="timeline">
  <div class="track" role="img" aria-label={label}>
    {#each visible as seg (`${seg.id}-${seg.start}`)}
      <div
        class="bar"
        style:left={pct(seg.start)}
        style:width={pct(seg.shownEnd - seg.start)}
        style:--fill="var(--entity-{slotOf(seg.id ?? '')})"
        style:--on="var(--entity-{slotOf(seg.id ?? '')}-on)"
      >
        {#if seg.shownEnd - seg.start >= 2 || span <= 12}
          <span class="bar-label"><Token slot={slotOf(seg.id ?? "")} size={16} />{seg.id}</span>
        {/if}
      </div>
    {/each}
    <div class="playhead" style:left={pct(cursor)} aria-hidden="true"></div>
  </div>
  <div class="axis" aria-hidden="true">
    {#each ticks as tick (tick)}
      <span style:left={pct(tick)}>{tick}</span>
    {/each}
  </div>
</figure>

<style>
  .timeline {
    margin: 0;
  }

  .track {
    position: relative;
    height: 64px;
    border-radius: var(--radius-card);
    background: var(--color-ground);
  }

  .bar {
    position: absolute;
    top: 6px;
    bottom: 6px;
    box-sizing: border-box;
    margin-inline: 2px;
    max-width: calc(100% - 4px);
    border-radius: var(--radius-bar);
    background: var(--fill);
    color: var(--on);
    display: flex;
    align-items: center;
    overflow: hidden;
    transition: width var(--duration-move) var(--ease-move);
  }

  .bar-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding-left: 8px;
    font-weight: 800;
    font-size: 0.9375rem;
    white-space: nowrap;
  }

  .playhead {
    position: absolute;
    top: -6px;
    bottom: -6px;
    width: 4px;
    margin-left: -2px;
    border-radius: var(--radius-pill);
    background: var(--color-ink);
    transition: left var(--duration-move) var(--ease-move);
  }

  .axis {
    position: relative;
    height: 26px;
    font-size: var(--text-data);
    color: var(--color-ink-muted);
    font-variant-numeric: tabular-nums;
  }

  .axis span {
    position: absolute;
    top: 6px;
    transform: translateX(-50%);
  }
</style>
