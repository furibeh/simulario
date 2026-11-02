<script lang="ts">
import { onMount } from "svelte";
import {
  applyTheme,
  nextTheme,
  readTheme,
  type ThemePreference,
  writeTheme,
} from "../../lib/theme";

interface Props {
  /** Accessible labels, one per mode the button switches to. */
  labels: Record<ThemePreference, string>;
}

let { labels }: Props = $props();
let theme = $state<ThemePreference>("system");
const next = $derived(nextTheme(theme));

onMount(() => {
  theme = readTheme(globalThis.localStorage);
});

function toggle() {
  theme = next;
  applyTheme(document.documentElement, theme);
  writeTheme(globalThis.localStorage, theme);
}
</script>

<button type="button" class="toggle" aria-label={labels[next]} title={labels[next]} onclick={toggle}>
  {#if theme === "dark"}
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  {:else if theme === "light"}
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  {:else}
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
    </svg>
  {/if}
</button>

<style>
  .toggle {
    width: var(--target-min);
    height: var(--target-min);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: var(--outline);
    background: var(--color-surface);
    color: var(--color-ink);
    cursor: pointer;
  }
</style>
