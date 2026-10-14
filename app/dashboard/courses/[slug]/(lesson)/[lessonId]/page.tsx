import { notFound, redirect } from "next/navigation";

import { getCourseForLearning } from "@/app/data/user/get-course-for-learning";
import { getLessonQuizForUser } from "@/app/data/user/get-lesson-quiz";
import { getMyQuizAttempts } from "@/app/data/user/get-my-quiz-attempts";

import { LessonInfo } from "./_components/LessonInfo";
import { LessonQuizSection } from "./_components/LessonQuizSection";
import { LessonVideo } from "./_components/LessonVideo";
import { LessonCellStepper } from "./_components/LessonCellStepper";
import { LessonCellContent } from "./_components/LessonCellContent";
import { PassCellButton } from "./_components/PassCellButton";
import { LearningCursorMarker } from "./_components/LearningCursorMarker";
import { dashboardCourseHref } from "@/lib/organization/course-links";

interface PageParams {
  params: Promise<{ slug: string; lessonId: string; organizationSlug?: string }>;
  searchParams: Promise<{ cellId?: string }>;
}

export default async function LessonPlayerPage({ params, searchParams }: PageParams) {
  const [{ slug, lessonId, organizationSlug }, { cellId }] = await Promise.all([params, searchParams]);
  const course = await getCourseForLearning({ slug, organizationSlug, currentLessonId: lessonId });
  const courseHref = dashboardCourseHref(course.organization.slug, slug);

  const lessons = course.courseChapters.flatMap((chapter) => chapter.lessons);
  const currentIndex = lessons.findIndex((lesson) => lesson.id === lessonId);

  if (currentIndex === -1) {
    notFound();
  }

  const currentLesson = lessons[currentIndex];
  const currentChapter = course.courseChapters.find((chapter) =>
    chapter.lessons.some((lesson) => lesson.id === currentLesson.id),
  );
  const prevLessonId = lessons[currentIndex - 1]?.id ?? null;
  const nextLessonId = lessons[currentIndex + 1]?.id ?? null;

  if (!currentLesson.isUnlocked) {
    const firstUnlockedLesson = lessons.find((lesson) => lesson.isUnlocked);
    if (!firstUnlockedLesson) redirect(courseHref);
    const firstOpenCell = firstUnlockedLesson.cells.find((cell) => cell.status !== "LOCKED");
    redirect(
      firstOpenCell
        ? `${dashboardCourseHref(course.organization.slug, slug, firstUnlockedLesson.id)}?cellId=${firstOpenCell.id}`
        : dashboardCourseHref(course.organization.slug, slug, firstUnlockedLesson.id),
    );
  }

  if (currentLesson.cells.length > 0) {
    const selected = currentLesson.cells.find((cell) => cell.id === cellId);
    const firstUnlocked = currentLesson.cells.find((cell) => cell.status === "AVAILABLE" || cell.status === "IN_PROGRESS") ??
      [...currentLesson.cells].reverse().find((cell) => cell.status === "PASSED");
    const active = selected && selected.status !== "LOCKED"
      ? selected
      : cellId
        ? firstUnlocked
        : currentLesson.cells.find((cell) => cell.status === "AVAILABLE" || cell.status === "IN_PROGRESS") ??
          [...currentLesson.cells].reverse().find((cell) => cell.status === "PASSED") ??
          firstUnlocked;

    if (!active) redirect(courseHref);
    if (cellId && (!selected || selected.status === "LOCKED")) {
      redirect(`${dashboardCourseHref(course.organization.slug, slug, lessonId)}?cellId=${active.id}`);
    }

    const quizAttempts = active.type === "QUIZ" ? await getMyQuizAttempts(active.id) : [];

    return (
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Урок {currentLesson.position}</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{currentLesson.title}</h1>
          </div>
          <p className="text-xs text-muted-foreground">Тема {currentChapter?.title}</p>
        </div>

        <LessonCellStepper
          courseSlug={slug}
          organizationSlug={course.organization.slug}
          lessonId={lessonId}
          cells={currentLesson.cells}
          activeCellId={active.id}
        />
        <LearningCursorMarker key={`cursor-${active.id}`} courseId={course.id} lessonId={currentLesson.id} cellId={active.id} />

        {currentLesson.videoUrl ? (
          <LessonVideo videoUrl={currentLesson.videoUrl} title={currentLesson.title} />
        ) : null}

        <LessonCellContent key={active.id} cell={active} quizAttempts={quizAttempts} />
        {active.type === "TEXT" || (active.type === "QUIZ" && !active.quiz?.questions.length) ? (
          <PassCellButton cellId={active.id} passed={active.status === "PASSED"} />
        ) : null}
      </div>
    );
  }

  const quiz = await getLessonQuizForUser({ lessonId: currentLesson.id });

  return (
    <div className="space-y-6">
      <LessonVideo
        videoUrl={currentLesson.videoUrl}
        title={currentLesson.title}
      />
      <LearningCursorMarker courseId={course.id} lessonId={currentLesson.id} />

      <LessonInfo
        lessonId={currentLesson.id}
        title={currentLesson.title}
        description={currentLesson.description}
        completed={currentLesson.completed}
        courseSlug={slug}
        organizationSlug={course.organization.slug}
        prevLessonId={prevLessonId}
        nextLessonId={nextLessonId}
      />

      {quiz ? <LessonQuizSection quiz={quiz} /> : null}
    </div>
  );
}
