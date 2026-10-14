"use client";

import { useState, useTransition } from "react";
import { UserRoundPlusIcon, UserRoundXIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { tryCatch } from "@/hooks/try-catch";
import type { RosterActionResult, RosterPerson } from "./CourseRosterManager";

export type CourseInstructor = RosterPerson;

export function CourseInstructorsManager({
  courseId,
  instructors,
  candidates,
  onAssign,
  onRemove,
}: {
  courseId: string;
  instructors: CourseInstructor[];
  candidates: CourseInstructor[];
  onAssign: (input: { courseId: string; userId: string }) => Promise<RosterActionResult>;
  onRemove: (input: { courseId: string; userId: string }) => Promise<RosterActionResult>;
}) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [isPending, startTransition] = useTransition();
  const available = candidates.filter((candidate) => !instructors.some((instructor) => instructor.id === candidate.id));

  function assign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) return;
    startTransition(async () => {
      const { data, error } = await tryCatch(onAssign({ courseId, userId }));
      if (error || !data || data.status === "error") {
        toast.error(data?.message ?? "Не удалось назначить преподавателя");
        return;
      }
      toast.success(data.message ?? "Преподаватель получил доступ к курсу");
      setUserId("");
      router.refresh();
    });
  }

  function remove(instructor: CourseInstructor) {
    if (!window.confirm(`Снять с ${instructor.name || instructor.email} права преподавателя этого курса?`)) return;
    startTransition(async () => {
      const { data, error } = await tryCatch(onRemove({ courseId, userId: instructor.id }));
      if (error || !data || data.status === "error") {
        toast.error(data?.message ?? "Не удалось снять доступ преподавателя");
        return;
      }
      toast.success(data.message ?? "Доступ преподавателя снят");
      router.refresh();
    });
  }

  return <section aria-labelledby="course-instructors-heading" className="space-y-3 rounded-xl border bg-card p-5">
    <div>
      <h2 id="course-instructors-heading" className="text-lg font-semibold">Преподаватели курса</h2>
      <p className="mt-1 text-sm text-muted-foreground">Назначайте доступ к этому курсу. Преподаватели видят только курсы, к которым подключены.</p>
    </div>
    {instructors.map((instructor) => <div key={instructor.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{instructor.name || instructor.email}</p><p className="truncate text-xs text-muted-foreground">{instructor.email}</p></div>
      <Button type="button" size="sm" variant="outline" disabled={isPending} aria-label={`Снять преподавателя: ${instructor.email}`} onClick={() => remove(instructor)}><UserRoundXIcon />Снять доступ</Button>
    </div>)}
    {!instructors.length ? <p className="text-sm text-muted-foreground">К этому курсу ещё не подключён преподаватель.</p> : null}
    <form onSubmit={assign} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <label className="space-y-1.5 text-sm"><span>Назначить преподавателя</span>
        <select aria-label="Назначить преподавателя" value={userId} onChange={(event) => setUserId(event.target.value)} disabled={isPending || !available.length} className="h-10 w-full rounded-md border border-input bg-background px-3">
          <option value="">Выберите пользователя</option>
          {available.map((person) => <option key={person.id} value={person.id}>{person.name || person.email} · {person.email}</option>)}
        </select>
      </label>
      <Button type="submit" disabled={isPending || !userId} className="self-end"><UserRoundPlusIcon />Назначить</Button>
      {!available.length ? <p className="text-xs text-muted-foreground sm:col-span-2">Нет доступных пользователей. Пользователь станет преподавателем после назначения на курс.</p> : null}
    </form>
  </section>;
}
