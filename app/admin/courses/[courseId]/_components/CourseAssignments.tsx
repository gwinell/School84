"use client";

import { useMemo, useState, useTransition } from "react";
import { UserRoundPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import type { TAdminGetCourseAssignments } from "@/app/data/admin/admin-get-course-assignments";
import { Button } from "@/components/ui/button";
import { tryCatch } from "@/hooks/try-catch";
import { assignCourseToStudent } from "../assignments/actions";

type AccessMode = "ALL_AT_ONCE" | "SEQUENTIAL";

export function CourseAssignments({
  courseId,
  students,
  enrollments,
}: {
  courseId: string;
  students: TAdminGetCourseAssignments["students"];
  enrollments: TAdminGetCourseAssignments["enrollment"];
}) {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [accessMode, setAccessMode] = useState<AccessMode>("ALL_AT_ONCE");
  const [isPending, startTransition] = useTransition();
  const studentById = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studentId) {
      toast.error("Выберите ученика");
      return;
    }
    startTransition(async () => {
      const { data, error } = await tryCatch(
        assignCourseToStudent({ courseId, userId: studentId, accessMode }),
      );
      if (error || data?.status === "error") {
        toast.error(data?.status === "error" ? data.message : "Не удалось сохранить назначение");
        return;
      }
      toast.success(data?.message ?? "Назначение сохранено");
      router.refresh();
    });
  }

  function editAssignment(userId: string, mode: AccessMode) {
    setStudentId(userId);
    setAccessMode(mode);
    document.getElementById("course-assignment-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="text-xl font-semibold">Назначения курса</h2>
        <p className="mt-1 text-sm text-muted-foreground">Выберите ученика и правило доступа к материалам.</p>
      </div>

      <form id="course-assignment-form" onSubmit={submit} className="grid gap-3 rounded-lg border bg-muted/20 p-4 md:grid-cols-[minmax(0,1fr)_minmax(250px,1fr)_auto] md:items-end">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Ученик</span>
          <select
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            disabled={isPending || students.length === 0}
            className="h-10 w-full rounded-md border border-input bg-background px-3"
          >
            <option value="">Выберите ученика</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name} · {student.email}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Режим доступа</span>
          <select
            value={accessMode}
            onChange={(event) => setAccessMode(event.target.value as AccessMode)}
            disabled={isPending}
            className="h-10 w-full rounded-md border border-input bg-background px-3"
          >
            <option value="ALL_AT_ONCE">Весь курс сразу</option>
            <option value="SEQUENTIAL">Последовательно по урокам</option>
          </select>
        </label>
        <Button type="submit" disabled={isPending || students.length === 0}>
          <UserRoundPlusIcon />
          {isPending ? "Сохраняем…" : "Назначить курс"}
        </Button>
        {accessMode === "SEQUENTIAL" ? (
          <p className="text-xs text-muted-foreground md:col-span-3">
            Следующий урок откроется, когда ученик решит и отметит принятыми все задачи текущего урока. Тексты и quiz внутри уже открытого урока доступны сразу.
          </p>
        ) : null}
        {students.length === 0 ? <p className="text-sm text-muted-foreground md:col-span-3">Пока нет зарегистрированных учеников.</p> : null}
      </form>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Назначено ученикам <span className="font-normal text-muted-foreground">({enrollments.filter((item) => item.status === "Active").length})</span></h3>
        {enrollments.filter((item) => item.status === "Active").map((assignment) => (
          <div key={assignment.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{assignment.user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{assignment.user.email}</p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
              {assignment.accessMode === "ALL_AT_ONCE" ? "Весь курс сразу" : "Последовательно по задачам"}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => editAssignment(assignment.user.id, assignment.accessMode)}
              disabled={isPending || !studentById.has(assignment.user.id)}
            >
              Изменить режим
            </Button>
          </div>
        ))}
        {enrollments.every((item) => item.status !== "Active") ? (
          <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">У этого курса пока нет назначенных учеников.</p>
        ) : null}
      </div>
    </section>
  );
}
