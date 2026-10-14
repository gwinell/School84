import CourseLearnOverviewPage from "@/app/dashboard/courses/[slug]/page";

export default function TenantCourseOverview({ params }: { params: Promise<{ organizationSlug: string; slug: string }> }) {
  return <CourseLearnOverviewPage params={params} />;
}
