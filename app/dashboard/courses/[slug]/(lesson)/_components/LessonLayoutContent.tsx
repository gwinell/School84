import type { ReactNode } from "react";

import { getCourseForLearning } from "@/app/data/user/get-course-for-learning";

import { PlayerHeader } from "./PlayerHeader";

interface LessonLayoutContentProps {
  children: ReactNode;
  slug: string;
  organizationSlug?: string;
}

export async function LessonLayoutContent({
  children,
  slug,
  organizationSlug,
}: LessonLayoutContentProps) {
  const course = await getCourseForLearning({ slug, organizationSlug });

  return (
    <PlayerHeader
      courseSlug={course.slug}
      organizationSlug={course.organization.slug}
      courseTitle={course.title}
      chapters={course.courseChapters}
    >
      {children}
    </PlayerHeader>
  );
}
