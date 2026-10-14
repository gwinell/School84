"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { tryCatch } from "@/hooks/try-catch";
import type { tUserLessonQuiz } from "@/app/data/user/get-lesson-quiz";
import { passLessonCellAction } from "../cell-progress-actions";
import { QuizPlayer } from "./QuizPlayer";

export function QuizCellPlayer({
  quiz,
  cellId,
  passed,
}: {
  quiz: tUserLessonQuiz;
  cellId: string;
  passed: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function markPassed() {
    if (passed || isPending) return;
    startTransition(async () => {
      const { data, error } = await tryCatch(passLessonCellAction({ cellId }));
      if (error || data?.status === "error") {
        toast.error(data?.status === "error" ? data.message : "Не удалось сохранить прогресс");
        return;
      }
      toast.success("Quiz пройден");
      router.refresh();
    });
  }

  return <QuizPlayer quiz={quiz} onPassed={markPassed} />;
}
