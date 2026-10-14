import { BookOpenIcon } from "lucide-react";

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
        description="Your administrator will assign courses to your account."
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
