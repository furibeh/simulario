# Lesson spec: <title>

<!--
Copy this file to docs/lessons/<id>.md, where <id> is the lesson's content id
(the MDX filename in src/content/lessons/{es,en}/). This spec is the contract
for both MDX translations and for the engine tests. Write it in English.
Lesson prose does not belong here; the MDX files hold it.
-->

| Field          | Value                                        |
| -------------- | -------------------------------------------- |
| Id             | `<id>`                                       |
| Path / module  | <path> / <module number and name>            |
| Engine         | `src/engines/<engine>/`                      |
| Estimated time | <minutes>                                    |
| Status         | Draft / Ready to write / Written / Published |

## Learning objectives

By the end of the lesson the learner can:

1. <observable skill, starting with a verb>
2. …

## Prerequisites

- <concept> (lesson `<id>`, or "covered in Theory" if that lesson does not exist yet)

## Misconceptions targeted

Each misconception should be exposed by at least one prediction, experiment or check question.

| #   | Misconception  | Where it is exposed                |
| --- | -------------- | ---------------------------------- |
| M1  | <wrong belief> | Predict / Experiment E1 / Check C2 |

## Minimal theory (before Predict)

Only what the learner needs to reason about the prediction, 3–5 minutes of reading:

- <definition or rule>

## Predict

- **Question**: <the exact question, language-neutral>
- **Setup**: <preset and parameters>
- **Correct answer**: <answer>
- **Naive answer and why it fails**: <the answer a learner holding M1 gives, and the step in the run that contradicts it>

## Run

- **Default setup**: <preset, parameters>
- **Moment to watch**: <the step where the key behavior happens, by time or step number>

## Explain (depth after the run)

- <topic, formula, proof sketch or real-system note>

## Experiment

| #   | Challenge                  | One valid solution | Why it works   |
| --- | -------------------------- | ------------------ | -------------- |
| E1  | <goal phrased as "Make …"> | <parameters>       | <one sentence> |

## Check

| #   | Question   | Answer   | Targets |
| --- | ---------- | -------- | ------- |
| C1  | <question> | <answer> | M1      |

## Engine behavior

### Inputs and limits

<fields, ranges, defaults>

### Rules and tie-breaking

<every rule the engine applies, precise enough to compute results by hand>

### Explanation keys

| Key     | Params     | Example (es) | Example (en) |
| ------- | ---------- | ------------ | ------------ |
| `<key>` | `<params>` | <text>       | <text>       |

## Expected results (hand-computed)

Tests in `src/engines/<engine>/` assert these values. Compute them by hand from the rules above, never from the engine's output.

### Preset: <name>

<input table>

| Variant | Schedule / trace summary | Metrics | Order |
| ------- | ------------------------ | ------- | ----- |

### Edge cases

| Case | Input | Expected |
| ---- | ----- | -------- |

## Go deeper (optional section)

- <topic>

## References

- <author, title, edition, chapter/section, URL if free>

## Translations

| Language | File                              | Status      |
| -------- | --------------------------------- | ----------- |
| es       | `src/content/lessons/es/<id>.mdx` | Not started |
| en       | `src/content/lessons/en/<id>.mdx` | Not started |
