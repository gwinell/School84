import { adminGetCourse } from "@/app/data/admin/admin-get-course";
import { adminGetCategoryOptions } from "@/app/data/admin/admin-get-category-options";
import { adminGetCourseAssignments } from "@/app/data/admin/admin-get-course-assignments";
import { PageHeader } from "@/components/admin/page-header";
import { EditCourseForm } from "./_components/EditCourseForm";
import { EditCourseStructureForm } from "./_components/EditCourseStructureForm";
import { CourseAssignments } from "../_components/CourseAssignments";

type Params = Promise<{ courseId: string }>;

export default async function EditCoursePage({ params }: { params: Params }) {
  const { courseId } = await params;
  const [course, categoryOptions, assignments] = await Promise.all([
    adminGetCourse(courseId),
    adminGetCategoryOptions(),
    adminGetCourseAssignments(courseId),
  ]);

  return (
    <div>
      <PageHeader backHref="/admin/courses" title="Edit Course" />

      <div className="mx-auto max-w-5xl space-y-8">
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Настройки курса</h2>
          <EditCourseForm
            courseId={courseId}
            course={course}
            categoryOptions={categoryOptions}
          />
        </section>
        <EditCourseStructureForm
          key={course.courseChapters.map((chapter) => chapter.id + chapter.lessons.length).join(":")}
          course={course}
        />
        <CourseAssignments
          courseId={courseId}
          students={assignments.students}
          enrollments={assignments.enrollment}
        />
      </div>
    </div>
  );
}
