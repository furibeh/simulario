<script lang="ts">
import { type PresetId, presetIds, presets } from "../../engines/file-system/presets";
import { assertValidInput, simulate } from "../../engines/file-system/simulate";
import {
  type FsExplanation,
  type FsState,
  geometry,
  limits,
  type Operation,
  type OpName,
} from "../../engines/file-system/types";
import type { Locale } from "../../i18n/config";
import { fileSystemEn } from "../../i18n/engines/file-system.en";
import { fileSystemEs } from "../../i18n/engines/file-system.es";
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
}

let { lang, preset = "links" }: Props = $props();

const t = $derived(useTranslations(lang));
const templates = $derived(lang === "es" ? fileSystemEs : fileSystemEn);
const opNames: readonly OpName[] = [
  "create",
  "write",
  "link",
  "symlink",
  "unlink",
  "open",
  "close",
  "cat",
  "read",
  "rename",
];

/** Editable row: every op keeps all its fields so switching operation does not lose input. */
interface Row {
  op: OpName;
  name: string;
  to: string;
  text: string;
  fd: number;
}

const toRow = (o: Operation): Row => ({
  op: o.op,
  name: "name" in o ? o.name : "a",
  to: "to" in o ? o.to : o.op === "symlink" ? o.target : "b",
  text: "text" in o ? o.text : "",
  fd: "fd" in o ? o.fd : 3,
});

function toOp(r: Row): Operation {
  switch (r.op) {
    case "write":
      return { op: "write", name: r.name, text: r.text };
    case "link":
    case "rename":
      return { op: r.op, name: r.name, to: r.to };
    case "symlink":
      return { op: "symlink", target: r.to, name: r.name };
    case "close":
    case "read":
      return { op: r.op, fd: r.fd };
    default:
      return { op: r.op, name: r.name };
  }
}

// svelte-ignore state_referenced_locally
let rows = $state<Row[]>(presets[preset].map(toRow));
// svelte-ignore state_referenced_locally
let script = $state<Operation[]>([...presets[preset]]);
let invalidStep = $state<number | null>(null);
let guesses = $state<Record<number, string>>({});
let predictionState = $state<"open" | "locked" | "skipped">("open");
let runId = $state(0);

const trace = $derived(simulate({ script }));
const total = $derived(trace.steps.length);
const traceKey = $derived(`${JSON.stringify(script)}|${runId}`);

$effect(() => {
  void trace;
  guesses = {};
  predictionState = "open";
});

/** Applies the edited rows when they form a valid script; otherwise keeps the last valid one. */
function commit(next: Row[]) {
  rows = next;
  const candidate = next.map(toOp);
  try {
    assertValidInput({ script: candidate });
    script = candidate;
    invalidStep = null;
  } catch {
    const bad = candidate.findIndex((_, i) => {
      try {
        assertValidInput({ script: [candidate[i] as Operation] });
        return false;
      } catch {
        return true;
      }
    });
    invalidStep = bad >= 0 ? bad + 1 : 1;
  }
}

function edit(index: number, change: Partial<Row>) {
  commit(rows.map((r, i) => (i === index ? { ...r, ...change } : r)));
}

function loadPreset(id: PresetId) {
  commit(presets[id].map(toRow));
}

const inodeName = (n: number) =>
  t("fs.inodeName", { n, shape: t(`shape.${slotForIndex(n - 1)}` as UiKey) });

function command(o: Operation): string {
  switch (o.op) {
    case "write":
      return `write ${o.name} "${o.text}"`;
    case "link":
    case "rename":
      return `${o.op} ${o.name} ${o.to}`;
    case "symlink":
      return `symlink ${o.target} ${o.name}`;
    case "close":
    case "read":
      return `${o.op} ${o.fd}`;
    default:
      return `${o.op} ${o.name}`;
  }
}

// Prediction: one question per read, options from every text the script writes.
const reads = $derived(
  script.flatMap((o, i) =>
    o.op === "cat" || o.op === "read" ? [{ step: i, cmd: command(o) }] : [],
  ),
);
const choices = $derived(
  [...new Set(script.flatMap((o) => (o.op === "write" && o.text !== "" ? [o.text] : [])))]
    .map((text) => ({ value: `text:${text}`, label: t("fs.predict.text", { text }) }))
    .concat([
      { value: "empty", label: t("fs.predict.empty") },
      { value: "error", label: t("fs.predict.error") },
    ]),
);

function actualOf(step: number): string {
  const out = trace.result.outputs.find((o) => o.step === step);
  if (!out || out.kind === "error") return "error";
  return out.content === "" ? "empty" : `text:${out.content}`;
}

const labelOf = (value: string | undefined) =>
  value === undefined || value === ""
    ? "–"
    : value === "empty"
      ? t("fs.predict.empty")
      : value === "error"
        ? t("fs.predict.error")
        : t("fs.predict.text", { text: value.slice(5) });

function lockPrediction() {
  if (predictionState !== "open") return;
  const all = reads.length > 0 && reads.every((r) => (guesses[r.step] ?? "") !== "");
  predictionState = all ? "locked" : "skipped";
}

function predictAgain() {
  guesses = {};
  predictionState = "open";
  runId += 1;
}

function explanationText(explain: readonly FsExplanation[]): string {
  return explain.map((e) => renderExplanation(templates, e)).join(" ");
}

function announce(cursor: number): string {
  const step = cursor > 0 ? trace.steps[cursor - 1] : undefined;
  return step ? t("fs.live", { n: step.t + 1, text: explanationText(step.explain) }) : "";
}

function initialState(): FsState {
  return {
    inodes: [
      { number: 0, type: "dir", links: 2, open: 0, size: 0, blocks: [0], target: null },
      ...Array.from({ length: geometry.inodes - 1 }, () => null),
    ],
    blocks: Array.from({ length: geometry.blocks }, () => null),
    entries: [],
    fds: [],
    touched: { inodes: [], blocks: [], names: [] },
  };
}

function ownerOf(state: FsState, block: number): number | null {
  const node = state.inodes.find((n) => n?.blocks.includes(block));
  return node?.number ?? null;
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

{#snippet bitmap(label: string, bits: readonly boolean[])}
  <div class="bitmap">
    <span class="field-name">{label}</span>
    <ol>
      {#each bits as used, i (i)}
        <li class:used aria-label={t("fs.bitmap.cell", { n: i, state: used ? t("fs.bitmap.used") : t("fs.bitmap.free") })}><span aria-hidden="true">{used ? 1 : 0}</span></li>
      {/each}
    </ol>
  </div>
{/snippet}

<div class="sim">
  <section class="card" aria-labelledby="fs-script">
    <h3 id="fs-script">{t("fs.script")}</h3>
    <p class="hint">{t("fs.script.hint")}</p>
    <ol class="script">
      {#each rows as row, i (i)}
        <li class:invalid={invalidStep === i + 1}>
          <span class="field-name step-n">{t("fs.step", { n: i + 1 })}</span>
          <select aria-label={t("fs.op", { n: i + 1 })} value={row.op} onchange={(e) => edit(i, { op: e.currentTarget.value as OpName })}>
            {#each opNames as o (o)}<option value={o}>{t(`fs.op.${o}`)}</option>{/each}
          </select>
          {#if row.op === "close" || row.op === "read"}
            <input class="number" type="number" min={geometry.firstFd} max={geometry.lastFd} value={row.fd} aria-label={t("fs.argOf", { arg: t("fs.arg.fd"), n: i + 1 })} onchange={(e) => edit(i, { fd: Number.parseInt(e.currentTarget.value, 10) || geometry.firstFd })} />
          {:else}
            {#if row.op === "symlink"}
              <input class="text" type="text" value={row.to} placeholder={t("fs.arg.target")} aria-label={t("fs.argOf", { arg: t("fs.arg.target"), n: i + 1 })} onchange={(e) => edit(i, { to: e.currentTarget.value.trim() })} />
            {/if}
            <input class="text" type="text" value={row.name} placeholder={t("fs.arg.name")} aria-label={t("fs.argOf", { arg: t("fs.arg.name"), n: i + 1 })} onchange={(e) => edit(i, { name: e.currentTarget.value.trim() })} />
            {#if row.op === "link" || row.op === "rename"}
              <input class="text" type="text" value={row.to} placeholder={t("fs.arg.to")} aria-label={t("fs.argOf", { arg: t("fs.arg.to"), n: i + 1 })} onchange={(e) => edit(i, { to: e.currentTarget.value.trim() })} />
            {/if}
            {#if row.op === "write"}
              <input class="text" type="text" maxlength={limits.text} value={row.text} placeholder={t("fs.arg.text")} aria-label={t("fs.argOf", { arg: t("fs.arg.text"), n: i + 1 })} onchange={(e) => edit(i, { text: e.currentTarget.value })} />
            {/if}
          {/if}
          <button type="button" class="icon" aria-label={t("fs.removeStep", { n: i + 1 })} disabled={rows.length <= limits.script.min} onclick={() => commit(rows.filter((_, j) => j !== i))}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </li>
      {/each}
    </ol>
    {#if invalidStep !== null}<p class="hint" role="alert">{t("fs.invalid", { n: invalidStep })}</p>{/if}
    <div class="row">
      <button type="button" class="pill" disabled={rows.length >= limits.script.max} onclick={() => commit([...rows, { op: "cat", name: rows.at(-1)?.name ?? "a", to: "b", text: "", fd: 3 }])}>{t("fs.addStep")}</button>
    </div>
    <div class="presets" role="group" aria-label={t("cpu.presets")}>
      <span class="hint">{t("cpu.presets")}</span>
      {#each presetIds as id (id)}
        <button type="button" class="pill small" onclick={() => loadPreset(id)}>{t(`fs.preset.${id}`)}</button>
      {/each}
    </div>
  </section>

  {#if predictionState === "open"}
    <section class="card" aria-labelledby="fs-predict">
      <h3 id="fs-predict">{t("cpu.predict.title")}</h3>
      {#if reads.length === 0}
        <p>{t("fs.predict.none")}</p>
      {:else}
        <p>{t("fs.predict.prompt")}</p>
        <ul class="questions">
          {#each reads as r (r.step)}
            <li>
              <label class="option">
                <span>{t("fs.predict.question", { n: r.step + 1, cmd: "" })}<code>{r.cmd}</code></span>
                <select value={guesses[r.step] ?? ""} onchange={(e) => (guesses = { ...guesses, [r.step]: e.currentTarget.value })}>
                  <option value="">{t("ps.predict.choose")}</option>
                  {#each choices as c (c.value)}<option value={c.value}>{c.label}</option>{/each}
                </select>
              </label>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  <div class="board">
    <Player {total} {traceKey} {labels} {announce} onfirstplay={lockPrediction} onend={announceRunFinished}>
      {#snippet board(cursor)}
        {@const step = cursor > 0 ? trace.steps[cursor - 1] : undefined}
        {@const state = step?.state ?? initialState()}
        {@const ended = cursor >= total}
        {@const failed = step !== undefined && trace.result.errors.includes(step.t)}
        {@const named = new Set(state.entries.map((e) => e.inode))}
        {@const shown = trace.result.outputs.filter((o) => o.step < cursor)}
        <div class="board-head">
          <h3>{step ? t("fs.board.at", { n: step.t + 1 }) : t("cpu.board.start")}</h3>
          <p class="rule">{t("fs.rule")}</p>
        </div>

        {#if step}
          <p class="command" class:failed><span class="visually-hidden">{t("fs.command")}: </span><code>$ {command(script[step.t] as Operation)}</code></p>
        {/if}

        <section class="bitmaps" aria-labelledby="fs-bitmaps">
          <h4 id="fs-bitmaps" class="visually-hidden">{t("fs.bitmaps")}</h4>
          {@render bitmap(t("fs.bitmap.inodes"), state.inodes.map((n) => n !== null))}
          {@render bitmap(t("fs.bitmap.blocks"), state.blocks.map((b, i) => b !== null || i === 0))}
        </section>

        <div class="layers">
          <section class="layer" aria-labelledby="fs-dir">
            <h4 id="fs-dir">{t("fs.dir")}</h4>
            <ul class="entries">
              {#each state.entries as e (e.name)}
                <li class:touched={state.touched.names.includes(e.name)}>
                  <code class="name">{e.name}</code>
                  <span aria-hidden="true">→</span>
                  <span class="entity"><Token slot={slotForIndex(e.inode - 1)} size={20} label={inodeName(e.inode)} /><span aria-hidden="true">{e.inode}</span></span>
                </li>
              {:else}
                <li class="empty">{t("fs.dir.empty")}</li>
              {/each}
            </ul>
            <h4 class="sub">{t("fs.fds")}</h4>
            <ul class="fds">
              {#each state.fds as f (f.fd)}
                <li>{t("fs.fd", { fd: f.fd, inode: f.inode })}</li>
              {:else}
                <li class="empty">{t("fs.fds.none")}</li>
              {/each}
            </ul>
          </section>

          <section class="layer" aria-labelledby="fs-inodes">
            <h4 id="fs-inodes">{t("fs.inodes")}</h4>
            <ul class="inodes">
              {#each state.inodes as node, i (i)}
                {#if node && node.type !== "dir"}
                  <li class="inode" class:touched={state.touched.inodes.includes(i)} class:orphan={!named.has(i)}>
                    <div class="inode-head">
                      <span class="entity"><Token slot={slotForIndex(i - 1)} size={26} label={inodeName(i)} /><span aria-hidden="true">{t("fs.inode", { n: i })}</span></span>
                      <span class="caption">{t(`fs.type.${node.type}`)}{named.has(i) ? "" : ` · ${t("fs.inode.orphan")}`}</span>
                    </div>
                    <dl>
                      <dt>{t("fs.inode.links")}</dt><dd>{node.links}</dd>
                      <dt>{t("fs.inode.open")}</dt><dd>{node.open}</dd>
                      <dt>{t("fs.inode.size")}</dt><dd>{node.size}</dd>
                      {#if node.type === "symlink"}
                        <dt>{t("fs.inode.target")}</dt><dd><code>{node.target}</code></dd>
                      {:else}
                        <dt>{t("fs.inode.blocks")}</dt><dd>{node.blocks.length ? node.blocks.join(", ") : t("fs.inode.none")}</dd>
                      {/if}
                    </dl>
                  </li>
                {/if}
              {/each}
            </ul>
          </section>

          <section class="layer" aria-labelledby="fs-blocks">
            <h4 id="fs-blocks">{t("fs.blocks")}</h4>
            <ol class="blocks">
              {#each state.blocks as content, b (b)}
                {@const owner = b === 0 ? null : ownerOf(state, b)}
                <li class="block" class:used={content !== null || b === 0} class:touched={state.touched.blocks.includes(b)}>
                  <span class="field-name">{b}</span>
                  {#if b === 0}
                    <span class="caption">{t("fs.block.dir")}</span>
                  {:else if content !== null && owner !== null}
                    <Token slot={slotForIndex(owner - 1)} size={14} label={inodeName(owner)} />
                    <code class="bytes">{content.replaceAll(" ", "·")}</code>
                  {:else}
                    <span class="caption">{t("fs.block.free")}</span>
                  {/if}
                </li>
              {/each}
            </ol>
          </section>
        </div>

        <div class="after">
          <section class="why" aria-labelledby="fs-why">
            <h4 id="fs-why">{t("cpu.why")}</h4>
            <p>{step ? explanationText(step.explain) : t("fs.why.start")}</p>
            <h4 class="sub">{t("fs.output")}</h4>
            {#if shown.length === 0}
              <p class="empty">{t("fs.output.none")}</p>
            {:else}
              <ol class="console">
                {#each shown as o (o.step)}
                  <li><code>$ {command(script[o.step] as Operation)}</code><br /><code class:error={o.kind === "error"}>{o.kind === "error" ? t("fs.output.error") : o.content === "" ? t("fs.predict.empty") : o.content}</code></li>
                {/each}
              </ol>
            {/if}
          </section>

          {#if predictionState !== "open"}
            <section class="card verdict" aria-labelledby="fs-verdict">
              <h4 id="fs-verdict">{t("cpu.predict.title")}</h4>
              {#if predictionState === "skipped"}
                <p>{reads.length === 0 ? t("fs.predict.none") : t("cpu.predict.none")}</p>
              {:else if !ended}
                <p>{t("cpu.predict.locked")}</p>
              {:else}
                {@const answers = reads.map((r) => ({ ...r, yours: guesses[r.step], actual: actualOf(r.step) }))}
                {@const hits = answers.filter((a) => a.yours === a.actual).length}
                <p class="score">
                  {#if hits === answers.length}
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" stroke-width="3" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>
                    {t("fs.predict.perfect")}
                  {:else}
                    {t("fs.predict.score", { hits, total: answers.length })}
                  {/if}
                </p>
                <ul class="answers">
                  {#each answers as a (a.step)}
                    <li>
                      <span class="q">{t("fs.predict.question", { n: a.step + 1, cmd: a.cmd })}</span>
                      <span class="a">
                        {#if a.yours === a.actual}
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" stroke-width="3.2" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>
                          {labelOf(a.actual)}<span class="visually-hidden">, {t("cpu.predict.match")}</span>
                        {:else}
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-bad)" stroke-width="3.2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                          {t("fs.predict.yours", { answer: labelOf(a.yours) })} {t("fs.predict.actual", { answer: labelOf(a.actual) })}
                        {/if}
                      </span>
                    </li>
                  {/each}
                </ul>
                {#if hits < answers.length}<p class="hint">{t("fs.predict.hint")}</p>{/if}
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
  .field-name {
    font-size: var(--text-data);
    font-weight: 500;
    color: var(--color-ink-muted);
  }

  .script {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .script li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-slot);
  }

  .script li.invalid select,
  .script li.invalid .text {
    border-color: var(--color-bad);
  }

  .step-n {
    min-width: 3.5rem;
  }

  select,
  .text {
    min-height: var(--target-min);
    max-width: 100%;
    padding: 0 var(--space-3);
    border: var(--outline);
    border-radius: var(--radius-field);
    background: var(--color-surface);
    color: var(--color-ink);
  }

  .text {
    width: 9rem;
    font-family: var(--font-mono);
  }

  .questions {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .option {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    align-items: flex-start;
  }

  .command {
    margin: 0;
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-field);
    background: var(--color-ink);
    color: var(--color-on-ink);
    font-family: var(--font-mono);
    font-size: 1rem;
    overflow-wrap: anywhere;
  }

  .command.failed {
    text-decoration: line-through;
    text-decoration-color: var(--color-bad);
    text-decoration-thickness: 2px;
  }

  .bitmaps {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-6);
  }

  .bitmap {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .bitmap ol {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }

  .bitmap li {
    width: 1.6rem;
    height: 1.6rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1.5px dashed var(--color-ink-muted);
    border-radius: 6px;
    font-family: var(--font-mono);
    font-size: var(--text-data);
    color: var(--color-ink-muted);
  }

  .bitmap li.used {
    border: 1.5px solid var(--color-ink);
    background: var(--color-ink);
    color: var(--color-on-ink);
  }

  .layers {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
  }

  .layer {
    flex: 1 1 220px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .sub {
    margin-top: var(--space-3);
  }

  .entries,
  .fds,
  .inodes,
  .console {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .entries li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 36px;
    padding: 0 var(--space-3);
    border: var(--outline);
    border-radius: var(--radius-field);
  }

  .name {
    font-family: var(--font-mono);
    font-weight: 700;
  }

  .touched {
    background: var(--color-slot);
  }

  .inode {
    padding: var(--space-3);
    border: var(--outline);
    border-radius: var(--radius-card);
  }

  .inode.orphan {
    border: var(--outline-waiting);
  }

  .inode-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .caption {
    font-size: var(--text-data);
    color: var(--color-ink-muted);
  }

  dl {
    margin: var(--space-2) 0 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px var(--space-3);
    font-size: var(--text-small);
  }

  dt {
    color: var(--color-ink-muted);
  }

  dd {
    margin: 0;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .blocks {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(4.75rem, 1fr));
    gap: var(--space-2);
  }

  .block {
    min-height: 3.5rem;
    padding: var(--space-1) var(--space-2);
    border: 1.5px dashed var(--color-ink-muted);
    border-radius: var(--radius-bar);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .block.used {
    border: 2px solid var(--color-ink);
  }

  .bytes {
    font-family: var(--font-mono);
    font-weight: 700;
  }

  .console li {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-field);
    background: var(--color-ground);
    font-family: var(--font-mono);
    font-size: var(--text-small);
    overflow-wrap: anywhere;
  }

  .console .error {
    color: var(--color-bad);
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
