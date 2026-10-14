import { getMyEnrolledCourses } from "@/app/data/user/get-my-enrolled-courses";
import { getMyLearningActivity } from "@/app/data/user/get-my-learning-activity";

import { EnrolledCoursesList } from "./_components/EnrolledCoursesList";
import { LearningActivityStats } from "./_components/LearningActivityStats";

export const metadata = {
  title: "My Learning | KnowSphere",
  description: "Pick up where you left off.",
};

export default async function DashboardPage() {
  const [courses, activity] = await Promise.all([getMyEnrolledCourses(), getMyLearningActivity()]);

  return (
    <div className="flex flex-1 flex-col space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">My Learning</h2>
        <p className="text-sm text-muted-foreground">
          Continue with the courses assigned to you by your administrator.
        </p>
      </div>

      <LearningActivityStats activity={activity} />

      <EnrolledCoursesList courses={courses} />
    </div>
  );
}
