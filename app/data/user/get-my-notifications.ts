import "server-only";

import { requireUser } from "./require-user";
import prisma from "@/lib/prisma";

export async function getMyNotifications() {
  const session = await requireUser();
  const now = new Date();
  const upcomingLimit = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const dueEnrollments = await prisma.enrollment.findMany({
    where: { userId: session.user.id, status: "Active", dueAt: { lte: upcomingLimit } },
    select: { courseId: true, dueAt: true, course: { select: { title: true, courseChapters: { select: { lessons: { select: { cells: { select: { id: true } } } } } } } } },
  });
  for (const enrollment of dueEnrollments) {
    const cells = enrollment.course.courseChapters.flatMap((chapter) => chapter.lessons.flatMap((lesson) => lesson.cells.map((cell) => cell.id)));
    if (cells.length === 0) {
      await prisma.studentNotification.deleteMany({ where: { userId: session.user.id, courseId: enrollment.courseId, type: { in: ["COURSE_DUE_SOON", "COURSE_OVERDUE"] } } });
      continue;
    }
    const passedCount = await prisma.lessonCellProgress.count({ where: { userId: session.user.id, lessonCellId: { in: cells }, status: "PASSED" } });
    if (passedCount === cells.length) {
      await prisma.studentNotification.deleteMany({ where: { userId: session.user.id, courseId: enrollment.courseId, type: { in: ["COURSE_DUE_SOON", "COURSE_OVERDUE"] } } });
      continue;
    }
    const overdue = enrollment.dueAt! < now;
    await prisma.studentNotification.deleteMany({ where: { userId: session.user.id, courseId: enrollment.courseId, type: overdue ? "COURSE_DUE_SOON" : "COURSE_OVERDUE" } });
    await prisma.studentNotification.upsert({
      where: { userId_courseId_type: { userId: session.user.id, courseId: enrollment.courseId, type: overdue ? "COURSE_OVERDUE" : "COURSE_DUE_SOON" } },
      create: { userId: session.user.id, courseId: enrollment.courseId, type: overdue ? "COURSE_OVERDUE" : "COURSE_DUE_SOON", title: overdue ? "Срок курса истёк" : "Скоро срок сдачи курса", body: `${enrollment.course.title}: срок ${enrollment.dueAt!.toLocaleDateString("ru-RU")}` },
      update: {},
    });
  }
  return prisma.studentNotification.findMany({
    where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, type: true, title: true, body: true, readAt: true, createdAt: true, courseId: true, course: { select: { title: true, slug: true, organization: { select: { slug: true } } } } },
  });
}
