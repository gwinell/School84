"use client";

import {
  CourseForm,
  type CourseFormProps,
} from "../../../_components/CourseForm";
import { updateCourse } from "../actions";
import type { CourseSchemaType } from "@/lib/zodSchemas";
import type { tAdminGetCourse } from "@/app/data/admin/admin-get-course";
import type { tCategoryOption } from "@/app/data/admin/admin-get-category-options";

type EditCourseFormProps = {
  courseId: string;
  course: tAdminGetCourse;
  categoryOptions: tCategoryOption[];
  courseHrefBase?: string;
};

export function EditCourseForm({
  courseId,
  course,
  categoryOptions,
  courseHrefBase = `/admin/courses/${courseId}`,
}: EditCourseFormProps) {
  const submitAction: CourseFormProps["submitAction"] = (data) =>
    updateCourse(courseId, data);

  return (
    <CourseForm
      initialValues={{
        title: course.title,
        description: course.description ?? "",
        smallDesc: course.smallDesc,
        fileKey: course.fileKey ?? "",
        priceCents: course.priceCents,
        duration: course.duration,
        level: course.level as CourseSchemaType["level"],
        status: course.status as CourseSchemaType["status"],
        slug: course.slug,
        categories: course.categories.map((c) => c.name),
      }}
      categoryOptions={categoryOptions}
      submitAction={submitAction}
      submitLabel="Save Changes"
      pendingLabel="Saving..."
      successVerb="updated"
      successDescription="Your course has been updated."
      redirectTo={`${courseHrefBase}/edit`}
      showReset={false}
      existingImageUrl={course.imageUrl}
      existingImageKey={course.fileKey}
      uploadCourseId={courseId}
    />
  );
}
