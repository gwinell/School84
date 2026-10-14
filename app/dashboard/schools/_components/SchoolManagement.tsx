"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createOrganization,
  createOrganizationInvitation,
  removeOrganizationMember,
  updateOrganizationMemberRole,
} from "@/app/data/organization/actions";

type Member = { role: "OWNER" | "ADMIN" | "TEACHER" | "STUDENT"; createdAt: Date; user: { id: string; name: string; email: string } };
type School = { id: string; name: string; slug: string; logoUrl: string | null; primaryColor: string | null; role: "OWNER" | "ADMIN" | "TEACHER" | "STUDENT"; members: Member[] };

export function SchoolManagement({ schools }: { schools: School[] }) {
  const [isPending, startTransition] = useTransition();
  const [schoolName, setSchoolName] = useState("");
  const [emailBySchool, setEmailBySchool] = useState<Record<string, string>>({});
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  function createSchool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createOrganization({ name: schoolName });
      if (result.status === "error") { toast.error(result.message); return; }
      toast.success(result.message);
      setSchoolName("");
      window.location.reload();
    });
  }

  function invite(school: School) {
    const email = emailBySchool[school.id]?.trim();
    if (!email) return toast.error("Enter an email address");
    startTransition(async () => {
      const result = await createOrganizationInvitation({ organizationId: school.id, email, role: "STUDENT" });
      if (result.status === "error") { toast.error(result.message); return; }
      if (!result.data) { toast.error("Invitation could not be created"); return; }
      setInviteUrl(result.data.inviteUrl);
      setEmailBySchool((current) => ({ ...current, [school.id]: "" }));
      toast.success(result.message);
    });
  }

  function setRole(school: School, userId: string, role: string) {
    startTransition(async () => {
      const result = await updateOrganizationMemberRole({ organizationId: school.id, userId, role });
      if (result.status === "error") { toast.error(result.message); return; }
      toast.success(result.message);
      window.location.reload();
    });
  }

  function remove(school: School, userId: string) {
    startTransition(async () => {
      const result = await removeOrganizationMember({ organizationId: school.id, userId });
      if (result.status === "error") { toast.error(result.message); return; }
      toast.success(result.message);
      window.location.reload();
    });
  }

  return <div className="space-y-6">
    <form onSubmit={createSchool} className="flex flex-wrap gap-2 rounded-lg border p-4">
      <input value={schoolName} onChange={(event) => setSchoolName(event.target.value)} minLength={2} maxLength={100} required placeholder="School name" className="min-w-56 flex-1 rounded-md border bg-background px-3 py-2 text-sm" />
      <button disabled={isPending} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">Create school</button>
    </form>
    {inviteUrl ? <div className="break-all rounded-md border bg-muted p-3 text-sm">Share this one-time invitation link: <a className="underline" href={inviteUrl}>{inviteUrl}</a></div> : null}
    {schools.map((school) => <section key={school.id} className="space-y-4 rounded-lg border p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">{school.name}</h2><p className="text-sm text-muted-foreground">/{school.slug} · {school.role.toLowerCase()}</p></div>
        <div className="flex gap-2">
          <Link href={`/schools/${encodeURIComponent(school.slug)}/courses`} className="rounded-md border px-3 py-2 text-sm hover:bg-muted">Browse courses</Link>
          {school.role === "OWNER" || school.role === "ADMIN" ? <Link href="/teacher/courses/new" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">Create a course</Link> : null}
        </div>
      </header>
      {school.role === "OWNER" || school.role === "ADMIN" ? <form onSubmit={(event) => { event.preventDefault(); invite(school); }} className="flex flex-wrap gap-2">
        <input type="email" required value={emailBySchool[school.id] ?? ""} onChange={(event) => setEmailBySchool((current) => ({ ...current, [school.id]: event.target.value }))} placeholder="Invite student by email" className="min-w-56 flex-1 rounded-md border bg-background px-3 py-2 text-sm" />
        <button disabled={isPending} className="rounded-md border px-4 py-2 text-sm disabled:opacity-50">Create invitation</button>
      </form> : null}
      {school.members.length === 0 ? <p className="text-sm text-muted-foreground">You are a member of this school. Ask a school administrator for staff or enrollment changes.</p> : null}
      <div className="divide-y rounded-md border">
        {school.members.map((member) => <div key={member.user.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
          <div><div className="font-medium">{member.user.name || member.user.email}</div><div className="text-muted-foreground">{member.user.email}</div></div>
          {member.role === "OWNER" ? <span className="text-muted-foreground">Owner</span> : <div className="flex items-center gap-2">
            <select aria-label={`Role for ${member.user.email}`} value={member.role} disabled={isPending || (member.role === "ADMIN" && school.role !== "OWNER")} onChange={(event) => setRole(school, member.user.id, event.target.value)} className="rounded-md border bg-background px-2 py-1">
              {school.role === "OWNER" ? <option value="ADMIN">Admin</option> : null}<option value="TEACHER">Teacher</option><option value="STUDENT">Student</option>
            </select>
            <button type="button" disabled={isPending || (member.role === "ADMIN" && school.role !== "OWNER")} onClick={() => remove(school, member.user.id)} className="rounded-md border px-2 py-1 text-destructive disabled:opacity-50">Remove</button>
          </div>}
        </div>)}
      </div>
    </section>)}
  </div>;
}
