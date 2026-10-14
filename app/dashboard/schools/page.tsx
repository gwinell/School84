import { getMyOrganizations, getOrganizationMembers } from "@/app/data/organization/actions";
import { SchoolManagement } from "./_components/SchoolManagement";

export default async function SchoolsPage() {
  const organizations = await getMyOrganizations();
  const schools = await Promise.all(organizations.map(async ({ organization, role }) => ({
    ...organization,
    role,
    members: role === "OWNER" || role === "ADMIN" ? await getOrganizationMembers(organization.id) : [],
  })));
  return <div className="mx-auto w-full max-w-5xl space-y-6">
    <div><h1 className="text-2xl font-bold">Your schools</h1><p className="text-sm text-muted-foreground">Create a school or manage its members and courses.</p></div>
    <SchoolManagement schools={schools} />
  </div>;
}
