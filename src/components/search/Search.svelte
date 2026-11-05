<script lang="ts">
import { type Locale, localizedPath } from "../../i18n/config";
import { useTranslations } from "../../i18n/t";
import { loadPagefind } from "../../lib/pagefind";
import { isSearchShortcut } from "../../lib/search";
import SearchPanel from "./SearchPanel.svelte";

interface Props {
  lang: Locale;
}

let { lang }: Props = $props();
const t = $derived(useTranslations(lang));
const uid = $props.id();

let dialog: HTMLDialogElement | undefined = $state();
let trigger: HTMLAnchorElement | undefined = $state();
let panel: SearchPanel | undefined = $state();
let returnFocus: HTMLElement | null = null;

/** Starts loading the index early (hover or focus on the trigger); errors surface on search. */
function warm(): void {
  loadPagefind().catch(() => {});
}

/** The search page has its own field: shortcuts and the trigger focus it instead of the dialog. */
function pageField(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>("[data-search-page] [data-search-input]");
}

function open(): void {
  const field = pageField();
  if (field) {
    field.focus();
    field.select();
    return;
  }
  if (!dialog) return;
  if (!dialog.open) {
    const active = document.activeElement;
    // Nothing focused (the shortcut pressed on the page body): focus goes back to the trigger.
    returnFocus = active instanceof HTMLElement && active !== document.body ? active : null;
    warm();
    dialog.showModal();
  }
  panel?.focus();
}

function close(): void {
  dialog?.close();
}

function onclose(): void {
  (returnFocus ?? trigger)?.focus();
  returnFocus = null;
}

function ontriggerclick(event: MouseEvent): void {
  // Let Ctrl/⌘/Shift-click open the search page in a new tab or window.
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0)
    return;
  event.preventDefault();
  open();
}

/** A click on the backdrop lands on the dialog itself, outside its inner box. */
function ondialogclick(event: MouseEvent): void {
  if (event.target === dialog) close();
}

/** Escape always closes; inside a search field Chrome would otherwise only clear the text. */
function ondialogkeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  close();
}

function inEditableField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return (
    target.closest(
      "textarea, select, input:not([type=checkbox], [type=radio], [type=button], [type=submit], [type=reset], [type=range])",
    ) !== null
  );
}

function onwindowkeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || !isSearchShortcut(event, inEditableField(event.target))) return;
  event.preventDefault();
  open();
}
</script>

<svelte:window onkeydown={onwindowkeydown} />

<a
  bind:this={trigger}
  class="trigger"
  href={localizedPath(lang, "search")}
  aria-haspopup="dialog"
  aria-keyshortcuts="/ Control+K Meta+K"
  onclick={ontriggerclick}
  onpointerenter={warm}
  onfocus={warm}
>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21" />
  </svg>
  <span class="label">{t("nav.search")}</span>
</a>

<!-- A click on the backdrop closes the dialog; by keyboard, Escape and the close button do. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialog}
  class="dialog"
  aria-labelledby={`${uid}-title`}
  {onclose}
  onclick={ondialogclick}
  onkeydown={ondialogkeydown}
>
  <div class="inner">
    <div class="head">
      <h2 id={`${uid}-title`}>{t("search.title")}</h2>
      <button type="button" class="close" aria-label={t("search.close")} title={t("search.close")} onclick={close}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
    <SearchPanel bind:this={panel} {lang} headingLevel={3} onnavigate={close} />
    <p class="shortcut">{t("search.shortcut")}</p>
  </div>
</dialog>

<style>
  .trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-width: var(--target-min);
    min-height: var(--target-min);
    padding: 0 var(--space-4);
    border: var(--outline);
    border-radius: var(--radius-pill);
    background: var(--color-surface);
    color: var(--color-ink);
    font-weight: 700;
    text-decoration: none;
  }

  .trigger:hover .label {
    text-decoration: underline;
  }

  /* Narrow screens: icon only, with the label kept for assistive technology. */
  @media (max-width: 600px) {
    .trigger {
      padding: 0;
    }

    .label {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
  }

  .dialog {
    width: min(40rem, 100% - 2 * var(--gutter));
    max-width: none;
    max-height: calc(100dvh - 2 * var(--space-6));
    margin: var(--space-6) auto auto;
    padding: 0;
    border: var(--outline);
    border-radius: var(--radius-board);
    background: var(--color-surface);
    color: var(--color-ink);
    box-shadow: var(--shadow-board);
  }

  .dialog[open] {
    display: flex;
    flex-direction: column;
  }

  /*
   * Modern browsers let ::backdrop inherit custom properties from its dialog. Where they do not,
   * the variable is unset, the backdrop stays clear and the outlined dialog still stands out.
   */
  .dialog::backdrop {
    background: color-mix(in srgb, var(--color-ink) 45%, transparent);
  }

  @media (prefers-reduced-motion: no-preference) {
    .dialog[open] {
      animation: rise var(--duration-move) var(--ease-move);
    }
  }

  @keyframes rise {
    from {
      opacity: 0;
      translate: 0 var(--space-3);
    }
  }

  .inner {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .head h2 {
    font-size: var(--text-h3);
  }

  .close {
    flex: none;
    width: var(--target-min);
    height: var(--target-min);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: var(--outline);
    border-radius: var(--radius-pill);
    background: var(--color-surface);
    color: var(--color-ink);
    cursor: pointer;
  }

  .shortcut {
    color: var(--color-ink-muted);
    font-size: var(--text-small);
  }

  @media (max-width: 600px) {
    .dialog {
      margin-top: var(--space-4);
      max-height: calc(100dvh - 2 * var(--space-4));
    }

    .inner {
      padding: var(--space-4);
    }

    /* There is rarely a keyboard on a phone. */
    .shortcut {
      display: none;
    }
  }
</style>
