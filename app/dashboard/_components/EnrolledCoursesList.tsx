import { BookOpenIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/general/EmptyState";
import type { tEnrolledCourse } from "@/app/data/user/get-my-enrolled-courses";

import { EnrolledCourseCard } from "./EnrolledCourseCard";

interface EnrolledCoursesListProps {
  courses: tEnrolledCourse[];
}

export function EnrolledCoursesList({ courses }: EnrolledCoursesListProps) {
  if (courses.length === 0) {
    return (
      <EmptyState
        fill
        icon={BookOpenIcon}
        title="No courses yet"
        description="Import a prepared course package to start learning on your own, or join a school to access its courses."
        action={
          <Link href="/dashboard/import" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90">
            Import a course
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground tabular-nums">
            {courses.length}
          </span>{" "}
          {courses.length === 1 ? "course" : "courses"} enrolled
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {courses.map((course) => (
          <EnrolledCourseCard key={course.enrollmentId} course={course} />
        ))}
      </div>
    </div>
  );
}
