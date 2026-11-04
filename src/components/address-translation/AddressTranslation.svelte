<script lang="ts">
import { type PresetId, presetIds, presets } from "../../engines/address-translation/presets";
import { simulate } from "../../engines/address-translation/simulate";
import {
  limits,
  type Outcome,
  type PageEntry,
  type TranslationExplanation,
  type TranslationInput,
  type TranslationState,
} from "../../engines/address-translation/types";
import type { Locale } from "../../i18n/config";
import { addressTranslationEn } from "../../i18n/engines/address-translation.en";
import { addressTranslationEs } from "../../i18n/engines/address-translation.es";
import { renderExplanation } from "../../i18n/engines/types";
import { formatNumber, useTranslations } from "../../i18n/t";
import type { UiKey } from "../../i18n/ui/es";
import { announceRunFinished } from "../../lib/events";
import Player from "../../player/Player.svelte";
import "../board/board.css";
import { slotForIndex } from "../token/shapes";
import Token from "../token/Token.svelte";

interface Props {
  lang: Locale;
  preset?: PresetId;
}

let { lang, preset = "walk" }: Props = $props();

const t = $derived(useTranslations(lang));
const templates = $derived(lang === "es" ? addressTranslationEs : addressTranslationEn);
type Guess = Outcome | "notRun" | "";
const choices: readonly Exclude<Guess, "">[] = ["hit", "miss", "fault", "invalid", "notRun"];

// svelte-ignore state_referenced_locally
let input = $state<TranslationInput>(structuredClone(presets[preset]));
let guesses = $state<Guess[]>([]);
let predictionState = $state<"open" | "locked" | "skipped">("open");
let runId = $state(0);

const trace = $derived(simulate(input));
const total = $derived(trace.steps.length);
const traceKey = $derived(`${JSON.stringify(input)}|${runId}`);
const maxAddress = $derived(input.pages.length * input.pageSize - 1);
const offsetBits = $derived(Math.log2(input.pageSize));
const pageBits = $derived(Math.max(1, Math.ceil(Math.log2(input.pages.length))));
const frameBits = $derived(Math.max(1, Math.ceil(Math.log2(input.frames))));

$effect(() => {
  void trace;
  guesses = [];
  predictionState = "open";
});

const pageName = (n: number) =>
  t("at.pageName", { n, shape: t(`shape.${slotForIndex(n)}` as UiKey) });
const bin = (value: number, bits: number) => value.toString(2).padStart(bits, "0");

function loadPreset(id: PresetId) {
  input = structuredClone(presets[id]);
}

function setAccess(index: number, raw: string) {
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) return;
  const clamped = Math.min(maxAddress, Math.max(0, value));
  input = { ...input, accesses: input.accesses.map((a, i) => (i === index ? clamped : a)) };
}

function addAccess() {
  if (input.accesses.length >= limits.accesses.max) return;
  input = { ...input, accesses: [...input.accesses, input.accesses.at(-1) ?? 0] };
}

function removeAccess(index: number) {
  if (input.accesses.length <= limits.accesses.min) return;
  input = { ...input, accesses: input.accesses.filter((_, i) => i !== index) };
}

function actualOf(index: number): Exclude<Guess, ""> {
  return trace.result.accesses[index]?.outcome ?? "notRun";
}

function lockPrediction() {
  if (predictionState !== "open") return;
  const all = input.accesses.every((_, i) => (guesses[i] ?? "") !== "");
  predictionState = all ? "locked" : "skipped";
}

function predictAgain() {
  guesses = [];
  predictionState = "open";
  runId += 1;
}

function explanationText(explain: readonly TranslationExplanation[]): string {
  return explain.map((e) => renderExplanation(templates, e)).join(" ");
}

function announce(cursor: number): string {
  const step = cursor > 0 ? trace.steps[cursor - 1] : undefined;
  return step ? t("at.live", { n: step.t + 1, text: explanationText(step.explain) }) : "";
}

function initialState(): Omit<TranslationState, "access"> {
  const frames: (number | null)[] = Array.from({ length: input.frames }, () => null);
  input.pages.forEach((p, i) => {
    if (p.kind === "frame") frames[p.frame] = i;
  });
  return { pages: input.pages, tlb: [], frames, fifo: [] };
}

function whereText(p: PageEntry): string {
  if (p.kind === "frame") return t("at.where.frame", { n: p.frame });
  return t(`at.where.${p.kind}`);
}

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
    <section class="card" aria-labelledby="at-setup">
      <h3 id="at-setup">{t("at.setup")}</h3>
      <p class="hint">{t("at.setup.hint")} {t("at.layout", { size: input.pageSize, pages: input.pages.length, frames: input.frames })}</p>
      <ol class="accesses">
        {#each input.accesses as address, i (i)}
          <li>
            <label class="field">
              <span class="field-name">{t("at.accessOf", { n: i + 1 })}</span>
              <input class="number" type="number" inputmode="numeric" min="0" max={maxAddress} value={address} onchange={(e) => setAccess(i, e.currentTarget.value)} />
            </label>
            <button type="button" class="icon" aria-label={t("at.removeAccess", { n: i + 1 })} disabled={input.accesses.length <= limits.accesses.min} onclick={() => removeAccess(i)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </li>
        {/each}
      </ol>
      <div class="row">
        <button type="button" class="pill" disabled={input.accesses.length >= limits.accesses.max} onclick={addAccess}>{t("at.addAccess")}</button>
      </div>
      <div class="presets" role="group" aria-label={t("cpu.presets")}>
        <span class="hint">{t("cpu.presets")}</span>
        {#each presetIds as id (id)}
          <button type="button" class="pill small" onclick={() => loadPreset(id)}>{t(`at.preset.${id}`)}</button>
        {/each}
      </div>
    </section>

    <section class="card" aria-labelledby="at-tlb-size">
      <h3 id="at-tlb-size">{t("at.tlbSize")}</h3>
      <div class="row" role="group" aria-labelledby="at-tlb-size">
        {#each [0, 1, 2, 3, 4] as n (n)}
          <button type="button" class="pill small num" aria-pressed={input.tlbSize === n} onclick={() => (input = { ...input, tlbSize: n })}>{n}</button>
        {/each}
      </div>
      <p class="hint">{t("at.tlbSize.hint")}</p>
      <p class="hint">{t("at.costs")}</p>
    </section>
  </div>

  {#if predictionState === "open"}
    <section class="card" aria-labelledby="at-predict">
      <h3 id="at-predict">{t("cpu.predict.title")}</h3>
      <p>{t("at.predict.prompt")}</p>
      <ol class="predict-list">
        {#each input.accesses as address, i (i)}
          <li>
            <span class="predict-addr">{address}</span>
            <select aria-label={t("at.predict.cell", { n: i + 1, addr: address })} value={guesses[i] ?? ""} onchange={(e) => { const next = [...guesses]; next[i] = e.currentTarget.value as Guess; guesses = next; }}>
              <option value="">{t("ps.predict.choose")}</option>
              {#each choices as c (c)}<option value={c}>{t(`at.outcome.${c}`)}</option>{/each}
            </select>
          </li>
        {/each}
      </ol>
    </section>
  {/if}

  <div class="board">
    <Player {total} {traceKey} {labels} {announce} onfirstplay={lockPrediction} onend={announceRunFinished}>
      {#snippet board(cursor)}
        {@const step = cursor > 0 ? trace.steps[cursor - 1] : undefined}
        {@const state = step?.state ?? initialState()}
        {@const access = step?.state.access}
        {@const ended = cursor >= total}
        {@const done = trace.result.accesses.filter((a) => a.index < cursor)}
        {@const onDisk = state.pages.flatMap((p, i) => (p.kind === "disk" ? [i] : []))}
        <div class="board-head">
          <h3>{step ? t("at.board.at", { n: step.t + 1 }) : t("cpu.board.start")}</h3>
          <p class="rule">{t("at.rule")}</p>
        </div>

        <section class="zone translate" aria-labelledby="at-translate">
          <h4 id="at-translate">{t("at.translate")}</h4>
          {#if access}
            <div class="addresses">
              <div class="address">
                <span class="field-name">{t("at.virtual")}</span>
                <span class="decimal">{access.address}</span>
                <span class="bits" aria-hidden="true"><span class="page-bits">{bin(access.page, pageBits)}</span><span class="offset-bits">{bin(access.offset, offsetBits)}</span></span>
                <span class="caption">{t("at.pageBits", { n: access.page })} · {t("at.offsetBits", { n: access.offset })}</span>
              </div>
              <svg class="arrow" width="40" height="24" viewBox="0 0 40 24" aria-hidden="true"><path d="M2 12h32M26 4l8 8-8 8" fill="none" stroke="var(--color-ink)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
              {#if access.frame !== null && access.phys !== null}
                <div class="address">
                  <span class="field-name">{t("at.physical")}</span>
                  <span class="decimal">{access.phys}</span>
                  <span class="bits" aria-hidden="true"><span class="page-bits">{bin(access.frame, frameBits)}</span><span class="offset-bits">{bin(access.offset, offsetBits)}</span></span>
                  <span class="caption">{t("at.frameBits", { n: access.frame })} · {t("at.offsetBits", { n: access.offset })}</span>
                </div>
              {:else}
                <p class="killed">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-bad)" stroke-width="3" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  {t("at.killed")}
                </p>
              {/if}
            </div>
            <p class="outcome-line"><strong>{t(`at.outcome.${access.outcome}`)}</strong> · {t("at.log.cost")} {formatNumber(lang, access.cost, 0)}</p>
          {:else}
            <p class="empty">{t("at.waiting")}</p>
          {/if}
        </section>

        <div class="tables">
          <section class="panel" aria-labelledby="at-tlb">
            <h4 id="at-tlb">{t("at.tlb")}</h4>
            {#if input.tlbSize === 0}
              <p class="empty">{t("at.tlb.none")}</p>
            {:else}
              <p class="hint">{t("at.tlb.hint")}</p>
              <ol class="tlb">
                {#each Array.from({ length: input.tlbSize }, (_, i) => state.tlb[i]) as entry, i (i)}
                  <li class:filled={entry !== undefined} class:used={entry !== undefined && access?.page === entry.page && access.outcome !== "invalid"}>
                    {#if entry}
                      <span class="entity"><Token slot={slotForIndex(entry.page)} size={20} label={pageName(entry.page)} /><span aria-hidden="true">p{entry.page}</span></span>
                      <span aria-hidden="true">→</span>
                      <span>{t("at.where.frame", { n: entry.frame })}</span>
                    {:else}
                      <span class="empty">{t("at.tlb.empty")}</span>
                    {/if}
                  </li>
                {/each}
              </ol>
            {/if}
          </section>

          <section class="panel" aria-labelledby="at-pt">
            <h4 id="at-pt">{t("at.pageTable")}</h4>
            <div class="table-wrap">
              <table class="pt">
                <thead><tr><th scope="col">{t("at.page")}</th><th scope="col">{t("at.where")}</th></tr></thead>
                <tbody>
                  {#each state.pages as p, i (i)}
                    <tr class:current={access?.page === i} class:invalid={p.kind === "invalid"}>
                      <th scope="row"><span class="entity">{#if p.kind !== "invalid"}<Token slot={slotForIndex(i)} size={18} label={pageName(i)} />{/if}<span aria-hidden={p.kind !== "invalid"}>{i}</span></span></th>
                      <td>{whereText(p)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </section>

          <section class="panel" aria-labelledby="at-memory">
            <h4 id="at-memory">{t("at.memory")}</h4>
            <ol class="frames">
              {#each state.frames as page, f (f)}
                <li class="frame" class:current={access?.frame === f}>
                  <span class="field-name">{t("at.frame", { n: f })}</span>
                  {#if page !== null}
                    <span class="entity"><Token slot={slotForIndex(page)} size={28} label={pageName(page)} /><span aria-hidden="true">p{page}</span></span>
                  {:else}
                    <span class="empty">{t("at.frame.free")}</span>
                  {/if}
                </li>
              {/each}
            </ol>
            <h4 class="disk-title">{t("at.disk")}</h4>
            <ul class="disk">
              {#each onDisk as page (page)}
                <li><span class="entity"><Token slot={slotForIndex(page)} size={22} variant="outline" label={pageName(page)} /><span aria-hidden="true">p{page}</span></span></li>
              {/each}
            </ul>
          </section>
        </div>

        <div class="after">
          <section class="why" aria-labelledby="at-why">
            <h4 id="at-why">{t("cpu.why")}</h4>
            <p>{step ? explanationText(step.explain) : t("at.why.start")}</p>
          </section>

          {#if predictionState !== "open"}
            <section class="card verdict" aria-labelledby="at-verdict">
              <h4 id="at-verdict">{t("cpu.predict.title")}</h4>
              {#if predictionState === "skipped"}
                <p>{t("cpu.predict.none")}</p>
              {:else if !ended}
                <p>{t("cpu.predict.locked")}</p>
              {:else}
                {@const rows = input.accesses.map((addr, i) => ({ i, addr, guess: guesses[i] ?? "", actual: actualOf(i) }))}
                {@const hits = rows.filter((r) => r.guess === r.actual).length}
                <p class="score">
                  {#if hits === rows.length}
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" stroke-width="3" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>
                    {t("at.predict.perfect")}
                  {:else}
                    {t("at.predict.score", { hits, total: rows.length })}
                  {/if}
                </p>
                <ol class="verdict-list">
                  {#each rows as r (r.i)}
                    <li>
                      <span class="predict-addr">{r.addr}</span>
                      {#if r.guess === r.actual}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" stroke-width="3.2" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>
                        {t(`at.outcome.${r.actual}`)}<span class="visually-hidden">, {t("cpu.predict.match")}</span>
                      {:else}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-bad)" stroke-width="3.2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                        <s>{r.guess ? t(`at.outcome.${r.guess}`) : "–"}</s>
                        <span class="visually-hidden">, {t("cpu.predict.miss")}</span>
                        <span class="actual">{t("ps.predict.actual", { state: t(`at.outcome.${r.actual}`) })}</span>
                      {/if}
                    </li>
                  {/each}
                </ol>
                {#if hits < rows.length}<p class="hint">{t("at.predict.hint", { size: input.pageSize })}</p>{/if}
              {/if}
              <div class="row"><button type="button" class="pill small" onclick={predictAgain}>{t("cpu.predict.again")}</button></div>
            </section>
          {/if}
        </div>

        <section class="metrics" aria-labelledby="at-log">
          <h4 id="at-log">{t("at.log")}</h4>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t("at.log.n")}</th>
                  <th scope="col">{t("at.log.addr")}</th>
                  <th scope="col">{t("at.log.page")}</th>
                  <th scope="col">{t("at.log.offset")}</th>
                  <th scope="col" class="left">{t("at.log.outcome")}</th>
                  <th scope="col">{t("at.log.phys")}</th>
                  <th scope="col">{t("at.log.cost")}</th>
                </tr>
              </thead>
              <tbody>
                {#each done as a (a.index)}
                  <tr>
                    <th scope="row">{a.index + 1}</th>
                    <td>{a.address}</td>
                    <td>{a.page}</td>
                    <td>{a.offset}</td>
                    <td class="left">{t(`at.outcome.${a.outcome}.short`)}</td>
                    <td>{a.phys ?? "–"}</td>
                    <td>{formatNumber(lang, a.cost, 0)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          {#if ended && total > 0}
            {@const faultCost = trace.result.accesses.filter((a) => a.outcome === "fault").reduce((sum, a) => sum + a.cost, 0)}
            <p class="tally">{t("at.totals", { hits: trace.result.hits, faults: trace.result.faults, cost: formatNumber(lang, trace.result.cost, 0) })}</p>
            {#if trace.result.faults > 0}
              <p>{t("at.totals.share", { pct: formatNumber(lang, (faultCost / trace.result.cost) * 100, 0) })}</p>
            {/if}
          {/if}
        </section>
      {/snippet}
    </Player>
  </div>
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .field-name {
    font-size: var(--text-data);
    font-weight: 500;
    color: var(--color-ink-muted);
  }

  .accesses {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .accesses li {
    display: flex;
    align-items: flex-end;
    gap: var(--space-1);
  }

  .num {
    min-width: var(--target-min);
    padding: 0 var(--space-3);
  }

  select {
    min-height: var(--target-min);
    max-width: 100%;
    padding: 0 var(--space-3);
    border: var(--outline);
    border-radius: var(--radius-field);
    background: var(--color-surface);
    color: var(--color-ink);
  }

  .predict-list,
  .verdict-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .predict-list li,
  .verdict-list li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
  }

  .predict-addr {
    min-width: 3rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .verdict-list s {
    text-decoration-color: var(--color-bad);
    text-decoration-thickness: 2px;
  }

  .actual {
    font-size: var(--text-data);
    color: var(--color-ink-muted);
  }

  /* The translation is the move of each turn: a recessed slot with both addresses. */
  .translate {
    background: var(--color-slot);
  }

  .addresses {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
  }

  .address {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-3) var(--space-4);
    border: var(--outline);
    border-radius: var(--radius-field);
    background: var(--color-surface);
  }

  .decimal {
    font-size: 1.75rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .bits {
    font-family: var(--font-mono);
    font-size: 1.125rem;
    letter-spacing: 0.08em;
  }

  .page-bits {
    padding: 0 2px;
    border-radius: var(--radius-bar);
    background: var(--color-ink);
    color: var(--color-on-ink);
  }

  .offset-bits {
    padding: 0 2px;
    text-decoration: underline dashed;
    text-underline-offset: 4px;
  }

  .caption {
    font-size: var(--text-data);
    color: var(--color-ink-muted);
  }

  .killed {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 800;
  }

  .outcome-line {
    margin: 0;
  }

  .tables {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
  }

  .panel {
    flex: 1 1 200px;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .tlb,
  .frames,
  .disk {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .tlb li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--target-min);
    padding: 0 var(--space-3);
    border: var(--outline-waiting);
    border-radius: var(--radius-field);
  }

  .tlb li.filled {
    border: var(--outline);
  }

  .tlb li.used,
  .frame.current {
    background: var(--color-slot);
  }

  .pt th,
  .pt td {
    text-align: left;
    padding: 3px 8px;
  }

  .pt tr.current {
    outline: 2.5px solid var(--color-ink);
    outline-offset: -2px;
    background: var(--color-slot);
  }

  .pt tr.invalid td,
  .pt tr.invalid th {
    color: var(--color-ink-muted);
  }

  .frame {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-height: var(--target-min);
    padding: var(--space-1) var(--space-3);
    border: var(--outline);
    border-radius: var(--radius-field);
  }

  .disk-title {
    margin-top: var(--space-2);
  }

  .disk {
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: var(--outline-waiting);
    border-radius: var(--radius-field);
    min-height: var(--target-min);
  }

  th.left,
  td.left {
    text-align: left;
  }

  .tally {
    font-weight: 700;
  }
</style>
