"use client";

import { useState, useTransition } from "react";
import { CheckCircle2Icon, CircleXIcon, LoaderCircleIcon, PlayIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { tCourseForLearningCell } from "@/app/data/user/get-course-for-learning";
import { submitCodeTaskAction } from "../code-submission-actions";
import { ActivityHeartbeat } from "./ActivityHeartbeat";
import { tryCatch } from "@/hooks/try-catch";

type Submission = NonNullable<tCourseForLearningCell["latestSubmission"]>;
type SubmissionHistoryItem = { id: string; status: string; passedTests: number; totalTests: number; actualOutput: string | null; errorText: string | null; lintOutput: string | null; durationMs: number; sourceCode: string; createdAt: Date | string; feedback: { score: number; comment: string; updatedAt: Date | string } | null };

export function CodeTaskWorkspace({ cell }: { cell: tCourseForLearningCell }) {
  const router = useRouter();
  const [sourceCode, setSourceCode] = useState(cell.latestSubmission?.sourceCode ?? cell.starterCode ?? "");
  const [submission, setSubmission] = useState<Submission | null>(cell.latestSubmission);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const submissionHistory = (cell as typeof cell & { submissionHistory?: SubmissionHistoryItem[] }).submissionHistory ?? [];
  const latestFeedback = (cell.latestSubmission as (Submission & { feedback?: { score: number; comment: string } | null }) | null)?.feedback;

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const { data: result, error } = await tryCatch(submitCodeTaskAction({ cellId: cell.id, sourceCode }));
      if (error || !result) {
        setMessage("Не удалось отправить решение. Попробуйте снова.");
        return;
      }
      if (result.status === "error" || !result.data) {
        setMessage(result.message);
        return;
      }
      setSubmission({
        ...result.data,
        sourceCode,
        createdAt: new Date(),
        feedback: null,
      });
      router.refresh();
    });
  }

  const passed = submission?.status === "ACCEPTED" || cell.status === "PASSED";

  return (
    <Card>
      <ActivityHeartbeat cellId={cell.id} kind="SOLVING" />
      <CardHeader>
        <CardTitle>Задача</CardTitle>
        <CardDescription>Отправьте Python-код — проверка запустится на сервере в изолированной среде.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="prose prose-sm max-w-none whitespace-pre-wrap dark:prose-invert">
          {cell.taskPrompt || <p className="text-muted-foreground">Условие задачи ещё не добавлено.</p>}
        </div>
        {Array.isArray(cell.examples) && cell.examples.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Примеры</h2>
            {cell.examples.map((example, index) => {
              const row = example && typeof example === "object" ? example as { input?: unknown; output?: unknown } : {};
              return (
                <div key={index} className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
                  <Example label="Входные данные" value={row.input} />
                  <Example label="Ожидаемый вывод" value={row.output} />
                </div>
              );
            })}
          </div>
        ) : null}

        <label className="block space-y-2">
          <span className="text-sm font-semibold">Ваш код</span>
          <Textarea
            value={sourceCode}
            onChange={(event) => setSourceCode(event.target.value)}
            className="min-h-64 font-mono text-sm"
            spellCheck={false}
            maxLength={30_000}
            placeholder="# Напишите решение"
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {passed ? "Задача принята. Её результат сохранён." : "Решение проверяется по тестам автора."}
          </p>
          <Button onClick={submit} disabled={isPending || sourceCode.trim().length === 0}>
            {isPending ? <LoaderCircleIcon className="animate-spin" /> : <PlayIcon />}
            {isPending ? "Проверяем…" : "Отправить решение"}
          </Button>
        </div>

        {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
        {submission ? (
          <div className="space-y-3 rounded-xl border bg-muted/30 p-4" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2">
              {submission.status === "ACCEPTED" ? (
                <Badge className="bg-emerald-600 text-white"><CheckCircle2Icon />Принято</Badge>
              ) : (
                <Badge variant="destructive"><CircleXIcon />{statusLabel[submission.status]}</Badge>
              )}
              <span className="text-sm text-muted-foreground">
                Пройдено тестов: {submission.passedTests}/{submission.totalTests}
                {submission.durationMs ? ` · ${submission.durationMs} мс` : ""}
              </span>
            </div>
            {submission.actualOutput ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Фактический вывод</p>
                <pre className="max-h-48 overflow-auto rounded-lg bg-background p-3 text-xs">{submission.actualOutput}</pre>
              </div>
            ) : null}
            {submission.errorText ? (
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 text-xs text-destructive">{submission.errorText}</pre>
            ) : null}
            {submission.lintOutput ? (
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 text-xs">{submission.lintOutput}</pre>
            ) : null}
          </div>
        ) : null}
        {latestFeedback ? (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <p className="font-medium">Проверка преподавателя: {latestFeedback.score}/100</p>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{latestFeedback.comment}</p>
          </div>
        ) : null}

        {submissionHistory.length > 1 ? <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium underline underline-offset-4">История отправок ({submissionHistory.length})</summary>
          <ol className="mt-3 space-y-3">
            {submissionHistory.map((attempt, index) => <li key={attempt.id} className="space-y-2 rounded-md bg-muted/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Попытка {submissionHistory.length - index} · {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(attempt.createdAt))}</p>
                <Badge variant={attempt.status === "ACCEPTED" ? "default" : "destructive"}>{attempt.status === "ACCEPTED" ? "Принято" : statusLabel[attempt.status] ?? attempt.status} · {attempt.passedTests}/{attempt.totalTests}</Badge>
              </div>
              <details>
                <summary className="cursor-pointer text-xs underline underline-offset-4">Код и вывод</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <pre className="max-h-48 overflow-auto rounded bg-background p-2 text-xs"><code>{attempt.sourceCode}</code></pre>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-xs">{attempt.actualOutput || attempt.errorText || attempt.lintOutput || "Нет дополнительного вывода"}</pre>
                </div>
              </details>
              {attempt.feedback ? <div className="rounded bg-background p-2 text-sm"><p className="font-medium">Проверка преподавателя: {attempt.feedback.score}/100</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{attempt.feedback.comment}</p></div> : null}
            </li>)}
          </ol>
        </details> : null}
      </CardContent>
    </Card>
  );
}

const statusLabel: Record<string, string> = {
  WRONG_ANSWER: "Есть ошибки в ответе",
  LINT_ERROR: "Замечания линтера",
  RUNTIME_ERROR: "Ошибка выполнения",
  TIME_LIMIT: "Превышено время",
  SYSTEM_ERROR: "Проверка недоступна",
};

function Example({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <pre className="min-h-10 overflow-x-auto rounded bg-background p-2 text-xs">{typeof value === "string" ? value : "—"}</pre>
    </div>
  );
}
