<script lang="ts">
import { type PresetId, presetIds, presets } from "../../engines/page-replacement/presets";
import { faultTable, simulate } from "../../engines/page-replacement/simulate";
import {
  type Algorithm,
  algorithms,
  limits,
  type ReplacementExplanation,
} from "../../engines/page-replacement/types";
import type { Locale } from "../../i18n/config";
import { pageReplacementEn } from "../../i18n/engines/page-replacement.en";
import { pageReplacementEs } from "../../i18n/engines/page-replacement.es";
import { renderExplanation } from "../../i18n/engines/types";
import { useTranslations } from "../../i18n/t";
import type { UiKey } from "../../i18n/ui/es";
import { announceRunFinished } from "../../lib/events";
import Player from "../../player/Player.svelte";
import "../board/board.css";
import { slotForIndex } from "../token/shapes";
import Token from "../token/Token.svelte";

interface Props {
  lang: Locale;
  preset?: PresetId;
  frames?: number;
  algorithm?: Algorithm;
}

let {
  lang,
  preset = "belady",
  frames: initialFrames = 4,
  algorithm: initialAlgorithm = "fifo",
}: Props = $props();

const t = $derived(useTranslations(lang));
const templates = $derived(lang === "es" ? pageReplacementEs : pageReplacementEn);

// svelte-ignore state_referenced_locally
let refs = $state<number[]>([...presets[preset]]);
// svelte-ignore state_referenced_locally
let refsText = $state(presets[preset].join(" "));
let refsInvalid = $state(false);
// svelte-ignore state_referenced_locally
let frames = $state(initialFrames);
// svelte-ignore state_referenced_locally
let algorithm = $state<Algorithm>(initialAlgorithm);
let guess = $state<number | null>(null);
let predictionState = $state<"open" | "locked" | "skipped">("open");
let runId = $state(0);

const trace = $derived(simulate({ refs, frames, algorithm }));
const total = $derived(trace.steps.length);
const table = $derived(faultTable(refs));
const traceKey = $derived(`${refs.join(",")}|${frames}|${algorithm}|${runId}`);

$effect(() => {
  void trace;
  guess = null;
  predictionState = "open";
});

const pageLabel = (n: number) => t("pr.page", { n, shape: t(`shape.${slotForIndex(n)}` as UiKey) });

function loadPreset(id: PresetId) {
  refs = [...presets[id]];
  refsText = refs.join(" ");
  refsInvalid = false;
}

function setRefs(text: string) {
  refsText = text;
  const parts = text
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  const pages = parts.map((p) => Number(p));
  const ok =
    pages.length >= limits.refs.min &&
    pages.length <= limits.refs.max &&
    pages.every((p) => Number.isInteger(p) && p >= limits.page.min && p <= limits.page.max);
  refsInvalid = !ok;
  if (ok) refs = pages;
}

function lockPrediction() {
  if (predictionState !== "open") return;
  predictionState = guess === null ? "skipped" : "locked";
}

function predictAgain() {
  guess = null;
  predictionState = "open";
  runId += 1;
}

function explanationText(explain: readonly ReplacementExplanation[]): string {
  return explain.map((e) => renderExplanation(templates, e)).join(" ");
}

function announce(cursor: number): string {
  const step = cursor > 0 ? trace.steps[cursor - 1] : undefined;
  return step
    ? t("pr.live", {
        n: step.t + 1,
        page: step.state.record.page,
        text: explanationText(step.explain),
      })
    : "";
}

// Clock dial geometry.
const DIAL = 220;
const DC = DIAL / 2;
const dialPos = (slot: number, n: number, r: number) => {
  const a = (-90 + (360 * slot) / n) * (Math.PI / 180);
  return { x: DC + r * Math.cos(a), y: DC + r * Math.sin(a) };
};

const labels = $derived({
  region: t("player.region"),
  run: t("player.run"),
  pause: t("player.pause"),
  resume: t("player.resume"),
  replay: t("player.replay"),
  stepBack: t("player.stepBack"),
  stepForward: t("player.stepForward"),
  toStart: t("player.toStart"),
  toEnd: t("player.toEnd"),
  speed: t("player.speed"),
  slow: t("player.slow"),
  normal: t("player.normal"),
  fast: t("player.fast"),
});
</script>

<div class="sim">
  <div class="setup">
    <section class="card" aria-labelledby="pr-setup">
      <h3 id="pr-setup">{t("pr.setup")}</h3>
      <label class="option">
        <span class="field-name">{t("pr.refs")}</span>
        <input class="refs-input" type="text" inputmode="numeric" value={refsText} aria-invalid={refsInvalid} aria-describedby="pr-refs-hint" onchange={(e) => setRefs(e.currentTarget.value)} />
      </label>
      <p id="pr-refs-hint" class="hint" role={refsInvalid ? "alert" : undefined}>{refsInvalid ? t("pr.refs.invalid") : t("pr.refs.hint")}</p>
      <div class="presets" role="group" aria-label={t("cpu.presets")}>
        <span class="hint">{t("cpu.presets")}</span>
        {#each presetIds as id (id)}
          <button type="button" class="pill small" onclick={() => loadPreset(id)}>{t(`pr.preset.${id}`)}</button>
        {/each}
      </div>
      <div class="option" role="group" aria-labelledby="pr-frames">
        <span id="pr-frames" class="field-name">{t("pr.frames")}</span>
        <div class="row">
          {#each Array.from({ length: limits.frames.max }, (_, i) => i + 1) as n (n)}
            <button type="button" class="pill small num" aria-pressed={frames === n} onclick={() => (frames = n)}>{n}</button>
          {/each}
        </div>
      </div>
    </section>

    <section class="card" aria-labelledby="pr-algorithm">
      <h3 id="pr-algorithm">{t("pr.algorithm")}</h3>
      <div class="row" role="group" aria-labelledby="pr-algorithm">
        {#each algorithms as a (a)}
          <button type="button" class="pill" aria-pressed={algorithm === a} onclick={() => (algorithm = a)}>{t(`pr.algo.${a}`)}</button>
        {/each}
      </div>
      <p class="hint">{t(`pr.rule.${algorithm}`)}</p>
    </section>
  </div>

  {#if predictionState === "open"}
    <section class="card" aria-labelledby="pr-predict">
      <h3 id="pr-predict">{t("cpu.predict.title")}</h3>
      <p>{t("pr.predict.prompt", { frames })}</p>
      <div class="row" role="group" aria-labelledby="pr-predict">
        {#each Array.from({ length: refs.length }, (_, i) => i + 1) as n (n)}
          <button type="button" class="pill small num" aria-pressed={guess === n} aria-label={t("pr.predict.pick", { n })} onclick={() => (guess = guess === n ? null : n)}>{n}</button>
        {/each}
      </div>
    </section>
  {/if}

  <div class="board">
    <Player {total} {traceKey} {labels} {announce} onfirstplay={lockPrediction} onend={announceRunFinished}>
      {#snippet board(cursor)}
        {@const step = cursor > 0 ? trace.steps[cursor - 1] : undefined}
        {@const state = step?.state}
        {@const ended = cursor >= total}
        <div class="board-head">
          <h3>{step ? t("pr.board.at", { n: step.t + 1 }) : t("cpu.board.start")}</h3>
          <p class="rule">{t(`pr.rule.${algorithm}`)}</p>
        </div>

        <section aria-labelledby="pr-grid">
          <h4 id="pr-grid">{t("pr.grid")}</h4>
          <div class="table-wrap">
            <table class="grid">
              <thead>
                <tr>
                  <th scope="col"><span class="visually-hidden">{t("pr.grid.ref")}</span></th>
                  {#each refs as page, i (i)}
                    <th scope="col" class:now={i === cursor - 1}><span class="visually-hidden">{t("pr.grid.ref")} {i + 1}: </span>{page}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each Array.from({ length: frames }, (_, s) => s) as s (s)}
                  <tr>
                    <th scope="row">{t("pr.grid.frame", { n: s })}</th>
                    {#each refs as _, i (i)}
                      {@const shown = i < cursor ? trace.steps[i]?.state : undefined}
                      {@const page = shown?.slots[s] ?? null}
                      {@const changed = shown?.record.slot === s}
                      <td class:now={i === cursor - 1} class:loaded={changed && !shown?.record.hit} class:touched={changed && shown?.record.hit}>
                        {#if page !== null && shown}
                          <span class="cell"><Token slot={slotForIndex(page)} size={14} label={pageLabel(page)} /><span aria-hidden="true">{page}</span></span>
                        {/if}
                      </td>
                    {/each}
                  </tr>
                {/each}
                <tr class="faults">
                  <th scope="row">{t("pr.grid.fault")}</th>
                  {#each refs as _, i (i)}
                    {@const record = i < cursor ? trace.result.records[i] : undefined}
                    <td class:now={i === cursor - 1}>
                      {#if record}
                        {#if record.hit}<span class="visually-hidden">{t("pr.grid.hitMark")}</span>{:else}<strong>{t("pr.grid.faultMark")}</strong>{/if}
                      {/if}
                    </td>
                  {/each}
                </tr>
                <tr class="victims">
                  <th scope="row">{t("pr.grid.out")}</th>
                  {#each refs as _, i (i)}
                    {@const record = i < cursor ? trace.result.records[i] : undefined}
                    <td class:now={i === cursor - 1}>{#if record?.victim !== null && record?.victim !== undefined}<s>{record.victim}</s>{/if}</td>
                  {/each}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="zone algo-state" aria-labelledby="pr-state">
          {#if algorithm === "fifo" || algorithm === "lru"}
            {@const list = (algorithm === "fifo" ? state?.queue : state?.recency) ?? []}
            <h4 id="pr-state">{t(algorithm === "fifo" ? "pr.state.fifo" : "pr.state.lru")}</h4>
            <p class="hint">{t(algorithm === "fifo" ? "pr.state.fifo.hint" : "pr.state.lru.hint")}</p>
            <ol class="order">
              {#each list as page (page)}
                <li><Token slot={slotForIndex(page)} size={34} label={pageLabel(page)} /><span aria-hidden="true">{page}</span></li>
              {:else}
                <li class="empty">{t("pr.state.empty")}</li>
              {/each}
            </ol>
          {:else if algorithm === "opt"}
            <h4 id="pr-state">{t("pr.state.opt")}</h4>
            <ul class="next-use">
              {#each state?.slots ?? [] as page, s (s)}
                {#if page !== null}
                  {@const next = state?.nextUse[s] ?? null}
                  <li>
                    <span class="entity"><Token slot={slotForIndex(page)} size={22} label={pageLabel(page)} /><span aria-hidden="true">{page}</span></span>
                    <span>{next === null ? t("pr.state.opt.never") : t("pr.state.opt.next", { n: next })}</span>
                  </li>
                {/if}
              {:else}
                <li class="empty">{t("pr.state.empty")}</li>
              {/each}
            </ul>
          {:else}
            {@const hand = state?.hand ?? 0}
            {@const slots = state?.slots ?? Array.from({ length: frames }, () => null)}
            {@const bits = state?.bits ?? Array.from({ length: frames }, () => 0)}
            {@const dialLabel = t("pr.state.clock.label", {
              hand,
              frames: slots.map((p, s) => (p === null ? t("pr.state.clock.free", { slot: s }) : t("pr.state.clock.frame", { slot: s, page: p, bit: bits[s] ?? 0 }))).join(". "),
            })}
            <h4 id="pr-state">{t("pr.state.clock")}</h4>
            <p class="hint">{t("pr.state.clock.hint")}</p>
            <svg class="dial" viewBox="0 0 {DIAL} {DIAL}" role="img" aria-label={dialLabel}>
              <circle cx={DC} cy={DC} r="78" fill="none" stroke="var(--color-ink-muted)" stroke-width="2" stroke-dasharray="4 6" />
              {#if frames > 0}
                {@const tip = dialPos(hand, frames, 52)}
                <line x1={DC} y1={DC} x2={tip.x} y2={tip.y} stroke="var(--color-ink)" stroke-width="5" stroke-linecap="round" />
                <circle cx={DC} cy={DC} r="7" fill="var(--color-ink)" />
              {/if}
              {#each slots as page, s (s)}
                {@const p = dialPos(s, frames, 78)}
                <rect x={p.x - 24} y={p.y - 22} width="48" height="44" rx="10" fill={s === hand ? "var(--color-slot)" : "var(--color-surface)"} stroke="var(--color-ink)" stroke-width="2.5" />
                <text x={p.x} y={p.y - 6} class="dial-page" text-anchor="middle" dominant-baseline="central">{page ?? "–"}</text>
                <text x={p.x} y={p.y + 11} class="dial-bit" text-anchor="middle" dominant-baseline="central">{t("pr.state.clock.bit", { b: bits[s] ?? 0 })}</text>
              {/each}
            </svg>
          {/if}
        </section>

        <div class="after">
          <section class="why" aria-labelledby="pr-why">
            <h4 id="pr-why">{t("cpu.why")}</h4>
            <p>{step ? explanationText(step.explain) : t("pr.why.start")}</p>
            {#if ended}
              <p class="tally">{t("pr.tally", { faults: trace.result.faults, hits: trace.result.hits, compulsory: trace.result.compulsory })}</p>
            {/if}
          </section>

          {#if predictionState !== "open"}
            <section class="card verdict" aria-labelledby="pr-verdict">
              <h4 id="pr-verdict">{t("cpu.predict.title")}</h4>
              {#if predictionState === "skipped"}
                <p>{t("cpu.predict.none")}</p>
              {:else if !ended}
                <p>{t("cpu.predict.locked")}</p>
              {:else if guess === trace.result.faults}
                <p class="score">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" stroke-width="3" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>
                  {t("pr.predict.right", { n: trace.result.faults })}
                </p>
              {:else}
                <p class="score">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-bad)" stroke-width="3" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  {t("pr.predict.wrong", { guess: guess ?? 0, n: trace.result.faults })}
                </p>
                <p class="hint">{t("pr.predict.hint")}</p>
              {/if}
              <div class="row"><button type="button" class="pill small" onclick={predictAgain}>{t("cpu.predict.again")}</button></div>
            </section>
          {/if}
        </div>

        {#if ended}
          <section class="metrics" aria-labelledby="pr-compare">
            <h4 id="pr-compare">{t("pr.compare")}</h4>
            <p class="hint">{t("pr.compare.hint")}</p>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t("pr.compare.algo")}</th>
                    {#each table.fifo as _, i (i)}<th scope="col">{i + 1}</th>{/each}
                  </tr>
                </thead>
                <tbody>
                  {#each algorithms as a (a)}
                    <tr class:selected={a === algorithm}>
                      <th scope="row">{t(`pr.algo.${a}`)}</th>
                      {#each table[a] as faults, i (i)}
                        {@const up = i > 0 && faults > (table[a][i - 1] ?? faults)}
                        <td class:current={a === algorithm && i + 1 === frames} class:up>
                          {#if up}<span aria-hidden="true">↑ </span><span class="visually-hidden">{t("pr.compare.more")}: </span>{/if}{faults}
                        </td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </section>
        {/if}
      {/snippet}
    </Player>
  </div>
</div>

<style>
  .option {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .field-name {
    font-size: var(--text-data);
    font-weight: 500;
    color: var(--color-ink-muted);
  }

  .refs-input {
    min-height: var(--target-min);
    padding: 0 var(--space-3);
    border: var(--outline);
    border-radius: var(--radius-field);
    background: var(--color-surface);
    color: var(--color-ink);
    font-family: var(--font-mono);
    font-size: 1rem;
    letter-spacing: 0.06em;
  }

  .refs-input[aria-invalid="true"] {
    border-color: var(--color-bad);
  }

  .num {
    min-width: var(--target-min);
    padding: 0 var(--space-3);
  }

  .grid th,
  .grid td {
    padding: 3px 2px;
    text-align: center;
    min-width: 2.25rem;
  }

  .grid tbody th {
    text-align: left;
    white-space: nowrap;
    padding-right: var(--space-2);
    font-weight: 500;
    color: var(--color-ink-muted);
  }

  .grid thead th {
    font-size: 1rem;
    font-weight: 800;
    color: var(--color-ink);
  }

  .grid .now {
    background: var(--color-ground);
  }

  .grid thead th.now {
    background: var(--color-ink);
    color: var(--color-on-ink);
    border-radius: var(--radius-bar);
  }

  .cell {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  /* A page just loaded sits in a recessed slot; a hit gets a dashed ring. */
  td.loaded .cell {
    padding: 0 4px;
    border-radius: var(--radius-bar);
    background: var(--color-slot);
    outline: 2px solid var(--color-ink);
  }

  td.touched .cell {
    padding: 0 4px;
    border-radius: var(--radius-bar);
    outline: 2px dashed var(--color-ink-muted);
  }

  .faults td {
    font-weight: 800;
  }

  .victims td {
    color: var(--color-ink-muted);
  }

  .victims s {
    text-decoration-color: var(--color-bad);
    text-decoration-thickness: 2px;
  }

  .algo-state {
    border: var(--outline-waiting);
  }

  .order {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .order li {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-weight: 700;
  }

  .next-use {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .next-use li {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .dial {
    display: block;
    width: 100%;
    max-width: 260px;
    height: auto;
  }

  .dial-page {
    fill: var(--color-ink);
    font-size: 17px;
    font-weight: 800;
  }

  .dial-bit {
    fill: var(--color-ink-muted);
    font-size: 11px;
  }

  .tally {
    font-weight: 700;
  }

  tr.selected th {
    font-weight: 800;
  }

  td.current {
    outline: 2.5px solid var(--color-ink);
    outline-offset: -3px;
    border-radius: var(--radius-bar);
    font-weight: 800;
  }

  td.up {
    color: var(--color-bad);
    font-weight: 800;
  }
</style>
