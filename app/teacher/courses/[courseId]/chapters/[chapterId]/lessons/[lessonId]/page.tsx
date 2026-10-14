import { notFound } from "next/navigation";

import { adminGetLesson } from "@/app/data/admin/admin-get-lesson";
import { requireCourseTeacher } from "@/app/data/teacher/require-course-teacher";
import { LessonCellEditor } from "@/app/admin/courses/[courseId]/chapters/[chapterId]/lessons/[lessonId]/_components/LessonCellEditor";

export default async function TeacherLessonPage({ params, searchParams }: {
  params: Promise<{ courseId: string; chapterId: string; lessonId: string }>;
  searchParams: Promise<{ cellId?: string }>;
}) {
  const [{ courseId, chapterId, lessonId }, { cellId }] = await Promise.all([params, searchParams]);
  await requireCourseTeacher(courseId);
  const lesson = await adminGetLesson({ id: lessonId });
  if (lesson.chapter.courseId !== courseId || lesson.chapterId !== chapterId) notFound();
  const selectedCell = lesson.cells.find((cell) => cell.id === cellId) ?? lesson.cells[0] ?? null;
  return <LessonCellEditor
    key={`${lesson.id}:${selectedCell?.id ?? ""}:${lesson.cells.map((cell) => cell.id).join(":")}`}
    courseId={courseId}
    chapterId={chapterId}
    lesson={lesson}
    selectedCell={selectedCell}
    courseHrefBase={`/teacher/courses/${courseId}`}
  />;
}
