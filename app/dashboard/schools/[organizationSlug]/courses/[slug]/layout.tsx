import TenantLessonLayout from "@/app/dashboard/courses/[slug]/(lesson)/layout";

export default function TenantCourseLayout({ children, params }: { children: React.ReactNode; params: Promise<{ organizationSlug: string; slug: string }> }) {
  return <TenantLessonLayout params={params}>{children}</TenantLessonLayout>;
}
