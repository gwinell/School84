export function publicCourseHref(organizationSlug: string, courseSlug: string) {
  return `/schools/${encodeURIComponent(organizationSlug)}/courses/${encodeURIComponent(courseSlug)}`;
}

export function dashboardCourseHref(organizationSlug: string, courseSlug: string, lessonId?: string) {
  const base = `/dashboard/schools/${encodeURIComponent(organizationSlug)}/courses/${encodeURIComponent(courseSlug)}`;
  return lessonId ? `${base}/${encodeURIComponent(lessonId)}` : base;
}
