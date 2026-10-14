import Link from "next/link";
import { adminGetChapter } from "@/app/data/admin/admin-get-chapter";
import { PageHeader } from "@/components/admin/page-header";
import { ChapterEditor } from "./_components/ChapterEditor";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ courseId: string; chapterId: string }>;
}) {
  const { courseId, chapterId } = await params;
  const chapter = await adminGetChapter(chapterId);
  if (chapter.courseId !== courseId) return <Link href="/admin/courses">Курс не найден</Link>;

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/admin/courses/${courseId}/edit`}
        title={chapter.course.title}
      />
      <ChapterEditor
        key={`${chapter.id}:${chapter.lessons.map((lesson) => lesson.id).join(":")}`}
        chapter={chapter}
      />
    </div>
  );
}
