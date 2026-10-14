import Link from "next/link";
import { CheckIcon, Code2Icon, FileTextIcon, ListChecksIcon, LockKeyholeIcon } from "lucide-react";

import type { tCourseForLearningCell } from "@/app/data/user/get-course-for-learning";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const typeLabels = { TEXT: "Конспект", CODE_TASK: "Задача", QUIZ: "Quiz" } as const;
const typeIcons = { TEXT: FileTextIcon, CODE_TASK: Code2Icon, QUIZ: ListChecksIcon } as const;

export function LessonCellStepper({
  courseSlug,
  lessonId,
  cells,
  activeCellId,
}: {
  courseSlug: string;
  lessonId: string;
  cells: tCourseForLearningCell[];
  activeCellId: string;
}) {
  return (
    <nav aria-label="Ячейки урока" className="flex items-center gap-2 overflow-x-auto rounded-xl border bg-card p-3">
      <span className="mr-1 shrink-0 text-xs font-medium text-muted-foreground">Ячейки</span>
      {cells.map((cell, index) => {
        const Icon = typeIcons[cell.type];
        const passed = cell.status === "PASSED";
        const locked = cell.status === "LOCKED";
        const current = cell.id === activeCellId;
        const label = `${index + 1}. ${typeLabels[cell.type]}${cell.title ? ` — ${cell.title}` : ""}`;
        const square = (
          <span
            className={cn(
              "relative flex size-10 shrink-0 items-center justify-center rounded-md border transition-colors",
              passed
                ? "border-emerald-700 bg-emerald-700 text-white"
                : "border-border bg-muted text-foreground",
              current && "ring-2 ring-primary ring-offset-2 ring-offset-background",
              locked && "cursor-not-allowed opacity-50",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {passed ? <CheckIcon className="absolute -right-1 -top-1 size-3 rounded-full bg-emerald-700" aria-hidden /> : null}
            {locked ? <LockKeyholeIcon className="absolute -right-1 -top-1 size-3 rounded-full bg-background p-0.5 text-muted-foreground" aria-hidden /> : null}
          </span>
        );
        return locked ? (
          <span key={cell.id} role="img" aria-label={`${label}. Заблокировано`} title={`${label} · сначала пройдите предыдущую ячейку`}>
            {square}
          </span>
        ) : (
          <Button
            key={cell.id}
            nativeButton={false}
            render={<Link href={`/dashboard/courses/${courseSlug}/${lessonId}?cellId=${cell.id}`} />}
            variant="ghost"
            size="icon"
            className="size-10 shrink-0 p-0"
            aria-label={label}
            aria-current={current ? "step" : undefined}
            title={`${index + 1}. ${typeLabels[cell.type]}${cell.title ? ` — ${cell.title}` : ""}${passed ? " · пройдено" : ""}`}
          >
            {square}
          </Button>
        );
      })}
    </nav>
  );
}
