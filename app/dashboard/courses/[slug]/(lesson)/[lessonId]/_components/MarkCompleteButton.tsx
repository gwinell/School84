"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, CircleIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { tryCatch } from "@/hooks/try-catch";

import { setLessonCompletionAction } from "../actions";

interface MarkCompleteButtonProps {
  lessonId: string;
  completed: boolean;
}

export function MarkCompleteButton({
  lessonId,
  completed,
}: MarkCompleteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  function runToggle(next: boolean) {
    startTransition(async () => {
      const { data: result, error } = await tryCatch(
        setLessonCompletionAction({ lessonId, completed: next }),
      );

      if (error || !result) {
        toast.error("Unexpected error. Please try again.");
        return;
      }

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setIsConfirmOpen(false);
      router.refresh();

    });
  }

  if (!completed) {
    return (
      <>
        <Button
          size="lg"
          className="w-full sm:w-auto"
          onClick={() => runToggle(true)}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <CircleIcon className="size-4" />
          )}
          Mark as completed
        </Button>

      </>
    );
  }

  return (
    <>
      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogTrigger
          render={
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
              disabled={isPending}
            >
              <CheckCircle2Icon className="size-4 text-primary" />
              Completed
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as incomplete?</AlertDialogTitle>
            <AlertDialogDescription>
              This lesson will be removed from your completed progress.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsConfirmOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => runToggle(false)}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                "Mark as incomplete"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}
