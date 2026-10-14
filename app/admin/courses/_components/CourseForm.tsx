"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { RichTextEditor } from "@/components/rich-text-editor/Editor";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  courseSchema,
  CourseSchemaType,
  ECourseLevel,
  ECourseStatus,
} from "@/lib/zodSchemas";
import { Uploader } from "@/components/file-uploader/Uploader";
import slugify from "slugify";
import { formatSlug } from "@/lib/formatSlug";
import { useTransition } from "react";
import { tryCatch } from "@/hooks/try-catch";
import { useConfetti } from "@/hooks/use-confetti";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { tApiResponse } from "@/types/api";
import type { tCategoryOption } from "@/app/data/admin/admin-get-category-options";

import { CategoryMultiSelect } from "./CategoryMultiSelect";

export type CourseFormProps = {
  initialValues?: Partial<CourseSchemaType>;
  submitAction: (
    data: CourseSchemaType,
  ) => Promise<
    | tApiResponse<unknown>
    | { status: "success" | "error"; message: string; data: unknown }
  >;
  categoryOptions: tCategoryOption[];
  submitLabel?: string;
  pendingLabel?: string;
  successVerb?: string;
  successDescription?: string;
  redirectTo?: string;
  onSubmitted?: () => void;
  formId?: string;
  showReset?: boolean;
  fireConfetti?: boolean;
  existingImageUrl?: string | null;
  existingImageKey?: string | null;
  uploadCourseId?: string;
};

export function CourseForm({
  initialValues,
  submitAction,
  categoryOptions,
  submitLabel = "Create Course",
  pendingLabel = "Creating...",
  successVerb = "created",
  successDescription = "Your course has been created.",
  redirectTo = "/admin/courses",
  onSubmitted,
  formId = "course-form",
  showReset = true,
  fireConfetti = false,
  existingImageUrl = null,
  existingImageKey = null,
  uploadCourseId,
}: CourseFormProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const triggerConfetti = useConfetti();
  const form = useForm({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      title: "",
      description: "",
      smallDesc: "",
      fileKey: "",
      priceCents: 0,
      duration: 1,
      level: ECourseLevel.BEGINNER,
      status: ECourseStatus.DRAFT,
      slug: "",
      categories: [],
      ...initialValues,
    },
  });

  const onSubmit = (data: CourseSchemaType) => {
    startTransition(async () => {
      const { data: result, error } = await tryCatch(submitAction(data));

      if (error) {
        toast.error("An unexpected error occurred. Please try again.");
        return;
      }

      if (result?.status === "success") {
        toast.success(`Course ${successVerb} successfully!`, {
          description: successDescription,
        });
        if (fireConfetti) {
          triggerConfetti();
        }
        onSubmitted?.();
        if (redirectTo) {
          router.push(redirectTo);
        }
      } else if (result?.status === "error") {
        toast.error(result.message);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic Information</CardTitle>
        <CardDescription>
          Provide the basic details for the course.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form id={formId} onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            {/* Title */}
            <Controller
              name="title"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="title">Title</FieldLabel>
                  <Input
                    {...field}
                    id="title"
                    placeholder="Course Title"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    Enter a descriptive title for your course (5-32 characters)
                  </FieldDescription>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {/* Slug */}
            <Controller
              name="slug"
              control={form.control}
              render={({ field, fieldState }) => {
                const transformedSlug = field.value
                  ? formatSlug(field.value)
                  : "";

                const handleGenerateSlug = () => {
                  const title = form.getValues("title");
                  if (title) {
                    form.setValue(
                      "slug",
                      slugify(title, { lower: true, strict: true }),
                      { shouldValidate: true },
                    );
                  }
                };

                return (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="slug">Slug</FieldLabel>
                    <div className="flex gap-2">
                      <Input
                        {...field}
                        id="slug"
                        placeholder="course-slug"
                        aria-invalid={fieldState.invalid}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleGenerateSlug}
                      >
                        Generate Slug
                      </Button>
                    </div>
                    <FieldDescription>
                      {transformedSlug && transformedSlug !== field.value && (
                        <>
                          suggested slug name:{" "}
                          <strong>{transformedSlug}</strong>
                        </>
                      )}
                    </FieldDescription>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                );
              }}
            />

            {/* Small Description */}
            <Controller
              name="smallDesc"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="smallDesc">Short Description</FieldLabel>
                  <Input
                    {...field}
                    id="smallDesc"
                    placeholder="A brief description"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    Brief summary of the course (max 100 characters)
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
                  <RichTextEditor field={field} courseId={uploadCourseId} />
                  <FieldDescription>
                    Detailed description of what students will learn (max 500
                    characters)
                  </FieldDescription>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {/* Thumbnail */}
            <Controller
              name="fileKey"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="fileKey">
                    Thumbnail{" "}
                    <span className="text-muted-foreground font-normal">
                      (Optional)
                    </span>
                  </FieldLabel>
                  <Uploader
                    courseId={uploadCourseId}
                    initialPreviewUrl={existingImageUrl}
                    initialKey={existingImageKey}
                    onRemoveInitial={() => field.onChange("")}
                    onUploadComplete={(key) => {
                      field.onChange(key);
                    }}
                  />
                  {field.value === "" && existingImageKey ? (
                    <FieldDescription>
                      Current thumbnail will be removed when you save. Drop a
                      new file to replace it.
                    </FieldDescription>
                  ) : null}
                </Field>
              )}
            />

            {/* Category + Level */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Controller
                name="categories"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="categories">Categories</FieldLabel>
                    <CategoryMultiSelect
                      value={field.value ?? []}
                      onChange={field.onChange}
                      options={categoryOptions}
                    />
                    <FieldDescription>
                      Pick existing categories or type to create a new one (up to
                      10 per course)
                    </FieldDescription>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              <Controller
                name="level"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="level">Level</FieldLabel>
                    <Select
                      name={field.name}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger
                        id="level"
                        aria-invalid={fieldState.invalid}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(ECourseLevel).map((level) => (
                          <SelectItem key={level} value={level}>
                            {level.charAt(0) + level.slice(1).toLowerCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      Choose the difficulty level
                    </FieldDescription>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </div>

            {/* Duration + Price */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Controller
                name="duration"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="duration">
                      Duration (minutes)
                    </FieldLabel>
                    <Input
                      {...field}
                      id="duration"
                      type="number"
                      min="1"
                      placeholder="60"
                      aria-invalid={fieldState.invalid}
                      value={String(field.value ?? "")}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    />
                    <FieldDescription>
                      Total course duration in minutes
                    </FieldDescription>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

            </div>

            {/* Status */}
            <Controller
              name="status"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="status">Status</FieldLabel>
                  <Select
                    name={field.name}
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger
                      id="status"
                      aria-invalid={fieldState.invalid}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(ECourseStatus).map((status) => (
                        <SelectItem key={status} value={status}>
                          {status.charAt(0) + status.slice(1).toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Set the course publication status
                  </FieldDescription>
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
          {showReset && (
            <Button
              type="button"
              variant="outline"
              onClick={() => form.reset()}
            >
              Reset
            </Button>
          )}
          <Button type="submit" form={formId} disabled={isPending}>
            {isPending ? pendingLabel : submitLabel}
          </Button>
        </Field>
      </CardFooter>
    </Card>
  );
}
