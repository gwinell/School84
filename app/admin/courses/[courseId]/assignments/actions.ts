"use server";

import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { request } from "@arcjet/next";
import { z } from "zod";
import arcjet, { fixedWindow } from "@/lib/arcjet";
import { requireCourseTeacher } from "@/app/data/teacher/require-course-teacher";
import { requireTeacher } from "@/app/data/teacher/require-teacher";
import { requireUser } from "@/app/data/user/require-user";
import prisma from "@/lib/prisma";
import { env } from "@/lib/env";
import { resend } from "@/lib/resend";
import { errorResponse, successResponse } from "@/lib/responses";

const enrollmentOptions = z.object({ courseId: z.string().min(1), accessMode: z.enum(["ALL_AT_ONCE", "SEQUENTIAL"]).default("ALL_AT_ONCE"), dueAt: z.string().datetime().optional().nullable() });
const emailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase());
const invitationActorLimit = arcjet.withRule(fixedWindow({ mode: "LIVE", window: "1m", max: 10 }));
const invitationRecipientLimit = arcjet.withRule(fixedWindow({ mode: "LIVE", window: "1h", max: 3 }));
const bulkAssignmentActorLimit = arcjet.withRule(fixedWindow({ mode: "LIVE", window: "1m", max: 5 }));
const localRateLimitBuckets = new Map<string, { windowEndsAt: number; count: number }>();

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
  const parsed = enrollmentOptions.extend({ userIds: z.array(z.string().min(1)).max(100) }).safeParse(input);
  if (!parsed.success || !parsed.data.userIds.length) return errorResponse("Добавьте до 100 учеников", null);
  const { session: teacherSession, course } = await requireCourseTeacher(parsed.data.courseId);
  if (!(await canBulkAssignStudents(teacherSession.user.id))) {
    return errorResponse("Не удалось обработать назначение. Повторите позже.", null);
  }
  const userIds = [...new Set(parsed.data.userIds)];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, role: true, enrollment: { where: { courseId: course.id }, select: { status: true } } } });
  const eligible = users.filter((user) => user.role !== "admin" && user.role !== "teacher");
  const dueAt = parsed.data.dueAt === undefined ? undefined : parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  await prisma.$transaction(async (tx) => {
    for (const user of eligible) {
      if (user.enrollment.some((enrollment) => enrollment.status === "Active")) continue;
      await tx.enrollment.upsert({ where: { userId_courseId: { userId: user.id, courseId: course.id } }, create: { userId: user.id, courseId: course.id, status: "Active", amount: 0, accessMode: parsed.data.accessMode, dueAt: dueAt ?? null }, update: { status: "Active", accessMode: parsed.data.accessMode, ...(dueAt === undefined ? {} : { dueAt }) } });
      await tx.studentNotification.upsert({ where: { userId_courseId_type: { userId: user.id, courseId: course.id, type: "COURSE_ASSIGNED" } }, create: { userId: user.id, courseId: course.id, type: "COURSE_ASSIGNED", title: "Вам назначен курс", body: "Новый курс доступен в личном кабинете." }, update: { readAt: null } });
    }
  });
  revalidatePath(`/teacher/courses/${course.id}`); revalidatePath("/dashboard");
  return successResponse("Запрос обработан. Доступ предоставлен подходящим аккаунтам.", { requested: parsed.data.userIds.length });
}

export async function bulkInviteStudentsToCourse(input: unknown) {
  const parsed = enrollmentOptions.extend({ emails: z.array(z.string()).min(1).max(10) }).safeParse(input);
  if (!parsed.success) return errorResponse("Укажите не более 10 email-адресов", null);

  const validEmails = new Set<string>();
  let invalidCount = 0;
  for (const raw of parsed.data.emails) {
    const result = emailSchema.safeParse(raw);
    if (result.success) validEmails.add(result.data); else invalidCount++;
  }
  const emails = [...validEmails];
  if (!emails.length) return errorResponse("Проверьте формат email-адресов", null);

  const { session: teacherSession, course } = await requireCourseTeacher(parsed.data.courseId);
  // Preflight every unique, valid recipient before creating any records or
  // sending mail. A denied bucket must not result in a partially issued batch.
  for (const email of emails) {
    if (!(await canSendCourseInvitation({ teacherId: teacherSession.user.id, email }))) {
      return errorResponse("Не удалось обработать приглашения. Повторите позже.", null);
    }
  }

  const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  const invitations = emails.map((email) => {
    const token = randomBytes(32).toString("base64url");
    return {
      email,
      token,
      inviteUrl: `${env.BETTER_AUTH_URL.replace(/\/$/, "")}/invite/${token}`,
      record: {
        courseId: course.id,
        email,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        accessMode: parsed.data.accessMode,
        dueAt,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdById: teacherSession.user.id,
      },
    };
  });

  await prisma.$transaction(async (tx) => {
    for (const invitation of invitations) {
      await tx.courseInvitation.deleteMany({ where: { courseId: course.id, email: invitation.email, acceptedAt: null } });
      await tx.courseInvitation.create({ data: invitation.record });
    }
  });

  let sent = 0;
  let failed = 0;
  const manualInvites: Array<{ email: string; inviteUrl: string }> = [];
  if (env.AUTH_EMAIL_MODE === "console") {
    for (const invitation of invitations) {
      console.info(`[School 84 local invitation] ${invitation.email}: ${invitation.inviteUrl}`);
      manualInvites.push({ email: invitation.email, inviteUrl: invitation.inviteUrl });
    }
  } else {
    for (const invitation of invitations) {
      try {
        const result = await resend.emails.send({
          from: env.EMAIL_FROM,
          to: [invitation.email],
          subject: `Приглашение на курс «${course.title}»`,
          text: `Вас пригласили на курс «${course.title}». Откройте ссылку, чтобы принять приглашение: ${invitation.inviteUrl}\n\nСсылка действует 7 дней и может быть использована один раз.`,
          html: `<p>Вас пригласили на курс «${escapeHtml(course.title)}».</p><p><a href="${escapeHtml(invitation.inviteUrl)}">Принять приглашение</a></p><p>Ссылка действует 7 дней и может быть использована один раз.</p>`,
        });
        if (result.error) throw result.error;
        sent++;
      } catch (error) {
        console.error("Failed to send course invitation email", error);
        failed++;
        manualInvites.push({ email: invitation.email, inviteUrl: invitation.inviteUrl });
      }
    }
  }

  revalidatePath(`/teacher/courses/${course.id}`);
  const emailDelivery: "console" | "sent" | "failed" | "partial" = env.AUTH_EMAIL_MODE === "console" ? "console" : failed === 0 ? "sent" : sent === 0 ? "failed" : "partial";
  return successResponse("Запрос обработан. Приглашения отправлены или подготовлены для передачи; ссылка действует 7 дней.", {
    requested: emails.length,
    invalidCount,
    sent,
    failed,
    emailDelivery,
    manualInvites,
  });
}

export async function inviteStudentToCourse(input: unknown) {
  const parsed = enrollmentOptions.extend({ email: z.string() }).safeParse(input);
  if (!parsed.success) return errorResponse("Проверьте email и настройки курса", null);
  const { session: teacherSession, course } = await requireCourseTeacher(parsed.data.courseId);
  const email = emailSchema.safeParse(parsed.data.email);
  if (!email.success) return errorResponse("Некорректный email", null);

  if (!(await canSendCourseInvitation({ teacherId: teacherSession.user.id, email: email.data }))) {
    return errorResponse("Не удалось обработать приглашение. Повторите позже.", null);
  }

  const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction(async (tx) => {
    await tx.courseInvitation.deleteMany({ where: { courseId: course.id, email: email.data, acceptedAt: null } });
    await tx.courseInvitation.create({ data: { courseId: course.id, email: email.data, tokenHash: createHash("sha256").update(token).digest("hex"), accessMode: parsed.data.accessMode, dueAt, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), createdById: teacherSession.user.id } });
  });
  const inviteUrl = `${env.BETTER_AUTH_URL.replace(/\/$/, "")}/invite/${token}`;

  // Keep the invitation durable before sending. A mail provider failure must
  // never destroy the only usable invite link; the teacher can share it from
  // the response UI and retry by creating a fresh invitation if needed.
  if (env.AUTH_EMAIL_MODE === "console") {
    console.info(`[School 84 local invitation] ${email.data}: ${inviteUrl}`);
    return successResponse("Если адрес может принять приглашение, ссылка отправлена или подготовлена для передачи; она действует 7 дней", {
      inviteUrl,
      alreadyAssigned: false,
      emailDelivery: "console" as const,
    });
  }

  try {
    const result = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: [email.data],
      subject: `Приглашение на курс «${course.title}»`,
      text: `Вас пригласили на курс «${course.title}». Откройте ссылку, чтобы принять приглашение: ${inviteUrl}\n\nСсылка действует 7 дней и может быть использована один раз.`,
      html: `<p>Вас пригласили на курс «${escapeHtml(course.title)}».</p><p><a href="${escapeHtml(inviteUrl)}">Принять приглашение</a></p><p>Ссылка действует 7 дней и может быть использована один раз.</p>`,
    });
    if (result.error) throw result.error;
    return successResponse("Если адрес может принять приглашение, ссылка отправлена или подготовлена для передачи; она действует 7 дней", {
      inviteUrl,
      alreadyAssigned: false,
      emailDelivery: "sent" as const,
    });
  } catch (error) {
    console.error("Failed to send course invitation email", error);
    return successResponse("Приглашение создано, но письмо не отправлено. Скопируйте ссылку и передайте её ученику вручную", {
      inviteUrl,
      alreadyAssigned: false,
      emailDelivery: "failed" as const,
    });
  }
}

function rateLimitFingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function canBulkAssignStudents(teacherId: string) {
  const fingerprint = rateLimitFingerprint(`bulk-assign:actor:${teacherId}`);
  if (env.ARCJET_ENABLED !== "true") {
    return takeLocalRateLimitSlot(`bulk-assignment:${fingerprint}`, 5, 60_000);
  }
  try {
    const req = await request();
    const decision = await bulkAssignmentActorLimit.protect(req, { fingerprint });
    return !decision.isDenied();
  } catch {
    return false;
  }
}

async function canSendCourseInvitation({ teacherId, email }: { teacherId: string; email: string }) {
  const actorFingerprint = rateLimitFingerprint(`course-invite:actor:${teacherId}`);
  const recipientFingerprint = rateLimitFingerprint(`course-invite:recipient:${teacherId}:${email}`);

  // The local/demo profile intentionally disables Arcjet credentials. Enforce
  // the same ceilings in this single-process mode instead of silently allowing
  // unbounded invite emails. Map size is capped so unique addresses cannot grow
  // memory indefinitely; at capacity, new buckets are rejected until expiry.
  if (env.ARCJET_ENABLED !== "true") {
    return takeLocalRateLimitSlot(actorFingerprint, 10, 60_000) &&
      takeLocalRateLimitSlot(recipientFingerprint, 3, 60 * 60_000);
  }

  try {
    const req = await request();
    const actorDecision = await invitationActorLimit.protect(req, { fingerprint: actorFingerprint });
    if (actorDecision.isDenied()) return false;
    const recipientDecision = await invitationRecipientLimit.protect(req, { fingerprint: recipientFingerprint });
    return !recipientDecision.isDenied();
  } catch {
    // Fail closed when the external limiter cannot make a decision.
    return false;
  }
}

function takeLocalRateLimitSlot(fingerprint: string, max: number, windowMs: number) {
  const now = Date.now();
  for (const [key, bucket] of localRateLimitBuckets) {
    if (bucket.windowEndsAt <= now) localRateLimitBuckets.delete(key);
  }

  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = `${fingerprint}:${windowMs}:${windowStart}`;
  const bucket = localRateLimitBuckets.get(key);
  if (!bucket) {
    if (localRateLimitBuckets.size >= 20_000) return false;
    localRateLimitBuckets.set(key, { windowEndsAt: windowStart + windowMs, count: 1 });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count++;
  return true;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
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
