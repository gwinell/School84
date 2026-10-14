"use client";

import { useTransition } from "react";
import { XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tryCatch } from "@/hooks/try-catch";
import type { RosterActionResult } from "./CourseRosterManager";

export type CourseInvitation = { id: string; email: string; accessMode: string; dueAt: Date | string | null; expiresAt: Date | string; acceptedAt: Date | string | null; createdAt: Date | string; isExpired?: boolean };

export function CourseInvitationsList({
  courseId,
  invitations,
  onCancel,
}: {
  courseId: string;
  invitations: CourseInvitation[];
  onCancel: (input: { courseId: string; invitationId: string }) => Promise<RosterActionResult>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const pending = invitations.filter((invitation) => !invitation.acceptedAt && !invitation.isExpired);
  if (!invitations.length) return null;

  function cancel(invitation: CourseInvitation) {
    if (!window.confirm(`Отменить приглашение для ${invitation.email}?`)) return;
    startTransition(async () => {
      const { data, error } = await tryCatch(onCancel({ courseId, invitationId: invitation.id }));
      if (error || !data || data.status === "error") {
        toast.error(data?.message ?? "Не удалось отменить приглашение");
        return;
      }
      toast.success(data.message ?? "Приглашение отменено");
      router.refresh();
    });
  }

  return <section aria-labelledby="course-invitations-heading" className="space-y-3 rounded-xl border bg-card p-5">
    <div><h2 id="course-invitations-heading" className="text-lg font-semibold">Ссылки-приглашения</h2><p className="mt-1 text-sm text-muted-foreground">Ссылка показывается при создании один раз. Здесь можно отменить неиспользованное приглашение.</p></div>
    {invitations.map((invitation) => {
      const accepted = Boolean(invitation.acceptedAt);
      const expired = !accepted && Boolean(invitation.isExpired);
      return <div key={invitation.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{invitation.email}</p><p className="text-xs text-muted-foreground">Истекает {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(invitation.expiresAt))}</p></div>
        <Badge variant={accepted ? "default" : expired ? "secondary" : "outline"}>{accepted ? "Принято" : expired ? "Истекло" : "Ожидает"}</Badge>
        {!accepted && !expired ? <Button type="button" size="sm" variant="outline" disabled={isPending} aria-label={`Отменить приглашение: ${invitation.email}`} onClick={() => cancel(invitation)}><XIcon />Отменить</Button> : null}
      </div>;
    })}
    <p className="text-xs text-muted-foreground">Активных приглашений: {pending.length}</p>
  </section>;
}
