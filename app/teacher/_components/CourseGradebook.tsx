import { ActivityIcon, BookOpenCheckIcon, CalendarClockIcon, UserRoundIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { SubmissionReviewForm } from "./SubmissionReviewForm";

export type GradebookFeedback = { score: number; comment: string; updatedAt?: Date | string } | null;
export type GradebookCodeSubmission = {
  id: string;
  status: string;
  passedTests: number;
  totalTests: number;
  sourceCode: string;
  actualOutput: string | null;
  errorText: string | null;
  createdAt: Date | string;
  isLate?: boolean;
  lessonCell: { title: string | null; lesson: { title: string } };
  feedback: GradebookFeedback;
  isLate?: boolean;
};
export type GradebookQuizAttempt = {
  id: string;
  lessonCellId: string;
  selectedAnswers: { questionId: string; questionText: string; selectedAnswerIds: string[]; selectedAnswerTexts: string[] }[];
  score: number;
  total: number;
  passed: boolean;
  submittedAt: Date | string;
  lessonCell: { title: string | null; lesson: { title: string } };
  feedback: GradebookFeedback;
};
export type GradebookStudent = {
  user: { id: string; name: string; email: string };
  enrollment: { id: string; status: string; accessMode: string; dueAt: Date | string | null; createdAt: Date | string };
  progress: { completedCells: number; totalCells: number; percent: number; lastActiveAt: Date | string | null; cursor: { lessonId: string; cellId: string | null; updatedAt: Date | string } | null };
  codeSubmissions: GradebookCodeSubmission[];
  quizAttempts: GradebookQuizAttempt[];
};

function dateLabel(date: Date | string | null | undefined) {
  return date ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date)) : "Нет данных";
}

/** Teacher view of course progress, work history, and review feedback. */
export function CourseGradebook({
  students,
  onReview,
}: {
  students: GradebookStudent[];
  onReview: (input: { codeSubmissionId?: string; quizAttemptId?: string; score: number; comment: string }) => Promise<{ status: "success" | "error"; message?: string }>;
}) {
  if (!students.length) {
    return <section aria-labelledby="gradebook-heading" className="rounded-xl border p-6">
      <h2 id="gradebook-heading" className="text-xl font-semibold">Журнал курса</h2>
      <p className="mt-2 text-sm text-muted-foreground">Пока нет назначенных учеников и учебных работ.</p>
    </section>;
  }

  return (
    <section aria-labelledby="gradebook-heading" className="space-y-4">
      <div>
        <h2 id="gradebook-heading" className="text-xl font-semibold">Журнал курса</h2>
        <p className="mt-1 text-sm text-muted-foreground">Прогресс, срок прохождения и история решений каждого ученика.</p>
      </div>
      <div className="grid gap-4">
        {students.map((student) => <StudentCard key={student.user.id} student={student} onReview={onReview} />)}
      </div>
    </section>
  );
}

function StudentCard({ student, onReview }: { student: GradebookStudent; onReview: CourseGradebookProps["onReview"] }) {
  const submissionCount = student.codeSubmissions.length + student.quizAttempts.length;
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><UserRoundIcon className="size-4" />{student.user.name || student.user.email}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{student.user.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={student.enrollment.status === "Active" ? "default" : "secondary"}>{student.enrollment.status === "Active" ? "Активен" : student.enrollment.status}</Badge>
          <Badge variant="outline">{student.enrollment.accessMode === "SEQUENTIAL" ? "По порядку" : "Весь курс"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Progress value={student.progress.percent}>
            <ProgressLabel>Прогресс курса</ProgressLabel>
            <ProgressValue />
          </Progress>
          <p className="flex items-center gap-2 text-sm"><CalendarClockIcon className="size-4 text-muted-foreground" /><span>Срок: {dateLabel(student.enrollment.dueAt)}</span></p>
          <p className="flex items-center gap-2 text-sm"><ActivityIcon className="size-4 text-muted-foreground" /><span>Последняя активность: {dateLabel(student.progress.lastActiveAt)}</span></p>
        </div>
        <p className="text-xs text-muted-foreground">Пройдено ячеек: {student.progress.completedCells} из {student.progress.totalCells}. Работ в истории: {submissionCount}.</p>

        <div className="space-y-3 border-t pt-4">
          <h3 className="flex items-center gap-2 font-medium"><BookOpenCheckIcon className="size-4" />Попытки и проверка</h3>
          {student.codeSubmissions.map((submission) => (
            <article key={submission.id} className="space-y-3 rounded-lg border p-3" aria-label={`Решение: ${submission.lessonCell.title ?? submission.lessonCell.lesson.title}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{submission.lessonCell.title || submission.lessonCell.lesson.title}</p>
                  <p className="text-xs text-muted-foreground">Код · {dateLabel(submission.createdAt)} · {submission.status === "ACCEPTED" ? "Принято" : submission.status} · {submission.passedTests}/{submission.totalTests} тестов</p>
                </div>
                <div className="flex gap-2">{submission.isLate ? <Badge variant="destructive">После срока</Badge> : null}{submission.feedback ? <Badge variant="secondary">Оценка: {submission.feedback.score}/100</Badge> : null}</div>
              </div>
              <details>
                <summary className="cursor-pointer text-sm underline underline-offset-4">Открыть код и результат</summary>
                <div className="mt-2 grid gap-2 lg:grid-cols-2">
                  <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs"><code>{submission.sourceCode}</code></pre>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{submission.actualOutput || submission.errorText || "Нет дополнительного вывода"}</pre>
                </div>
              </details>
              <SubmissionReviewForm target={{ codeSubmissionId: submission.id }} initialScore={submission.feedback?.score} initialComment={submission.feedback?.comment} onSubmit={onReview} />
            </article>
          ))}

          {student.quizAttempts.map((attempt) => (
            <article key={attempt.id} className="space-y-3 rounded-lg border p-3" aria-label={`Попытка quiz: ${attempt.lessonCell.title ?? attempt.lessonCell.lesson.title}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{attempt.lessonCell.title || attempt.lessonCell.lesson.title}</p>
                  <p className="text-xs text-muted-foreground">Quiz · {dateLabel(attempt.submittedAt)} · {attempt.passed ? "Пройден" : "Не пройден"} · {attempt.score}/{attempt.total}</p>
                </div>
                <div className="flex gap-2">{attempt.isLate ? <Badge variant="destructive">После срока</Badge> : null}{attempt.feedback ? <Badge variant="secondary">Оценка преподавателя: {attempt.feedback.score}/100</Badge> : null}</div>
              </div>
              <details>
                <summary className="cursor-pointer text-sm underline underline-offset-4">Посмотреть ответы ученика</summary>
                <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
                  {attempt.selectedAnswers.map((answer) => <li key={answer.questionId}>
                    <p className="font-medium">{answer.questionText}</p>
                    <p className="text-muted-foreground">Ответ: {answer.selectedAnswerTexts.length ? answer.selectedAnswerTexts.join(", ") : "Нет ответа"}</p>
                  </li>)}
                </ol>
              </details>
              <SubmissionReviewForm target={{ quizAttemptId: attempt.id }} initialScore={attempt.feedback?.score} initialComment={attempt.feedback?.comment} onSubmit={onReview} />
            </article>
          ))}
          {!submissionCount ? <p className="text-sm text-muted-foreground">Попыток пока нет.</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

type CourseGradebookProps = Parameters<typeof CourseGradebook>[0];
