"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { RichTextEditor } from "@/components/rich-text-editor/Editor";
import { Uploader } from "@/components/file-uploader/Uploader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { lessonSchema, type LessonSchemaType } from "@/lib/zodSchemas";
import { tryCatch } from "@/hooks/try-catch";

import { updateLesson } from "../actions";
import type { TAdminGetLesson } from "@/app/data/admin/admin-get-lesson";

interface iAppProps {
  data: TAdminGetLesson;
  courseId: string;
  chapterId: string;
}

export function LessonForm({ data, courseId, chapterId }: iAppProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<LessonSchemaType>({
    resolver: zodResolver(lessonSchema),
    defaultValues: {
      name: data.title,
      description: data.description ?? "",
      videoKey: data.videoKey ?? "",
      courseId,
      chapterId,
    },
  });

  const onSubmit = (values: LessonSchemaType) => {
    startTransition(async () => {
      const { data: result, error } = await tryCatch(
        updateLesson(data.id, values),
      );

      if (error) {
        toast.error("An unexpected error occurred. Please try again.");
        return;
      }

      if (result?.status === "success") {
        toast.success("Lesson updated successfully!", {
          description: "Your lesson has been updated.",
        });
        router.push(`/admin/courses/${courseId}/edit`);
      } else if (result?.status === "error") {
        toast.error(result.message);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lesson Details</CardTitle>
        <CardDescription>
          Update the lesson title, description, and media.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form id="lesson-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            {/* Name */}
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <Input
                    {...field}
                    id="name"
                    placeholder="Lesson Name"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    Enter the name of the lesson (min 3 characters)
                  </FieldDescription>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {/* Description */}
            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="description">Description</FieldLabel>
                  <RichTextEditor field={field} courseId={courseId} />
                  <FieldDescription>
                    Detailed description of what this lesson covers
                  </FieldDescription>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {/* Video */}
            <Controller
              name="videoKey"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="videoKey">
                    Video{" "}
                    <span className="text-muted-foreground font-normal">
                      (Optional)
                    </span>
                  </FieldLabel>
                  <Uploader
                    fileType="video"
                    onUploadComplete={(key) => {
                      field.onChange(key);
                    }}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
        </form>
      </CardContent>

      <CardFooter>
        <Field orientation="horizontal" className="justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/admin/courses/${courseId}/edit`)}
          >
            Cancel
          </Button>
          <Button type="submit" form="lesson-form" disabled={isPending}>
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </Field>
      </CardFooter>
    </Card>
  );
}
