import prisma from "@/lib/prisma";

/** Shared authorization for course-scoped media endpoints. */
export async function canAccessUploadCourse(input: {
  role: string | null | undefined;
  userId: string;
  courseId?: string;
}): Promise<boolean> {
  if (!input.courseId) return input.role === "admin";

  if (input.role !== "admin") {
    if (input.role !== "teacher") return false;
    const assignment = await prisma.courseInstructor.findUnique({
      where: {
        courseId_userId: { courseId: input.courseId, userId: input.userId },
      },
      select: { courseId: true },
    });
    if (!assignment) return false;
  }

  return Boolean(
    await prisma.course.findUnique({
      where: { id: input.courseId },
      select: { id: true },
    }),
  );
}
