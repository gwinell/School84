import { VideoIcon } from "lucide-react";

import { EmptyState } from "@/components/general/EmptyState";
import { getCourseForLearning } from "@/app/data/user/get-course-for-learning";

import { CourseOverviewHeader } from "./_components/CourseOverviewHeader";
import { DashboardCourseChapters } from "./_components/DashboardCourseChapters";

interface PageParams {
  params: Promise<{ slug: string }>;
}

export default async function CourseLearnOverviewPage({ params }: PageParams) {
  const { slug } = await params;
  const course = await getCourseForLearning({ slug });

  const totalLessons = course.courseChapters.reduce((count, chapter) => count + chapter.lessons.length, 0);

  return (
    <div className="flex flex-1 flex-col space-y-6">
      <CourseOverviewHeader
        slug={course.slug}
        title={course.title}
        smallDesc={course.smallDesc}
        imageUrl={course.imageUrl}
        resumeLessonId={course.resumeLessonId}
        resumeCellId={course.resumeCellId}
        hasStarted={course.resumeHasStarted}
      />

      {totalLessons === 0 ? (
        <EmptyState
          fill
          icon={VideoIcon}
          title="Course content coming soon"
          description="The instructor is still building this course. Check back later."
        />
      ) : (
        <DashboardCourseChapters
          chapters={course.courseChapters}
          courseSlug={course.slug}
        />
      )}
    </div>
  );
}
