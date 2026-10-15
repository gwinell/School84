"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { BookOpenIcon, GripVerticalIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { tryCatch } from "@/hooks/try-catch";
import { cn } from "@/lib/utils";
import type { tAdminGetCourse } from "@/app/data/admin/admin-get-course";
import { reorderChapters } from "../actions";
import NewChapterModal from "./NewChapterModal";
import DeleteChapterModal from "./DeleteChapterModal";

type Chapter = { id: string; title: string; position: number; lessons: { id: string; title: string }[] };

function ChapterRow({
  courseId,
  courseHrefBase,
  chapter,
  index,
}: {
  courseId: string;
  courseHrefBase: string;
  chapter: Chapter;
  index: number;
}) {
  const { ref, handleRef, isDragging } = useSortable({ id: chapter.id, index });
  return (
    <Card ref={ref} size="sm" className={cn(isDragging && "opacity-50")}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          ref={handleRef}
          type="button"
          aria-label="Переместить главу"
          className="cursor-grab text-muted-foreground"
        >
          <GripVerticalIcon className="size-4" />
        </button>
        <BookOpenIcon className="size-4 text-muted-foreground" />
        <Link
          href={`${courseHrefBase}/chapters/${chapter.id}`}
          className="min-w-0 flex-1 hover:text-primary"
        >
          <span className="block truncate font-medium">{chapter.title}</span>
          <span className="text-xs text-muted-foreground">
            {chapter.lessons.length} уроков · открыть главу
          </span>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={`${courseHrefBase}/chapters/${chapter.id}`} />}
        >
          Редактировать
        </Button>
        <DeleteChapterModal courseId={courseId} chapterId={chapter.id} />
      </div>
    </Card>
  );
}

export function EditCourseStructureForm({
  course,
  courseHrefBase = `/admin/courses/${course.id}`,
}: {
  course: tAdminGetCourse;
  courseHrefBase?: string;
}) {
  const [chapters, setChapters] = useState<Chapter[]>(course.courseChapters);
  const [isPending, startTransition] = useTransition();

  function reorder(from: number, to: number) {
    if (from === to) return;
    const previous = chapters;
    const next = [...chapters];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setChapters(next);
    startTransition(async () => {
      const { data, error } = await tryCatch(
        reorderChapters({
          courseId: course.id,
          chapters: next.map((chapter, index) => ({
            id: chapter.id,
            position: index + 1,
          })),
        }),
      );
      if (error || data?.status === "error") {
        setChapters(previous);
        toast.error(data?.status === "error" ? data.message : "Не удалось изменить порядок глав");
      }
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Главы курса</h2>
          <p className="text-sm text-muted-foreground">Откройте главу, чтобы редактировать её уроки.</p>
        </div>
        <NewChapterModal courseId={course.id} />
      </div>
      <DragDropProvider
        onDragEnd={(event) => {
          if (event.canceled || isPending) return;
          const source = event.operation.source;
          if (isSortable(source)) reorder(source.initialIndex, source.index);
        }}
      >
        <div className="space-y-2">
          {chapters.map((chapter, index) => (
            <ChapterRow
              key={chapter.id}
              courseId={course.id}
              courseHrefBase={courseHrefBase}
              chapter={chapter}
              index={index}
            />
          ))}
          {chapters.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              В курсе пока нет глав. Добавьте первую главу.
            </p>
          ) : null}
        </div>
      </DragDropProvider>
    </section>
  );
}
