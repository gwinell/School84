export type LearningTargetLesson = {
  id: string;
  completed: boolean;
  isUnlocked?: boolean;
  cells: { id: string; status?: "LOCKED" | "AVAILABLE" | "IN_PROGRESS" | "PASSED"; passed?: boolean }[];
};

export type LearningTargetCursor = { lessonId: string; cellId: string | null } | null;

/** Resolve a saved location only when it still belongs to an accessible lesson. */
export function resolveLearningTarget(
  lessons: LearningTargetLesson[],
  cursor: LearningTargetCursor,
) {
  const accessible = lessons.filter((lesson) => lesson.isUnlocked !== false);
  const savedLesson = cursor
    ? accessible.find((lesson) => lesson.id === cursor.lessonId)
    : undefined;
  const lesson = savedLesson ?? accessible.find((item) => !item.completed) ?? accessible[0];
  const savedCell = savedLesson && cursor?.cellId
    ? savedLesson.cells.find((cell) => cell.id === cursor.cellId && cell.status !== "LOCKED")
    : undefined;
  const cell = savedCell ?? lesson?.cells.find((item) => item.status !== "LOCKED" && item.status !== "PASSED" && !item.passed) ?? lesson?.cells.find((item) => item.status !== "LOCKED");
  const hasStarted = Boolean(savedLesson) || lessons.some((item) => item.completed || item.cells.some((cell) => cell.status === "PASSED" || cell.status === "IN_PROGRESS" || cell.passed));

  return { lessonId: lesson?.id ?? null, cellId: cell?.id ?? null, hasStarted };
}
