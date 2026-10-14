import { Code2Icon, FileTextIcon, ListChecksIcon } from "lucide-react";
import type { JSONContent } from "@tiptap/react";

import { RenderDescription } from "@/components/rich-text-editor/RenderDescription";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { tCourseForLearningCell } from "@/app/data/user/get-course-for-learning";
import type { tUserLessonQuiz } from "@/app/data/user/get-lesson-quiz";
import { QuizCellPlayer } from "./QuizCellPlayer";
import { CodeTaskWorkspace } from "./CodeTaskWorkspace";
import { ActivityHeartbeat } from "./ActivityHeartbeat";

const cellDetails = {
  TEXT: { label: "Конспект", Icon: FileTextIcon },
  CODE_TASK: { label: "Задача", Icon: Code2Icon },
  QUIZ: { label: "Проверка знаний", Icon: ListChecksIcon },
} as const;

function richText(value: string | null): JSONContent | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as JSONContent;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
export function LessonCellContent({ cell }: { cell: tCourseForLearningCell }) {
  const { Icon, label } = cellDetails[cell.type];
  const description = richText(cell.textContent);

  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon className="size-4" aria-hidden />{label}
        </p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {cell.title || label}
        </h1>
      </div>

      {cell.type === "TEXT" ? (
        <Card>
          <ActivityHeartbeat cellId={cell.id} kind="READING" />
          <CardContent className="prose prose-sm max-w-none p-5 dark:prose-invert sm:p-7">
            {description ? (
              <RenderDescription json={description} />
            ) : cell.textContent ? (
              <p className="whitespace-pre-wrap">{cell.textContent}</p>
            ) : (
              <p className="text-muted-foreground">В этом конспекте пока нет текста.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {cell.type === "CODE_TASK" ? <CodeTaskWorkspace cell={cell} /> : null}

      {cell.type === "QUIZ" ? (
        <Card>
          <CardHeader>
            <CardTitle>Quiz</CardTitle>
            <CardDescription>Ответьте на вопросы, чтобы проверить понимание темы.</CardDescription>
          </CardHeader>
          <CardContent>
            {cell.quiz && cell.quiz.questions.length > 0 ? (
              <QuizCellPlayer quiz={cell.quiz as tUserLessonQuiz} cellId={cell.id} passed={cell.status === "PASSED"} />
            ) : (
              <p className="text-sm text-muted-foreground">В этом quiz пока нет вопросов.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
