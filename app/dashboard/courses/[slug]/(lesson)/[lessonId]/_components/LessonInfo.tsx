import { RenderDescription } from "@/components/rich-text-editor/RenderDescription";
import { ExpandableContent } from "@/components/ui/expandable-content";
import { Separator } from "@/components/ui/separator";
import { type JSONContent } from "@tiptap/react";

import { LessonNav } from "./LessonNav";
import { MarkCompleteButton } from "./MarkCompleteButton";

interface LessonInfoProps {
  lessonId: string;
  title: string;
  description: string | null;
  completed: boolean;
  courseSlug: string;
  organizationSlug: string;
  prevLessonId: string | null;
  nextLessonId: string | null;
}

function parseDescription(description: string | null): JSONContent | null {
  if (!description) return null;
  try {
    const parsed = JSON.parse(description) as JSONContent;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function LessonInfo({
  lessonId,
  title,
  description,
  completed,
  courseSlug,
  organizationSlug,
  prevLessonId,
  nextLessonId,
}: LessonInfoProps) {
  const parsed = parseDescription(description);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight leading-tight">
          {title}
        </h1>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <MarkCompleteButton
            lessonId={lessonId}
            completed={completed}
          />
          <LessonNav
            courseSlug={courseSlug}
            organizationSlug={organizationSlug}
            prevLessonId={prevLessonId}
            nextLessonId={nextLessonId}
          />
        </div>
      </div>

      <Separator />

      {parsed ? (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            About this lesson
          </h2>
          <ExpandableContent>
            <RenderDescription json={parsed} />
          </ExpandableContent>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          No description provided for this lesson.
        </p>
      )}
    </div>
  );
}
