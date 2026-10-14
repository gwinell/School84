import "server-only";

import prisma from "@/lib/prisma";

export type SequentialLesson = {
  id: string;
  cells: { id: string; type: "TEXT" | "CODE_TASK" | "QUIZ" }[];
};

export type CellStatus = "LOCKED" | "AVAILABLE" | "IN_PROGRESS" | "PASSED";

/**
 * In sequential mode, the first lesson is open. Each following lesson opens
 * only after every CODE_TASK cell in every preceding lesson is PASSED.
 * Lessons with no code tasks do not block progression.
 */
export function getSequentiallyUnlockedLessonIds(
  lessons: SequentialLesson[],
  statusByCellId: ReadonlyMap<string, CellStatus>,
) {
  const unlocked = new Set<string>();
  let canContinue = true;

  for (const lesson of lessons) {
    if (canContinue) unlocked.add(lesson.id);
    const tasks = lesson.cells.filter((cell) => cell.type === "CODE_TASK");
    const allTasksPassed = tasks.every(
      (task) => statusByCellId.get(task.id) === "PASSED",
    );
    canContinue = canContinue && allTasksPassed;
  }

  return unlocked;
}

export async function canAccessAssignedLesson({
  userId,
  courseId,
  lessonId,
}: {
  userId: string;
  courseId: string;
  lessonId: string;
}) {
  const lessons = await prisma.lesson.findMany({
    where: { chapter: { courseId } },
    orderBy: [{ chapter: { position: "asc" } }, { position: "asc" }],
    select: {
      id: true,
      cells: {
        where: { type: "CODE_TASK" },
        select: { id: true, type: true },
      },
    },
  });
  const taskCellIds = lessons.flatMap((lesson) => lesson.cells.map((cell) => cell.id));
  const progress = taskCellIds.length
    ? await prisma.lessonCellProgress.findMany({
        where: { userId, lessonCellId: { in: taskCellIds } },
        select: { lessonCellId: true, status: true },
      })
    : [];
  const statusByCellId = new Map(progress.map((item) => [item.lessonCellId, item.status]));
  return getSequentiallyUnlockedLessonIds(lessons, statusByCellId).has(lessonId);
}
