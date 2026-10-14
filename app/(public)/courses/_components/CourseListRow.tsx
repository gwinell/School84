"use client";

import { Badge } from "@/components/ui/badge";
import { CourseImage } from "@/components/general/CourseImage";
import { RatingBadge } from "@/components/general/RatingBadge";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format-price";
import { ClockIcon, GraduationCapIcon, PlayCircleIcon } from "lucide-react";
import Link from "next/link";

import { type tCourse } from "@/app/data/course/get-all-courses";
import { publicCourseHref } from "@/lib/organization/course-links";

interface CourseListRowProps {
  course: tCourse;
  className?: string;
}

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "0 min";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

const levelStyles: Record<string, string> = {
  BEGINNER: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  INTERMEDIATE: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ADVANCED: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

export function CourseListRow({ course, className }: CourseListRowProps) {
  const levelLabel =
    course.level.charAt(0) + course.level.slice(1).toLowerCase();

  return (
    <Link
      href={publicCourseHref(course.organization.slug, course.slug)}
      className={cn(
        "group flex flex-col gap-4 overflow-hidden rounded-xl bg-card text-card-foreground border border-border shadow-xs transition-all duration-300 hover:shadow-lg sm:flex-row sm:items-stretch focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted sm:aspect-auto sm:h-auto sm:w-60 sm:shrink-0">
        <CourseImage
          imageUrl={course.imageUrl}
          alt={course.title}
          sizes="(max-width: 640px) 100vw, 240px"
          imageClassName="transition-transform duration-500 group-hover:scale-105"
        />
        <Badge
          className={cn(
            "absolute top-3 left-3 backdrop-blur-sm",
            levelStyles[course.level] ?? "bg-secondary text-secondary-foreground",
          )}
        >
          <GraduationCapIcon className="size-3" />
          {levelLabel}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5 sm:py-5 sm:pr-5">
        <div className="flex flex-1 flex-col gap-2">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug group-hover:text-primary transition-colors">
            {course.title}
          </h3>

          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {course.smallDesc}
          </p>

          {course.reviewCount > 0 ? (
            <div className="pt-0.5">
              <RatingBadge
                avg={course.reviewAvg}
                count={course.reviewCount}
              />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex items-center gap-1">
              <ClockIcon className="size-3.5" />
              {formatDuration(course.duration)}
            </span>
            <span className="flex items-center gap-1">
              <PlayCircleIcon className="size-3.5" />
              {course.lessonsCount}{" "}
              {course.lessonsCount === 1 ? "lesson" : "lessons"}
            </span>
          </div>

          <span className="text-base font-semibold text-foreground tabular-nums">
            {formatPrice(course.priceCents)}
          </span>
        </div>
      </div>
    </Link>
  );
}
