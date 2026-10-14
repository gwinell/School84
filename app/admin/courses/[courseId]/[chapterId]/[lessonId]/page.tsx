import { redirect } from "next/navigation";

export default async function LegacyLessonEditorRoute({
  params,
}: {
  params: Promise<{ courseId: string; chapterId: string; lessonId: string }>;
}) {
  const { courseId, chapterId, lessonId } = await params;
  redirect(
    `/admin/courses/${courseId}/chapters/${chapterId}/lessons/${lessonId}`,
  );
}
