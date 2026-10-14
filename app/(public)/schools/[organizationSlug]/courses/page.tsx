import PublicCoursesPage from "@/app/(public)/courses/page";

export default async function SchoolCoursesPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ q?: string; level?: string; sort?: string; page?: string }>;
}) {
  return <PublicCoursesPage params={params} searchParams={searchParams} />;
}
