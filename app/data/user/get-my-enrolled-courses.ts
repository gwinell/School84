import "server-only";

import prisma from "@/lib/prisma";
import { getDownloadUrls } from "@/lib/s3/get-download-url";
import { canAccessAssignedLesson } from "@/lib/course-access";
import { requireUser } from "./require-user";

export type tEnrolledCourse = {
  enrollmentId: string;
  id: string;
  slug: string;
  title: string;
  smallDesc: string;
  imageUrl: string | null;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  duration: number;
  chaptersCount: number;
  lessonsCount: number;
  completedCount: number;
  resumeLessonId: string | null;
  resumeCellId: string | null;
};

export async function getMyEnrolledCourses(): Promise<tEnrolledCourse[]> {
  const session = await requireUser();

  const enrollments = await prisma.enrollment.findMany({
    where: {
      userId: session.user.id,
      status: "Active",
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      accessMode: true,
      course: {
        select: {
          id: true,
          slug: true,
          title: true,
          smallDesc: true,
          fileKey: true,
          level: true,
          duration: true,
          courseChapters: {
            orderBy: { position: "asc" },
            select: {
              lessons: {
                orderBy: { position: "asc" },
                select: {
                  id: true,
                  cells: { orderBy: { position: "asc" }, select: { id: true, progress: { where: { userId: session.user.id }, select: { status: true } } } },
                  lessonProgress: {
                    where: { userId: session.user.id },
                    select: { completed: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const imageUrls = await getDownloadUrls(
    enrollments.map((e) => e.course.fileKey),
  );

  const cursors = await prisma.learningCursor.findMany({ where: { userId: session.user.id, courseId: { in: enrollments.map((e) => e.course.id) } }, select: { courseId: true, lessonId: true, cellId: true } });
  const cursorByCourse = new Map(cursors.map((cursor) => [cursor.courseId, cursor]));

  return Promise.all(enrollments.map(async (enrollment, i) => {
    const chapters = enrollment.course.courseChapters;
    const lessons = chapters.flatMap((chapter) =>
      chapter.lessons.map((lesson) => ({
        id: lesson.id,
        completed: lesson.lessonProgress[0]?.completed ?? false,
        cells: lesson.cells.map((cell) => ({ id: cell.id, passed: cell.progress[0]?.status === "PASSED" })),
      })),
    );
    const lessonsCount = lessons.length;
    const completedCount = lessons.filter((lesson) => lesson.completed).length;
    const cursor = cursorByCourse.get(enrollment.course.id);
    const cursorLesson = cursor ? lessons.find((lesson) => lesson.id === cursor.lessonId) : undefined;
    const cursorCell = cursorLesson?.cells.find((cell) => cell.id === cursor?.cellId);
    const cursorAllowed = cursorLesson && (session.user.role === "admin" || enrollment.accessMode !== "SEQUENTIAL" || await canAccessAssignedLesson({ userId: session.user.id, courseId: enrollment.course.id, lessonId: cursorLesson.id }));
    const fallbackLesson = lessons.find((lesson) => !lesson.completed) ?? lessons[0];
    const resumeLessonId = cursorAllowed ? cursorLesson!.id : fallbackLesson?.id ?? null;
    const resumeCellId = cursorAllowed
      ? cursorCell?.id ?? cursorLesson!.cells.find((cell) => !cell.passed)?.id ?? cursorLesson!.cells[0]?.id ?? null
      : fallbackLesson?.cells.find((cell) => !cell.passed)?.id ?? fallbackLesson?.cells[0]?.id ?? null;

    return {
      enrollmentId: enrollment.id,
      id: enrollment.course.id,
      slug: enrollment.course.slug,
      title: enrollment.course.title,
      smallDesc: enrollment.course.smallDesc,
      imageUrl: imageUrls[i],
      level: enrollment.course.level,
      duration: enrollment.course.duration,
      chaptersCount: chapters.length,
      lessonsCount,
      completedCount,
      resumeLessonId,
      resumeCellId,
    };
  }));
}
