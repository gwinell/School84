"use server";

import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCourseTeacher } from "@/app/data/teacher/require-course-teacher";
import { requireTeacher } from "@/app/data/teacher/require-teacher";
import { requireUser } from "@/app/data/user/require-user";
import prisma from "@/lib/prisma";
import { env } from "@/lib/env";
import { errorResponse, successResponse } from "@/lib/responses";

const enrollmentOptions = z.object({ courseId: z.string().min(1), accessMode: z.enum(["ALL_AT_ONCE", "SEQUENTIAL"]).default("ALL_AT_ONCE"), dueAt: z.string().datetime().optional().nullable() });
const emailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase());

async function assignExistingStudent(courseId: string, userId: string, accessMode: "ALL_AT_ONCE" | "SEQUENTIAL", dueAt: Date | null | undefined) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user || user.role === "admin" || user.role === "teacher") return false;
  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId, courseId } },
    create: { userId, courseId, status: "Active", amount: 0, accessMode, dueAt: dueAt ?? null },
    update: { status: "Active", accessMode, ...(dueAt === undefined ? {} : { dueAt }) },
  });
  await prisma.studentNotification.upsert({
    where: { userId_courseId_type: { userId, courseId, type: "COURSE_ASSIGNED" } },
    create: { userId, courseId, type: "COURSE_ASSIGNED", title: "Вам назначен курс", body: "Новый курс доступен в личном кабинете." },
    update: { readAt: null },
  });
  return true;
}

export async function assignCourseToStudent(input: unknown) {
  const parsed = enrollmentOptions.extend({ userId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return errorResponse("Некорректные данные назначения", null);
  const { course } = await requireCourseTeacher(parsed.data.courseId);
  const dueAt = parsed.data.dueAt === undefined ? undefined : parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  const ok = await assignExistingStudent(course.id, parsed.data.userId, parsed.data.accessMode, dueAt);
  if (!ok) return errorResponse("Выберите аккаунт ученика", null);
  revalidatePath(`/teacher/courses/${course.id}`); revalidatePath(`/admin/courses/${course.id}/edit`); revalidatePath("/dashboard");
  return successResponse("Курс назначен ученику", { userId: parsed.data.userId });
}

export async function bulkAssignStudents(input: unknown) {
  const parsed = enrollmentOptions.extend({ emails: z.array(z.string()).max(100).optional(), userIds: z.array(z.string().min(1)).max(100).optional() }).safeParse(input);
  if (!parsed.success || (!parsed.data.emails?.length && !parsed.data.userIds?.length) || (parsed.success && (parsed.data.emails?.length ?? 0) + (parsed.data.userIds?.length ?? 0) > 100)) return errorResponse("Добавьте до 100 email или учеников", null);
  const { course } = await requireCourseTeacher(parsed.data.courseId);
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const raw of parsed.data.emails ?? []) {
    const email = emailSchema.safeParse(raw);
    if (!email.success) invalid.push(raw.slice(0, 254)); else emails.push(email.data);
  }
  const users = await prisma.user.findMany({ where: { OR: [{ id: { in: parsed.data.userIds ?? [] } }, { email: { in: emails } }] }, select: { id: true, email: true, role: true, enrollment: { where: { courseId: course.id }, select: { status: true } } } });
  const inputIds = new Set(parsed.data.userIds ?? []);
  const existing = new Map(users.filter((user) => user.role !== "admin" && user.role !== "teacher").map((user) => [user.id, user]));
  const resolved = users.filter((user) => existing.has(user.id));
  const resolvedKeys = new Set(resolved.map((user) => user.email.toLowerCase()));
  for (const email of emails) if (!resolvedKeys.has(email)) invalid.push(email);
  let created = 0, alreadyAssigned = 0;
  const dueAt = parsed.data.dueAt === undefined ? undefined : parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  await prisma.$transaction(async (tx) => {
    for (const user of resolved) {
      if (user.enrollment.some((enrollment) => enrollment.status === "Active")) { alreadyAssigned++; continue; }
      await tx.enrollment.upsert({ where: { userId_courseId: { userId: user.id, courseId: course.id } }, create: { userId: user.id, courseId: course.id, status: "Active", amount: 0, accessMode: parsed.data.accessMode, dueAt: dueAt ?? null }, update: { status: "Active", accessMode: parsed.data.accessMode, ...(dueAt === undefined ? {} : { dueAt }) } });
      await tx.studentNotification.upsert({ where: { userId_courseId_type: { userId: user.id, courseId: course.id, type: "COURSE_ASSIGNED" } }, create: { userId: user.id, courseId: course.id, type: "COURSE_ASSIGNED", title: "Вам назначен курс", body: "Новый курс доступен в личном кабинете." }, update: { readAt: null } });
      created++;
    }
  });
  for (const id of inputIds) if (!resolved.some((user) => user.id === id)) invalid.push(id);
  revalidatePath(`/teacher/courses/${course.id}`); revalidatePath("/dashboard");
  return successResponse("Групповое назначение завершено", { created, alreadyAssigned, invalid: [...new Set(invalid)] });
}

export async function inviteStudentToCourse(input: unknown) {
  const parsed = enrollmentOptions.extend({ email: z.string() }).safeParse(input);
  if (!parsed.success) return errorResponse("Проверьте email и настройки курса", null);
  const { session: teacherSession, course } = await requireCourseTeacher(parsed.data.courseId);
  const email = emailSchema.safeParse(parsed.data.email);
  if (!email.success) return errorResponse("Некорректный email", null);
  const user = await prisma.user.findFirst({ where: { email: { equals: email.data, mode: "insensitive" } }, select: { id: true, role: true, enrollment: { where: { courseId: course.id }, select: { status: true } } } });
  const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  if (user) {
    if (user.role === "admin" || user.role === "teacher") return errorResponse("Этот email принадлежит преподавателю", null);
    if (user.enrollment.some((e) => e.status === "Active")) return successResponse("Ученик уже записан", { inviteUrl: null, alreadyAssigned: true });
    await assignExistingStudent(course.id, user.id, parsed.data.accessMode, dueAt);
    return successResponse("Курс назначен существующему ученику", { inviteUrl: null, alreadyAssigned: false });
  }
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction(async (tx) => {
    await tx.courseInvitation.deleteMany({ where: { courseId: course.id, email: email.data, acceptedAt: null } });
    await tx.courseInvitation.create({ data: { courseId: course.id, email: email.data, tokenHash: createHash("sha256").update(token).digest("hex"), accessMode: parsed.data.accessMode, dueAt, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), createdById: teacherSession.user.id } });
  });
  return successResponse("Приглашение создано на 7 дней", { inviteUrl: `${env.BETTER_AUTH_URL.replace(/\/$/, "")}/invite/${token}`, alreadyAssigned: false });
}

export async function acceptCourseInvitation(token: string) {
  const session = await requireUser();
  if (!session.user.emailVerified) return errorResponse("Сначала подтвердите email", null);
  if (session.user.role === "admin" || session.user.role === "teacher") return errorResponse("Это приглашение предназначено для аккаунта ученика", null);
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return errorResponse("Приглашение недействительно или истекло", null);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invitation = await prisma.courseInvitation.findUnique({ where: { tokenHash } });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date() || invitation.email.toLowerCase() !== session.user.email.toLowerCase()) return errorResponse("Приглашение недействительно или истекло", null);
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.courseInvitation.updateMany({ where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
    if (!claimed.count) return false;
    await tx.enrollment.upsert({ where: { userId_courseId: { userId: session.user.id, courseId: invitation.courseId } }, create: { userId: session.user.id, courseId: invitation.courseId, amount: 0, status: "Active", accessMode: invitation.accessMode, dueAt: invitation.dueAt }, update: { status: "Active", accessMode: invitation.accessMode, dueAt: invitation.dueAt } });
    await tx.studentNotification.upsert({ where: { userId_courseId_type: { userId: session.user.id, courseId: invitation.courseId, type: "COURSE_ASSIGNED" } }, create: { userId: session.user.id, courseId: invitation.courseId, type: "COURSE_ASSIGNED", title: "Вам назначен курс", body: "Новый курс доступен в личном кабинете." }, update: { readAt: null } });
    return true;
  });
  if (!result) return errorResponse("Приглашение уже использовано", null);
  revalidatePath("/dashboard"); return successResponse("Курс добавлен", { courseId: invitation.courseId });
}

export async function cancelEnrollment(input: unknown) {
  const parsed = z.object({ courseId: z.string().min(1), userId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return errorResponse("Некорректное назначение", null);
  const { course } = await requireCourseTeacher(parsed.data.courseId);
  const changed = await prisma.enrollment.updateMany({ where: { courseId: course.id, userId: parsed.data.userId, status: "Active" }, data: { status: "Cancelled" } });
  if (changed.count) await prisma.studentNotification.deleteMany({ where: { userId: parsed.data.userId, courseId: course.id } });
  revalidatePath(`/teacher/courses/${course.id}`); revalidatePath("/dashboard");
  return changed.count ? successResponse("Доступ ученика отменён", null) : errorResponse("Активное назначение не найдено", null);
}

export async function setEnrollmentDueDate(input: unknown) {
  const parsed = z.object({ courseId: z.string().min(1), userId: z.string().min(1), dueAt: z.string().datetime().nullable() }).safeParse(input);
  if (!parsed.success) return errorResponse("Некорректный срок", null);
  const { course } = await requireCourseTeacher(parsed.data.courseId);
  const changed = await prisma.enrollment.updateMany({ where: { courseId: course.id, userId: parsed.data.userId, status: "Active" }, data: { dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null } });
  if (!changed.count) return errorResponse("Активное назначение не найдено", null);
  await prisma.studentNotification.deleteMany({ where: { userId: parsed.data.userId, courseId: course.id, type: { in: ["COURSE_DUE_SOON", "COURSE_OVERDUE"] } } });
  revalidatePath(`/teacher/courses/${course.id}`); revalidatePath("/dashboard");
  return successResponse("Срок сохранён", null);
}

export async function submitReview(input: unknown) {
  const parsed = z.object({ codeSubmissionId: z.string().optional(), quizAttemptId: z.string().optional(), score: z.number().int().min(0).max(100), comment: z.string().trim().min(1).max(2000) }).refine((v) => Boolean(v.codeSubmissionId) !== Boolean(v.quizAttemptId)).safeParse(input);
  if (!parsed.success) return errorResponse("Укажите одну работу, оценку 0–100 и комментарий", null);
  const session = await requireTeacher();
  const allowedCourseIds = session.user.role === "admin"
    ? null
    : (await prisma.courseInstructor.findMany({ where: { userId: session.user.id }, select: { courseId: true } })).map((row) => row.courseId);
  const scope = allowedCourseIds ? { lessonCell: { lesson: { chapter: { courseId: { in: allowedCourseIds } } } } } : {};
  const target = parsed.data.codeSubmissionId
    ? await prisma.codeSubmission.findFirst({ where: { id: parsed.data.codeSubmissionId, ...scope }, select: { id: true, lessonCell: { select: { lesson: { select: { chapter: { select: { courseId: true } } } } } } } })
    : await prisma.quizAttempt.findFirst({ where: { id: parsed.data.quizAttemptId, ...scope }, select: { id: true, lessonCell: { select: { lesson: { select: { chapter: { select: { courseId: true } } } } } } } });
  if (!target) return errorResponse("Работа не найдена или недоступна", null);
  const courseId = target.lessonCell.lesson.chapter.courseId;
  const where = parsed.data.codeSubmissionId ? { codeSubmissionId: parsed.data.codeSubmissionId } : { quizAttemptId: parsed.data.quizAttemptId };
  const feedback = await prisma.submissionFeedback.upsert({ where, create: { ...where, reviewerId: session.user.id, score: parsed.data.score, comment: parsed.data.comment }, update: { reviewerId: session.user.id, score: parsed.data.score, comment: parsed.data.comment } });
  revalidatePath(`/teacher/courses/${courseId}`); revalidatePath("/dashboard");
  return successResponse("Обратная связь сохранена", { id: feedback.id, score: feedback.score, comment: feedback.comment, updatedAt: feedback.updatedAt });
}

export async function assignTeacherToCourse(input: unknown) {
  const session = await requireTeacher();
  if (session.user.role !== "admin") return errorResponse("Только администратор назначает преподавателей", null);
  const parsed = z.object({ courseId: z.string().min(1), userId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return errorResponse("Некорректные данные", null);
  const course = await prisma.course.findUnique({ where: { id: parsed.data.courseId }, select: { id: true } });
  const teacher = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true, role: true } });
  if (!course) return errorResponse("Курс не найден", null);
  if (!teacher || teacher.role === "admin") return errorResponse("Выберите обычный пользовательский аккаунт", null);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: teacher.id }, data: { role: "teacher" } });
    await tx.courseInstructor.upsert({ where: { courseId_userId: { courseId: course.id, userId: teacher.id } }, create: { courseId: course.id, userId: teacher.id }, update: {} });
  });
  revalidatePath("/teacher"); revalidatePath(`/teacher/courses/${course.id}`); return successResponse("Преподаватель назначен", null);
}

export async function removeTeacherFromCourse(input: unknown) {
  const session = await requireTeacher();
  if (session.user.role !== "admin") return errorResponse("Только администратор управляет преподавателями", null);
  const parsed = z.object({ courseId: z.string().min(1), userId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return errorResponse("Некорректные данные", null);
  const removed = await prisma.courseInstructor.deleteMany({ where: { courseId: parsed.data.courseId, userId: parsed.data.userId } });
  revalidatePath("/teacher"); revalidatePath(`/teacher/courses/${parsed.data.courseId}`);
  return removed.count ? successResponse("Доступ преподавателя к курсу снят", null) : errorResponse("Назначение не найдено", null);
}

export async function markNotificationRead(id: string) {
  const session = await requireUser();
  const parsed = z.string().min(1).safeParse(id);
  if (!parsed.success) return errorResponse("Уведомление не найдено", null);
  const result = await prisma.studentNotification.updateMany({ where: { id: parsed.data, userId: session.user.id, readAt: null }, data: { readAt: new Date() } });
  return successResponse(result.count ? "Уведомление отмечено" : "Без изменений", null);
}

export async function cancelCourseInvitation(input: unknown) {
  const parsed = z.object({ courseId: z.string().min(1), invitationId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return errorResponse("Некорректное приглашение", null);
  const { course } = await requireCourseTeacher(parsed.data.courseId);
  const deleted = await prisma.courseInvitation.deleteMany({ where: { id: parsed.data.invitationId, courseId: course.id, acceptedAt: null } });
  revalidatePath(`/teacher/courses/${course.id}`);
  return deleted.count ? successResponse("Приглашение отменено", null) : errorResponse("Приглашение не найдено или уже использовано", null);
}
