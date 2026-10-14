"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { useTransition } from "react";
import { FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { tryCatch } from "@/hooks/try-catch";
import {
  EQuizQuestionType,
  type LessonQuizSchemaType,
  lessonQuizSchema,
} from "@/lib/zodSchemas";

import { reorderQuizQuestions, upsertLessonQuiz } from "../actions";
import type { TAdminGetLessonQuiz } from "@/app/data/admin/admin-get-lesson-quiz";
import { SortableQuestionCard } from "./SortableQuestionCard";

interface iAppProps {
  cellId: string;
  initialQuiz: TAdminGetLessonQuiz | null;
}

type QuizFormValues = Omit<LessonQuizSchemaType, "lessonId">;

function buildDefaultValues(
  initialQuiz: TAdminGetLessonQuiz | null,
): QuizFormValues {
  if (!initialQuiz) {
    return { questions: [] };
  }

  return {
    questions: initialQuiz.questions.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type as EQuizQuestionType,
      answers: q.answers.map((a) => ({
        id: a.id,
        text: a.text,
        isCorrect: a.isCorrect,
        explanation: a.explanation ?? "",
      })),
    })),
  };
}

export function QuizEditor({
  cellId,
  initialQuiz,
}: iAppProps) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<QuizFormValues>({
    resolver: zodResolver(lessonQuizSchema.omit({ lessonId: true })),
    defaultValues: buildDefaultValues(initialQuiz),
    mode: "onSubmit",
  });

  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: "questions",
  });

  const watchedQuestions = useWatch({
    control: form.control,
    name: "questions",
  });

  const onSubmit = (values: QuizFormValues) => {
    startTransition(async () => {
      const { data: result, error } = await tryCatch(
        upsertLessonQuiz(cellId, values),
      );

      if (error) {
        toast.error("An unexpected error occurred. Please try again.");
        return;
      }

      if (result?.status === "success") {
        const savedQuiz = result.data as {
          questions: {
            id: string;
            text: string;
            type: EQuizQuestionType;
            answers: {
              id: string;
              text: string;
              isCorrect: boolean;
              explanation: string | null;
            }[];
          }[];
        } | null;
        if (savedQuiz) {
          form.reset({
            questions: savedQuiz.questions.map((question) => ({
              id: question.id,
              text: question.text,
              type: question.type as EQuizQuestionType,
              answers: question.answers.map((answer) => ({
                id: answer.id,
                text: answer.text,
                isCorrect: answer.isCorrect,
                explanation: answer.explanation ?? "",
              })),
            })),
          });
        }
        toast.success("Quiz saved successfully!", {
          description: "Your quiz has been updated.",
        });
      } else if (result?.status === "error") {
        toast.error(result.message);
      }
    });
  };

  const handleAddQuestion = () => {
    append({
      text: "",
      type: EQuizQuestionType.SINGLE,
      answers: [
        { text: "", isCorrect: false },
        { text: "", isCorrect: false },
      ],
    });
  };

  const handleReorder = (from: number, to: number) => {
    if (from === to) return;

    move(from, to);

    const questions = form.getValues("questions");
    const allHaveIds = questions.every((q) => Boolean(q.id));

    if (!allHaveIds) {
      return;
    }

    const orderedIds = form
      .getValues("questions")
      .map((q, i) => ({ id: q.id as string, position: i }));

    startTransition(async () => {
      const { data: result, error } = await tryCatch(
        reorderQuizQuestions({
          cellId,
          questions: orderedIds,
        }),
      );

      if (error) {
        toast.error("Failed to reorder questions");
        return;
      }

      if (result?.status === "error") {
        toast.error(result.message);
      } else {
        toast.success("Quiz order saved");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quiz</CardTitle>
        <CardDescription>
          Build the questions shown to students after this lesson. Drag
          questions to reorder them. The quiz is optional — students can
          complete the lesson without taking it.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <FormProvider {...form}>
          <form id="quiz-form" onSubmit={form.handleSubmit(onSubmit)}>
            {fields.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No questions yet. Add your first question to get started.
                </p>
                <Button type="button" onClick={handleAddQuestion}>
                  Add your first question
                </Button>
              </div>
            ) : (
              <DragDropProvider
                onDragEnd={(event) => {
                  if (event.canceled) return;
                  const source = event.operation.source;
                  if (!isSortable(source)) return;
                  const { initialIndex, index: newIndex } = source;
                  handleReorder(initialIndex, newIndex);
                }}
              >
                <div className="flex flex-col gap-4">
                  {fields.map((field, index) => (
                    <SortableQuestionCard
                      key={field.id}
                      index={index}
                      fieldId={field.id}
                      onRemove={() => remove(index)}
                      form={form}
                      watchedType={
                        (watchedQuestions?.[index]?.type as EQuizQuestionType) ??
                        EQuizQuestionType.SINGLE
                      }
                    />
                  ))}
                </div>
              </DragDropProvider>
            )}
          </form>
        </FormProvider>
      </CardContent>

      <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {fields.length} question{fields.length === 1 ? "" : "s"}
        </p>
        <div className="flex gap-2">
          {fields.length > 0 && (
            <Button type="button" variant="outline" onClick={handleAddQuestion}>
              Add question
            </Button>
          )}
          <Button
            type="submit"
            form="quiz-form"
            disabled={isPending || fields.length === 0}
          >
            {isPending ? "Saving..." : "Save quiz"}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
