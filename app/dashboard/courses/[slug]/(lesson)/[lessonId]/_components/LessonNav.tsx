import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { dashboardCourseHref } from "@/lib/organization/course-links";

interface LessonNavProps {
  courseSlug: string;
  organizationSlug: string;
  prevLessonId: string | null;
  nextLessonId: string | null;
}

export function LessonNav({
  courseSlug,
  organizationSlug,
  prevLessonId,
  nextLessonId,
}: LessonNavProps) {
  return (
    <div className="flex items-center gap-2">
      {prevLessonId ? (
        <Link
          href={dashboardCourseHref(organizationSlug, courseSlug, prevLessonId)}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          <ChevronLeftIcon className="size-4" />
          Previous
        </Link>
      ) : (
        <button
          type="button"
          disabled
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          <ChevronLeftIcon className="size-4" />
          Previous
        </button>
      )}

      {nextLessonId ? (
        <Link
          href={dashboardCourseHref(organizationSlug, courseSlug, nextLessonId)}
          className={buttonVariants({ size: "lg" })}
        >
          Next
          <ChevronRightIcon className="size-4" />
        </Link>
      ) : (
        <button
          type="button"
          disabled
          className={buttonVariants({ size: "lg" })}
        >
          Next
          <ChevronRightIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
