<script lang="ts">
import { philosophers, twoLocks } from "../../engines/resource-graph/presets";
import { simulate } from "../../engines/resource-graph/simulate";
import {
  type GraphExplanation,
  type GraphInput,
  type GraphState,
  limits,
  type ProgramOp,
  type ThreadView,
} from "../../engines/resource-graph/types";
import type { Locale } from "../../i18n/config";
import { resourceGraphEn } from "../../i18n/engines/resource-graph.en";
import { resourceGraphEs } from "../../i18n/engines/resource-graph.es";
import { renderExplanation } from "../../i18n/engines/types";
import { useTranslations } from "../../i18n/t";
import type { UiKey } from "../../i18n/ui/es";
import { announceRunFinished } from "../../lib/events";
import Player from "../../player/Player.svelte";
import Timeline from "../board/Timeline.svelte";
import "../board/board.css";
import { shapePaths, slotForId } from "../token/shapes";
import Token from "../token/Token.svelte";

type Scenario = "philosophers" | "twoLocks";

interface Props {
  lang: Locale;
  scenario?: Scenario;
  count?: number;
}

let { lang, scenario: initialScenario = "philosophers", count: initialCount = 5 }: Props = $props();

const t = $derived(useTranslations(lang));
const templates = $derived(lang === "es" ? resourceGraphEs : resourceGraphEn);
const uid = $props.id();
const shapeName = (id: string) => t(`shape.${slotForId(id)}` as UiKey);
const tokenLabel = (id: string) => `${id}, ${shapeName(id)}`;

// svelte-ignore state_referenced_locally
let scenario = $state<Scenario>(initialScenario);
// svelte-ignore state_referenced_locally
let count = $state(initialCount);
let ordering = $state<GraphInput["ordering"]>("script");
let delays = $state<number[]>([]);
let q1 = $state<boolean | null>(null);
let q2 = $state<number | null>(null);
let predictionState = $state<"open" | "locked" | "skipped">("open");
let runId = $state(0);

const base = $derived(scenario === "philosophers" ? philosophers(count) : twoLocks);
const input = $derived<GraphInput>({
  ...base,
  ordering,
  threads: base.threads.map((th, i) => ({ ...th, delay: delays[i] ?? 0 })),
});
const trace = $derived(simulate(input));
const total = $derived(trace.steps.length);
const ids = $derived(input.threads.map((_, i) => `T${i + 1}`));
const resourceIds = $derived(Array.from({ length: input.resources }, (_, i) => `R${i + 1}`));
const traceKey = $derived(`${JSON.stringify(input)}|${runId}`);

$effect(() => {
  void trace;
  q1 = null;
  q2 = null;
  predictionState = "open";
});

function choose(next: Scenario, n = count) {
  scenario = next;
  count = n;
  delays = [];
}

function setDelay(index: number, raw: string) {
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) return;
  const clamped = Math.min(limits.delay.max, Math.max(limits.delay.min, value));
  const next = ids.map((_, i) => delays[i] ?? 0);
  next[index] = clamped;
  delays = next;
}

function lockPrediction() {
  if (predictionState !== "open") return;
  predictionState = q1 !== null && q2 !== null ? "locked" : "skipped";
}

function predictAgain() {
  q1 = null;
  q2 = null;
  predictionState = "open";
  runId += 1;
}

function explanationText(explain: readonly GraphExplanation[]): string {
  return explain.map((e) => renderExplanation(templates, e)).join(" ");
}

function announce(cursor: number): string {
  const step = cursor > 0 ? trace.steps[cursor - 1] : undefined;
  return step ? t("rg.live", { n: step.t + 1, text: explanationText(step.explain) }) : "";
}

function timelineLabel(cursor: number): string {
  const parts = trace.result.segments
    .filter((s) => s.start < cursor)
    .map((s) => t("cpu.timeline.run", { id: s.id, start: s.start, end: Math.min(s.end, cursor) }));
  return [t("rg.timeline", { total }), ...parts].join(". ");
}

function opLabel(op: ProgramOp): string {
  if (op.op === "acquire") return t("rg.op.acquire", { res: `R${op.res}` });
  if (op.op === "release") return t("rg.op.release", { res: `R${op.res}` });
  return t(`rg.op.${op.op}`);
}

function initialState(): GraphState {
  return {
    threads: ids.map((id) => ({ id, status: "ready", holds: [], waitsFor: null, pc: 0 })),
    resources: resourceIds.map((id) => ({ id, holder: null, queue: [] })),
    ran: "",
    ready: ids,
    cycle: null,
  };
}

function statusText(th: ThreadView, state: GraphState): string {
  if (th.status === "blocked" && state.cycle?.includes(th.id)) return t("rg.status.stuck");
  return t(`rg.status.${th.status}`);
}

// Graph geometry: threads on an outer ring, resources on an inner ring, offset by half a step,
// so philosopher Ti sits between its forks Ri and R(i+1).
const SIZE = 340;
const C = SIZE / 2;
const ringT = 128;
const ringR = 66;
const nodeT = 18;
const nodeR = 17;

function polar(index: number, n: number, radius: number, offset: number) {
  const angle = (-90 + (360 * index) / n + offset) * (Math.PI / 180);
  return { x: C + radius * Math.cos(angle), y: C + radius * Math.sin(angle) };
}

const threadPos = $derived(ids.map((_, i) => polar(i, ids.length, ringT, 0)));
const resourcePos = $derived(
  resourceIds.map((_, i) => polar(i, resourceIds.length, ringR, -180 / resourceIds.length)),
);

function edge(
  from: { x: number; y: number },
  to: { x: number; y: number },
  r1: number,
  r2: number,
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x1: from.x + (dx / len) * r1,
    y1: from.y + (dy / len) * r1,
    x2: to.x - (dx / len) * (r2 + 4),
    y2: to.y - (dy / len) * (r2 + 4),
  };
}

function edgesOf(state: GraphState) {
  const inCycle = (thread: string, holder: string | null) => {
    const cycle = state.cycle;
    if (!cycle || !holder) return false;
    const i = cycle.indexOf(thread);
    return i >= 0 && cycle[(i + 1) % cycle.length] === holder;
  };
  const holdsCycle = (res: string, holder: string) =>
    state.threads.some((th) => th.waitsFor === res && inCycle(th.id, holder));
  const list: {
    key: string;
    kind: "holds" | "waits";
    cycle: boolean;
    line: ReturnType<typeof edge>;
  }[] = [];
  state.resources.forEach((r, ri) => {
    const rp = resourcePos[ri];
    const hi = r.holder ? ids.indexOf(r.holder) : -1;
    const tp = threadPos[hi];
    if (rp && tp && r.holder) {
      list.push({
        key: `h-${r.id}`,
        kind: "holds",
        cycle: holdsCycle(r.id, r.holder),
        line: edge(rp, tp, nodeR, nodeT),
      });
    }
  });
  state.threads.forEach((th, ti) => {
    if (!th.waitsFor) return;
    const ri = resourceIds.indexOf(th.waitsFor);
    const rp = resourcePos[ri];
    const tp = threadPos[ti];
    const holder = state.resources[ri]?.holder ?? null;
    if (rp && tp) {
      list.push({
        key: `w-${th.id}`,
        kind: "waits",
        cycle: inCycle(th.id, holder),
        line: edge(tp, rp, nodeT, nodeR),
      });
    }
  });
  return list;
}

function graphLabel(state: GraphState): string {
  const parts = state.resources.map((r) =>
    r.holder ? t("rg.graph.holds", { id: r.holder, res: r.id }) : t("rg.graph.free", { res: r.id }),
  );
  const waits = state.threads.flatMap((th) =>
    th.waitsFor ? [t("rg.graph.waits", { id: th.id, res: th.waitsFor })] : [],
  );
  return [t("rg.graph"), ...parts, ...waits].join(". ");
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
    <section class="card" aria-labelledby="rg-setup">
      <h3 id="rg-setup">{t("rg.setup")}</h3>
      <div class="row" role="group" aria-labelledby="rg-setup">
        <button type="button" class="pill" aria-pressed={scenario === "philosophers"} onclick={() => choose("philosophers")}>{t("rg.preset.philosophers")}</button>
        <button type="button" class="pill" aria-pressed={scenario === "twoLocks"} onclick={() => choose("twoLocks")}>{t("rg.preset.twoLocks")}</button>
      </div>
      {#if scenario === "philosophers"}
        <div class="option" role="group" aria-labelledby="rg-count">
          <span id="rg-count" class="field-name">{t("rg.count")}</span>
          <div class="row">
            {#each [2, 3, 4, 5] as n (n)}
              <button type="button" class="pill small num" aria-pressed={count === n} onclick={() => choose("philosophers", n)}>{n}</button>
            {/each}
          </div>
        </div>
      {/if}
      <div class="option" role="group" aria-labelledby="rg-ordering">
        <span id="rg-ordering" class="field-name">{t("rg.ordering")}</span>
        <div class="row">
          <button type="button" class="pill small" aria-pressed={ordering === "script"} onclick={() => (ordering = "script")}>{t("rg.ordering.script")}</button>
          <button type="button" class="pill small" aria-pressed={ordering === "global"} onclick={() => (ordering = "global")}>{t("rg.ordering.global")}</button>
        </div>
        <p class="hint">{t("rg.ordering.hint")}</p>
      </div>
    </section>

    <section class="card" aria-labelledby="rg-delays">
      <h3 id="rg-delays">{t("rg.delays")}</h3>
      <p class="hint">{t("rg.delays.hint")}</p>
      <div class="delays">
        {#each ids as id, i (id)}
          <label class="field">
            <span class="entity"><Token slot={slotForId(id)} size={20} />{id}</span>
            <input
              class="number"
              type="number"
              inputmode="numeric"
              min={limits.delay.min}
              max={limits.delay.max}
              value={delays[i] ?? 0}
              aria-label={t("rg.delayOf", { id })}
              onchange={(e) => setDelay(i, e.currentTarget.value)}
            />
          </label>
        {/each}
      </div>
    </section>
  </div>

  {#if predictionState === "open"}
    <section class="card" aria-labelledby="rg-predict">
      <h3 id="rg-predict">{t("cpu.predict.title")}</h3>
      <div class="option" role="group" aria-labelledby="rg-q1">
        <span id="rg-q1">{t("rg.predict.q1")}</span>
        <div class="row">
          <button type="button" class="pill small" aria-pressed={q1 === true} onclick={() => (q1 = q1 === true ? null : true)}>{t("rg.predict.yes")}</button>
          <button type="button" class="pill small" aria-pressed={q1 === false} onclick={() => (q1 = q1 === false ? null : false)}>{t("rg.predict.no")}</button>
        </div>
      </div>
      <div class="option" role="group" aria-labelledby="rg-q2">
        <span id="rg-q2">{t("rg.predict.q2")}</span>
        <div class="row">
          {#each Array.from({ length: ids.length + 1 }, (_, i) => i) as n (n)}
            <button type="button" class="pill small num" aria-pressed={q2 === n} onclick={() => (q2 = q2 === n ? null : n)}>{n}</button>
          {/each}
        </div>
      </div>
    </section>
  {/if}

  <div class="board">
    <Player {total} {traceKey} {labels} {announce} onfirstplay={lockPrediction} onend={announceRunFinished}>
      {#snippet board(cursor)}
        {@const step = cursor > 0 ? trace.steps[cursor - 1] : undefined}
        {@const state = step?.state ?? initialState()}
        {@const ended = cursor >= total}
        <div class="board-head">
          <h3>{step ? t("rg.board.at", { n: step.t + 1 }) : t("cpu.board.start")}</h3>
          <p class="rule">{t("rg.rule")}</p>
        </div>

        <div class="graph-row">
          <figure class="graph">
            <svg viewBox="0 0 {SIZE} {SIZE}" role="img" aria-label={graphLabel(state)}>
              <defs>
                {#each [["ink", "var(--color-ink)"], ["muted", "var(--color-ink-muted)"], ["bad", "var(--color-bad)"]] as [name, color] (name)}
                  <marker id="{uid}-{name}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M0 0L10 5L0 10z" fill={color} />
                  </marker>
                {/each}
              </defs>
              {#each edgesOf(state) as e (e.key)}
                {@const color = e.cycle ? "var(--color-bad)" : e.kind === "holds" ? "var(--color-ink)" : "var(--color-ink-muted)"}
                <line
                  x1={e.line.x1}
                  y1={e.line.y1}
                  x2={e.line.x2}
                  y2={e.line.y2}
                  stroke={color}
                  stroke-width={e.cycle ? 4 : 2.5}
                  stroke-dasharray={e.kind === "waits" ? "6 5" : undefined}
                  stroke-linecap="round"
                  marker-end="url(#{uid}-{e.cycle ? 'bad' : e.kind === 'holds' ? 'ink' : 'muted'})"
                />
              {/each}
              {#each resourceIds as res, i (res)}
                {@const p = resourcePos[i]}
                {#if p}
                  <rect x={p.x - nodeR} y={p.y - nodeR} width={nodeR * 2} height={nodeR * 2} rx="6" fill="var(--color-slot)" stroke="var(--color-ink)" stroke-width="2.5" />
                  <text x={p.x} y={p.y} class="node-label" text-anchor="middle" dominant-baseline="central">{res}</text>
                {/if}
              {/each}
              {#each ids as id, i (id)}
                {@const p = threadPos[i]}
                {@const th = state.threads[i]}
                {#if p}
                  <g opacity={th?.status === "done" ? 0.45 : 1}>
                    <path d={shapePaths[slotForId(id)]} transform="translate({p.x - nodeT} {p.y - nodeT}) scale({(nodeT * 2) / 24})" fill="var(--entity-{slotForId(id)})" stroke="var(--color-ink)" stroke-width="1.2" stroke-linejoin="round" />
                    <text x={p.x + (p.x - C) * 0.22} y={p.y + (p.y - C) * 0.22 + (p.y >= C ? 8 : -8)} class="node-label" text-anchor="middle" dominant-baseline="central">{id}</text>
                  </g>
                {/if}
              {/each}
            </svg>
          </figure>
          <ul class="legend" aria-hidden="true">
            <li><svg width="40" height="12"><line x1="2" y1="6" x2="38" y2="6" stroke="var(--color-ink)" stroke-width="2.5" /></svg>{t("rg.legend.holds")}</li>
            <li><svg width="40" height="12"><line x1="2" y1="6" x2="38" y2="6" stroke="var(--color-ink-muted)" stroke-width="2.5" stroke-dasharray="6 5" /></svg>{t("rg.legend.waits")}</li>
            <li><svg width="40" height="12"><line x1="2" y1="6" x2="38" y2="6" stroke="var(--color-bad)" stroke-width="4" /></svg>{t("rg.legend.cycle")}</li>
          </ul>
        </div>

        <div class="table-wrap">
          <table class="threads">
            <thead>
              <tr>
                <th scope="col">{t("rg.table.thread")}</th>
                <th scope="col">{t("rg.table.status")}</th>
                <th scope="col">{t("rg.table.holds")}</th>
                <th scope="col">{t("rg.table.waits")}</th>
                <th scope="col">{t("rg.table.program")}</th>
              </tr>
            </thead>
            <tbody>
              {#each state.threads as th (th.id)}
                <tr class:ran={state.ran === th.id}>
                  <th scope="row"><span class="entity"><Token slot={slotForId(th.id)} size={20} label={tokenLabel(th.id)} /><span aria-hidden="true">{th.id}</span></span></th>
                  <td>{statusText(th, state)}</td>
                  <td>{th.holds.length ? th.holds.join(", ") : t("rg.none")}</td>
                  <td>{th.waitsFor ?? "–"}</td>
                  <td>
                    <ol class="program">
                      {#each trace.result.programs[th.id] ?? [] as op, i (i)}
                        <li class:past={i < th.pc} class:next={i === th.pc && th.status !== "done"}><code>{opLabel(op)}</code>{#if i === th.pc && th.status !== "done"}<span class="visually-hidden">, {t("rg.op.next")}</span>{/if}</li>
                      {/each}
                    </ol>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <Timeline segments={trace.result.segments} total={Math.max(total, 1)} cursor={cursor} label={timelineLabel(cursor)} />

        <div class="after">
          <section class="why" aria-labelledby="rg-why">
            <h4 id="rg-why">{t("cpu.why")}</h4>
            <p>{step ? explanationText(step.explain) : t("rg.why.start")}</p>
            {#if ended && trace.result.deadlock}
              <p class="outcome">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-bad)" stroke-width="3" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                {t("rg.outcome.deadlock", { n: (trace.result.cycleStep ?? 0) + 1 })}
              </p>
            {:else if ended}
              <p class="outcome">{t("rg.outcome.done", { n: total })}</p>
            {/if}
          </section>

          {#if predictionState !== "open"}
            <section class="card verdict" aria-labelledby="rg-verdict">
              <h4 id="rg-verdict">{t("cpu.predict.title")}</h4>
              {#if predictionState === "skipped"}
                <p>{t("cpu.predict.none")}</p>
              {:else if !ended}
                <p>{t("cpu.predict.locked")}</p>
              {:else}
                {@const yesNo = (v: boolean | null) => (v === null ? "–" : v ? t("rg.predict.yes") : t("rg.predict.no"))}
                {@const answers = [
                  { q: t("rg.predict.q1"), yours: yesNo(q1), actual: yesNo(trace.result.deadlock), ok: q1 === trace.result.deadlock },
                  { q: t("rg.predict.q2"), yours: String(q2 ?? "–"), actual: String(trace.result.worked.length), ok: q2 === trace.result.worked.length },
                ]}
                {@const hits = answers.filter((a) => a.ok).length}
                <p class="score">
                  {#if hits === answers.length}
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" stroke-width="3" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>
                    {t("rg.predict.perfect")}
                  {:else}
                    {t("rg.predict.score", { hits, total: answers.length })}
                  {/if}
                </p>
                <ul class="answers">
                  {#each answers as a (a.q)}
                    <li>
                      <span class="q">{a.q}</span>
                      <span class="a">
                        {#if a.ok}
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" stroke-width="3.2" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>
                          {a.actual}<span class="visually-hidden">, {t("cpu.predict.match")}</span>
                        {:else}
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-bad)" stroke-width="3.2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                          {t("rg.predict.yours", { answer: a.yours })} {t("rg.predict.actual", { answer: a.actual })}
                        {/if}
                      </span>
                    </li>
                  {/each}
                </ul>
                {#if hits < answers.length}<p class="hint">{t("rg.predict.hint")}</p>{/if}
              {/if}
              <div class="row"><button type="button" class="pill small" onclick={predictAgain}>{t("cpu.predict.again")}</button></div>
            </section>
          {/if}
        </div>
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

  .num {
    min-width: var(--target-min);
    padding: 0 var(--space-3);
  }

  .delays {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-4);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .graph-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-5);
  }

  .graph {
    flex: 1 1 280px;
    max-width: 420px;
    margin: 0 auto;
    padding: var(--space-2);
    border-radius: var(--radius-card);
    background: var(--color-ground);
  }

  .graph svg {
    display: block;
    width: 100%;
    height: auto;
  }

  .node-label {
    fill: var(--color-ink);
    font-size: 13px;
    font-weight: 800;
  }

  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    font-size: var(--text-small);
  }

  .legend li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .threads td,
  .threads th {
    text-align: left;
    vertical-align: top;
  }

  .threads tbody tr {
    border-top: 1px solid var(--color-slot);
  }

  .threads tr.ran {
    background: var(--color-ground);
  }

  /* Keep the program readable on phones: the table scrolls inside .table-wrap instead. */
  .program {
    min-width: 15rem;
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 2px var(--space-1);
    font-size: var(--text-data);
  }

  .program li {
    padding: 0 var(--space-1);
    border: 2px solid transparent;
    border-radius: var(--radius-bar);
  }

  .program code {
    font-family: var(--font-mono);
  }

  .program li.past {
    color: var(--color-ink-muted);
  }

  .program li.next {
    border-style: dashed;
    border-color: var(--color-ink);
    font-weight: 700;
  }

  .outcome {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 700;
  }

  .answers {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .answers li {
    display: flex;
    flex-direction: column;
  }

  .q {
    font-size: var(--text-small);
    color: var(--color-ink-muted);
  }

  .a {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    font-weight: 700;
  }
</style>
