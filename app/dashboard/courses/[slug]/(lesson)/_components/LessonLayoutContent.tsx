import type { ReactNode } from "react";

import { getCourseForLearning } from "@/app/data/user/get-course-for-learning";

import { PlayerHeader } from "./PlayerHeader";

interface LessonLayoutContentProps {
  children: ReactNode;
  slug: string;
}

export async function LessonLayoutContent({
  children,
  slug,
}: LessonLayoutContentProps) {
  const course = await getCourseForLearning({ slug });

  return (
    <PlayerHeader
      courseSlug={course.slug}
      courseTitle={course.title}
      chapters={course.courseChapters}
    >
      {children}
    </PlayerHeader>
  );
}
