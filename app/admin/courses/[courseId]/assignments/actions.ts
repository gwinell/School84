"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/app/data/admin/require-admin";
import prisma from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/responses";

const assignmentSchema = z.object({
  courseId: z.string().min(1),
  userId: z.string().min(1),
  accessMode: z.enum(["ALL_AT_ONCE", "SEQUENTIAL"]),
});

export async function assignCourseToStudent(input: unknown) {
  await requireAdmin();
  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) return errorResponse("Некорректные данные назначения", null);

  const [course, student] = await Promise.all([
    prisma.course.findUnique({ where: { id: parsed.data.courseId }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true, role: true } }),
  ]);
  if (!course) return errorResponse("Курс не найден", null);
  if (!student || student.role === "admin") {
    return errorResponse("Выберите ученика", null);
  }

  try {
    const enrollment = await prisma.enrollment.upsert({
      where: {
        userId_courseId: { userId: student.id, courseId: course.id },
      },
      create: {
        userId: student.id,
        courseId: course.id,
        status: "Active",
        amount: 0,
        accessMode: parsed.data.accessMode,
      },
      update: {
        status: "Active",
        accessMode: parsed.data.accessMode,
      },
      select: { id: true },
    });

    revalidatePath(`/admin/courses/${course.id}/edit`);
    revalidatePath("/dashboard");
    return successResponse("Курс назначен ученику", enrollment);
  } catch {
    return errorResponse("Не удалось назначить курс", null);
  }
}
