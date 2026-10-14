import { dashboardCourseHref } from "@/lib/organization/course-links";

/** Build the learner URL for a saved lesson/cell position. */
export function getLearningLocationHref({
  slug,
  organizationSlug,
  lessonId,
  cellId,
}: {
  slug: string;
  organizationSlug?: string;
  lessonId?: string | null;
  cellId?: string | null;
}): string {
  const courseHref = organizationSlug
    ? dashboardCourseHref(organizationSlug, slug)
    : `/dashboard/courses/${encodeURIComponent(slug)}`;
  if (!lessonId) return courseHref;

  const lessonHref = `${courseHref}/${encodeURIComponent(lessonId)}`;
  return cellId ? `${lessonHref}?cellId=${encodeURIComponent(cellId)}` : lessonHref;
}
