import Link from "next/link";
import {
  ChevronRightIcon,
  ClockIcon,
  GraduationCapIcon,
} from "lucide-react";

import { CourseImage } from "@/components/general/CourseImage";
import { EmptyState } from "@/components/general/EmptyState";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { tAnalyticsRecentCourse } from "@/app/data/admin/admin-get-analytics";

interface RecentCoursesProps {
  courses: tAnalyticsRecentCourse[];
}

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "0 min";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

function formatLevel(level: tAnalyticsRecentCourse["level"]): string {
  return level.charAt(0) + level.slice(1).toLowerCase();
}

function formatStatus(status: tAnalyticsRecentCourse["status"]): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatRelative(date: Date): string {
  const now = Date.now();
  const then = date.getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function RecentCourses({ courses }: RecentCoursesProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle>Recent courses</CardTitle>
          <CardDescription>
            The five most recently created courses.
          </CardDescription>
        </div>
        <Link
          href="/admin/courses"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          View all
          <ChevronRightIcon className="size-4" />
        </Link>
      </CardHeader>
      <CardContent>
        {courses.length === 0 ? (
          <EmptyState
            icon={GraduationCapIcon}
            title="No courses yet"
            description="Create your first course to start tracking analytics."
            action={
              <Link
                href="/admin/courses/new"
                className={buttonVariants({ size: "sm" })}
              >
                Create course
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {courses.map((course) => (
              <li key={course.id}>
                <Link
                  href={`/admin/courses/${course.id}`}
                  className="group flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                    <CourseImage
                      imageUrl={course.imageUrl}
                      alt={course.title}
                      sizes="48px"
                      compact
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="line-clamp-1 text-sm font-medium leading-tight group-hover:underline underline-offset-4">
                      {course.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                        {formatStatus(course.status)}
                      </Badge>
                      <span className="inline-flex items-center gap-1">
                        <GraduationCapIcon className="size-3" aria-hidden />
                        {formatLevel(course.level)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ClockIcon className="size-3" aria-hidden />
                        {formatDuration(course.duration)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatRelative(course.createdAt)}
                    </span>
                    <ChevronRightIcon
                      className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
