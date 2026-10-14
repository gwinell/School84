import { Badge } from "@/components/ui/badge";

export type LearnerQuizAttempt = {
  id: string;
  selectedAnswers: { questionId: string; questionText: string; selectedAnswerIds: string[]; selectedAnswerTexts: string[] }[];
  score: number;
  total: number;
  passed: boolean;
  submittedAt: Date | string;
  feedback: { score: number; comment: string; updatedAt?: Date | string } | null;
};

export function LearnerQuizAttemptHistory({ attempts }: { attempts: LearnerQuizAttempt[] }) {
  if (!attempts.length) return null;
  return (
    <section aria-labelledby="quiz-history-heading" className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 id="quiz-history-heading" className="font-semibold">История попыток</h3>
        <span className="text-xs text-muted-foreground">{attempts.length} последних</span>
      </div>
      <ol className="space-y-3">
        {attempts.map((attempt, index) => (
          <li key={attempt.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Попытка {attempts.length - index} · {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(attempt.submittedAt))}</p>
              <Badge variant={attempt.passed ? "default" : "secondary"}>{attempt.passed ? "Пройдено" : "Не пройдено"} · {attempt.score}/{attempt.total}</Badge>
            </div>
            <details>
              <summary className="cursor-pointer text-sm underline underline-offset-4">Мои ответы</summary>
              <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
                {attempt.selectedAnswers.map((answer) => <li key={answer.questionId}>
                  <p className="font-medium">{answer.questionText}</p>
                  <p className="text-muted-foreground">{answer.selectedAnswerTexts.length ? answer.selectedAnswerTexts.join(", ") : "Нет ответа"}</p>
                </li>)}
              </ol>
            </details>
            {attempt.feedback ? <div className="rounded-md bg-muted/50 p-3 text-sm">
              <p className="font-medium">Проверка преподавателя: {attempt.feedback.score}/100</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{attempt.feedback.comment}</p>
            </div> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
