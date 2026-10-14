"use client";

import {
  CheckCircle2Icon,
  XCircleIcon,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { tryCatch } from "@/hooks/try-catch";
import type {
  tUserLessonQuiz,
  tUserQuizAnswer,
  tUserQuizQuestion,
} from "@/app/data/user/get-lesson-quiz";
import { cn } from "@/lib/utils";

import { gradeQuizAnswerAction, type tQuizGrade } from "../quiz-actions";

interface QuizPlayerProps {
  quiz: tUserLessonQuiz;
  onSubmitted?: (answers: Record<string, string[]>) => void;
}

export function QuizPlayer({ quiz, onSubmitted }: QuizPlayerProps) {
  const [selections, setSelections] = useState<Record<string, Set<string>>>(
    {},
  );
  const [results, setResults] = useState<Record<string, tQuizGrade>>({});
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const [isPending, startTransition] = useTransition();

  const totalQuestions = quiz.questions.length;
  const isLast = step === totalQuestions - 1;
  const currentQuestion = quiz.questions[step];

  const checked = useMemo(
    () => new Set(Object.keys(results)),
    [results],
  );
  const submittedCount = checked.size;

  const correctCount = useMemo(
    () => Object.values(results).filter((r) => r.isCorrect).length,
    [results],
  );

  function toggleSingle(questionId: string, answerId: string) {
    if (checked.has(questionId)) return;
    setSelections((prev) => ({
      ...prev,
      [questionId]: new Set([answerId]),
    }));
  }

  function toggleMultiple(questionId: string, answerId: string) {
    if (checked.has(questionId)) return;
    setSelections((prev) => {
      const next = new Set(prev[questionId] ?? []);
      if (next.has(answerId)) next.delete(answerId);
      else next.add(answerId);
      return { ...prev, [questionId]: next };
    });
  }

  function submitCurrent() {
    if (!currentQuestion) return;
    if (results[currentQuestion.id]) return;

    const questionId = currentQuestion.id;
    const selectedAnswerIds = Array.from(selections[questionId] ?? []);

    startTransition(async () => {
      const { data: grade, error } = await tryCatch(
        gradeQuizAnswerAction({ questionId, selectedAnswerIds }),
      );

      if (error || !grade) {
        toast.error("Could not grade your answer. Please try again.");
        return;
      }

      setResults((prev) => ({ ...prev, [questionId]: grade }));
    });
  }

  function advance() {
    if (isLast) {
      setFinished(true);
      onSubmitted?.(Object.fromEntries(Object.entries(selections).map(([id, answers]) => [id, Array.from(answers)])));
      return;
    }
    setStep((s) => s + 1);
  }

  function goBack() {
    if (step === 0) return;
    setStep((s) => s - 1);
    setFinished(false);
  }

  function tryAgain() {
    setSelections({});
    setResults({});
    setStep(0);
    setFinished(false);
  }

  if (finished) {
    return (
      <div className="flex flex-col gap-4">
        <div
          className={cn(
            "rounded-md border px-4 py-4 text-sm",
            correctCount === totalQuestions
              ? "border-green-500/40 bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-200"
              : "border-border bg-muted/40 text-foreground",
          )}
        >
          <p className="text-base font-semibold">
            You got{" "}
            <span
              className={cn(
                correctCount === totalQuestions
                  ? "text-green-700 dark:text-green-300"
                  : "text-foreground",
              )}
            >
              {correctCount}
            </span>{" "}
            out of <span>{totalQuestions}</span>{" "}
            {totalQuestions === 1 ? "question" : "questions"} right.
          </p>
          {correctCount < totalQuestions && (
            <p className="mt-1 text-xs text-muted-foreground">
              Go back through the questions to review the explanations.
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={tryAgain}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return null;
  }

  const isCurrentChecked = checked.has(currentQuestion.id);
  const currentSelection: Set<string> =
    selections[currentQuestion.id] ?? new Set<string>();
  const hasCurrentSelection = currentSelection.size > 0;

  const primaryLabel = isPending
    ? "Checking..."
    : !isCurrentChecked
      ? "Submit answer"
      : isLast
        ? "See result"
        : "Next question";
  const primaryDisabled =
    isPending || (!isCurrentChecked && !hasCurrentSelection);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>
          Question {step + 1} of {totalQuestions}
        </span>
        <span>
          {submittedCount} of {totalQuestions} submitted
        </span>
      </div>

      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{
            width: `${((step + 1) / totalQuestions) * 100}%`,
          }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-base font-medium">{currentQuestion.text}</p>
        <QuestionBody
          question={currentQuestion}
          selectedIds={currentSelection}
          revealed={isCurrentChecked}
          disabled={isPending}
          grade={results[currentQuestion.id]}
          onSingleChange={(answerId) =>
            toggleSingle(currentQuestion.id, answerId)
          }
          onMultipleChange={(answerId) =>
            toggleMultiple(currentQuestion.id, answerId)
          }
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={goBack}
          disabled={step === 0 || isPending}
        >
          Previous
        </Button>
        <Button
          type="button"
          onClick={isCurrentChecked ? advance : submitCurrent}
          disabled={primaryDisabled}
          title={
            primaryDisabled
              ? "Pick at least one answer first"
              : undefined
          }
        >
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}

interface QuestionBodyProps {
  question: tUserQuizQuestion;
  selectedIds: Set<string>;
  revealed: boolean;
  disabled?: boolean;
  grade?: tQuizGrade;
  onSingleChange: (answerId: string) => void;
  onMultipleChange: (answerId: string) => void;
}

function QuestionBody({
  question,
  selectedIds,
  revealed,
  disabled,
  grade,
  onSingleChange,
  onMultipleChange,
}: QuestionBodyProps) {
  if (question.type === "SINGLE") {
    return (
      <SingleQuestionBody
        question={question}
        selectedIds={selectedIds}
        revealed={revealed}
        disabled={disabled}
        grade={grade}
        onSingleChange={onSingleChange}
      />
    );
  }
  return (
    <MultipleQuestionBody
      question={question}
      selectedIds={selectedIds}
      revealed={revealed}
      disabled={disabled}
      grade={grade}
      onMultipleChange={onMultipleChange}
    />
  );
}

interface SingleBodyProps {
  question: tUserQuizQuestion;
  selectedIds: Set<string>;
  revealed: boolean;
  disabled?: boolean;
  grade?: tQuizGrade;
  onSingleChange: (answerId: string) => void;
}

function SingleQuestionBody({
  question,
  selectedIds,
  revealed,
  disabled,
  grade,
  onSingleChange,
}: SingleBodyProps) {
  const value: string =
    selectedIds.size > 0 ? Array.from(selectedIds)[0] : "";

  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onSingleChange(String(next))}
      aria-label={question.text}
    >
      <ul className="flex flex-col gap-2">
        {question.answers.map((answer) => (
          <AnswerOption
            key={answer.id}
            answer={answer}
            isSelected={selectedIds.has(answer.id)}
            revealed={revealed}
            isCorrect={grade?.correctAnswerIds.includes(answer.id)}
            explanation={grade?.explanations[answer.id]}
            marker={
              <RadioGroupItem
                value={answer.id}
                id={`quiz-answer-${answer.id}`}
                disabled={revealed || disabled}
              />
            }
          />
        ))}
      </ul>
    </RadioGroup>
  );
}

interface MultipleBodyProps {
  question: tUserQuizQuestion;
  selectedIds: Set<string>;
  revealed: boolean;
  disabled?: boolean;
  grade?: tQuizGrade;
  onMultipleChange: (answerId: string) => void;
}

function MultipleQuestionBody({
  question,
  selectedIds,
  revealed,
  disabled,
  grade,
  onMultipleChange,
}: MultipleBodyProps) {
  return (
    <ul className="flex flex-col gap-2">
      {question.answers.map((answer) => {
        const checked = selectedIds.has(answer.id);
        return (
          <AnswerOption
            key={answer.id}
            answer={answer}
            isSelected={checked}
            revealed={revealed}
            isCorrect={grade?.correctAnswerIds.includes(answer.id)}
            explanation={grade?.explanations[answer.id]}
            marker={
              <Checkbox
                checked={checked}
                id={`quiz-answer-${answer.id}`}
                disabled={revealed || disabled}
                onCheckedChange={() => onMultipleChange(answer.id)}
              />
            }
          />
        );
      })}
    </ul>
  );
}

interface AnswerOptionProps {
  answer: tUserQuizAnswer;
  isSelected: boolean;
  revealed: boolean;
  isCorrect: boolean | undefined;
  explanation: string | undefined;
  marker: React.ReactNode;
}

function AnswerOption({
  answer,
  isSelected,
  revealed,
  isCorrect,
  explanation,
  marker,
}: AnswerOptionProps) {
  const showAsCorrect = revealed && isCorrect === true;
  const showAsWrong = revealed && isSelected && isCorrect !== true;
  const showExplanation =
    revealed && explanation && (showAsCorrect || showAsWrong);

  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-md border border-border bg-background px-3 py-2",
        showAsCorrect &&
          "border-green-500/60 bg-green-50/60 dark:bg-green-950/20",
        showAsWrong && "border-red-500/60 bg-red-50/60 dark:bg-red-950/20",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 items-center">{marker}</div>
        <label htmlFor={`quiz-answer-${answer.id}`} className="flex-1 cursor-pointer text-sm">{answer.text}</label>
        {revealed && isCorrect === true && (
          <CheckCircle2Icon className="mt-1 size-5 shrink-0 text-green-600 dark:text-green-400" />
        )}
        {showAsWrong && (
          <XCircleIcon className="mt-1 size-5 shrink-0 text-red-600 dark:text-red-400" />
        )}
      </div>
      {showExplanation && (
        <p className="ml-9 text-xs leading-relaxed text-muted-foreground">
          {explanation}
        </p>
      )}
    </li>
  );
}
