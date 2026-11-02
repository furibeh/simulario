<script lang="ts">
import type { Locale } from "../../i18n/config";
import { useTranslations } from "../../i18n/t";
import { markCompleted } from "../../lib/progress";

export interface QuizQuestion {
  question: string;
  options: string[];
  /** Index of the correct option. */
  answer: number;
  /** Shown after checking, right or wrong. */
  explanation: string;
}

interface Props {
  lang: Locale;
  lessonId: string;
  questions: QuizQuestion[];
}

let { lang, lessonId, questions }: Props = $props();
const t = $derived(useTranslations(lang));
const uid = $props.id();

// svelte-ignore state_referenced_locally
let selected = $state<(number | null)[]>(questions.map(() => null));
// svelte-ignore state_referenced_locally
let checked = $state<boolean[]>(questions.map(() => false));
let completed = $state(false);

const correctCount = $derived(
  questions.filter((q, i) => checked[i] && selected[i] === q.answer).length,
);
const allChecked = $derived(checked.every(Boolean));

function check(index: number, event: SubmitEvent) {
  event.preventDefault();
  if (selected[index] === null) return;
  checked[index] = true;
  if (checked.every(Boolean) && !completed) {
    markCompleted(globalThis.localStorage, lessonId, new Date());
    completed = true;
  }
}
</script>

<div class="quiz">
  {#each questions as q, i (q.question)}
    {@const isRight = selected[i] === q.answer}
    <form class="question" onsubmit={(e) => check(i, e)}>
      <fieldset>
        <legend><span class="n">{i + 1}.</span> {q.question}</legend>
        <div class="options">
          {#each q.options as option, j (option)}
            <label class="option" class:right={checked[i] && j === q.answer} class:wrong={checked[i] && selected[i] === j && !isRight}>
              <input type="radio" name="{uid}-q{i}" value={j} bind:group={selected[i]} disabled={checked[i]} />
              <span>{option}</span>
            </label>
          {/each}
        </div>
      </fieldset>
      {#if checked[i]}
        <p class="feedback" role="status">
          {#if isRight}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-good)" stroke-width="3" aria-hidden="true"><path d="M4 12l5 5L20 6" /></svg>
            <strong>{t("quiz.correct")}</strong>
          {:else}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-bad)" stroke-width="3" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            <strong>{t("quiz.incorrect")}</strong>
          {/if}
          <span>{q.explanation}</span>
        </p>
      {:else}
        <button type="submit" class="pill" disabled={selected[i] === null}>{t("quiz.submit")}</button>
      {/if}
    </form>
  {/each}

  {#if allChecked}
    <p class="summary" role="status">
      {t("quiz.score", { n: correctCount, total: questions.length })}
      {t("quiz.done")}
    </p>
  {/if}
</div>

<style>
  .quiz {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .question {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-5);
    border: var(--outline);
    border-radius: var(--radius-card);
    background: var(--color-surface);
  }

  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  legend {
    padding: 0;
    font-weight: 700;
    max-width: var(--measure);
  }

  .n {
    color: var(--color-ink-muted);
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .option {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--target-min);
    padding: var(--space-2) var(--space-4);
    border: 2px solid var(--color-slot);
    border-radius: 12px;
    cursor: pointer;
  }

  .option input {
    width: 20px;
    height: 20px;
    accent-color: var(--color-action);
  }

  .option.right {
    border-color: var(--color-good);
  }

  .option.wrong {
    border-color: var(--color-bad);
  }

  .pill {
    align-self: flex-start;
    min-height: var(--target-min);
    padding: 0 var(--space-6);
    border: var(--outline);
    border-radius: var(--radius-pill);
    background: var(--color-ink);
    color: var(--color-on-ink);
    font-weight: 800;
    cursor: pointer;
  }

  .pill:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .feedback {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .summary {
    font-weight: 700;
  }
</style>
