<script lang="ts">
import { type Slot, shapePaths } from "./shapes";

interface Props {
  slot: Slot;
  /** Accessible name, e.g. "P2, cuadrado". Omit when the id is shown as text next to the token. */
  label?: string;
  size?: number;
  variant?: "filled" | "outline";
}

let { slot, label, size = 34, variant = "filled" }: Props = $props();
</script>

<svg
  class="token"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  role={label ? "img" : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : "true"}
>
  {#if variant === "filled"}
    <path
      d={shapePaths[slot]}
      fill="var(--entity-{slot})"
      stroke="var(--color-ink)"
      stroke-width="1.2"
      stroke-linejoin="round"
    />
  {:else}
    <path
      d={shapePaths[slot]}
      fill="none"
      stroke="var(--entity-{slot}-line)"
      stroke-width="2.4"
      stroke-linejoin="round"
    />
  {/if}
</svg>

<style>
  .token {
    flex: none;
    overflow: visible;
  }
</style>
