<script lang="ts">
import { type PresetId, presetIds, presets } from "../../engines/process-states/presets";
import { simulate } from "../../engines/process-states/simulate";
import {
  limits,
  type ProcessSpec,
  type ProcessStatesExplanation,
  type ProcessStatesState,
  type ProcessStatus,
} from "../../engines/process-states/types";
import type { Locale } from "../../i18n/config";
import { processStatesEn } from "../../i18n/engines/process-states.en";
import { processStatesEs } from "../../i18n/engines/process-states.es";
import { renderExplanation } from "../../i18n/engines/types";
import { formatNumber, useTranslations } from "../../i18n/t";
import type { UiKey } from "../../i18n/ui/es";
import { announceRunFinished } from "../../lib/events";
import Player from "../../player/Player.svelte";
import Timeline from "../board/Timeline.svelte";
import "../board/board.css";
import { scrollCurrent } from "../board/scroll-current";
import { slotForId } from "../token/shapes";
import Token from "../token/Token.svelte";

interface Props {
  lang: Locale;
  preset?: PresetId;
  /** null: no quantum. */
  quantum?: number | null;
  /** Instants the learner predicts, one column each. */
  predictAt?: readonly number[];
}

let {
  lang,
  preset = "diskWait",
  quantum: initialQuantum = null,
  predictAt = [3, 5],
}: Props = $props();

const t = $derived(useTranslations(lang));
const templates = $derived(lang === "es" ? processStatesEs : processStatesEn);
const choices: readonly ProcessStatus[] = ["ready", "running", "blocked", "terminated", "absent"];
const shapeName = (id: string) => t(`shape.${slotForId(id)}` as UiKey);
const tokenLabel = (id: string) => `${id}, ${shapeName(id)}`;
const stateName = (s: ProcessStatus) => t(`ps.state.${s}`);
const stateShort = (s: ProcessStatus) => t(`ps.state.${s}.short`);

// svelte-ignore state_referenced_locally
let processes = $state<ProcessSpec[]>(clonePreset(preset));
// svelte-ignore state_referenced_locally
let quantumOn = $state(initialQuantum !== null);
// svelte-ignore state_referenced_locally
let quantumValue = $state(initialQuantum ?? 2);
let prediction = $state<Record<string, ProcessStatus | "">>({});
let predictionState = $state<"open" | "locked" | "skipped">("open");
let runId = $state(0);

const quantum = $derived(quantumOn ? quantumValue : null);
const trace = $derived(simulate({ processes, quantum }));
const total = $derived(trace.steps.length);
const makespan = $derived(trace.result.makespan);
const units = $derived(Array.from({ length: makespan }, (_, i) => i));
const lastPredicted = $derived(Math.max(...predictAt));
const traceKey = $derived(`${JSON.stringify(processes)}|${quantum}|${runId}`);

$effect(() => {
  void trace;
  prediction = {};
  predictionState = "open";
});

function clonePreset(id: PresetId): ProcessSpec[] {
  return presets[id].map((p) => ({ ...p, bursts: [...p.bursts] }));
}

/** Instant shown at a player cursor: cursor 0 is "before starting", cursor k is steps[k − 1]. */
const instantAt = (cursor: number) => cursor - 1;

function stateAt(instant: number): ProcessStatesState | undefined {
  return (trace.steps[instant] ?? trace.steps.at(-1))?.state;
}

function statusAt(id: string, instant: number): ProcessStatus {
  return stateAt(instant)?.processes.find((p) => p.id === id)?.status ?? "absent";
}

function explanationText(explain: readonly ProcessStatesExplanation[]): string {
  return explain.map((e) => renderExplanation(templates, e)).join(" ");
}

function boardAt(cursor: number) {
  const step = cursor > 0 ? trace.steps[cursor - 1] : undefined;
  if (!step) {
    return {
      running: null as string | null,
      queue: [] as readonly string[],
      blocked: [] as { id: string; until: number }[],
      done: [] as string[],
      absent: processes.map((p) => ({ id: p.id, arrival: p.arrival })),
      text: t("ps.why.start"),
    };
  }
  const views = step.state.processes;
  const terminated = new Set(views.filter((p) => p.status === "terminated").map((p) => p.id));
  return {
    running: step.state.running,
    queue: step.state.queue,
    blocked: views.flatMap((p) =>
      p.status === "blocked" && p.ioUntil !== null ? [{ id: p.id, until: p.ioUntil }] : [],
    ),
    done: trace.result.finishOrder.filter((id) => terminated.has(id)),
    absent: views.flatMap((p, i) =>
      p.status === "absent" ? [{ id: p.id, arrival: processes[i]?.arrival ?? 0 }] : [],
    ),
    text: explanationText(step.explain),
  };
}

function announce(cursor: number): string {
  const step = cursor > 0 ? trace.steps[cursor - 1] : undefined;
  return step ? t("cpu.live", { t: step.t, text: explanationText(step.explain) }) : "";
}

function timelineLabel(instant: number): string {
  const parts = trace.result.cpuSegments
    .filter((s) => s.start < instant)
    .map((s) => {
      const end = Math.min(s.end, instant);
      return s.id === null
        ? t("cpu.timeline.idle", { start: s.start, end })
        : t("cpu.timeline.run", { id: s.id, start: s.start, end });
    });
  return [t("cpu.timeline", { total: makespan }), ...parts].join(". ");
}

// Workload editing
function clamp(value: number, range: { min: number; max: number }): number {
  return Math.min(range.max, Math.max(range.min, Math.round(value)));
}

function update(index: number, change: (p: ProcessSpec) => ProcessSpec) {
  processes = processes.map((p, i) => (i === index ? change(p) : p));
}

function setArrival(index: number, raw: string) {
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || processes[index]?.arrival === clamp(value, limits.arrival)) return;
  update(index, (p) => ({ ...p, arrival: clamp(value, limits.arrival) }));
}

function setBurst(index: number, burst: number, raw: string) {
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) return;
  const next = clamp(value, limits.burst);
  if (processes[index]?.bursts[burst] === next) return;
  update(index, (p) => ({ ...p, bursts: p.bursts.map((b, i) => (i === burst ? next : b)) }));
}

const maxBursts = Math.max(...limits.burstCounts);

function addIo(index: number) {
  update(index, (p) => (p.bursts.length < maxBursts ? { ...p, bursts: [...p.bursts, 2, 1] } : p));
}

function removeIo(index: number) {
  update(index, (p) => (p.bursts.length > 1 ? { ...p, bursts: p.bursts.slice(0, -2) } : p));
}

function renumber(list: ProcessSpec[]): ProcessSpec[] {
  return list.map((p, i) => ({ ...p, id: `P${i + 1}` }));
}

function removeProcess(index: number) {
  if (processes.length <= limits.processes.min) return;
  processes = renumber(processes.filter((_, i) => i !== index));
}

function addProcess() {
  if (processes.length >= limits.processes.max) return;
  const last = processes.at(-1);
  processes = renumber([
    ...processes,
    { id: "", arrival: Math.min(limits.arrival.max, (last?.arrival ?? 0) + 1), bursts: [2] },
  ]);
}

// Prediction
const cellKey = (id: string, instant: number) => `${id}@${instant}`;
const cellCount = $derived(processes.length * predictAt.length);
const filled = $derived(Object.values(prediction).filter((v) => v !== "").length);

function lockPrediction() {
  if (predictionState !== "open") return;
  predictionState = filled === cellCount ? "locked" : "skipped";
}

function predictAgain() {
  prediction = {};
  predictionState = "open";
  runId += 1;
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
    <section class="card" aria-labelledby="ps-workload">
      <h3 id="ps-workload">{t("cpu.workload")}</h3>
      <p class="hint">{t("ps.units")}</p>
      <ul class="procs">
        {#each processes as process, index (process.id)}
          <li class="proc">
            <span class="entity proc-id"><Token slot={slotForId(process.id)} size={22} label={shapeName(process.id)} />{process.id}</span>
            <label class="field">
              <span class="field-name">{t("cpu.arrival")}</span>
              <input
                class="number"
                type="number"
                inputmode="numeric"
                min={limits.arrival.min}
                max={limits.arrival.max}
                value={process.arrival}
                aria-label={t("ps.arrivalOf", { id: process.id })}
                onchange={(e) => setArrival(index, e.currentTarget.value)}
              />
            </label>
            <div class="bursts" role="group" aria-label={`${t("ps.bursts")}, ${process.id}`}>
              {#each process.bursts as burst, b (b)}
                {@const kind = b % 2 === 0 ? t("ps.burst.cpu") : t("ps.burst.io")}
                <label class="field" class:io={b % 2 === 1}>
                  <span class="field-name">{kind}</span>
                  <input
                    class="number"
                    type="number"
                    inputmode="numeric"
                    min={limits.burst.min}
                    max={limits.burst.max}
                    value={burst}
                    aria-label={t("ps.burstOf", { n: b + 1, id: process.id, kind })}
                    onchange={(e) => setBurst(index, b, e.currentTarget.value)}
                  />
                </label>
              {/each}
            </div>
            <div class="proc-actions">
              <button
                type="button"
                class="pill small"
                aria-label={t("ps.addIoTo", { id: process.id })}
                disabled={process.bursts.length >= maxBursts}
                onclick={() => addIo(index)}
              >
                {t("ps.addIo")}
              </button>
              <button
                type="button"
                class="pill small"
                aria-label={t("ps.removeIoFrom", { id: process.id })}
                disabled={process.bursts.length <= 1}
                onclick={() => removeIo(index)}
              >
                {t("ps.removeIo")}
              </button>
              <button
                type="button"
                class="icon"
                aria-label={t("cpu.removeProcess", { id: process.id })}
                disabled={processes.length <= limits.processes.min}
                onclick={() => removeProcess(index)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
          </li>
        {/each}
      </ul>
      <div class="row">
        <button type="button" class="pill" disabled={processes.length >= limits.processes.max} onclick={addProcess}>
          {t("cpu.addProcess")}
        </button>
      </div>
      <div class="presets" role="group" aria-label={t("cpu.presets")}>
        <span class="hint">{t("cpu.presets")}</span>
        {#each presetIds as id (id)}
          <button type="button" class="pill small" onclick={() => (processes = clonePreset(id))}>{t(`ps.preset.${id}`)}</button>
        {/each}
      </div>
    </section>

    <section class="card" aria-labelledby="ps-quantum">
      <h3 id="ps-quantum">{t("cpu.quantum")}</h3>
      <div class="row" role="group" aria-labelledby="ps-quantum">
        <button type="button" class="pill" aria-pressed={!quantumOn} onclick={() => (quantumOn = false)}>{t("ps.quantum.off")}</button>
        <button type="button" class="pill" aria-pressed={quantumOn} onclick={() => (quantumOn = true)}>{t("ps.quantum.on")}</button>
      </div>
      {#if quantumOn}
        <label class="quantum">
          <span>{t("cpu.quantum")}: <strong>{quantumValue}</strong></span>
          <input type="range" min={limits.quantum.min} max={limits.quantum.max} bind:value={quantumValue} />
        </label>
      {/if}
      <p class="hint">{t("ps.quantum.hint")}</p>
    </section>
  </div>

  {#if predictionState === "open"}
    <section class="card" aria-labelledby="ps-predict">
      <h3 id="ps-predict">{t("cpu.predict.title")}</h3>
      <p>{t("ps.predict.prompt")}</p>
      <div class="table-wrap">
        <table class="predict-grid">
          <thead>
            <tr>
              <th scope="col">{t("cpu.process")}</th>
              {#each predictAt as instant (instant)}<th scope="col">{t("ps.predict.at", { t: instant })}</th>{/each}
            </tr>
          </thead>
          <tbody>
            {#each processes as process (process.id)}
              <tr>
                <th scope="row"><span class="entity"><Token slot={slotForId(process.id)} size={22} label={shapeName(process.id)} />{process.id}</span></th>
                {#each predictAt as instant (instant)}
                  {@const key = cellKey(process.id, instant)}
                  <td>
                    <select
                      aria-label={t("ps.predict.cell", { id: process.id, t: instant })}
                      value={prediction[key] ?? ""}
                      onchange={(e) => (prediction = { ...prediction, [key]: e.currentTarget.value as ProcessStatus | "" })}
                    >
                      <option value="">{t("ps.predict.choose")}</option>
                      {#each choices as s (s)}<option value={s}>{stateName(s)}</option>{/each}
                    </select>
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if filled > 0}
        <div class="row"><button type="button" class="pill small" onclick={() => (prediction = {})}>{t("cpu.predict.clear")}</button></div>
      {/if}
    </section>
  {/if}

  <div class="board">
    <Player {total} {traceKey} {labels} {announce} onfirstplay={lockPrediction} onend={announceRunFinished}>
      {#snippet board(cursor)}
        {@const view = boardAt(cursor)}
        {@const instant = instantAt(cursor)}
        {@const shown = trace.steps[instant]?.state}
        <div class="board-head">
          <h3>{cursor === 0 ? t("cpu.board.start") : t("cpu.board.at", { t: instant })}</h3>
          <p class="rule">{t("ps.rule")}{quantum !== null ? ` ${t("ps.rule.quantum", { q: quantum })}` : ""}</p>
        </div>

        <div class="zones">
          <div class="zone waiting">
            <h4>{t("cpu.zone.waiting")}</h4>
            <ul class="zone-tokens">
              {#each view.queue as id (id)}
                <li><Token slot={slotForId(id)} size={54} label={tokenLabel(id)} /><span aria-hidden="true">{id}</span></li>
              {:else}
                <li class="empty">{t("cpu.zone.empty")}</li>
              {/each}
            </ul>
          </div>
          <div class="zone cpu">
            <h4>{t("cpu.zone.cpu")}</h4>
            {#if view.running}
              <div class="cpu-token"><Token slot={slotForId(view.running)} size={84} label={tokenLabel(view.running)} /><span aria-hidden="true">{view.running}</span></div>
            {:else}
              <p class="empty">{t("cpu.zone.idle")}</p>
            {/if}
          </div>
          <div class="zone blocked">
            <h4>{t("ps.zone.blocked")}</h4>
            <ul class="zone-tokens">
              {#each view.blocked as b (b.id)}
                <li>
                  <Token slot={slotForId(b.id)} size={54} label={tokenLabel(b.id)} />
                  <span aria-hidden="true">{b.id}</span>
                  <span class="caption">{t("ps.zone.until", { t: b.until })}</span>
                </li>
              {:else}
                <li class="empty">{t("cpu.zone.empty")}</li>
              {/each}
            </ul>
          </div>
          <div class="zone done">
            <h4>{t("cpu.zone.done")}</h4>
            <ul class="zone-tokens">
              {#each view.done as id (id)}
                <li><Token slot={slotForId(id)} size={34} variant="outline" label={tokenLabel(id)} /><span aria-hidden="true">{id}</span></li>
              {:else}
                <li class="empty">{t("cpu.zone.empty")}</li>
              {/each}
            </ul>
          </div>
        </div>

        {#if view.absent.length > 0}
          <div class="absent">
            <h4>{t("ps.zone.absent")}</h4>
            <ul class="absent-list">
              {#each view.absent as a (a.id)}
                <li><span class="entity"><Token slot={slotForId(a.id)} size={22} variant="outline" label={tokenLabel(a.id)} /><span aria-hidden="true">{a.id}</span></span> <span class="caption">{t("ps.zone.arrives", { t: a.arrival })}</span></li>
              {/each}
            </ul>
          </div>
        {/if}

        <Timeline segments={trace.result.cpuSegments} total={makespan} cursor={Math.max(instant, 0)} label={timelineLabel(Math.max(instant, 0))} />

        <section class="states" aria-labelledby="ps-states">
          <h4 id="ps-states">{t("ps.states")}</h4>
          <p class="hint">{t("ps.states.hint")}</p>
          <div class="table-wrap" use:scrollCurrent={cursor}>
            <table class="states-grid">
              <thead>
                <tr>
                  <th scope="col">{t("cpu.process")}</th>
                  {#each units as u (u)}<th scope="col" class:now={u === instant}><span class="visually-hidden">{t("ps.states.instant")} </span>{u}</th>{/each}
                </tr>
              </thead>
              <tbody>
                {#each processes as process, i (process.id)}
                  <tr>
                    <th scope="row"><span class="entity"><Token slot={slotForId(process.id)} size={20} label={shapeName(process.id)} />{process.id}</span></th>
                    {#each units as u (u)}
                      {@const s = u <= instant ? trace.steps[u]?.state.processes[i]?.status : undefined}
                      <td class:now={u === instant}>
                        {#if s}
                          <span class="cell {s}" style:--fill="var(--entity-{slotForId(process.id)})" style:--on="var(--entity-{slotForId(process.id)}-on)">
                            <span aria-hidden="true">{stateShort(s)}</span><span class="visually-hidden">{stateName(s)}</span>
                          </span>
                        {/if}
                      </td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>

        <div class="after">
          <section class="why" aria-labelledby="ps-why">
            <h4 id="ps-why">{t("cpu.why")}</h4>
            <p>{view.text}</p>
          </section>

          {#if predictionState !== "open"}
            <section class="card verdict" aria-labelledby="ps-verdict">
              <h4 id="ps-verdict">{t("cpu.predict.title")}</h4>
              {#if predictionState === "skipped"}
                <p>{t("cpu.predict.none")}</p>
              {:else if instant < lastPredicted && cursor < total}
                <p>{t("cpu.predict.locked")}</p>
              {:else}
                {@const cells = processes.flatMap((p) => predictAt.map((at) => ({ id: p.id, at, guess: prediction[cellKey(p.id, at)], actual: statusAt(p.id, at) })))}
                {@const hits = cells.filter((c) => c.guess === c.actual).length}
                <p class="score">
                  {#if hits === cells.length}
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" stroke-width="3" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>
                    {t("ps.predict.perfect")}
                  {:else}
                    {t("ps.predict.score", { hits, total: cells.length })}
                  {/if}
                </p>
                <div class="table-wrap">
                  <table class="verdict-grid">
                    <thead>
                      <tr>
                        <th scope="col">{t("cpu.process")}</th>
                        {#each predictAt as at (at)}<th scope="col">{t("ps.predict.at", { t: at })}</th>{/each}
                      </tr>
                    </thead>
                    <tbody>
                      {#each processes as p (p.id)}
                        <tr>
                          <th scope="row"><span class="entity"><Token slot={slotForId(p.id)} size={20} label={shapeName(p.id)} />{p.id}</span></th>
                          {#each cells.filter((c) => c.id === p.id) as c (c.at)}
                            {@const ok = c.guess === c.actual}
                            <td class:miss={!ok}>
                              {#if ok}
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" stroke-width="3.2" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>
                                {stateName(c.actual)}
                                <span class="visually-hidden">, {t("cpu.predict.match")}</span>
                              {:else}
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-bad)" stroke-width="3.2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                                <s>{c.guess ? stateName(c.guess) : "–"}</s>
                                <span class="visually-hidden">, {t("cpu.predict.miss")}</span>
                                <span class="actual">{t("ps.predict.actual", { state: stateName(c.actual) })}</span>
                              {/if}
                            </td>
                          {/each}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
                {#if hits < cells.length}<p class="hint">{t("ps.predict.hint")}</p>{/if}
              {/if}
              <div class="row"><button type="button" class="pill small" onclick={predictAgain}>{t("cpu.predict.again")}</button></div>
            </section>
          {/if}
        </div>

        <section class="metrics" aria-labelledby="ps-metrics">
          <h4 id="ps-metrics">{t("ps.metrics")}</h4>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t("cpu.process")}</th>
                  <th scope="col">{t("cpu.arrival")}</th>
                  <th scope="col">{t("ps.metrics.cpu")}</th>
                  <th scope="col">{t("ps.metrics.io")}</th>
                  <th scope="col">{t("ps.metrics.ready")}</th>
                  <th scope="col">{t("ps.metrics.finish")}</th>
                  <th scope="col">{t("ps.metrics.turnaround")}</th>
                </tr>
              </thead>
              <tbody>
                {#each trace.result.processes as m, i (m.id)}
                  {@const so = shown?.processes[i]}
                  {@const done = so?.status === "terminated"}
                  <tr>
                    <th scope="row"><span class="entity"><Token slot={slotForId(m.id)} size={20} label={shapeName(m.id)} />{m.id}</span></th>
                    <td>{m.arrival}</td>
                    <td>{so ? so.cpu : "–"}</td>
                    <td>{so ? so.io : "–"}</td>
                    <td>{so ? so.ready : "–"}</td>
                    <td>{done ? m.finish : "–"}</td>
                    <td>{done ? m.turnaround : "–"}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          {#if shown && instant > 0}
            <p>{t("ps.metrics.utilization", { busy: shown.busy, t: instant, pct: formatNumber(lang, (shown.busy / instant) * 100, 0) })}</p>
          {/if}
          {#if cursor >= total}
            <p>{t("ps.metrics.serial", { serial: trace.result.serialTime, makespan })}</p>
          {/if}
          <p class="hint">{t("ps.metrics.formula")}</p>
        </section>
      {/snippet}
    </Player>
  </div>
</div>

<style>
  .procs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .proc {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-2) var(--space-3);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-slot);
  }

  .proc-id {
    align-self: center;
    min-width: 3.5rem;
  }

  .bursts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .field-name {
    font-size: var(--text-data);
    color: var(--color-ink-muted);
  }

  .field.io .number {
    border-style: dashed;
  }

  .proc-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-left: auto;
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

  select {
    min-height: var(--target-min);
    padding: 0 var(--space-3);
    border: var(--outline);
    border-radius: var(--radius-field);
    background: var(--color-surface);
    color: var(--color-ink);
  }

  .predict-grid td,
  .predict-grid th {
    text-align: left;
  }

  /* Blocked processes wait too, but for an event, not for the CPU: dashed like a queue, on the ground color. */
  .zone.blocked {
    flex: 2 1 280px;
    border: var(--outline-waiting);
    background: var(--color-ground);
  }

  .caption {
    font-size: var(--text-data);
    font-weight: 500;
    color: var(--color-ink-muted);
  }

  .absent {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-4);
  }

  .absent-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
  }

  .states {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .states-grid th,
  .states-grid td {
    padding: 3px 2px;
    text-align: center;
  }

  /* Future columns are empty: keep them as wide as filled ones so the grid does not jump. */
  .states-grid td,
  .states-grid thead th:not(:first-child) {
    min-width: 2.75rem;
  }

  .states-grid th:first-child {
    text-align: left;
    padding-right: var(--space-2);
  }

  .states-grid thead th.now {
    color: var(--color-ink);
    font-weight: 800;
  }

  .cell {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 2.5rem;
    height: 30px;
    border-radius: var(--radius-bar);
    font-size: var(--text-data);
    font-weight: 700;
  }

  .cell.running {
    background: var(--fill);
    color: var(--on);
  }

  .cell.ready {
    border: var(--outline-waiting);
  }

  .cell.blocked {
    background: var(--color-slot);
  }

  .cell.terminated,
  .cell.absent {
    color: var(--color-ink-muted);
    font-weight: 400;
  }

  td.now .cell {
    outline: 2px solid var(--color-ink);
    outline-offset: 1px;
  }

  /* Keep the ✓/✗ mark on the same line as the state name. */
  .verdict-grid td {
    text-align: left;
    white-space: nowrap;
  }

  .verdict-grid s {
    text-decoration-color: var(--color-bad);
    text-decoration-thickness: 2px;
  }

  .actual {
    display: block;
    font-size: var(--text-data);
    color: var(--color-ink-muted);
  }
</style>
