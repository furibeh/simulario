<script lang="ts">
import { type PresetId, presetIds, presets } from "../../engines/bounded-buffer/presets";
import { simulate } from "../../engines/bounded-buffer/simulate";
import {
  type BufferExplanation,
  type BufferInput,
  limits,
  type Operation,
  type Sem,
  semaphores,
  type ThreadView,
} from "../../engines/bounded-buffer/types";
import type { Locale } from "../../i18n/config";
import { boundedBufferEn } from "../../i18n/engines/bounded-buffer.en";
import { boundedBufferEs } from "../../i18n/engines/bounded-buffer.es";
import { renderExplanation } from "../../i18n/engines/types";
import { useTranslations } from "../../i18n/t";
import type { UiKey } from "../../i18n/ui/es";
import { announceRunFinished } from "../../lib/events";
import Player from "../../player/Player.svelte";
import Timeline from "../board/Timeline.svelte";
import "../board/board.css";
import { type Slot, slotForIndex } from "../token/shapes";
import Token from "../token/Token.svelte";

interface Props {
  lang: Locale;
  preset?: PresetId;
}

let { lang, preset = "fastProducer" }: Props = $props();

const t = $derived(useTranslations(lang));
const templates = $derived(lang === "es" ? boundedBufferEs : boundedBufferEn);
const range = (r: { min: number; max: number }) =>
  Array.from({ length: r.max - r.min + 1 }, (_, i) => r.min + i);
const BODY = 5;
const sizeFields = [
  ["producers", "bb.producers"],
  ["consumers", "bb.consumers"],
  ["items", "bb.items"],
  ["capacity", "bb.capacity"],
] as const;

// svelte-ignore state_referenced_locally
let input = $state<BufferInput>({ ...presets[preset] });
let quantumValue = $state(2);
let q1 = $state("");
let q2 = $state<number | null>(null);
let predictionState = $state<"open" | "locked" | "skipped">("open");
let runId = $state(0);

const trace = $derived(simulate(input));
const total = $derived(trace.steps.length);
const ids = $derived(Object.keys(trace.result.programs));
const traceKey = $derived(`${JSON.stringify(input)}|${runId}`);

$effect(() => {
  void trace;
  q1 = "";
  q2 = null;
  predictionState = "open";
});

/** Producers take the first entity slots, consumers the next ones. */
const slotOf = (id: string): Slot => slotForIndex(Math.max(ids.indexOf(id), 0));
const shapeName = (id: string) => t(`shape.${slotOf(id)}` as UiKey);
const tokenLabel = (id: string) => `${id}, ${shapeName(id)}`;
const producerOf = (item: string) => item.split(".")[0] ?? item;

function set<K extends keyof BufferInput>(key: K, value: BufferInput[K]) {
  input = { ...input, [key]: value };
}

function setQuantum(on: boolean) {
  set("quantum", on ? quantumValue : null);
}

// Prediction: computed from the current trace.
const blockOptions = $derived([
  ...ids.flatMap((id) =>
    (id.startsWith("P") ? (["empty", "mutex"] as Sem[]) : (["full", "mutex"] as Sem[])).map(
      (sem) => ({ value: `${id}:${sem}`, label: t("bb.predict.block", { id, sem }) }),
    ),
  ),
  { value: "none", label: t("bb.predict.nobody") },
]);
const firstBlock = $derived(trace.result.blocks[0]);
const q1Answer = $derived(firstBlock ? `${firstBlock.id}:${firstBlock.sem}` : "none");
const firstSignalEmpty = $derived(
  trace.steps.find((s) =>
    s.explain.some(
      (e) => (e.key === "signal.inc" || e.key === "signal.wake") && e.params.sem === "empty",
    ),
  ),
);
const q2Answer = $derived(firstSignalEmpty?.state.sems.empty.value ?? null);
const labelOf = (value: string) => blockOptions.find((o) => o.value === value)?.label ?? "–";

function lockPrediction() {
  if (predictionState !== "open") return;
  const answered = q1 !== "" && (q2Answer === null || q2 !== null);
  predictionState = answered ? "locked" : "skipped";
}

function predictAgain() {
  q1 = "";
  q2 = null;
  predictionState = "open";
  runId += 1;
}

function explanationText(explain: readonly BufferExplanation[]): string {
  return explain.map((e) => renderExplanation(templates, e)).join(" ");
}

function announce(cursor: number): string {
  const step = cursor > 0 ? trace.steps[cursor - 1] : undefined;
  return step ? t("bb.live", { n: step.t + 1, text: explanationText(step.explain) }) : "";
}

function timelineLabel(cursor: number): string {
  const parts = trace.result.segments
    .filter((s) => s.start < cursor)
    .map((s) => t("cpu.timeline.run", { id: s.id, start: s.start, end: Math.min(s.end, cursor) }));
  return [t("bb.timeline", { total }), ...parts].join(". ");
}

function opLabel(op: Operation): string {
  if (op.op === "put") return t("bb.op.put");
  if (op.op === "take") return t("bb.op.take");
  return `${op.op}(${op.sem})`;
}

function statusText(th: ThreadView): string {
  if (th.status === "blocked") return t("bb.status.blocked", { sem: th.blockedOn ?? "" });
  return t(`bb.status.${th.status}`);
}

/** Line of the loop body a thread just ran in this step, if it ran. */
function ranLine(th: ThreadView, ran: string): number | null {
  if (th.id !== ran) return null;
  const index = th.status === "blocked" ? th.pc : th.pc - 1;
  return ((index % BODY) + BODY) % BODY;
}

function initialThreads(): ThreadView[] {
  return ids.map((id) => ({
    id,
    role: id.startsWith("P") ? "producer" : "consumer",
    pc: 0,
    status: "ready",
    blockedOn: null,
    items: 0,
  }));
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
    <section class="card" aria-labelledby="bb-setup">
      <h3 id="bb-setup">{t("bb.setup")}</h3>
      {#each sizeFields as [key, label] (key)}
        <div class="option" role="group" aria-labelledby="bb-{key}">
          <span id="bb-{key}" class="field-name">{t(label)}</span>
          <div class="row">
            {#each range(limits[key]) as n (n)}
              <button type="button" class="pill small num" aria-pressed={input[key] === n} onclick={() => set(key, n)}>{n}</button>
            {/each}
          </div>
        </div>
      {/each}
      <div class="option" role="group" aria-labelledby="bb-version">
        <span id="bb-version" class="field-name">{t("bb.version")}</span>
        <div class="row">
          <button type="button" class="pill small" aria-pressed={input.version === "correct"} onclick={() => set("version", "correct")}>{t("bb.version.correct")}</button>
          <button type="button" class="pill small" aria-pressed={input.version === "swapped"} onclick={() => set("version", "swapped")}>{t("bb.version.swapped")}</button>
        </div>
        <p class="hint">{t("bb.version.hint")}</p>
      </div>
      <div class="presets" role="group" aria-label={t("cpu.presets")}>
        <span class="hint">{t("cpu.presets")}</span>
        {#each presetIds as id (id)}
          <button type="button" class="pill small" onclick={() => (input = { ...presets[id] })}>{t(`bb.preset.${id}`)}</button>
        {/each}
      </div>
    </section>

    <section class="card" aria-labelledby="bb-schedule">
      <h3 id="bb-schedule">{t("bb.schedule")}</h3>
      <div class="row" role="group" aria-labelledby="bb-schedule">
        <button type="button" class="pill" aria-pressed={input.quantum === null} onclick={() => setQuantum(false)}>{t("bb.quantum.off")}</button>
        <button type="button" class="pill" aria-pressed={input.quantum !== null} onclick={() => setQuantum(true)}>{t("bb.quantum.on")}</button>
      </div>
      {#if input.quantum !== null}
        <label class="quantum">
          <span>{t("bb.quantum")}: <strong>{input.quantum}</strong></span>
          <input
            type="range"
            min={limits.quantum.min}
            max={limits.quantum.max}
            value={input.quantum}
            oninput={(e) => {
              quantumValue = Number(e.currentTarget.value);
              set("quantum", quantumValue);
            }}
          />
        </label>
      {/if}
      <p class="hint">{t("bb.quantum.hint")}</p>
    </section>
  </div>

  {#if predictionState === "open"}
    <section class="card" aria-labelledby="bb-predict">
      <h3 id="bb-predict">{t("cpu.predict.title")}</h3>
      <label class="option">
        <span>{t("bb.predict.q1")}</span>
        <select bind:value={q1}>
          <option value="">{t("ps.predict.choose")}</option>
          {#each blockOptions as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
        </select>
      </label>
      {#if q2Answer !== null}
        <div class="option" role="group" aria-labelledby="bb-q2">
          <span id="bb-q2">{t("bb.predict.q2")}</span>
          <div class="row">
            {#each Array.from({ length: input.capacity + 1 }, (_, i) => i) as n (n)}
              <button type="button" class="pill small num" aria-pressed={q2 === n} onclick={() => (q2 = q2 === n ? null : n)}>{n}</button>
            {/each}
          </div>
        </div>
      {/if}
    </section>
  {/if}

  <div class="board">
    <Player {total} {traceKey} {labels} {announce} onfirstplay={lockPrediction} onend={announceRunFinished}>
      {#snippet board(cursor)}
        {@const step = cursor > 0 ? trace.steps[cursor - 1] : undefined}
        {@const state = step?.state}
        {@const threads = state?.threads ?? initialThreads()}
        {@const buffer = state?.buffer ?? Array.from({ length: input.capacity }, () => null)}
        {@const ended = cursor >= total}
        {@const taken = trace.result.consumed.filter((c) => c.step < cursor)}
        {@const seen = trace.result.blocks.filter((b) => b.step < cursor)}
        <div class="board-head">
          <h3>{step ? t("bb.board.at", { n: step.t + 1 }) : t("cpu.board.start")}</h3>
          <p class="rule">{t("bb.rule")}{input.quantum !== null ? ` ${t("bb.rule.quantum", { q: input.quantum })}` : ""}</p>
        </div>

        <div class="zone buffer-zone">
          <h4>{t("bb.buffer")}</h4>
          <ol class="slots">
            {#each buffer as item, i (i)}
              <li class="slot" class:filled={item !== null}>
                <span class="visually-hidden">{t("bb.slot", { n: i })}: </span>
                {#if item}
                  <Token slot={slotOf(producerOf(item))} size={34} label={tokenLabel(producerOf(item))} />
                  <span class="item">{item}</span>
                {:else}
                  <span class="empty">{t("bb.slot.empty")}</span>
                {/if}
                <span class="slot-index" aria-hidden="true">{i}</span>
                <span class="pointers">
                  {#if (state?.in ?? 0) === i}<span class="pointer">{t("bb.slot.in")}</span>{/if}
                  {#if (state?.out ?? 0) === i}<span class="pointer">{t("bb.slot.out")}</span>{/if}
                </span>
              </li>
            {/each}
          </ol>
        </div>

        <section aria-labelledby="bb-sems">
          <h4 id="bb-sems" class="visually-hidden">{t("bb.sems")}</h4>
          <ul class="sems">
            {#each semaphores as sem (sem)}
              {@const view = state?.sems[sem] ?? { value: sem === "empty" ? input.capacity : sem === "full" ? 0 : 1, queue: [] }}
              <li class="sem">
                <div class="sem-head">
                  <code class="sem-name">{sem}</code>
                  <span class="sem-value" class:zero={view.value === 0}>{view.value}</span>
                </div>
                <span class="hint">{t(`bb.sem.${sem}.role`)}</span>
                <div class="sem-queue">
                  <span class="field-name">{t("bb.sem.queue")}</span>
                  {#each view.queue as id (id)}
                    <span class="entity"><Token slot={slotOf(id)} size={22} label={tokenLabel(id)} /><span aria-hidden="true">{id}</span></span>
                  {:else}
                    <span class="empty">{t("cpu.zone.empty")}</span>
                  {/each}
                </div>
              </li>
            {/each}
          </ul>
        </section>

        <div class="zones">
          <div class="zone waiting">
            <h4>{t("cpu.zone.waiting")}</h4>
            <ul class="zone-tokens">
              {#each state?.ready ?? ids as id (id)}
                <li><Token slot={slotOf(id)} size={40} label={tokenLabel(id)} /><span aria-hidden="true">{id}</span></li>
              {:else}
                <li class="empty">{t("cpu.zone.empty")}</li>
              {/each}
            </ul>
          </div>
          <div class="zone cpu">
            <h4>{t("cpu.zone.cpu")}</h4>
            {#if state?.running}
              <div class="cpu-token"><Token slot={slotOf(state.running)} size={64} label={tokenLabel(state.running)} /><span aria-hidden="true">{state.running}</span></div>
            {:else}
              <p class="empty">{t("cpu.zone.idle")}</p>
            {/if}
          </div>
        </div>

        <ul class="threads" aria-label={t("bb.threads")}>
          {#each threads as th (th.id)}
            {@const program = trace.result.programs[th.id] ?? []}
            {@const rounds = program.length / BODY}
            {@const round = Math.min(Math.floor(th.pc / BODY), rounds - 1)}
            {@const body = program.slice(round * BODY, round * BODY + BODY)}
            {@const ran = state ? ranLine(th, state.ran) : null}
            <li class="thread zone" class:blocked={th.status === "blocked"} class:done={th.status === "done"}>
              <div class="thread-head">
                <span class="entity"><Token slot={slotOf(th.id)} size={28} label={tokenLabel(th.id)} /><span aria-hidden="true">{th.id}</span></span>
                <span class="caption">{t(`bb.role.${th.role}`)}</span>
              </div>
              <p class="status">{statusText(th)}</p>
              <p class="caption">{t("bb.round", { k: Math.min(th.items + (th.status === "done" ? 0 : 1), rounds), n: rounds })}</p>
              <ol class="listing" aria-label={t("bb.listing", { id: th.id })}>
                {#each body as op, i (i)}
                  {@const isRan = ran === i}
                  {@const isNext = th.status !== "done" && th.pc % BODY === i && !isRan}
                  <li class:ran={isRan} class:next={isNext} style:--fill="var(--entity-{slotOf(th.id)})" style:--on="var(--entity-{slotOf(th.id)}-on)">
                    <code>{opLabel(op)}</code>
                    {#if isRan}<span class="visually-hidden">, {t("bb.line.ran")}</span>{:else if isNext}<span class="visually-hidden">, {t("bb.line.next")}</span>{/if}
                  </li>
                {/each}
              </ol>
            </li>
          {/each}
        </ul>

        <Timeline segments={trace.result.segments} total={Math.max(total, 1)} cursor={cursor} label={timelineLabel(cursor)} {slotOf} />

        <div class="after">
          <section class="why" aria-labelledby="bb-why">
            <h4 id="bb-why">{t("cpu.why")}</h4>
            <p>{step ? explanationText(step.explain) : t("bb.why.start")}</p>
            {#if ended && trace.result.deadlock}
              <p class="outcome bad">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-bad)" stroke-width="3" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                {t("bb.deadlock", { n: total })}
              </p>
            {:else if ended}
              <p class="outcome">{t("bb.done", { n: total })}</p>
            {/if}
          </section>

          {#if predictionState !== "open"}
            <section class="card verdict" aria-labelledby="bb-verdict">
              <h4 id="bb-verdict">{t("cpu.predict.title")}</h4>
              {#if predictionState === "skipped"}
                <p>{t("cpu.predict.none")}</p>
              {:else if !ended}
                <p>{t("cpu.predict.locked")}</p>
              {:else}
                {@const answers = [
                  { q: t("bb.predict.q1"), yours: labelOf(q1), actual: labelOf(q1Answer), ok: q1 === q1Answer },
                  ...(q2Answer === null ? [] : [{ q: t("bb.predict.q2"), yours: String(q2 ?? "–"), actual: String(q2Answer), ok: q2 === q2Answer }]),
                ]}
                {@const hits = answers.filter((a) => a.ok).length}
                <p class="score">
                  {#if hits === answers.length}
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" stroke-width="3" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>
                    {t("bb.predict.perfect")}
                  {:else}
                    {t("bb.predict.score", { hits, total: answers.length })}
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
                          {t("bb.predict.yours", { answer: a.yours })} {t("bb.predict.actual", { answer: a.actual })}
                        {/if}
                      </span>
                    </li>
                  {/each}
                </ul>
                {#if hits < answers.length}<p class="hint">{t("bb.predict.hint")}</p>{/if}
              {/if}
              <div class="row"><button type="button" class="pill small" onclick={predictAgain}>{t("cpu.predict.again")}</button></div>
            </section>
          {/if}
        </div>

        <div class="logs">
          <section class="metrics" aria-labelledby="bb-consumed">
            <h4 id="bb-consumed">{t("bb.consumed")}</h4>
            {#if taken.length === 0}
              <p class="empty">{t("bb.consumed.none")}</p>
            {:else}
              <ol class="consumed">
                {#each taken as c (c.item)}
                  <li><span class="entity"><Token slot={slotOf(producerOf(c.item))} size={20} label={tokenLabel(producerOf(c.item))} />{c.item}</span> <span class="caption">→ {c.by}</span></li>
                {/each}
              </ol>
            {/if}
          </section>
          <section class="metrics" aria-labelledby="bb-blocks">
            <h4 id="bb-blocks">{t("bb.blocks")}</h4>
            {#if seen.length === 0}
              <p class="empty">{t("bb.blocks.none")}</p>
            {:else}
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t("bb.blocks.thread")}</th>
                      <th scope="col">{t("bb.blocks.step")}</th>
                      <th scope="col">{t("bb.blocks.sem")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each seen as b (b.step)}
                      <tr>
                        <th scope="row"><span class="entity"><Token slot={slotOf(b.id)} size={20} label={shapeName(b.id)} />{b.id}</span></th>
                        <td>{b.step + 1}</td>
                        <td><code>{b.sem}</code></td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </section>
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
    align-self: flex-start;
    max-width: 100%;
    min-height: var(--target-min);
    padding: 0 var(--space-3);
    border: var(--outline);
    border-radius: var(--radius-field);
    background: var(--color-surface);
    color: var(--color-ink);
  }

  /* The buffer is the shared resource: recessed slots in a row. */
  .buffer-zone {
    background: var(--color-slot);
  }

  .slots {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .slot {
    position: relative;
    width: 6.5rem;
    min-height: 7rem;
    padding: var(--space-3) var(--space-2) var(--space-5);
    border: var(--outline-waiting);
    border-radius: var(--radius-card);
    background: var(--color-surface);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
  }

  .slot.filled {
    border: var(--outline);
  }

  .item {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .slot-index {
    position: absolute;
    top: var(--space-1);
    left: var(--space-2);
    font-size: var(--text-data);
    color: var(--color-ink-muted);
  }

  .pointers {
    position: absolute;
    bottom: var(--space-1);
    display: flex;
    gap: var(--space-1);
  }

  .pointer {
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--color-ink);
    color: var(--color-on-ink);
    font-family: var(--font-mono);
    font-size: var(--text-data);
  }

  .sems {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  .sem {
    flex: 1 1 180px;
    padding: var(--space-3) var(--space-4);
    border: var(--outline);
    border-radius: var(--radius-card);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .sem-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .sem-name {
    font-family: var(--font-mono);
    font-size: 1.125rem;
    font-weight: 700;
  }

  .sem-value {
    min-width: 3rem;
    padding: 0 var(--space-3);
    border-radius: var(--radius-field);
    background: var(--color-slot);
    font-size: 1.75rem;
    font-weight: 800;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  /* At 0 the next wait blocks: the counter inverts. */
  .sem-value.zero {
    background: var(--color-ink);
    color: var(--color-on-ink);
  }

  .sem-queue {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    min-height: 28px;
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
    border: var(--outline);
  }

  .thread.blocked {
    border: var(--outline-waiting);
    background: var(--color-ground);
  }

  .thread.done {
    background: var(--color-ground);
    color: var(--color-ink-muted);
  }

  .thread-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .status {
    margin: 0;
    font-weight: 700;
  }

  .caption {
    margin: 0;
    font-size: var(--text-data);
    color: var(--color-ink-muted);
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

  .listing li.next {
    border-style: dashed;
    border-color: var(--color-ink-muted);
  }

  .listing li.ran {
    background: var(--fill);
    color: var(--on);
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

  .logs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
  }

  .logs > section {
    flex: 1 1 260px;
  }

  .consumed {
    margin: 0;
    padding-left: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
</style>
