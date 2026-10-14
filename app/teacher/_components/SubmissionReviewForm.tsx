"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { tryCatch } from "@/hooks/try-catch";

export type ReviewTarget =
  | { codeSubmissionId: string; quizAttemptId?: never }
  | { quizAttemptId: string; codeSubmissionId?: never };

export type ReviewInput = ReviewTarget & { score: number; comment: string };

type ReviewResult = { status: "success" | "error"; message?: string };

/** A controlled review form shared by teacher gradebook submission rows. */
export function SubmissionReviewForm({
  target,
  initialScore,
  initialComment,
  onSubmit,
}: {
  target: ReviewTarget;
  initialScore?: number | null;
  initialComment?: string | null;
  onSubmit: (input: ReviewInput) => Promise<ReviewResult>;
}) {
  const [score, setScore] = useState(initialScore == null ? "" : String(initialScore));
  const [comment, setComment] = useState(initialComment ?? "");
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    const numericScore = Number(score);
    if (!Number.isInteger(numericScore) || numericScore < 0 || numericScore > 100) {
      setErrorMessage("Введите целую оценку от 0 до 100.");
      return;
    }
    if (!comment.trim()) {
      setErrorMessage("Добавьте комментарий ученику.");
      return;
    }

    startTransition(async () => {
      const { data, error } = await tryCatch(onSubmit({ ...target, score: numericScore, comment: comment.trim() }));
      if (error || !data || data.status === "error") {
        const message = data?.message ?? "Не удалось сохранить проверку. Попробуйте снова.";
        setErrorMessage(message);
        toast.error(message);
        return;
      }
      toast.success(data.message ?? "Проверка сохранена");
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[140px_minmax(0,1fr)_auto] sm:items-end" aria-label="Ручная проверка">
      <label className="space-y-1.5 text-sm">
        <span className="font-medium">Оценка (0–100)</span>
        <Input
          type="number"
          min={0}
          max={100}
          step={1}
          inputMode="numeric"
          value={score}
          onChange={(event) => setScore(event.target.value)}
          disabled={isPending}
          required
        />
      </label>
      <label className="space-y-1.5 text-sm">
        <span className="font-medium">Комментарий ученику</span>
        <Textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={2000}
          rows={2}
          placeholder="Что получилось и что улучшить?"
          disabled={isPending}
          required
        />
      </label>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Сохраняем…" : "Сохранить проверку"}
      </Button>
      {errorMessage ? <p role="alert" className="text-sm text-destructive sm:col-span-3">{errorMessage}</p> : null}
    </form>
  );
}
