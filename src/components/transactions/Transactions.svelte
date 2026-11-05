<script lang="ts">
import { fixBalance, type PresetId, presetIds, presets } from "../../engines/transactions/presets";
import { simulate } from "../../engines/transactions/simulate";
import {
  type Isolation,
  type ItemView,
  itemIds,
  type Operation,
  type TxExplanation,
  type TxTrace,
  type TxView,
} from "../../engines/transactions/types";
import type { Locale } from "../../i18n/config";
import { transactionsEn } from "../../i18n/engines/transactions.en";
import { transactionsEs } from "../../i18n/engines/transactions.es";
import { renderExplanation } from "../../i18n/engines/types";
import { useTranslations } from "../../i18n/t";
import type { UiKey } from "../../i18n/ui/es";
import { announceRunFinished } from "../../lib/events";
import Player from "../../player/Player.svelte";
import Timeline from "../board/Timeline.svelte";
import "../board/board.css";
import { slotForId } from "../token/shapes";
import Token from "../token/Token.svelte";

type Mode = "app" | "atomic" | "forUpdate";
type Confidence = "low" | "mid" | "high";

interface Props {
  lang: Locale;
  preset?: PresetId;
  /** Isolation levels the lesson offers, in button order. */
  levels?: readonly Isolation[];
}

let { lang, preset = "balance", levels = ["read-uncommitted", "read-committed"] }: Props = $props();

const t = $derived(useTranslations(lang));
const templates = $derived(lang === "es" ? transactionsEs : transactionsEn);
const shapeName = (id: string) => t(`shape.${slotForId(id)}` as UiKey);
const tokenLabel = (id: string) => `${id}, ${shapeName(id)}`;

/** Prediction per scenario: the options offered and how to read the answer from a trace. */
const questions: Record<
  PresetId,
  { options: number[]; answer: (trace: TxTrace) => number | null }
> = {
  balance: { options: [100, 120, 150, 170], answer: (tr) => tr.result.final[0] ?? null },
  dirtyRead: {
    options: [100, 150],
    answer: (tr) => tr.result.reads.find((r) => r.tx === "T2")?.value ?? null,
  },
  transfer: {
    options: [100, 140],
    answer: (tr) => {
      const reads = tr.result.reads.filter((r) => r.tx === "T1");
      return reads.length === 2 ? reads.reduce((sum, r) => sum + r.value, 0) : null;
    },
  },
  crossTransfers: { options: [0, 1, 2], answer: (tr) => tr.result.committed.length },
};

function defaultOrder(id: PresetId, m: Mode): string[] {
  return id === "balance" && m === "atomic" ? ["T1", "T2", "T1", "T2"] : [...presets[id].order];
}

// svelte-ignore state_referenced_locally
let presetId = $state<PresetId>(preset);
// svelte-ignore state_referenced_locally
let isolation = $state<Isolation>(presets[preset].isolation);
let mode = $state<Mode>("app");
// svelte-ignore state_referenced_locally
let order = $state<string[]>(defaultOrder(preset, "app"));
let guess = $state<number | null>(null);
let confidence = $state<Confidence | null>(null);
let predictionState = $state<"open" | "locked" | "skipped">("open");
let runId = $state(0);

const scripts = $derived<readonly (readonly Operation[])[]>(
  presetId === "balance" && mode !== "app" ? fixBalance(mode) : presets[presetId].transactions,
);
const items = $derived(presets[presetId].items);
const ids = $derived(scripts.map((_, i) => `T${i + 1}`));
const trace = $derived(simulate({ items, transactions: scripts, isolation, order }));
const total = $derived(trace.steps.length);
const question = $derived(questions[presetId]);
const answer = $derived(question.answer(trace));
const opsLeft = $derived(
  scripts.reduce((sum, s) => sum + s.length, 0) -
    (trace.steps.at(-1)?.state.transactions.reduce((sum, x) => sum + x.pc, 0) ?? 0),
);
/** Transactions that can take the next turn: neither ended nor waiting for a lock. */
const ready = $derived(
  trace.steps
    .at(-1)
    ?.state.transactions.filter((x) => x.status === "active")
    .map((x) => x.id) ?? ids,
);
const traceKey = $derived(`${presetId}|${isolation}|${mode}|${order.join(",")}|${runId}`);

$effect(() => {
  void trace;
  guess = null;
  confidence = null;
  predictionState = "open";
});

function loadPreset(id: PresetId) {
  presetId = id;
  isolation = presets[id].isolation;
  mode = "app";
  order = defaultOrder(id, "app");
}

function setMode(m: Mode) {
  mode = m;
  order = defaultOrder(presetId, m);
}

function give(id: string) {
  if (ready.includes(id)) order = [...order, id];
}

function lockPrediction() {
  if (predictionState !== "open") return;
  predictionState = guess === null ? "skipped" : "locked";
}

function predictAgain() {
  guess = null;
  confidence = null;
  predictionState = "open";
  runId += 1;
}

function explanationText(explain: readonly TxExplanation[]): string {
  return explain.map((e) => renderExplanation(templates, e)).join(" ");
}

function announce(cursor: number): string {
  const step = cursor > 0 ? trace.steps[cursor - 1] : undefined;
  return step ? t("tx.live", { n: step.t + 1, text: explanationText(step.explain) }) : "";
}

function itemsAt(cursor: number): readonly ItemView[] {
  const step = cursor > 0 ? trace.steps[cursor - 1] : undefined;
  return (
    step?.state.items ??
    items.map((value, i) => ({
      id: itemIds[i] ?? "x",
      committed: value,
      version: "init",
      committedBy: null,
      pending: null,
      holder: null,
      readers: [],
      queue: [],
    }))
  );
}

function txsAt(cursor: number): readonly TxView[] {
  const step = cursor > 0 ? trace.steps[cursor - 1] : undefined;
  return (
    step?.state.transactions ??
    ids.map((id) => ({
      id,
      status: "active" as const,
      pc: 0,
      waitsFor: null,
      lastReads: [],
    }))
  );
}

/** Items and transactions the step's explanations name, to highlight what changed. */
function touched(explain: readonly TxExplanation[]): { items: Set<string>; txs: Set<string> } {
  const seenItems = new Set<string>();
  const seenTxs = new Set<string>();
  for (const e of explain) {
    if ("item" in e.params) seenItems.add(e.params.item);
    if (e.key === "handoff") seenTxs.add(e.params.to);
    else if (e.key !== "lock.wait" && e.key !== "deadlock") seenTxs.add(e.params.tx);
  }
  return { items: seenItems, txs: seenTxs };
}

function timelineLabel(cursor: number): string {
  const parts = trace.result.segments
    .filter((s) => s.start < cursor)
    .map((s) => t("cpu.timeline.run", { id: s.id, start: s.start, end: Math.min(s.end, cursor) }));
  return [t("tx.timeline", { total: Math.max(total, 1) }), ...parts].join(". ");
}

const sign = (d: number) => (d < 0 ? "−" : "+");

function opText(op: Operation): string {
  switch (op.op) {
    case "read":
    case "readForUpdate":
      return t(`tx.op.${op.op}`, { item: op.item });
    case "write":
      return t("tx.op.write", { item: op.item, v: op.value });
    case "writeFromRead":
    case "add":
      return t(`tx.op.${op.op}`, { item: op.item, sign: sign(op.delta), d: Math.abs(op.delta) });
    default:
      return t(`tx.op.${op.op}`);
  }
}

function statusText(x: TxView): string {
  return x.status === "blocked"
    ? t("tx.status.blocked", { item: x.waitsFor ?? "" })
    : t(`tx.status.${x.status}`);
}

const finalText = (values: readonly number[]) =>
  values.map((v, i) => `${itemIds[i]} = ${v}`).join(", ");

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
    <section class="card" aria-labelledby="tx-setup">
      <h3 id="tx-setup">{t("tx.setup")}</h3>
      <div class="presets" role="group" aria-label={t("cpu.presets")}>
        <span class="hint">{t("cpu.presets")}</span>
        {#each presetIds as id (id)}
          <button type="button" class="pill small" aria-pressed={presetId === id} onclick={() => loadPreset(id)}>{t(`tx.preset.${id}`)}</button>
        {/each}
      </div>
      <p class="hint">{t(`tx.preset.about.${presetId}`)}</p>
      <div class="option" role="group" aria-labelledby="tx-isolation">
        <span id="tx-isolation" class="field-name">{t("tx.isolation")}</span>
        <div class="row">
          {#each levels as level (level)}
            <button type="button" class="pill small" aria-pressed={isolation === level} onclick={() => (isolation = level)}>{t(`tx.isolation.${level}`)}</button>
          {/each}
        </div>
        <p class="hint">{t(`tx.isolation.about.${isolation}`)}</p>
      </div>
      {#if presetId === "balance"}
        <div class="option" role="group" aria-labelledby="tx-mode">
          <span id="tx-mode" class="field-name">{t("tx.mode")}</span>
          <div class="row">
            {#each ["app", "atomic", "forUpdate"] as const as m (m)}
              <button type="button" class="pill small" aria-pressed={mode === m} onclick={() => setMode(m)}>{t(`tx.mode.${m}`)}</button>
            {/each}
          </div>
        </div>
      {/if}
    </section>

    <section class="card" aria-labelledby="tx-order">
      <h3 id="tx-order">{t("tx.order")}</h3>
      <p class="hint">{t("tx.order.hint")}</p>
      <div class="row">
        {#each ids as id (id)}
          <button type="button" class="pill tx-button" aria-label={t("tx.order.give", { id })} disabled={!ready.includes(id)} onclick={() => give(id)}>
            <Token slot={slotForId(id)} size={22} />{id}
          </button>
        {/each}
      </div>
      {#if order.length === 0}
        <p class="empty">{t("tx.order.empty")}</p>
      {:else}
        <ol class="order">
          {#each order as id, i (i)}
            <li><Token slot={slotForId(id)} size={20} label={tokenLabel(id)} /></li>
          {/each}
        </ol>
      {/if}
      <p class="hint">
        {t("tx.order.count", { n: order.length })}
        {trace.result.complete ? t("tx.order.done") : t("tx.order.left", { n: opsLeft })}
      </p>
      <div class="row">
        <button type="button" class="pill small" disabled={order.length === 0} onclick={() => (order = order.slice(0, -1))}>{t("tx.order.undo")}</button>
        <button type="button" class="pill small" onclick={() => (order = defaultOrder(presetId, mode))}>{t("tx.order.reset")}</button>
        <button type="button" class="pill small" disabled={order.length === 0} onclick={() => (order = [])}>{t("tx.order.clear")}</button>
      </div>
    </section>
  </div>

  {#if predictionState === "open"}
    <section class="card" aria-labelledby="tx-predict">
      <h3 id="tx-predict">{t("cpu.predict.title")}</h3>
      <p>{t(`tx.predict.${presetId}`)}</p>
      <div class="row" role="group" aria-labelledby="tx-predict">
        {#each question.options as n (n)}
          <button type="button" class="pill guess" aria-pressed={guess === n} aria-label={t("tx.predict.pick", { n })} onclick={() => (guess = guess === n ? null : n)}>{n}</button>
        {/each}
      </div>
      <div class="option" role="group" aria-labelledby="tx-confidence">
        <span id="tx-confidence" class="field-name">{t("tx.predict.confidence")}</span>
        <div class="row">
          {#each ["low", "mid", "high"] as const as c (c)}
            <button type="button" class="pill small" aria-pressed={confidence === c} onclick={() => (confidence = confidence === c ? null : c)}>{t(`tx.confidence.${c}`)}</button>
          {/each}
        </div>
      </div>
    </section>
  {/if}

  <div class="board">
    <Player {total} {traceKey} {labels} {announce} onfirstplay={lockPrediction} onend={announceRunFinished}>
      {#snippet board(cursor)}
        {@const step = cursor > 0 ? trace.steps[cursor - 1] : undefined}
        {@const hit = touched(step?.explain ?? [])}
        {@const reads = trace.result.reads.filter((r) => r.step < cursor)}
        {@const writes = trace.result.writes.filter((w) => w.step < cursor)}
        {@const ended = cursor >= total && total > 0}
        <div class="board-head">
          <h3>{step ? t("tx.board.at", { n: step.t + 1 }) : t("cpu.board.start")}</h3>
          <p class="rule">{t(`tx.rule.${isolation}`)}</p>
        </div>

        <section aria-labelledby="tx-data">
          <h4 id="tx-data">{t("tx.data")}</h4>
          <ul class="items">
            {#each itemsAt(cursor) as it (it.id)}
              <li class="item zone" class:touched={hit.items.has(it.id)}>
                <code class="var">{it.id}</code>
                <div class="cell">
                  <span class="field-name">{t("tx.item.committed")}</span>
                  <span class="value">{it.committed}</span>
                  {#if it.committedBy}<span class="caption">{t("tx.item.committedBy", { id: it.committedBy })}</span>{/if}
                </div>
                <div class="cell">
                  <span class="field-name">{t("tx.item.pending")}</span>
                  {#if it.pending}
                    <span class="value pending">{it.pending.value}</span>
                    <span class="entity caption"><Token slot={slotForId(it.pending.tx)} size={20} label={shapeName(it.pending.tx)} />{it.pending.tx}</span>
                  {:else}
                    <span class="caption">{t("tx.item.none")}</span>
                  {/if}
                </div>
                <div class="cell">
                  <span class="field-name">{t("tx.item.lock")}</span>
                  {#if it.holder}
                    <span class="entity"><Token slot={slotForId(it.holder)} size={22} label={shapeName(it.holder)} />{it.holder}</span>
                  {:else}
                    <span class="caption">{t("tx.item.free")}</span>
                  {/if}
                  {#if it.queue.length > 0}
                    <span class="caption">{t("tx.item.queue")}</span>
                    <span class="queue">
                      {#each it.queue as q (q)}<Token slot={slotForId(q)} size={20} label={tokenLabel(q)} />{/each}
                    </span>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        </section>

        <section aria-labelledby="tx-transactions">
          <h4 id="tx-transactions">{t("tx.transactions")}</h4>
          <ul class="txs">
            {#each txsAt(cursor) as x, k (x.id)}
              {@const ranNow = hit.txs.has(x.id)}
              {@const ended_ = x.status === "committed" || x.status === "aborted"}
              <li class="tx zone" class:running={ranNow} class:done={ended_} class:blocked={x.status === "blocked"}>
                <div class="tx-head">
                  <span class="entity"><Token slot={slotForId(x.id)} size={34} label={tokenLabel(x.id)} variant={ended_ ? "outline" : "filled"} /><span aria-hidden="true">{x.id}</span></span>
                  <span class="caption">{statusText(x)}</span>
                </div>
                <ol class="listing" aria-label={t("tx.listing", { id: x.id })}>
                  {#each scripts[k] ?? [] as op, i (i)}
                    {@const ran = ranNow && i === x.pc - 1}
                    {@const next = i === x.pc && !ended_}
                    <li class:past={i < x.pc && !ran} class:ran class:next class:waiting={next && x.status === "blocked"} style:--fill="var(--entity-{slotForId(x.id)})" style:--on="var(--entity-{slotForId(x.id)}-on)">
                      <code>{opText(op)}</code>
                      {#if ran}<span class="visually-hidden">, {t("tx.line.ran")}</span>{:else if next}<span class="visually-hidden">, {x.status === "blocked" ? t("tx.line.waiting") : t("tx.line.next")}</span>{:else if i < x.pc}<span class="visually-hidden">, {t("tx.line.done")}</span>{/if}
                    </li>
                  {/each}
                </ol>
                <div class="seen">
                  <span class="field-name">{t("tx.lastReads")}</span>
                  {#if x.lastReads.length === 0}
                    <span class="caption">{t("tx.lastReads.none")}</span>
                  {:else}
                    <span class="reads-line">{x.lastReads.map((r) => `${r.item} = ${r.value}`).join(", ")}</span>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        </section>

        <Timeline segments={trace.result.segments} total={Math.max(total, 1)} cursor={cursor} label={timelineLabel(cursor)} />

        <div class="after">
          <section class="why" aria-labelledby="tx-why">
            <h4 id="tx-why">{t("cpu.why")}</h4>
            <p>{step ? explanationText(step.explain) : t("tx.why.start")}</p>
          </section>

          {#if predictionState !== "open"}
            <section class="card verdict" aria-labelledby="tx-verdict">
              <h4 id="tx-verdict">{t("cpu.predict.title")}</h4>
              {#if predictionState === "skipped"}
                <p>{t("cpu.predict.none")}</p>
              {:else if !ended}
                <p>{t("cpu.predict.locked")}</p>
              {:else if answer === null}
                <p>{t("tx.predict.incomplete")}</p>
              {:else if guess === answer}
                <p class="score">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" stroke-width="3" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>
                  {t("tx.predict.right", { answer })}
                </p>
              {:else}
                <p class="score">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-bad)" stroke-width="3" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  {t("tx.predict.wrong", { guess: guess ?? 0, answer })}
                </p>
                {#if confidence === "high"}<p>{t("tx.predict.wrongSure")}</p>{/if}
                <p class="hint">{t("tx.predict.hint")}</p>
              {/if}
              <div class="row"><button type="button" class="pill small" onclick={predictAgain}>{t("cpu.predict.again")}</button></div>
            </section>
          {/if}
        </div>

        <section class="metrics" aria-labelledby="tx-reads">
          <h4 id="tx-reads">{t("tx.reads")}</h4>
          {#if reads.length === 0}
            <p class="empty">{t("tx.reads.empty")}</p>
          {:else}
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t("tx.col.tx")}</th>
                    <th scope="col">{t("tx.col.item")}</th>
                    <th scope="col">{t("tx.col.read")}</th>
                    <th scope="col">{t("tx.col.kind")}</th>
                    <th scope="col">{t("tx.col.committed")}</th>
                    <th scope="col">{t("tx.col.step")}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each reads as r, i (i)}
                    <tr class:flag={r.kind === "dirty"}>
                      <th scope="row"><span class="entity"><Token slot={slotForId(r.tx)} size={20} label={shapeName(r.tx)} />{r.tx}</span></th>
                      <td><code>{r.item}</code></td>
                      <td>{r.value}</td>
                      <td>{t(`tx.kind.${r.kind}`)}</td>
                      <td>{r.committed}</td>
                      <td>{r.step + 1}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </section>

        <section class="metrics" aria-labelledby="tx-writes">
          <h4 id="tx-writes">{t("tx.writes")}</h4>
          {#if writes.length === 0}
            <p class="empty">{t("tx.writes.empty")}</p>
          {:else}
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t("tx.col.tx")}</th>
                    <th scope="col">{t("tx.col.item")}</th>
                    <th scope="col">{t("tx.col.value")}</th>
                    <th scope="col">{t("tx.col.verdict")}</th>
                    <th scope="col">{t("tx.col.step")}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each writes as w, i (i)}
                    <tr class:flag={w.stale}>
                      <th scope="row"><span class="entity"><Token slot={slotForId(w.tx)} size={20} label={shapeName(w.tx)} />{w.tx}</span></th>
                      <td><code>{w.item}</code></td>
                      <td>{w.value}</td>
                      <td><span class="mark">
                        {#if w.stale}
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-bad)" stroke-width="3.2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                          {t("tx.writes.stale")}
                        {:else}
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" stroke-width="3.2" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>
                          {t("tx.writes.ok")}
                        {/if}
                      </span></td>
                      <td>{w.step + 1}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
          <p class="hint">{t("tx.writes.hint")}</p>
          {#if ended && trace.result.complete}
            <p class="tally">{t("tx.tally", { values: finalText(trace.result.final), lost: trace.result.lostUpdates, dirty: trace.result.dirtyReads })}</p>
            {#if presetId === "transfer" && answer !== null}<p class="tally">{t("tx.tally.report", { total: answer })}</p>{/if}
          {:else if !trace.result.complete && (ended || total === 0)}
            <p class="tally">{t("tx.tally.incomplete", { n: opsLeft })}</p>
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

  .caption {
    font-size: var(--text-data);
    color: var(--color-ink-muted);
  }

  .tx-button {
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

  .items,
  .txs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  /* A data item is the contested resource: a recessed slot, like the shared counter. */
  .item {
    flex: 1 1 260px;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-4);
    background: var(--color-slot);
  }

  .item.touched {
    border: var(--outline);
  }

  .var {
    font-family: var(--font-mono);
    font-size: 1.25rem;
    font-weight: 700;
    align-self: center;
  }

  .cell {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
  }

  .value {
    min-width: 3.5rem;
    padding: var(--space-1) var(--space-3);
    border: var(--outline);
    border-radius: var(--radius-field);
    background: var(--color-surface);
    font-size: 1.5rem;
    font-weight: 800;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  /* Uncommitted: the value is waiting to become real, so it uses the waiting outline. */
  .value.pending {
    border: var(--outline-waiting);
    background: transparent;
  }

  .queue {
    display: inline-flex;
    gap: 2px;
  }

  .tx {
    flex: 1 1 220px;
    border: var(--outline-waiting);
  }

  .tx.running {
    border: var(--outline);
  }

  .tx.done {
    background: var(--color-ground);
  }

  .tx-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
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
    overflow-wrap: anywhere;
  }

  .listing li.past {
    color: var(--color-ink-muted);
  }

  .listing li.next {
    border-style: dashed;
    border-color: var(--color-ink-muted);
  }

  .listing li.waiting {
    border-color: var(--color-ink);
  }

  .listing li.ran {
    background: var(--fill);
    color: var(--on);
  }

  /* The number sits outside the filled line, on the board's ground: keep it in ink. */
  .listing li.ran::marker {
    color: var(--color-ink);
  }

  .seen {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2);
  }

  .reads-line {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .mark {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  tr.flag td,
  tr.flag th {
    font-weight: 700;
  }

  .tally {
    font-weight: 700;
  }
</style>
