import Link from "next/link";
import { notFound } from "next/navigation";

import { adminGetChapter } from "@/app/data/admin/admin-get-chapter";
import { requireCourseTeacher } from "@/app/data/teacher/require-course-teacher";
import { ChapterEditor } from "@/app/admin/courses/[courseId]/chapters/[chapterId]/_components/ChapterEditor";

export default async function TeacherChapterPage({ params }: { params: Promise<{ courseId: string; chapterId: string }> }) {
  const { courseId, chapterId } = await params;
  await requireCourseTeacher(courseId);
  const chapter = await adminGetChapter(chapterId);
  if (chapter.courseId !== courseId) notFound();
  return <div className="space-y-6">
    <Link href={`/teacher/courses/${courseId}/edit`} className="text-sm underline underline-offset-4">К редактированию курса · {chapter.course.title}</Link>
    <ChapterEditor key={`${chapter.id}:${chapter.lessons.map((lesson) => lesson.id).join(":")}`} chapter={chapter} courseHrefBase={`/teacher/courses/${courseId}`} />
  </div>;
}
