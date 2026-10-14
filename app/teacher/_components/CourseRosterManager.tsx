"use client";

import { useState, useTransition } from "react";
import { CopyIcon, UserRoundPlusIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { tryCatch } from "@/hooks/try-catch";

export type RosterPerson = { id: string; name: string; email: string };
export type RosterEnrollment = {
  id: string;
  user: RosterPerson;
  status: "Active" | "Pending" | "Cancelled";
  accessMode: "ALL_AT_ONCE" | "SEQUENTIAL";
  dueAt?: Date | string | null;
};
export type RosterActionResult<T = unknown> = {
  status: "success" | "error";
  message?: string;
  data?: T;
};
export type EnrollmentOptions = {
  courseId: string;
  accessMode: "ALL_AT_ONCE" | "SEQUENTIAL";
  dueAt?: string | null;
};
export type BulkInvitationResult = {
  requested: number;
  invalidCount: number;
  sent: number;
  failed: number;
  emailDelivery: "sent" | "failed" | "partial" | "console";
  manualInvites: Array<{ email: string; inviteUrl: string }>;
};

/** Teacher-scoped invitation, bulk assignment, and enrollment management UI. */
export function CourseRosterManager({
  courseId,
  enrollments,
  onInvite,
  onBulkInvite,
  onCancel,
  onSetDueDate,
}: {
  courseId: string;
  enrollments: RosterEnrollment[];
  onInvite: (input: EnrollmentOptions & { email: string }) => Promise<RosterActionResult<{ inviteUrl: string | null; alreadyAssigned: boolean; emailDelivery?: "sent" | "failed" | "console" }>>;
  onBulkInvite: (input: EnrollmentOptions & { emails: string[] }) => Promise<RosterActionResult<BulkInvitationResult>>;
  onCancel: (input: { courseId: string; userId: string }) => Promise<RosterActionResult>;
  onSetDueDate: (input: { courseId: string; userId: string; dueAt: string | null }) => Promise<RosterActionResult>;
}) {
  const router = useRouter();
  const [accessMode, setAccessMode] = useState<EnrollmentOptions["accessMode"]>("ALL_AT_ONCE");
  const [dueAt, setDueAt] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [bulkEmails, setBulkEmails] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteDelivery, setInviteDelivery] = useState<"sent" | "failed" | "console" | null>(null);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkManualInvites, setBulkManualInvites] = useState<BulkInvitationResult["manualInvites"]>([]);
  const [isPending, startTransition] = useTransition();
  function options(): EnrollmentOptions {
    return {
      courseId,
      accessMode,
      dueAt: dueAt ? new Date(`${dueAt}T23:59:59`).toISOString() : null,
    };
  }

  function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    startTransition(async () => {
      const { data, error } = await tryCatch(onInvite({ ...options(), email }));
      if (error || !data || data.status === "error" || !data.data) {
        toast.error(data?.message ?? "Не удалось создать приглашение");
        return;
      }
      if (data.data.alreadyAssigned) {
        toast.info("У этого аккаунта уже есть доступ к курсу");
        return;
      }
      if (!data.data.inviteUrl) {
        setInviteEmail("");
        toast.success(data.message ?? "Курс назначен существующему ученику");
        router.refresh();
        return;
      }
      setInviteUrl(data.data.inviteUrl);
      setInviteDelivery(data.data.emailDelivery ?? null);
      setInviteEmail("");
      router.refresh();
      if (data.data.emailDelivery === "failed") {
        toast.warning("Письмо не отправлено. Ссылка на приглашение сохранена ниже.");
      } else if (data.data.emailDelivery === "sent") {
        toast.success("Приглашение отправлено на email");
      } else if (data.data.emailDelivery === "console") {
        toast.info("Локальный режим: письмо не отправлено, ссылка выведена в консоль");
      } else {
        toast.success(data.message ?? "Одноразовое приглашение готово");
      }
    });
  }

  function bulkInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const emails = [...new Set(bulkEmails.split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean))];
    if (!emails.length) return;
    startTransition(async () => {
      const { data, error } = await tryCatch(onBulkInvite({ ...options(), emails }));
      if (error || !data || data.status === "error" || !data.data) {
        toast.error(data?.message ?? "Не удалось создать приглашения");
        return;
      }
      const result = data.data;
      const message = data.message ?? "Запрос обработан. Приглашения отправлены или подготовлены для передачи.";
      toast.success(message);
      setBulkMessage(`${message} Адресов: ${result.requested}; отправлено: ${result.sent}; требуется передать вручную: ${result.manualInvites.length}; неверный формат: ${result.invalidCount}.`);
      setBulkManualInvites(result.manualInvites);
      setBulkEmails("");
      router.refresh();
    });
  }

  function cancelEnrollment(user: RosterPerson) {
    if (!window.confirm(`Снять доступ к курсу для ${user.name} (${user.email})?`)) return;
    startTransition(async () => {
      const { data, error } = await tryCatch(onCancel({ courseId, userId: user.id }));
      if (error || !data || data.status === "error") {
        toast.error(data?.message ?? "Не удалось снять доступ");
        return;
      }
      toast.success(data.message ?? "Доступ к курсу снят");
      router.refresh();
    });
  }

  function setEnrollmentDueDate(user: RosterPerson, date: string) {
    startTransition(async () => {
      const { data, error } = await tryCatch(onSetDueDate({
        courseId,
        userId: user.id,
        dueAt: date ? new Date(`${date}T23:59:59`).toISOString() : null,
      }));
      if (error || !data || data.status === "error") {
        toast.error(data?.message ?? "Не удалось изменить срок");
        return;
      }
      toast.success(data.message ?? "Срок обновлён");
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="course-roster-heading" className="space-y-5 rounded-xl border bg-card p-5">
      <div>
        <h2 id="course-roster-heading" className="text-xl font-semibold">Ученики курса</h2>
        <p className="mt-1 text-sm text-muted-foreground">Приглашайте новых учеников, назначайте курс списком и управляйте сроком доступа.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={invite} className="space-y-3 rounded-lg border bg-muted/20 p-4" aria-label="Пригласить ученика">
          <div><h3 className="font-medium">Одноразовое приглашение</h3><p className="mt-1 text-xs text-muted-foreground">В режиме Resend ссылка автоматически отправляется на email. Если доставка не удалась или включён локальный режим, ссылку можно скопировать и передать вручную.</p></div>
          <label className="block space-y-1.5 text-sm">
            <span>Email ученика</span>
            <Input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} disabled={isPending} placeholder="student@example.com" />
          </label>
          <EnrollmentOptionsFields accessMode={accessMode} dueAt={dueAt} disabled={isPending} setAccessMode={setAccessMode} setDueAt={setDueAt} />
          <Button type="submit" disabled={isPending}>
            <UserRoundPlusIcon />{isPending ? "Создаём…" : "Создать приглашение"}
          </Button>
          {inviteUrl ? (
            <div className="space-y-2 rounded-md border bg-background p-3">
              <p className="text-sm font-medium">
                {inviteDelivery === "sent"
                  ? "Письмо отправлено. При необходимости можно также скопировать ссылку. Она одноразовая и действует 7 дней."
                  : inviteDelivery === "failed"
                    ? "Письмо не отправлено. Скопируйте ссылку и передайте её вручную. Она одноразовая и действует 7 дней."
                    : inviteDelivery === "console"
                      ? "Локальный режим: письмо не отправлено. Ссылка выведена в консоль и действует 7 дней."
                      : "Скопируйте ссылку и передайте её ученику. Она одноразовая и действует 7 дней."}
              </p>
              <div className="flex gap-2">
                <Input aria-label="Ссылка приглашения" readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} />
                <Button type="button" variant="outline" aria-label="Скопировать ссылку приглашения" onClick={async () => {
                  try { await navigator.clipboard.writeText(inviteUrl); toast.success("Ссылка скопирована"); }
                  catch { toast.error("Не удалось скопировать ссылку"); }
                }}><CopyIcon /></Button>
              </div>
            </div>
          ) : null}
        </form>

        <form onSubmit={bulkInvite} className="space-y-3 rounded-lg border bg-muted/20 p-4" aria-label="Пригласить учеников списком">
          <h3 className="font-medium">Приглашения по списку</h3>
          <p className="text-xs text-muted-foreground">Каждому адресу будет отправлена персональная ссылка. Доступ к курсу появится после принятия приглашения.</p>
          <label className="block space-y-1.5 text-sm">
            <span>Email учеников (до 10 адресов)</span>
            <Textarea value={bulkEmails} onChange={(event) => setBulkEmails(event.target.value)} disabled={isPending} rows={4} placeholder="Можно вставить список, разделённый запятыми или строками" />
          </label>
          <EnrollmentOptionsFields accessMode={accessMode} dueAt={dueAt} disabled={isPending} setAccessMode={setAccessMode} setDueAt={setDueAt} />
          <Button type="submit" disabled={isPending || !bulkEmails.trim()}>{isPending ? "Отправляем…" : "Отправить приглашения"}</Button>
          {bulkMessage ? <p role="status" className="text-sm text-muted-foreground">{bulkMessage}</p> : null}
          {bulkManualInvites.length ? <div className="space-y-2" aria-label="Ссылки для передачи вручную">
            {bulkManualInvites.map(({ email, inviteUrl }) => <div key={email} className="flex gap-2">
              <Input aria-label={`Ссылка приглашения: ${email}`} readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} />
              <Button type="button" variant="outline" aria-label={`Скопировать приглашение: ${email}`} onClick={async () => {
                try { await navigator.clipboard.writeText(inviteUrl); toast.success("Ссылка скопирована"); }
                catch { toast.error("Не удалось скопировать ссылку"); }
              }}><CopyIcon /></Button>
            </div>)}
          </div> : null}
        </form>
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">Назначенные и приглашённые <Badge variant="secondary">{enrollments.filter((item) => item.status !== "Cancelled").length}</Badge></h3>
        {enrollments.filter((item) => item.status !== "Cancelled").map((enrollment) => (
          <div key={enrollment.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{enrollment.user.name || enrollment.user.email}</p>
              <p className="truncate text-xs text-muted-foreground">{enrollment.user.email}</p>
            </div>
            <Badge variant={enrollment.status === "Active" ? "default" : "secondary"}>{enrollment.status === "Active" ? "Есть доступ" : "Ожидает приглашения"}</Badge>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs">{enrollment.accessMode === "ALL_AT_ONCE" ? "Весь курс" : "По порядку"}</span>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Срок</span>
              <Input type="date" aria-label={`Срок прохождения: ${enrollment.user.email}`} disabled={isPending} value={enrollment.dueAt ? new Date(enrollment.dueAt).toISOString().slice(0, 10) : ""} onChange={(event) => setEnrollmentDueDate(enrollment.user, event.target.value)} className="h-8 w-36" />
            </label>
            <Button type="button" size="sm" variant="outline" disabled={isPending} aria-label={`Снять доступ: ${enrollment.user.email}`} onClick={() => cancelEnrollment(enrollment.user)}>
              <XIcon />Снять доступ
            </Button>
          </div>
        ))}
        {!enrollments.some((item) => item.status !== "Cancelled") ? <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Ученики пока не назначены.</p> : null}
      </div>
    </section>
  );
}

function EnrollmentOptionsFields({
  accessMode,
  dueAt,
  disabled,
  setAccessMode,
  setDueAt,
}: {
  accessMode: EnrollmentOptions["accessMode"];
  dueAt: string;
  disabled: boolean;
  setAccessMode: (mode: EnrollmentOptions["accessMode"]) => void;
  setDueAt: (date: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm">
        <span>Доступ к материалам</span>
        <select value={accessMode} onChange={(event) => setAccessMode(event.target.value as EnrollmentOptions["accessMode"])} disabled={disabled} className="h-10 w-full rounded-md border border-input bg-background px-3">
          <option value="ALL_AT_ONCE">Весь курс сразу</option>
          <option value="SEQUENTIAL">Последовательно</option>
        </select>
      </label>
      <label className="space-y-1.5 text-sm">
        <span>Срок прохождения (необязательно)</span>
        <Input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} disabled={disabled} />
      </label>
    </div>
  );
}
