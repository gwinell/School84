"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowDownIcon, ArrowUpIcon, PlayCircleIcon } from "lucide-react";
import { toast } from "sonner";

import type { tAdminGetChapter } from "@/app/data/admin/admin-get-chapter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tryCatch } from "@/hooks/try-catch";
import { updateChapter, reorderLessons } from "../../../edit/actions";
import NewLessonModal from "../../../edit/_components/NewLessonModal";
import DeleteLessonModal from "../../../edit/_components/DeleteLessonModal";
import DeleteChapterModal from "../../../edit/_components/DeleteChapterModal";

export function ChapterEditor({ chapter: initial }: { chapter: tAdminGetChapter }) {
  const [chapter, setChapter] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [isPending, startTransition] = useTransition();

  function moveLesson(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= chapter.lessons.length) return;
    const next = [...chapter.lessons];
    const [lesson] = next.splice(index, 1);
    next.splice(destination, 0, lesson);
    setChapter({ ...chapter, lessons: next });
    startTransition(async () => {
      const { data, error } = await tryCatch(
        reorderLessons({
          courseId: chapter.courseId,
          chapterId: chapter.id,
          lessons: next.map((item, position) => ({ id: item.id, position: position + 1 })),
        }),
      );
      if (error || data?.status === "error") {
        setChapter(chapter);
        toast.error(data?.status === "error" ? data.message : "Не удалось переместить урок");
      } else {
        toast.success("Порядок уроков сохранён");
      }
    });
  }

  function saveTitle() {
    startTransition(async () => {
      const { data, error } = await tryCatch(
        updateChapter({ courseId: chapter.courseId, chapterId: chapter.id, title }),
      );
      if (error || data?.status === "error") {
        toast.error(data?.status === "error" ? data.message : "Не удалось сохранить главу");
      } else {
        setChapter((previous) => ({ ...previous, title: title.trim() }));
        toast.success("Глава сохранена");
      }
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <section className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-5">
        <label className="min-w-0 basis-64 flex-1 space-y-2">
          <span className="text-sm font-medium">Название главы</span>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <Button disabled={isPending || title.trim() === chapter.title} onClick={saveTitle}>
          Сохранить
        </Button>
        <DeleteChapterModal courseId={chapter.courseId} chapterId={chapter.id} />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Уроки</h2>
            <p className="text-sm text-muted-foreground">Переставляйте и открывайте урок для редактирования ячеек.</p>
          </div>
          <NewLessonModal courseId={chapter.courseId} chapterId={chapter.id} />
        </div>
        <div className="space-y-2">
          {chapter.lessons.map((lesson, index) => (
            <div key={lesson.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
              <span className="w-7 text-center text-xs text-muted-foreground">{index + 1}</span>
              <PlayCircleIcon className="size-4 text-muted-foreground" />
              <Link
                href={`/admin/courses/${chapter.courseId}/chapters/${chapter.id}/lessons/${lesson.id}`}
                className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary"
              >
                {lesson.title}
              </Link>
              <Button variant="ghost" size="icon-sm" aria-label="Выше" disabled={index === 0 || isPending} onClick={() => moveLesson(index, -1)}>
                <ArrowUpIcon />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Ниже" disabled={index === chapter.lessons.length - 1 || isPending} onClick={() => moveLesson(index, 1)}>
                <ArrowDownIcon />
              </Button>
              <DeleteLessonModal lessonId={lesson.id} courseId={chapter.courseId} chapterId={chapter.id} />
            </div>
          ))}
          {chapter.lessons.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Добавьте первый урок в эту главу.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
