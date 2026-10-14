"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpenIcon,
  CheckIcon,
  ChevronDownIcon,
  LockKeyholeIcon,
  PlayIcon,
} from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { tCourseForLearningChapter } from "@/app/data/user/get-course-for-learning";
import { dashboardCourseHref } from "@/lib/organization/course-links";

export function LessonChaptersList({
  chapters,
  courseSlug,
  organizationSlug,
  onNavigate,
}: {
  chapters: tCourseForLearningChapter[];
  courseSlug: string;
  organizationSlug: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const lessons = chapters.flatMap((chapter) => chapter.lessons);
  const totalCells = lessons.reduce((sum, lesson) => sum + lesson.cells.length, 0);
  const passedCells = lessons.reduce(
    (sum, lesson) => sum + lesson.cells.filter((cell) => cell.status === "PASSED").length,
    0,
  );
  const percentage = totalCells ? Math.round((passedCells / totalCells) * 100) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-4 py-4">
        <Progress value={percentage} className="w-full">
          <ProgressLabel>Прогресс курса</ProgressLabel>
          <ProgressValue />
        </Progress>
        <p className="mt-2 text-xs tabular-nums text-muted-foreground">
          {passedCells} из {totalCells} ячеек пройдено
        </p>
      </div>
      <nav aria-label="Темы и уроки курса" className="min-h-0 flex-1 overflow-y-auto p-3">
        <ul className="flex flex-col gap-2">
          {chapters.map((chapter, index) => (
            <ChapterItem
              key={chapter.id}
              chapter={chapter}
              index={index}
              courseSlug={courseSlug}
              organizationSlug={organizationSlug}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      </nav>
    </div>
  );
}

function ChapterItem({
  chapter,
  index,
  courseSlug,
  organizationSlug,
  pathname,
  onNavigate,
}: {
  chapter: tCourseForLearningChapter;
  index: number;
  courseSlug: string;
  organizationSlug: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  const hasCurrent = chapter.lessons.some((lesson) => pathname.endsWith(`/${lesson.id}`));
  const [open, setOpen] = useState(hasCurrent);

  return (
    <li>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/60">
          <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
          <BookOpenIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">
            <span className="mr-1.5 text-xs text-muted-foreground">{index + 1}.</span>
            {chapter.title}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="ml-3 mt-1 flex flex-col gap-1 border-l border-border pl-2">
            {chapter.lessons.map((lesson, lessonIndex) => {
              const active = pathname.endsWith(`/${lesson.id}`);
              const locked = !lesson.isUnlocked;
              const done = lesson.cells.length > 0
                ? lesson.cells.every((cell) => cell.status === "PASSED")
                : lesson.completed;
              return (
                <li key={lesson.id}>
                  {locked ? (
                    <div aria-disabled="true" title="Решите все задачи предыдущего урока" className="flex min-h-10 cursor-not-allowed items-center gap-2 rounded-r-md px-2.5 py-2 text-sm text-muted-foreground/65">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><LockKeyholeIcon className="size-3" /></span>
                      <span className="line-clamp-2 flex-1 leading-snug">{lesson.title}</span>
                    </div>
                  ) : <Link
                    href={dashboardCourseHref(organizationSlug, courseSlug, lesson.id)}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex min-h-10 items-center gap-2 rounded-r-md px-2.5 py-2 text-sm transition-colors hover:bg-muted/60",
                      active && "bg-muted font-medium text-foreground",
                      done && "border-l-2 border-emerald-800 -ml-[2px]",
                      !done && !active && "text-muted-foreground",
                    )}
                  >
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[10px]", done ? "bg-emerald-800 text-white" : "bg-muted text-muted-foreground")}>
                      {done ? <CheckIcon className="size-3" /> : active ? <PlayIcon className="size-3 fill-current" /> : lessonIndex + 1}
                    </span>
                    <span className="line-clamp-2 flex-1 leading-snug">{lesson.title}</span>
                    {lesson.cells.length > 0 ? <span className="text-[10px] tabular-nums text-muted-foreground">{lesson.cells.filter((cell) => cell.status === "PASSED").length}/{lesson.cells.length}</span> : null}
                  </Link>}
                </li>
              );
            })}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
