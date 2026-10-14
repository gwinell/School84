import Link from "next/link";
import { ArrowRightIcon, BookOpenIcon, ClockIcon } from "lucide-react";

import { CourseImage } from "@/components/general/CourseImage";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { tEnrolledCourse } from "@/app/data/user/get-my-enrolled-courses";
import { getLearningLocationHref } from "@/app/dashboard/_lib/learning-links";

interface EnrolledCourseCardProps {
  course: tEnrolledCourse;
}

function formatLevel(level: tEnrolledCourse["level"]): string {
  return ({ BEGINNER: "Начальный", INTERMEDIATE: "Средний", ADVANCED: "Продвинутый" } as const)[level];
}

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "0 мин";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} мин`;
  if (mins === 0) return `${hours} ч`;
  return `${hours} ч ${mins} мин`;
}

function russianCount(value: number, forms: [string, string, string]): string {
  const absolute = Math.abs(value);
  const lastTwo = absolute % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
  const last = absolute % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

export function EnrolledCourseCard({ course }: EnrolledCourseCardProps) {
  const continueHref = getLearningLocationHref({
    slug: course.slug,
    organizationSlug: course.organizationSlug,
    lessonId: course.resumeLessonId,
    cellId: (course as typeof course & { resumeCellId?: string | null }).resumeCellId,
  });
  const hasStarted = course.hasStarted;

  const lessonWord = russianCount(course.lessonsCount, ["урок", "урока", "уроков"]);
  const chapterWord = russianCount(course.chaptersCount, ["раздел", "раздела", "разделов"]);

  return (
    <Card className="group flex flex-col overflow-hidden pt-0">
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        <CourseImage
          imageUrl={course.imageUrl}
          alt={course.title}
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
          imageClassName="transition-transform duration-500 group-hover:scale-105"
        />
      </div>

      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{formatLevel(course.level)}</Badge>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <BookOpenIcon className="size-3" aria-hidden />
              {course.chaptersCount} {chapterWord}
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <ClockIcon className="size-3" aria-hidden />
              {formatDuration(course.duration)}
            </span>
          </div>

          <h3 className="line-clamp-2 text-lg font-semibold leading-tight tracking-tight">
            <Link
              href={getLearningLocationHref({ slug: course.slug, organizationSlug: course.organizationSlug })}
              className="transition-colors hover:text-primary hover:underline underline-offset-4"
            >
              {course.title}
            </Link>
          </h3>
          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {course.smallDesc}
          </p>
        </div>

        <div className="mt-auto flex items-center justify-between border-t pt-4">
          <span className="text-xs text-muted-foreground tabular-nums">
              {course.completedCount} из {course.lessonsCount} {lessonWord}
          </span>
          <Link
            href={continueHref}
            className={buttonVariants({ size: "sm" })}
          >
            {hasStarted ? "Продолжить" : "Начать курс"}
            <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
