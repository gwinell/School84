import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { adminGetCourse } from "@/app/data/admin/admin-get-course";
import { adminGetCategoryOptions } from "@/app/data/admin/admin-get-category-options";
import { requireCourseTeacher } from "@/app/data/teacher/require-course-teacher";
import { EditCourseForm } from "@/app/admin/courses/[courseId]/edit/_components/EditCourseForm";
import { EditCourseStructureForm } from "@/app/admin/courses/[courseId]/edit/_components/EditCourseStructureForm";

export default async function TeacherEditCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  await requireCourseTeacher(courseId);
  const [course, categoryOptions] = await Promise.all([adminGetCourse(courseId), adminGetCategoryOptions()]);
  const courseHrefBase = `/teacher/courses/${courseId}`;
  return <div className="space-y-8">
    <Link href={courseHrefBase} className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm hover:bg-muted"><ArrowLeftIcon className="size-4" />К курсу и ученикам</Link>
    <header><h1 className="text-3xl font-bold tracking-tight">Редактирование курса</h1><p className="mt-1 text-sm text-muted-foreground">{course.title}</p></header>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Настройки курса</h2><EditCourseForm courseId={courseId} course={course} categoryOptions={categoryOptions} courseHrefBase={courseHrefBase} /></section>
    <EditCourseStructureForm key={course.courseChapters.map((chapter) => chapter.id + chapter.lessons.length).join(":")} course={course} courseHrefBase={courseHrefBase} />
  </div>;
}
