import LessonPlayerPage from "@/app/dashboard/courses/[slug]/(lesson)/[lessonId]/page";

export default function TenantLessonPage({ params, searchParams }: {
  params: Promise<{ organizationSlug: string; slug: string; lessonId: string }>;
  searchParams: Promise<{ cellId?: string }>;
}) {
  return <LessonPlayerPage params={params} searchParams={searchParams} />;
}
