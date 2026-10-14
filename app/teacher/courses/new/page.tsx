import { redirect } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { adminGetCategoryOptions } from "@/app/data/admin/admin-get-category-options";
import { getMyManagedOrganizations } from "@/app/data/organization/actions";
import { CourseForm } from "@/app/admin/courses/_components/CourseForm";
import { createCourse } from "@/app/admin/courses/new/actions";

export default async function NewSchoolCoursePage() {
  const [organizations, categoryOptions] = await Promise.all([
    getMyManagedOrganizations(),
    adminGetCategoryOptions(),
  ]);
  if (organizations.length === 0) redirect("/dashboard/schools");

  return <>
    <PageHeader backHref="/teacher" title="Create course" />
    <CourseForm
      submitAction={createCourse}
      categoryOptions={categoryOptions}
      organizationOptions={organizations.map(({ organization }) => ({ id: organization.id, name: organization.name }))}
      submitLabel="Create course"
      pendingLabel="Creating..."
      successVerb="created"
      successDescription="The course has been created in the selected school."
      redirectTo="/teacher"
    />
  </>;
}
