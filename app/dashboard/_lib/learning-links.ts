/** Build the learner URL for a saved lesson/cell position. */
export function getLearningLocationHref({
  slug,
  lessonId,
  cellId,
}: {
  slug: string;
  lessonId?: string | null;
  cellId?: string | null;
}): string {
  const courseHref = `/dashboard/courses/${encodeURIComponent(slug)}`;
  if (!lessonId) return courseHref;

  const lessonHref = `${courseHref}/${encodeURIComponent(lessonId)}`;
  return cellId ? `${lessonHref}?cellId=${encodeURIComponent(cellId)}` : lessonHref;
}
