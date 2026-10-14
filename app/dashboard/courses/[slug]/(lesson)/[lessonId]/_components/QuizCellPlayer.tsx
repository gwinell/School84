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

  function saveAttempt(quizAnswers: Record<string, string[]>) {
    if (isPending) return;
    startTransition(async () => {
      const { data, error } = await tryCatch(passLessonCellAction({ cellId, quizAnswers }));
      if (error || data?.status === "error") {
        const attempt = data?.status === "error" && data.data && typeof data.data === "object"
          ? data.data as { score?: unknown; total?: unknown }
          : null;
        if (typeof attempt?.score === "number" && typeof attempt.total === "number") {
          toast.info(`Попытка сохранена: ${attempt.score}/${attempt.total}. Проверьте ответы и попробуйте снова.`);
          router.refresh();
          return;
        }
        toast.error(data?.status === "error" ? data.message : "Не удалось сохранить попытку");
        return;
      }
      if (!passed) toast.success("Quiz пройден");
      router.refresh();
    });
  }

  return <QuizPlayer quiz={quiz} onSubmitted={saveAttempt} />;
}
