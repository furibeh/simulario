/** Lesson progress kept in the browser. No personal data. See docs/architecture.md, "Progress". */

import { legacyLessonIds } from "./legacy-ids";

export const PROGRESS_KEY = "simulario:progress:v1";

export interface LessonProgress {
  /** First time the gated stages (Explain, Experiment, Check) were opened. */
  unlockedAt?: string;
  completedAt?: string;
}

export interface Progress {
  v: 1;
  lessons: Record<string, LessonProgress>;
}

type Reader = Pick<Storage, "getItem"> | undefined;
type Writer = Pick<Storage, "getItem" | "setItem"> | undefined;

const empty = (): Progress => ({ v: 1, lessons: {} });

export function readProgress(storage: Reader): Progress {
  try {
    const raw = storage?.getItem(PROGRESS_KEY);
    if (!raw) return empty();
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as Progress).v === 1 &&
      typeof (parsed as Progress).lessons === "object" &&
      (parsed as Progress).lessons !== null
    ) {
      return renameLegacy(parsed as Progress);
    }
    return empty();
  } catch {
    return empty();
  }
}

/**
 * Moves progress stored under an old lesson id to its new id. The first date of each field wins
 * (ISO strings sort by time). The renamed copy is saved by the next write.
 */
function renameLegacy(progress: Progress): Progress {
  const lessons: Record<string, LessonProgress> = {};
  const earliest = (a?: string, b?: string) => (a && b ? (a < b ? a : b) : (a ?? b));
  for (const [id, lesson] of Object.entries(progress.lessons)) {
    const target = legacyLessonIds[id] ?? id;
    const prev = lessons[target];
    if (!prev) {
      lessons[target] = lesson;
      continue;
    }
    const merged: LessonProgress = {};
    const unlockedAt = earliest(prev.unlockedAt, lesson.unlockedAt);
    const completedAt = earliest(prev.completedAt, lesson.completedAt);
    if (unlockedAt) merged.unlockedAt = unlockedAt;
    if (completedAt) merged.completedAt = completedAt;
    lessons[target] = merged;
  }
  return { ...progress, lessons };
}

/** Sets a timestamp field once (the first date is kept) and saves. */
function stamp(
  storage: Writer,
  lessonId: string,
  field: keyof LessonProgress,
  now: Date,
): Progress {
  const progress = readProgress(storage);
  const lesson = progress.lessons[lessonId] ?? {};
  const next: Progress = {
    ...progress,
    lessons: {
      ...progress.lessons,
      [lessonId]: { ...lesson, [field]: lesson[field] ?? now.toISOString() },
    },
  };
  try {
    storage?.setItem(PROGRESS_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: progress lasts for this page only.
  }
  return next;
}

export function markUnlocked(storage: Writer, lessonId: string, now: Date): Progress {
  return stamp(storage, lessonId, "unlockedAt", now);
}

export function markCompleted(storage: Writer, lessonId: string, now: Date): Progress {
  return stamp(storage, lessonId, "completedAt", now);
}

/** For the path map's "done" state (design.md, PathMap); not wired yet. */
export function isCompleted(progress: Progress, lessonId: string): boolean {
  return Boolean(progress.lessons[lessonId]?.completedAt);
}

/** A completed lesson counts as unlocked too. */
export function isUnlocked(progress: Progress, lessonId: string): boolean {
  const lesson = progress.lessons[lessonId];
  return Boolean(lesson?.unlockedAt || lesson?.completedAt);
}
