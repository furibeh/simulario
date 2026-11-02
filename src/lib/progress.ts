/** Lesson progress kept in the browser. No personal data. See docs/architecture.md, "Progress". */

export const PROGRESS_KEY = "simulario:progress:v1";

export interface LessonProgress {
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
      return parsed as Progress;
    }
    return empty();
  } catch {
    return empty();
  }
}

export function markCompleted(storage: Writer, lessonId: string, now: Date): Progress {
  const progress = readProgress(storage);
  const lesson = progress.lessons[lessonId] ?? {};
  const next: Progress = {
    ...progress,
    lessons: {
      ...progress.lessons,
      [lessonId]: { ...lesson, completedAt: lesson.completedAt ?? now.toISOString() },
    },
  };
  try {
    storage?.setItem(PROGRESS_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: progress lasts for this page only.
  }
  return next;
}

export function isCompleted(progress: Progress, lessonId: string): boolean {
  return Boolean(progress.lessons[lessonId]?.completedAt);
}
