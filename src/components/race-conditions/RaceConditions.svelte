<script lang="ts">
import { type PresetId, presetIds, presets } from "../../engines/race-conditions/presets";
import { programFor, simulate } from "../../engines/race-conditions/simulate";
import {
  type Instruction,
  limits,
  type RaceExplanation,
  type ThreadView,
} from "../../engines/race-conditions/types";
import type { Locale } from "../../i18n/config";
import { raceConditionsEn } from "../../i18n/engines/race-conditions.en";
import { raceConditionsEs } from "../../i18n/engines/race-conditions.es";
import { renderExplanation } from "../../i18n/engines/types";
import { useTranslations } from "../../i18n/t";
import type { UiKey } from "../../i18n/ui/es";
import { announceRunFinished } from "../../lib/events";
import Player from "../../player/Player.svelte";
import Timeline from "../board/Timeline.svelte";
import "../board/board.css";
import { slotForId } from "../token/shapes";
import Token from "../token/Token.svelte";

interface Props {
  lang: Locale;
  preset?: PresetId;
}

let { lang, preset = "twoOnce" }: Props = $props();

const t = $derived(useTranslations(lang));
const templates = $derived(lang === "es" ? raceConditionsEs : raceConditionsEn);
const shapeName = (id: string) => t(`shape.${slotForId(id)}` as UiKey);
const tokenLabel = (id: string) => `${id}, ${shapeName(id)}`;
const range = (r: { min: number; max: number }) =>
  Array.from({ length: r.max - r.min + 1 }, (_, i) => r.min + i);

// svelte-ignore state_referenced_locally
const start = presets[preset];
let threadCount = $state(start.threads);
let increments = $state(start.increments);
let atomic = $state(start.atomic);
let kind = $state<"timer" | "manual">(start.schedule.kind);
let quantum = $state(start.schedule.kind === "timer" ? start.schedule.quantum : 2);
let order = $state<string[]>(start.schedule.kind === "manual" ? [...start.schedule.order] : []);
let guess = $state<number | null>(null);
let predictionState = $state<"open" | "locked" | "skipped">("open");
let runId = $state(0);

const ids = $derived(Array.from({ length: threadCount }, (_, i) => `T${i + 1}`));
const program = $derived(programFor(increments, atomic));
const totalInstructions = $derived(threadCount * program.length);
const trace = $derived(
  simulate({
    threads: threadCount,
    increments,
    atomic,
    schedule: kind === "timer" ? { kind, quantum } : { kind, order },
  }),
);
const total = $derived(trace.steps.length);
const expected = $derived(trace.result.expected);
const traceKey = $derived(
  `${threadCount}|${increments}|${atomic}|${kind}|${quantum}|${order.join(",")}|${runId}`,
);

$effect(() => {
  void trace;
  guess = null;
  predictionState = "open";
});

function loadPreset(id: PresetId) {
  const p = presets[id];
  threadCount = p.threads;
  increments = p.increments;
  atomic = p.atomic;
  kind = p.schedule.kind;
  if (p.schedule.kind === "timer") quantum = p.schedule.quantum;
  order = p.schedule.kind === "manual" ? [...p.schedule.order] : [];
}

/** Changing the program invalidates a manual order. */
function setProgram(change: () => void) {
  change();
  order = [];
}

const usedBy = (id: string) => order.filter((x) => x === id).length;
const leftFor = (id: string) => program.length - usedBy(id);

function give(id: string) {
  if (leftFor(id) > 0) order = [...order, id];
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

function explanationText(explain: readonly RaceExplanation[]): string {
  return explain.map((e) => renderExplanation(templates, e)).join(" ");
}

function announce(cursor: number): string {
  const step = cursor > 0 ? trace.steps[cursor - 1] : undefined;
  return step ? t("rc.live", { n: step.t + 1, text: explanationText(step.explain) }) : "";
}

function threadsAt(cursor: number): readonly ThreadView[] {
  const step = cursor > 0 ? trace.steps[cursor - 1] : undefined;
  return (
    step?.state.threads ??
    ids.map((id) => ({ id, pc: 0, reg: null, loaded: null, status: "ready" as const }))
  );
}

function timelineLabel(cursor: number): string {
  const parts = trace.result.segments
    .filter((s) => s.start < cursor)
    .map((s) => t("cpu.timeline.run", { id: s.id, start: s.start, end: Math.min(s.end, cursor) }));
  return [t("rc.timeline", { total: Math.max(total, 1) }), ...parts].join(". ");
}

const opName = (op: Instruction) => t(`rc.op.${op}`);
const opText = (op: Instruction) => t(`rc.instr.${op}`);

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
    <section class="card" aria-labelledby="rc-setup">
      <h3 id="rc-setup">{t("rc.setup")}</h3>
      <div class="option" role="group" aria-labelledby="rc-threads">
        <span id="rc-threads" class="field-name">{t("rc.threads")}</span>
        <div class="row">
          {#each range(limits.threads) as n (n)}
            <button type="button" class="pill small" aria-pressed={threadCount === n} onclick={() => setProgram(() => (threadCount = n))}>{n}</button>
          {/each}
        </div>
      </div>
      <div class="option" role="group" aria-labelledby="rc-increments">
        <span id="rc-increments" class="field-name">{t("rc.increments")}</span>
        <div class="row">
          {#each range(limits.increments) as n (n)}
            <button type="button" class="pill small" aria-pressed={increments === n} onclick={() => setProgram(() => (increments = n))}>{n}</button>
          {/each}
        </div>
      </div>
      <div class="option" role="group" aria-labelledby="rc-mode">
        <span id="rc-mode" class="field-name">{t("rc.mode")}</span>
        <div class="row">
          <button type="button" class="pill small" aria-pressed={!atomic} onclick={() => setProgram(() => (atomic = false))}>{t("rc.mode.split")}</button>
          <button type="button" class="pill small" aria-pressed={atomic} onclick={() => setProgram(() => (atomic = true))}>{t("rc.mode.atomic")}</button>
        </div>
        <p class="hint">{t("rc.mode.hint")}</p>
      </div>
      <div class="presets" role="group" aria-label={t("cpu.presets")}>
        <span class="hint">{t("cpu.presets")}</span>
        {#each presetIds as id (id)}
          <button type="button" class="pill small" onclick={() => loadPreset(id)}>{t(`rc.preset.${id}`)}</button>
        {/each}
      </div>
    </section>

    <section class="card" aria-labelledby="rc-schedule">
      <h3 id="rc-schedule">{t("rc.schedule")}</h3>
      <div class="row" role="group" aria-labelledby="rc-schedule">
        <button type="button" class="pill" aria-pressed={kind === "timer"} onclick={() => (kind = "timer")}>{t("rc.schedule.timer")}</button>
        <button type="button" class="pill" aria-pressed={kind === "manual"} onclick={() => (kind = "manual")}>{t("rc.schedule.manual")}</button>
      </div>
      {#if kind === "timer"}
        <label class="quantum">
          <span>{t("rc.quantum")}: <strong>{quantum}</strong></span>
          <input type="range" min={limits.quantum.min} max={limits.quantum.max} bind:value={quantum} />
        </label>
        <p class="hint">{t("rc.schedule.timer.hint")}</p>
      {:else}
        <p class="hint">{t("rc.schedule.manual.hint")}</p>
        <div class="row">
          {#each ids as id (id)}
            <button type="button" class="pill thread-button" aria-label={t("rc.manual.give", { id })} disabled={leftFor(id) === 0} onclick={() => give(id)}>
              <Token slot={slotForId(id)} size={22} />{id}
            </button>
          {/each}
        </div>
        <h4 class="field-name">{t("rc.manual.order")}</h4>
        {#if order.length === 0}
          <p class="empty">{t("rc.manual.empty")}</p>
        {:else}
          <ol class="order">
            {#each order as id, i (i)}
              <li><Token slot={slotForId(id)} size={20} label={tokenLabel(id)} /></li>
            {/each}
          </ol>
        {/if}
        <p class="hint">{t("rc.manual.count", { n: order.length, total: totalInstructions })}</p>
        <div class="row">
          <button type="button" class="pill small" disabled={order.length === 0} onclick={() => (order = order.slice(0, -1))}>{t("rc.manual.undo")}</button>
          <button type="button" class="pill small" disabled={order.length === 0} onclick={() => (order = [])}>{t("rc.manual.clear")}</button>
        </div>
      {/if}
    </section>
  </div>

  {#if predictionState === "open"}
    <section class="card" aria-labelledby="rc-predict">
      <h3 id="rc-predict">{t("cpu.predict.title")}</h3>
      <p>{t("rc.predict.prompt")}</p>
      <div class="row" role="group" aria-labelledby="rc-predict">
        {#each Array.from({ length: expected + 1 }, (_, i) => i) as n (n)}
          <button type="button" class="pill guess" aria-pressed={guess === n} aria-label={t("rc.predict.pick", { n })} onclick={() => (guess = guess === n ? null : n)}>{n}</button>
        {/each}
      </div>
    </section>
  {/if}

  <div class="board">
    <Player {total} {traceKey} {labels} {announce} onfirstplay={lockPrediction} onend={announceRunFinished}>
      {#snippet board(cursor)}
        {@const step = cursor > 0 ? trace.steps[cursor - 1] : undefined}
        {@const views = threadsAt(cursor)}
        {@const counter = step?.state.counter ?? 0}
        {@const writes = trace.result.writes.filter((w) => w.step < cursor)}
        {@const ended = cursor >= total && total > 0}
        <div class="board-head">
          <h3>{step ? t("rc.board.at", { n: step.t + 1 }) : t("cpu.board.start")}</h3>
          <p class="rule">{kind === "timer" ? t("rc.rule.timer", { q: quantum }) : t("rc.rule.manual")}</p>
        </div>

        <div class="memory zone">
          <h4>{t("rc.memory")}</h4>
          <p class="cell-line">
            <code class="var">{t("rc.counter")}</code>
            <span class="value" class:changed={step?.state.instruction === "store" || step?.state.instruction === "inc"}>{counter}</span>
          </p>
        </div>

        <ul class="threads">
          {#each views as th (th.id)}
            {@const isRunning = step?.state.running === th.id}
            <li class="thread zone" class:running={isRunning} class:done={th.status === "done"}>
              <div class="thread-head">
                <span class="entity"><Token slot={slotForId(th.id)} size={34} label={tokenLabel(th.id)} /><span aria-hidden="true">{th.id}</span></span>
                <span class="status">{isRunning ? t("rc.status.running") : th.status === "done" ? t("rc.status.done") : t("rc.status.ready")}</span>
              </div>
              <div class="reg">
                <span class="field-name">{t("rc.reg")}</span>
                <span class="reg-value">{th.reg ?? t("rc.reg.empty")}</span>
                {#if th.loaded !== null}<span class="caption">{t("rc.loaded", { v: th.loaded })}</span>{/if}
              </div>
              <ol class="listing" aria-label={t("rc.listing", { id: th.id })}>
                {#each program as op, i (i)}
                  {@const ran = isRunning && i === th.pc - 1}
                  {@const next = i === th.pc && th.status !== "done"}
                  <li class:past={i < th.pc && !ran} class:ran class:next style:--fill="var(--entity-{slotForId(th.id)})" style:--on="var(--entity-{slotForId(th.id)}-on)">
                    <code><span class="op">{opName(op)}</span> {opText(op)}</code>
                    {#if ran}<span class="visually-hidden">, {t("rc.line.ran")}</span>{:else if next}<span class="visually-hidden">, {t("rc.line.next")}</span>{:else if i < th.pc}<span class="visually-hidden">, {t("rc.line.done")}</span>{/if}
                  </li>
                {/each}
              </ol>
            </li>
          {/each}
        </ul>

        <Timeline segments={trace.result.segments} total={Math.max(total, 1)} cursor={cursor} label={timelineLabel(cursor)} />

        <div class="after">
          <section class="why" aria-labelledby="rc-why">
            <h4 id="rc-why">{t("cpu.why")}</h4>
            <p>{step ? explanationText(step.explain) : t("rc.why.start")}</p>
          </section>

          {#if predictionState !== "open"}
            <section class="card verdict" aria-labelledby="rc-verdict">
              <h4 id="rc-verdict">{t("cpu.predict.title")}</h4>
              {#if predictionState === "skipped"}
                <p>{t("cpu.predict.none")}</p>
              {:else if !ended}
                <p>{t("cpu.predict.locked")}</p>
              {:else if guess === trace.result.final}
                <p class="score">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" stroke-width="3" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>
                  {t("rc.predict.right", { final: trace.result.final })}
                </p>
              {:else}
                <p class="score">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-bad)" stroke-width="3" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  {t("rc.predict.wrong", { guess: guess ?? 0, final: trace.result.final })}
                </p>
                <p class="hint">{t("rc.predict.hint")}</p>
              {/if}
              <div class="row"><button type="button" class="pill small" onclick={predictAgain}>{t("cpu.predict.again")}</button></div>
            </section>
          {/if}
        </div>

        <section class="metrics" aria-labelledby="rc-writes">
          <h4 id="rc-writes">{t("rc.writes")}</h4>
          {#if writes.length === 0}
            <p class="empty">{t("rc.writes.empty")}</p>
          {:else}
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t("rc.writes.thread")}</th>
                    <th scope="col">{t("rc.writes.step")}</th>
                    <th scope="col">{t("rc.writes.loaded")}</th>
                    <th scope="col">{t("rc.writes.before")}</th>
                    <th scope="col">{t("rc.writes.value")}</th>
                    <th scope="col">{t("rc.writes.verdict")}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each writes as w (w.step)}
                    <tr class:stale={w.stale}>
                      <th scope="row"><span class="entity"><Token slot={slotForId(w.id)} size={20} label={shapeName(w.id)} />{w.id}</span></th>
                      <td>{w.step + 1}</td>
                      <td>{w.loaded ?? "–"}</td>
                      <td>{w.before}</td>
                      <td>{w.value}</td>
                      <td><span class="mark">
                        {#if w.stale}
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-bad)" stroke-width="3.2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                          {t("rc.writes.stale")}
                        {:else}
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" stroke-width="3.2" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>
                          {t("rc.writes.ok")}
                        {/if}
                      </span></td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
          <p class="hint">{t("rc.writes.hint")}</p>
          {#if ended && trace.result.complete}
            <p class="tally">{t("rc.tally", { expected, final: trace.result.final, lost: trace.result.lost })}</p>
          {:else if !trace.result.complete && (ended || total === 0)}
            <p class="tally">{t("rc.tally.incomplete", { n: totalInstructions - total })}</p>
          {/if}
        </section>
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
    margin: 0;
    font-size: var(--text-data);
    font-weight: 500;
    color: var(--color-ink-muted);
  }

  .quantum {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .quantum input {
    accent-color: var(--color-action);
    min-height: var(--target-min);
  }

  .thread-button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .guess {
    min-width: var(--target-min);
    padding: 0 var(--space-4);
    font-variant-numeric: tabular-nums;
  }

  .order {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }

  /* The shared variable is the contested resource: a recessed slot with one big number. */
  .memory {
    background: var(--color-slot);
    align-items: center;
  }

  .memory h4 {
    align-self: flex-start;
  }

  .cell-line {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin: 0;
  }

  .var {
    font-family: var(--font-mono);
    font-size: 1.25rem;
    font-weight: 700;
  }

  .value {
    min-width: 4.5rem;
    padding: var(--space-2) var(--space-4);
    border: var(--outline);
    border-radius: var(--radius-field);
    background: var(--color-surface);
    font-size: 2.25rem;
    font-weight: 800;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  /* A write just landed: the cell inverts for this step. */
  .value.changed {
    background: var(--color-ink);
    color: var(--color-on-ink);
  }

  .threads {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  .thread {
    flex: 1 1 200px;
    border: var(--outline-waiting);
  }

  .thread.running {
    border: var(--outline);
  }

  .thread.done {
    background: var(--color-ground);
  }

  .thread-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .status,
  .caption {
    font-size: var(--text-data);
    color: var(--color-ink-muted);
  }

  .reg {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }

  .reg-value {
    font-size: 1.375rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .listing {
    margin: 0;
    padding-left: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--text-data);
  }

  .listing li {
    padding: 2px var(--space-2);
    border: 2px solid transparent;
    border-radius: var(--radius-bar);
  }

  .listing code {
    font-family: var(--font-mono);
  }

  .listing .op {
    font-weight: 700;
  }

  .listing li.past {
    color: var(--color-ink-muted);
  }

  .listing li.next {
    border-style: dashed;
    border-color: var(--color-ink-muted);
  }

  .listing li.ran {
    background: var(--fill);
    color: var(--on);
  }

  /* The number sits outside the filled line, on the board's ground: keep it in ink. */
  .listing li.ran::marker {
    color: var(--color-ink);
  }

  .mark {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    white-space: nowrap;
  }

  tr.stale td,
  tr.stale th {
    font-weight: 700;
  }

  .tally {
    font-weight: 700;
  }
</style>
