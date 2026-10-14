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

interface CourseCardProps {
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

export function CourseCard({ course, className }: CourseCardProps) {
  const levelLabel =
    course.level.charAt(0) + course.level.slice(1).toLowerCase();

  return (
    <Link
      href={publicCourseHref(course.organization.slug, course.slug)}
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl bg-card text-card-foreground border border-border shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        <CourseImage
          imageUrl={course.imageUrl}
          alt={course.title}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
          imageClassName="transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/30 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        <Badge
          className={cn(
            "absolute top-3 left-3 backdrop-blur-sm",
            levelStyles[course.level] ??
              "bg-secondary text-secondary-foreground",
          )}
        >
          <GraduationCapIcon className="size-3" />
          {levelLabel}
        </Badge>

        <div className="absolute top-3 right-3">
          <Badge className="bg-background/90 text-foreground backdrop-blur-sm tabular-nums">
            {formatPrice(course.priceCents)}
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug group-hover:text-primary transition-colors">
          {course.title}
        </h3>

        <p className="line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">
          {course.smallDesc}
        </p>

        {course.reviewCount > 0 ? (
          <div className="flex">
            <RatingBadge avg={course.reviewAvg} count={course.reviewCount} />
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
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
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {formatPrice(course.priceCents)}
          </span>
        </div>
      </div>
    </Link>
  );
}
