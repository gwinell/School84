"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { tryCatch } from "@/hooks/try-catch";
import { passLessonCellAction } from "../cell-progress-actions";

export function PassCellButton({ cellId, passed }: { cellId: string; passed: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function pass() {
    startTransition(async () => {
      const { data, error } = await tryCatch(passLessonCellAction({ cellId }));
      if (error || data?.status === "error") {
        toast.error(data?.status === "error" ? data.message : "Не удалось сохранить прогресс");
        return;
      }
      toast.success("Ячейка отмечена как пройденная");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">
        {passed ? "Прогресс сохранён. Можно вернуться к этой ячейке в любой момент." : "Завершите эту ячейку, чтобы открыть следующую."}
      </p>
      <Button onClick={pass} disabled={passed || isPending} variant={passed ? "secondary" : "default"}>
        <CheckCircle2Icon />
        {passed ? "Пройдено" : isPending ? "Сохраняем…" : "Отметить пройденной"}
      </Button>
    </div>
  );
}
