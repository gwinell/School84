"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BookOpenIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  PlayCircleIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { dashboardCourseHref } from "@/lib/organization/course-links";

import type { tCourseForLearningChapter } from "@/app/data/user/get-course-for-learning";

interface DashboardCourseChaptersProps {
  chapters: tCourseForLearningChapter[];
  courseSlug: string;
  organizationSlug: string;
}

export function DashboardCourseChapters({
  chapters,
  courseSlug,
  organizationSlug,
}: DashboardCourseChaptersProps) {
  const totalLessons = chapters.reduce(
    (acc, chapter) => acc + chapter.lessons.length,
    0,
  );

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
          Curriculum
        </h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"} ·{" "}
          {totalLessons} {totalLessons === 1 ? "lesson" : "lessons"}
        </p>
      </header>

      <div className="space-y-4">
        {chapters.map((chapter) => (
          <ChapterSection
            key={chapter.id}
            chapter={chapter}
            courseSlug={courseSlug}
            organizationSlug={organizationSlug}
          />
        ))}
      </div>
    </section>
  );
}

interface ChapterSectionProps {
  chapter: tCourseForLearningChapter;
  courseSlug: string;
  organizationSlug: string;
}

function ChapterSection({ chapter, courseSlug, organizationSlug }: ChapterSectionProps) {
  const [open, setOpen] = useState(true);
  const lessonCount = chapter.lessons.length;
  const lessonWord = lessonCount === 1 ? "lesson" : "lessons";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40">
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-300",
            !open && "-rotate-90",
          )}
          aria-hidden
        />
        <BookOpenIcon
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <span className="flex-1 font-medium text-sm sm:text-base">
          {chapter.title}
        </span>
        <Badge variant="secondary" className="shrink-0">
          {lessonCount} {lessonWord}
        </Badge>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-t border-border px-2 py-2 sm:px-3">
          {lessonCount === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              No lessons in this chapter yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {chapter.lessons.map((lesson, idx) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  index={idx}
                  href={dashboardCourseHref(organizationSlug, courseSlug, lesson.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface LessonRowProps {
  lesson: tCourseForLearningChapter["lessons"][number];
  index: number;
  href: string;
}

function LessonRow({ lesson, index, href }: LessonRowProps) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-muted/60"
      >
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground tabular-nums">
          {index + 1}
        </span>
        <div className="flex flex-1 flex-col">
          <span className="text-sm font-medium leading-snug">
            {lesson.title}
          </span>
          <span className="text-xs text-muted-foreground">
            Lesson {index + 1}
          </span>
        </div>
        {lesson.completed ? (
          <CheckCircle2Icon
            className="mt-0.5 size-4 shrink-0 text-primary"
            aria-hidden
          />
        ) : (
          <PlayCircleIcon
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        )}
      </Link>
    </li>
  );
}
