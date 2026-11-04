<script lang="ts">
import { type PresetId, presetIds, presets } from "../../engines/cpu-scheduling/presets";
import { simulate } from "../../engines/cpu-scheduling/simulate";
import {
  type Algorithm,
  algorithms,
  type CpuExplanation,
  limits,
  type ProcessSpec,
} from "../../engines/cpu-scheduling/types";
import type { Locale } from "../../i18n/config";
import { cpuSchedulingEn } from "../../i18n/engines/cpu-scheduling.en";
import { cpuSchedulingEs } from "../../i18n/engines/cpu-scheduling.es";
import { renderExplanation } from "../../i18n/engines/types";
import { formatNumber, useTranslations } from "../../i18n/t";
import type { UiKey } from "../../i18n/ui/es";
import { announceRunFinished } from "../../lib/events";
import Player from "../../player/Player.svelte";
import Timeline from "../board/Timeline.svelte";
import "../board/board.css";
import { slotForId } from "../token/shapes";
import Token from "../token/Token.svelte";

interface Props {
  lang: Locale;
  /** "lesson" shows every control; "demo" is the compact board for the home page. */
  variant?: "lesson" | "demo";
  preset?: PresetId;
  algorithm?: Algorithm;
  quantum?: number;
}

let {
  lang,
  variant = "lesson",
  preset = "convoy",
  algorithm: initialAlgorithm = "fcfs",
  quantum: initialQuantum = 2,
}: Props = $props();

const t = $derived(useTranslations(lang));
const fields = ["arrival", "burst", "priority"] as const;
const templates = $derived(lang === "es" ? cpuSchedulingEs : cpuSchedulingEn);
const algoLabel = $derived(
  Object.fromEntries(algorithms.map((a) => [a, t(`cpu.algo.${a}.short`)])) as Record<
    Algorithm,
    string
  >,
);
const num = (v: number) => formatNumber(lang, v);
const shapeName = (id: string) => t(`shape.${slotForId(id)}` as UiKey);
const tokenLabel = (id: string) => `${id}, ${shapeName(id)}`;

// svelte-ignore state_referenced_locally
let processes = $state<ProcessSpec[]>(presets[preset].map((p) => ({ ...p })));
// svelte-ignore state_referenced_locally
let algorithm = $state<Algorithm>(initialAlgorithm);
// svelte-ignore state_referenced_locally
let quantum = $state(initialQuantum);
let prediction = $state<string[]>([]);
let predictionState = $state<"open" | "locked" | "skipped">("open");
let runId = $state(0);

const trace = $derived(simulate({ processes, algorithm, quantum }));
const total = $derived(trace.steps.length);
const comparison = $derived(
  algorithms.map((a) => ({
    algorithm: a,
    waiting: simulate({ processes, algorithm: a, quantum }).result.averages.waiting,
  })),
);
const maxWaiting = $derived(Math.max(...comparison.map((c) => c.waiting), 0.001));
const traceKey = $derived(`${JSON.stringify(processes)}|${algorithm}|${quantum}|${runId}`);

$effect(() => {
  void trace;
  prediction = [];
  predictionState = "open";
});

function explanationText(explain: readonly CpuExplanation[]): string {
  return explain.map((e) => renderExplanation(templates, e)).join(" ");
}

function boardAt(cursor: number) {
  if (cursor === 0) {
    return {
      cpu: null as string | null,
      queue: processes.filter((p) => p.arrival === 0).map((p) => p.id),
      done: [] as readonly string[],
      text: t("cpu.why.start"),
    };
  }
  const step = trace.steps[cursor - 1];
  if (!step) return { cpu: null, queue: [], done: [], text: "" };
  const { running, queue, finished } = step.state;
  const expired = step.explain.find((e) => e.key === "rr.expire")?.params.id;
  const stays = running !== null && !finished.includes(running) && running !== expired;
  return {
    cpu: stays ? running : null,
    queue: expired ? [...queue, expired] : [...queue],
    done: finished,
    text: explanationText(step.explain),
  };
}

function announce(cursor: number): string {
  if (cursor === 0) return "";
  const step = trace.steps[cursor - 1];
  return step ? t("cpu.live", { t: cursor, text: explanationText(step.explain) }) : "";
}

function timelineLabel(cursor: number): string {
  const parts = trace.result.segments
    .filter((s) => s.start < cursor)
    .map((s) => {
      const end = Math.min(s.end, cursor);
      return s.id === null
        ? t("cpu.timeline.idle", { start: s.start, end })
        : t("cpu.timeline.run", { id: s.id, start: s.start, end });
    });
  return [t("cpu.timeline", { total }), ...parts].join(". ");
}

// Workload editing
function clamp(value: number, range: { min: number; max: number }): number {
  return Math.min(range.max, Math.max(range.min, Math.round(value)));
}

function setField(index: number, field: "arrival" | "burst" | "priority", raw: string) {
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) return;
  const current = processes[index];
  if (!current) return;
  const next = clamp(value, limits[field]);
  if (current[field] === next) return;
  processes = processes.map((p, i) => (i === index ? { ...p, [field]: next } : p));
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
    {
      id: "",
      arrival: Math.min(limits.arrival.max, (last?.arrival ?? 0) + 1),
      burst: 3,
      priority: 2,
    },
  ]);
}

function loadPreset(id: PresetId) {
  processes = presets[id].map((p) => ({ ...p }));
}

// Prediction
function pick(id: string) {
  if (predictionState !== "open" || prediction.includes(id)) return;
  prediction = [...prediction, id];
}

function unpick(id: string) {
  if (predictionState !== "open") return;
  prediction = prediction.filter((p) => p !== id);
}

function lockPrediction() {
  if (variant !== "lesson" || predictionState !== "open") return;
  predictionState = prediction.length === processes.length ? "locked" : "skipped";
}

function predictAgain() {
  prediction = [];
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

<div class="sim" class:demo={variant === "demo"}>
  {#if variant === "lesson"}
    <div class="setup">
      <section class="card" aria-labelledby="cpu-workload">
        <h3 id="cpu-workload">{t("cpu.workload")}</h3>
        <p class="hint">{t("cpu.units")}</p>
        <div class="table-wrap">
          <table class="workload">
            <thead>
              <tr>
                <th scope="col">{t("cpu.process")}</th>
                <th scope="col">{t("cpu.arrival")}</th>
                <th scope="col">{t("cpu.burst")}</th>
                <th scope="col">{t("cpu.priority")}</th>
                <th scope="col"><span class="visually-hidden">{t("cpu.removeColumn")}</span></th>
              </tr>
            </thead>
            <tbody>
              {#each processes as process, index (process.id)}
                <tr>
                  <th scope="row"><span class="entity"><Token slot={slotForId(process.id)} size={22} label={shapeName(process.id)} />{process.id}</span></th>
                  {#each fields as field (field)}
                    <td>
                      <input
                        type="number"
                        inputmode="numeric"
                        min={limits[field].min}
                        max={limits[field].max}
                        value={process[field]}
                        aria-label={t("cpu.fieldOf", { field: t(`cpu.${field}`), id: process.id })}
                        onchange={(e) => setField(index, field, e.currentTarget.value)}
                      />
                    </td>
                  {/each}
                  <td>
                    <button
                      type="button"
                      class="icon"
                      aria-label={t("cpu.removeProcess", { id: process.id })}
                      disabled={processes.length <= limits.processes.min}
                      onclick={() => removeProcess(index)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="row">
          <button type="button" class="pill" disabled={processes.length >= limits.processes.max} onclick={addProcess}>
            {t("cpu.addProcess")}
          </button>
        </div>
        <div class="presets" role="group" aria-label={t("cpu.presets")}>
          <span class="hint">{t("cpu.presets")}</span>
          {#each presetIds as id (id)}
            <button type="button" class="pill small" onclick={() => loadPreset(id)}>{t(`cpu.preset.${id}`)}</button>
          {/each}
        </div>
      </section>

      <section class="card" aria-labelledby="cpu-algorithm">
        <h3 id="cpu-algorithm">{t("cpu.algorithm")}</h3>
        <div class="algos" role="group" aria-label={t("cpu.algorithm")}>
          {#each algorithms as a (a)}
            <button type="button" class="algo" aria-pressed={algorithm === a} title={t(`cpu.algo.${a}`)} onclick={() => (algorithm = a)}>
              {algoLabel[a]}
            </button>
          {/each}
        </div>
        <p><strong>{t(`cpu.algo.${algorithm}`)}</strong>: {t(`cpu.algo.${algorithm}.rule`)}</p>
        {#if algorithm === "rr"}
          <label class="quantum">
            <span>{t("cpu.quantum")}: <strong>{quantum}</strong></span>
            <input type="range" min={limits.quantum.min} max={limits.quantum.max} bind:value={quantum} />
          </label>
        {/if}
      </section>
    </div>

    {#if predictionState === "open"}
      <section class="card predict" aria-labelledby="cpu-predict">
        <h3 id="cpu-predict">{t("cpu.predict.title")}</h3>
        <p>{t("cpu.predict.prompt")}</p>
        <div class="tokens">
          {#each processes as process (process.id)}
            <button
              type="button"
              class="token-button"
              disabled={prediction.includes(process.id)}
              aria-label={t("cpu.predict.pick", { id: process.id, n: prediction.length + 1 })}
              onclick={() => pick(process.id)}
            >
              <Token slot={slotForId(process.id)} size={40} />{process.id}
            </button>
          {/each}
        </div>
        <ol class="order">
          {#each processes as _, n (n)}
            {@const id = prediction[n]}
            <li>
              {#if id}
                <button type="button" class="token-button placed" aria-label={t("cpu.predict.unpick", { id })} onclick={() => unpick(id)}>
                  <Token slot={slotForId(id)} size={28} />{id}
                </button>
              {:else}
                <span class="slot">{t("cpu.predict.position", { n: n + 1 })}</span>
              {/if}
            </li>
          {/each}
        </ol>
        {#if prediction.length > 0}
          <div class="row"><button type="button" class="pill small" onclick={() => (prediction = [])}>{t("cpu.predict.clear")}</button></div>
        {/if}
      </section>
    {/if}
  {/if}

  <div class="board">
    <Player
      {total}
      {traceKey}
      {labels}
      {announce}
      onfirstplay={lockPrediction}
      onend={variant === "lesson" ? announceRunFinished : undefined}
    >
      {#snippet board(cursor)}
        {@const view = boardAt(cursor)}
        <div class="board-head">
          <h3>{cursor === 0 ? t("cpu.board.start") : t("cpu.board.at", { t: cursor })}</h3>
          <p class="rule">{algoLabel[algorithm]}{algorithm === "rr" ? ` (${t("cpu.quantum").toLowerCase()} ${quantum})` : ""}: {t(`cpu.algo.${algorithm}.rule`)}</p>
        </div>

        <div class="zones">
          <div class="zone waiting">
            <h4>{t("cpu.zone.waiting")}</h4>
            <ul class="zone-tokens">
              {#each view.queue as id (id)}
                <li><Token slot={slotForId(id)} size={variant === "demo" ? 40 : 54} label={tokenLabel(id)} /><span aria-hidden="true">{id}</span></li>
              {:else}
                <li class="empty">{t("cpu.zone.empty")}</li>
              {/each}
            </ul>
          </div>
          <div class="zone cpu">
            <h4>{t("cpu.zone.cpu")}</h4>
            {#if view.cpu}
              <div class="cpu-token"><Token slot={slotForId(view.cpu)} size={variant === "demo" ? 60 : 84} label={tokenLabel(view.cpu)} /><span aria-hidden="true">{view.cpu}</span></div>
            {:else}
              <p class="empty">{t("cpu.zone.idle")}</p>
            {/if}
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

        <Timeline segments={trace.result.segments} {total} {cursor} label={timelineLabel(cursor)} />

        <div class="after">
          <section class="why" aria-labelledby="cpu-why">
            <h4 id="cpu-why">{t("cpu.why")}</h4>
            <p>{view.text}</p>
          </section>

          {#if variant === "lesson" && predictionState !== "open"}
            <section class="card verdict" aria-labelledby="cpu-verdict">
              <h4 id="cpu-verdict">{t("cpu.predict.title")}</h4>
              {#if predictionState === "skipped"}
                <p>{t("cpu.predict.none")}</p>
              {:else if cursor < total}
                <div class="tokens small">
                  {#each prediction as id (id)}<span class="entity"><Token slot={slotForId(id)} size={28} />{id}</span>{/each}
                </div>
                <p>{t("cpu.predict.locked")}</p>
              {:else}
                {@const actual = trace.result.finishOrder}
                {@const hits = prediction.filter((id, i) => actual[i] === id).length}
                <p class="score">
                  {#if hits === actual.length}
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" stroke-width="3" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>
                    {t("cpu.predict.perfect")}
                  {:else}
                    {t("cpu.predict.score", { hits, total: actual.length })}
                  {/if}
                </p>
                <dl class="compare-orders">
                  <dt>{t("cpu.predict.yours")}</dt>
                  <dd>
                    {#each prediction as id, i (id)}
                      <span class="entity" class:miss={actual[i] !== id}>
                        <Token slot={slotForId(id)} size={24} />{id}
                        <span class="visually-hidden">, {actual[i] === id ? t("cpu.predict.match") : t("cpu.predict.miss")}</span>
                        {#if actual[i] !== id}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-bad)" stroke-width="3.2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>{/if}
                      </span>
                    {/each}
                  </dd>
                  <dt>{t("cpu.predict.actual")}</dt>
                  <dd>
                    {#each actual as id (id)}<span class="entity"><Token slot={slotForId(id)} size={24} />{id}</span>{/each}
                  </dd>
                </dl>
                {#if hits < actual.length}<p class="hint">{t("cpu.predict.hint")}</p>{/if}
              {/if}
              <div class="row"><button type="button" class="pill small" onclick={predictAgain}>{t("cpu.predict.again")}</button></div>
            </section>
          {/if}
        </div>

        {#if variant === "lesson"}
          <section class="metrics" aria-labelledby="cpu-metrics">
            <h4 id="cpu-metrics">{t("cpu.metrics")}</h4>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t("cpu.process")}</th>
                    <th scope="col">{t("cpu.arrival")}</th>
                    <th scope="col">{t("cpu.burst")}</th>
                    <th scope="col">{t("cpu.metrics.finish")}</th>
                    <th scope="col">{t("cpu.metrics.turnaround")}</th>
                    <th scope="col">{t("cpu.metrics.waiting")}</th>
                    <th scope="col">{t("cpu.metrics.response")}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each trace.result.processes as m (m.id)}
                    {@const done = m.finish <= cursor}
                    <tr>
                      <th scope="row"><span class="entity"><Token slot={slotForId(m.id)} size={20} />{m.id}</span></th>
                      <td>{m.arrival}</td>
                      <td>{m.burst}</td>
                      <td>{done ? m.finish : "–"}</td>
                      <td>{done ? m.turnaround : "–"}</td>
                      <td>{done ? m.waiting : "–"}</td>
                      <td>{m.firstStart < cursor ? m.response : "–"}</td>
                    </tr>
                  {/each}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">{t("cpu.metrics.average")}</th>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td>{cursor >= total ? num(trace.result.averages.turnaround) : "–"}</td>
                    <td>{cursor >= total ? num(trace.result.averages.waiting) : "–"}</td>
                    <td>{cursor >= total ? num(trace.result.averages.response) : "–"}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p class="hint">{t("cpu.metrics.formula")}</p>
          </section>
        {/if}
      {/snippet}
    </Player>
  </div>

  {#if variant === "lesson"}
    <section class="card" aria-labelledby="cpu-compare">
      <h3 id="cpu-compare">{t("cpu.compare")}</h3>
      <p class="hint">{t("cpu.compare.hint")}</p>
      <ul class="bars">
        {#each comparison as c (c.algorithm)}
          <li class:current={c.algorithm === algorithm}>
            <span class="bar-name">{algoLabel[c.algorithm]}</span>
            <span class="bar-track" aria-hidden="true"><span class="bar-fill" style:width="{(c.waiting / maxWaiting) * 100}%"></span></span>
            <span class="bar-value">{num(c.waiting)}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .workload input {
    width: 3.5rem;
    min-height: var(--target-min);
    padding: 0 var(--space-2);
    border: var(--outline);
    border-radius: var(--radius-field);
    background: var(--color-surface);
    text-align: right;
  }

  .algos {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .algo {
    cursor: pointer;
    border: var(--outline);
    background: var(--color-surface);
    color: var(--color-ink);
    min-width: 64px;
    min-height: var(--target-min);
    border-radius: var(--radius-pill);
    font-weight: 700;
  }

  .algo[aria-pressed="true"] {
    background: var(--color-ink);
    color: var(--color-on-ink);
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

  .tokens {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .tokens.small {
    gap: var(--space-2);
  }

  .token-button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--target-min);
    padding: 4px var(--space-4) 4px 6px;
    border-radius: var(--radius-pill);
    font-weight: 800;
  }

  .token-button.placed {
    padding-right: var(--space-3);
  }

  .order li {
    display: flex;
  }

  .order {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .slot {
    display: inline-flex;
    align-items: center;
    min-height: var(--target-min);
    padding: 0 var(--space-4);
    border: var(--outline-waiting);
    border-radius: var(--radius-pill);
    color: var(--color-ink-muted);
    font-size: var(--text-small);
  }

  .compare-orders {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-2) var(--space-4);
    align-items: center;
  }

  .compare-orders dt {
    color: var(--color-ink-muted);
    font-size: var(--text-small);
  }

  .compare-orders dd {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .entity.miss {
    text-decoration: line-through;
    text-decoration-color: var(--color-bad);
    text-decoration-thickness: 2px;
  }

  .bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .bars li {
    display: grid;
    grid-template-columns: 4.5rem 1fr 3.5rem;
    gap: var(--space-3);
    align-items: center;
    font-variant-numeric: tabular-nums;
  }

  .bar-track {
    height: 14px;
    border-radius: var(--radius-pill);
    background: var(--color-ground);
    overflow: hidden;
  }

  .bar-fill {
    display: block;
    height: 100%;
    border-radius: var(--radius-pill);
    background: var(--color-ink-muted);
  }

  .bars li.current {
    font-weight: 800;
  }

  .bars li.current .bar-fill {
    background: var(--color-ink);
  }

  .bar-value {
    text-align: right;
  }

  .demo .board {
    padding: var(--space-5);
  }

  @media (max-width: 600px) {
    /* The headers are wider than the inputs: keep them small so all five columns fit at 360px. */
    .workload th,
    .workload td {
      padding: 4px 2px;
    }

    .workload thead th {
      font-size: var(--text-data);
    }

    .workload input {
      width: 2.75rem;
      padding: 0 4px;
    }
  }
</style>
