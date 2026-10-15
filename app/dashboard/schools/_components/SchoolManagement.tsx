"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowUpRightIcon, CopyIcon, PlusIcon, UserPlusIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createOrganization,
  createOrganizationInvitation,
  removeOrganizationMember,
  updateOrganizationMemberRole,
} from "@/app/data/organization/actions";
import * as organizationActions from "@/app/data/organization/actions";

type OrganizationRole = "OWNER" | "ADMIN" | "TEACHER" | "STUDENT";
type InviteRole = Exclude<OrganizationRole, "OWNER">;
type Member = { role: OrganizationRole; createdAt: Date; user: { id: string; name: string; email: string } };
type School = { id: string; name: string; slug: string; logoUrl: string | null; primaryColor: string | null; role: OrganizationRole; members: Member[] };
type SchoolBrand = Pick<School, "name" | "slug" | "logoUrl" | "primaryColor">;
type InviteShare = { schoolName: string; email: string; role: InviteRole; url: string };
const updateOrganizationBranding = (organizationActions as unknown as {
  updateOrganizationBranding(input: { organizationId: string } & SchoolBrand): Promise<{ status: "success" | "error"; message?: string }>;
}).updateOrganizationBranding;

const ROLE_LABEL: Record<OrganizationRole, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  TEACHER: "Преподаватель",
  STUDENT: "Ученик",
};

export function SchoolManagement({ schools }: { schools: School[] }) {
  const [isPending, startTransition] = useTransition();
  const [schoolName, setSchoolName] = useState("");
  const [emailBySchool, setEmailBySchool] = useState<Record<string, string>>({});
  const [roleBySchool, setRoleBySchool] = useState<Record<string, InviteRole>>({});
  const [inviteShare, setInviteShare] = useState<InviteShare | null>(null);
  const [brandBySchool, setBrandBySchool] = useState<Record<string, SchoolBrand>>({});
  const [brandingDraftBySchool, setBrandingDraftBySchool] = useState<Record<string, SchoolBrand>>({});

  function getBrand(school: School): SchoolBrand {
    return brandBySchool[school.id] ?? school;
  }

  function getBrandDraft(school: School): SchoolBrand {
    return brandingDraftBySchool[school.id] ?? getBrand(school);
  }

  function editBrand(school: School, field: keyof SchoolBrand, value: string) {
    setBrandingDraftBySchool((current) => ({
      ...current,
      [school.id]: { ...getBrandDraft(school), [field]: value || (field === "logoUrl" || field === "primaryColor" ? null : "") },
    }));
  }

  function saveBranding(event: React.FormEvent<HTMLFormElement>, school: School) {
    event.preventDefault();
    const draft = getBrandDraft(school);
    const name = draft.name.trim();
    const slug = draft.slug.trim().toLowerCase();
    const logoUrl = draft.logoUrl?.trim() || null;
    const primaryColor = draft.primaryColor?.trim() || null;
    if (name.length < 2 || name.length > 100) return toast.error("Название должно содержать от 2 до 100 символов");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return toast.error("Адрес школы должен содержать латинские буквы, цифры и дефисы");
    if (logoUrl) {
      try {
        if (new URL(logoUrl).protocol !== "https:") return toast.error("Ссылка на логотип должна начинаться с HTTPS");
      } catch {
        return toast.error("Укажите корректную HTTPS-ссылку на логотип");
      }
    }
    if (primaryColor && !/^#[0-9a-fA-F]{6}$/.test(primaryColor)) return toast.error("Цвет должен быть в формате #RRGGBB");

    const previous = getBrand(school);
    const updated: SchoolBrand = { name, slug, logoUrl, primaryColor };
    setBrandBySchool((current) => ({ ...current, [school.id]: updated }));
    setBrandingDraftBySchool((current) => ({ ...current, [school.id]: updated }));
    startTransition(async () => {
      try {
        const result = await updateOrganizationBranding({ organizationId: school.id, ...updated });
        if (result.status === "error") {
          setBrandBySchool((current) => ({ ...current, [school.id]: previous }));
          toast.error(result.message);
          return;
        }
        toast.success("Оформление школы сохранено");
      } catch {
        setBrandBySchool((current) => ({ ...current, [school.id]: previous }));
        toast.error("Не удалось сохранить оформление школы. Проверьте соединение и попробуйте снова.");
      }
    });
  }

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
    const email = emailBySchool[school.id]?.trim().toLowerCase();
    if (!email) return toast.error("Укажите email приглашённого");
    const role = roleBySchool[school.id] ?? "STUDENT";
    startTransition(async () => {
      const result = await createOrganizationInvitation({ organizationId: school.id, email, role });
      if (result.status === "error") { toast.error(result.message); return; }
      if (!result.data) { toast.error("Не удалось подготовить приглашение"); return; }
      setInviteShare({ schoolName: school.name, email, role, url: result.data.inviteUrl });
      setEmailBySchool((current) => ({ ...current, [school.id]: "" }));
      toast.success("Одноразовая ссылка готова. Передайте её приглашённому.");
    });
  }

  async function copyInviteLink() {
    if (!inviteShare) return;
    try {
      await navigator.clipboard.writeText(inviteShare.url);
      toast.success("Ссылка скопирована");
    } catch {
      toast.error("Не удалось скопировать ссылку. Выделите её и скопируйте вручную.");
    }
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

  return (
    <div className="space-y-6">
      <form onSubmit={createSchool} className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <label className="min-w-56 flex-1 space-y-1.5 text-sm font-medium" htmlFor="new-school-name">
          Создать школу
          <Input id="new-school-name" value={schoolName} onChange={(event) => setSchoolName(event.target.value)} minLength={2} maxLength={100} required placeholder="Название школы" />
        </label>
        <Button type="submit" disabled={isPending}><PlusIcon aria-hidden />Создать</Button>
      </form>

      {inviteShare ? (
        <section aria-live="polite" className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div>
            <h2 className="font-semibold">Приглашение для школы «{inviteShare.schoolName}» готово</h2>
            <p className="text-sm text-muted-foreground">{inviteShare.email} · роль: {ROLE_LABEL[inviteShare.role]}. Ссылка одноразовая и действует 7 дней; отправьте её получателю.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input aria-label="Ссылка приглашения" readOnly value={inviteShare.url} className="min-w-56 flex-1" onFocus={(event) => event.currentTarget.select()} />
            <Button type="button" variant="outline" onClick={copyInviteLink}><CopyIcon aria-hidden />Копировать ссылку</Button>
          </div>
        </section>
      ) : null}

      {schools.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Пока нет школ, в которых вы состоите. Создайте школу или примите приглашение по ссылке.</p> : null}

      {schools.map((school) => {
        const canManage = school.role === "OWNER" || school.role === "ADMIN";
        const isOwner = school.role === "OWNER";
        const brand = getBrand(school);
        const brandDraft = getBrandDraft(school);
        return (
          <section key={school.id} className="space-y-4 rounded-lg border p-4">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <Brand brand={brand} nameClassName="text-lg" markClassName="size-8" />
                <p className="text-sm text-muted-foreground">/{brand.slug} · {ROLE_LABEL[school.role]}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button nativeButton={false} variant="outline" render={<Link href={`/schools/${encodeURIComponent(brand.slug)}/courses`} />}>
                  Курсы школы<ArrowUpRightIcon aria-hidden />
                </Button>
                {canManage ? <Button nativeButton={false} variant="outline" render={<Link href="/teacher/courses/new" />}>Создать курс</Button> : null}
              </div>
            </header>

            {canManage ? (
              <form onSubmit={(event) => saveBranding(event, school)} className="space-y-3 rounded-md border bg-background p-3">
                <h3 className="font-medium">Оформление и адрес школы</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1.5 text-sm font-medium" htmlFor={`school-name-${school.id}`}>Название
                    <Input id={`school-name-${school.id}`} required minLength={2} maxLength={100} value={brandDraft.name} onChange={(event) => editBrand(school, "name", event.target.value)} />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium" htmlFor={`school-slug-${school.id}`}>Публичный адрес
                    <Input id={`school-slug-${school.id}`} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={brandDraft.slug} onChange={(event) => editBrand(school, "slug", event.target.value)} />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium" htmlFor={`school-logo-${school.id}`}>HTTPS-ссылка на логотип
                    <Input id={`school-logo-${school.id}`} type="url" placeholder="https://example.org/logo.png" value={brandDraft.logoUrl ?? ""} onChange={(event) => editBrand(school, "logoUrl", event.target.value)} />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium" htmlFor={`school-color-${school.id}`}>Основной цвет (#RRGGBB)
                    <div className="flex gap-2"><Input id={`school-color-${school.id}`} type="text" pattern="#[0-9a-fA-F]{6}" placeholder="#3157A4" value={brandDraft.primaryColor ?? ""} onChange={(event) => editBrand(school, "primaryColor", event.target.value)} /><span aria-hidden="true" className="size-9 shrink-0 rounded-md border" style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(brandDraft.primaryColor ?? "") ? brandDraft.primaryColor! : "transparent" }} /></div>
                  </label>
                </div>
                <Button type="submit" disabled={isPending}>Сохранить оформление</Button>
              </form>
            ) : null}

            {canManage ? (
              <form onSubmit={(event) => { event.preventDefault(); invite(school); }} className="flex flex-wrap items-end gap-3 rounded-md bg-muted/40 p-3">
                <label className="min-w-56 flex-1 space-y-1.5 text-sm font-medium" htmlFor={`invite-email-${school.id}`}>
                  Пригласить участника
                  <Input id={`invite-email-${school.id}`} type="email" required value={emailBySchool[school.id] ?? ""} onChange={(event) => setEmailBySchool((current) => ({ ...current, [school.id]: event.target.value }))} placeholder="name@example.com" />
                </label>
                <label className="space-y-1.5 text-sm font-medium" htmlFor={`invite-role-${school.id}`}>
                  Роль
                  <select id={`invite-role-${school.id}`} value={roleBySchool[school.id] ?? "STUDENT"} onChange={(event) => setRoleBySchool((current) => ({ ...current, [school.id]: event.target.value as InviteRole }))} className="block h-9 min-w-40 rounded-md border bg-background px-3 text-sm">
                    <option value="STUDENT">Ученик</option>
                    <option value="TEACHER">Преподаватель</option>
                    {isOwner ? <option value="ADMIN">Администратор</option> : null}
                  </select>
                </label>
                <Button type="submit" disabled={isPending}><UserPlusIcon aria-hidden />Создать ссылку</Button>
              </form>
            ) : null}

            {!canManage ? <p className="text-sm text-muted-foreground">Для изменения роли или доступа обратитесь к администратору школы.</p> : null}
            {school.members.length ? (
              <div className="divide-y rounded-md border" aria-label={`Участники школы ${school.name}`}>
                {school.members.map((member) => (
                  <div key={member.user.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                    <div><div className="font-medium">{member.user.name || member.user.email}</div><div className="text-muted-foreground">{member.user.email}</div></div>
                    {member.role === "OWNER" ? <span className="text-muted-foreground">Владелец</span> : canManage ? (
                      <div className="flex items-center gap-2">
                        <label className="sr-only" htmlFor={`member-role-${school.id}-${member.user.id}`}>Роль для {member.user.email}</label>
                        <select id={`member-role-${school.id}-${member.user.id}`} value={member.role} disabled={isPending || (member.role === "ADMIN" && !isOwner)} onChange={(event) => setRole(school, member.user.id, event.target.value)} className="rounded-md border bg-background px-2 py-1">
                          {isOwner ? <option value="ADMIN">Администратор</option> : null}<option value="TEACHER">Преподаватель</option><option value="STUDENT">Ученик</option>
                        </select>
                        <Button type="button" variant="outline" size="sm" disabled={isPending || (member.role === "ADMIN" && !isOwner)} onClick={() => remove(school, member.user.id)} aria-label={`Удалить участника ${member.user.email}`} className="text-destructive">Удалить</Button>
                      </div>
                    ) : <span>{ROLE_LABEL[member.role]}</span>}
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
