"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { env } from "@/lib/env";
import { requireUser } from "@/app/data/user/require-user";
import { requireOrganizationRole } from "./authorization";
import { deriveCourseSlug } from "@/lib/formatSlug";
import { errorResponse, successResponse } from "@/lib/responses";
import { canClaimOrganizationInvitation } from "@/lib/organization/access-policy";

const organizationInput = z.object({ name: z.string().trim().min(2).max(100) });
const organizationSettingsInput = z.object({
  organizationId: z.string().min(1),
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Некорректный адрес школы"),
  logoUrl: z.preprocess((value) => value === "" ? null : value, z.union([
    z.null(),
    z.string().max(2048).url().refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password;
      } catch {
        return false;
      }
    }, "Логотип должен иметь HTTPS-адрес"),
  ])),
  primaryColor: z.preprocess((value) => value === "" ? null : value, z.union([z.null(), z.string().regex(/^#[0-9a-fA-F]{6}$/, "Цвет должен быть в формате #RRGGBB")])),
});
const inviteInput = z.object({
  organizationId: z.string().min(1),
  email: z.email().transform((email) => email.trim().toLowerCase()),
  role: z.enum(["ADMIN", "TEACHER", "STUDENT"]),
});
const HASH = (token: string) => createHash("sha256").update(token).digest("hex");

/** Authenticated school bootstrap; the creator is the first school owner. */
export async function createOrganization(input: unknown) {
  const session = await requireUser();
  const parsed = organizationInput.safeParse(input);
  if (!parsed.success) return errorResponse("Некорректное название школы", null);

  const baseSlug = deriveCourseSlug(parsed.data.name, parsed.data.name).slice(0, 52) || "school";
  const slug = `${baseSlug}-${randomBytes(3).toString("hex")}`;
  const organization = await prisma.organization.create({
    data: {
      name: parsed.data.name,
      slug,
      memberships: { create: { userId: session.user.id, role: "OWNER" } },
    },
    select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true },
  });
  revalidatePath("/teacher");
  return successResponse("Школа создана", organization);
}

export async function getMyManagedOrganizations() {
  const session = await requireUser();
  return prisma.organizationMembership.findMany({
    where: { userId: session.user.id, role: { in: ["OWNER", "ADMIN"] } },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      organization: { select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true } },
    },
  });
}

export async function getMyOrganizations() {
  const session = await requireUser();
  return prisma.organizationMembership.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      organization: { select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true } },
    },
  });
}

/** Update a school's public identity. Tenant roles are checked before any lookup or write. */
export async function updateOrganizationBranding(input: unknown) {
  const parsed = organizationSettingsInput.safeParse(input);
  if (!parsed.success) return errorResponse("Проверьте название, адрес и оформление школы", null);

  const { organizationId, ...data } = parsed.data;
  await requireOrganizationRole(organizationId, ["OWNER", "ADMIN"]);

  // ADMINs may edit school presentation, but the operation deliberately has no
  // owner or membership fields and cannot alter the owner's authority.
  const existing = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, slug: true },
  });
  if (!existing) return errorResponse("Школа не найдена", null);

  const slugConflict = await prisma.organization.findFirst({
    where: { slug: data.slug, id: { not: organizationId } },
    select: { id: true },
  });
  if (slugConflict) return errorResponse("Этот адрес школы уже занят", null);

  try {
    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: { name: data.name, slug: data.slug, logoUrl: data.logoUrl, primaryColor: data.primaryColor },
      select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true },
    });
    revalidatePath("/teacher/schools");
    revalidatePath("/teacher");
    revalidatePath(`/schools/${encodeURIComponent(existing.slug)}`);
    revalidatePath(`/schools/${encodeURIComponent(organization.slug)}`);
    revalidatePath(`/schools/${encodeURIComponent(existing.slug)}/courses`);
    revalidatePath(`/schools/${encodeURIComponent(organization.slug)}/courses`);
    revalidatePath(`/dashboard/schools/${encodeURIComponent(existing.slug)}`);
    revalidatePath(`/dashboard/schools/${encodeURIComponent(organization.slug)}`);
    return successResponse("Настройки школы сохранены", organization);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return errorResponse("Этот адрес школы уже занят", null);
    }
    throw error;
  }
}

/** Returns a one-time URL for sharing; only organization owners/admins can issue one. */
export async function createOrganizationInvitation(input: unknown) {
  const parsed = inviteInput.safeParse(input);
  if (!parsed.success) return errorResponse("Некорректное приглашение", null);
  const { session } = await requireOrganizationRole(parsed.data.organizationId, ["OWNER", "ADMIN"]);
  if (parsed.data.role === "ADMIN") {
    const membership = await prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: parsed.data.organizationId, userId: session.user.id } },
      select: { role: true },
    });
    if (session.user.role !== "admin" && membership?.role !== "OWNER") {
      return errorResponse("Только владелец школы может приглашать администратора", null);
    }
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (existing) {
    const member = await prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: parsed.data.organizationId, userId: existing.id } },
      select: { userId: true },
    });
    if (member) return errorResponse("Приглашение невозможно", null);
  }

  const token = randomBytes(32).toString("base64url");
  const invitation = await prisma.organizationInvitation.create({
    data: {
      organizationId: parsed.data.organizationId,
      email: parsed.data.email,
      role: parsed.data.role,
      tokenHash: HASH(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdById: session.user.id,
    },
    select: { id: true, expiresAt: true },
  });
  return successResponse("Приглашение создано", {
    ...invitation,
    inviteUrl: `${env.BETTER_AUTH_URL.replace(/\/$/, "")}/school-invite/${token}`,
  });
}

export async function getOrganizationMembers(organizationId: string) {
  await requireOrganizationRole(organizationId, ["OWNER", "ADMIN"]);
  return prisma.organizationMembership.findMany({
    where: { organizationId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: { role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
  });
}

export async function updateOrganizationMemberRole(input: unknown) {
  const parsed = z.object({ organizationId: z.string().min(1), userId: z.string().min(1), role: z.enum(["ADMIN", "TEACHER", "STUDENT"]) }).safeParse(input);
  if (!parsed.success) return errorResponse("Некорректная роль", null);
  const { session, membership: actorMembership } = await requireOrganizationRole(parsed.data.organizationId, ["OWNER", "ADMIN"]);
  if (parsed.data.role === "ADMIN" && session.user.role !== "admin" && actorMembership?.role !== "OWNER") {
    return errorResponse("Только владелец школы может назначить администратора", null);
  }
  const target = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId: parsed.data.organizationId, userId: parsed.data.userId } },
    select: { role: true, user: { select: { email: true } } },
  });
  if (!target || target.role === "OWNER" || (target.role === "ADMIN" && actorMembership?.role !== "OWNER" && session.user.role !== "admin")) {
    return errorResponse("Невозможно изменить роль участника", null);
  }
  await prisma.$transaction(async (tx) => {
    await tx.organizationMembership.update({
      where: { organizationId_userId: { organizationId: parsed.data.organizationId, userId: parsed.data.userId } },
      data: { role: parsed.data.role },
    });
    if (target.role === "TEACHER" && parsed.data.role !== "TEACHER") {
      await tx.courseInstructor.deleteMany({ where: { userId: parsed.data.userId, course: { organizationId: parsed.data.organizationId } } });
    }
  });
  revalidatePath("/teacher/schools");
  return successResponse("Роль обновлена", null);
}

export async function removeOrganizationMember(input: unknown) {
  const parsed = z.object({ organizationId: z.string().min(1), userId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return errorResponse("Некорректные данные", null);
  const { session, membership: actorMembership } = await requireOrganizationRole(parsed.data.organizationId, ["OWNER", "ADMIN"]);
  const target = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId: parsed.data.organizationId, userId: parsed.data.userId } },
    select: { role: true, user: { select: { email: true } } },
  });
  if (!target || target.role === "OWNER" || (target.role === "ADMIN" && actorMembership?.role !== "OWNER" && session.user.role !== "admin")) {
    return errorResponse("Невозможно удалить участника", null);
  }
  await prisma.$transaction(async (tx) => {
    // Revocation applies to every membership role. A promoted learner may
    // still have active enrollments and old invite links from their student
    // period, so role-based cleanup would leave a re-entry path.
    const courses = await tx.course.findMany({ where: { organizationId: parsed.data.organizationId }, select: { id: true } });
    const courseIds = courses.map((course) => course.id);
    if (courseIds.length) {
      await tx.enrollment.updateMany({
        where: { userId: parsed.data.userId, courseId: { in: courseIds }, status: "Active" },
        data: { status: "Cancelled" },
      });
      await tx.studentNotification.deleteMany({ where: { userId: parsed.data.userId, courseId: { in: courseIds } } });
    }
    await tx.courseInvitation.updateMany({
      where: { course: { organizationId: parsed.data.organizationId }, email: { equals: target.user.email, mode: "insensitive" }, acceptedAt: null, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() },
    });
    await tx.organizationInvitation.updateMany({
      where: { organizationId: parsed.data.organizationId, email: { equals: target.user.email, mode: "insensitive" }, acceptedAt: null, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() },
    });
    if (target.role === "TEACHER") {
      await tx.courseInstructor.deleteMany({ where: { userId: parsed.data.userId, course: { organizationId: parsed.data.organizationId } } });
    }
    await tx.organizationMembership.delete({
      where: { organizationId_userId: { organizationId: parsed.data.organizationId, userId: parsed.data.userId } },
    });
  });
  revalidatePath("/teacher/schools");
  return successResponse("Участник удалён из школы", null);
}

/** Claim is bound to the authenticated account's verified email and is one-time. */
export async function acceptOrganizationInvitation(token: string) {
  const session = await requireUser();
  // Invitation links can grant staff or even school-admin access. A matching
  // but unverified OAuth email is not sufficient proof of account ownership.
  if (!session.user.emailVerified) return errorResponse("Подтвердите адрес электронной почты перед принятием приглашения", null);
  const parsed = z.string().min(32).max(128).safeParse(token);
  if (!parsed.success) return errorResponse("Приглашение недействительно или истекло", null);
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { tokenHash: HASH(parsed.data) },
    select: { id: true, organizationId: true, email: true, role: true, expiresAt: true, acceptedAt: true },
  });
  if (!invitation || !canClaimOrganizationInvitation({
    emailVerified: session.user.emailVerified,
    accountEmail: session.user.email,
    invitationEmail: invitation.email,
    acceptedAt: invitation.acceptedAt,
    expiresAt: invitation.expiresAt,
  })) {
    return errorResponse("Приглашение недействительно или истекло", null);
  }

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.organizationInvitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date() },
    });
    if (!claimed.count) return false;
    await tx.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: invitation.organizationId, userId: session.user.id } },
      create: { organizationId: invitation.organizationId, userId: session.user.id, role: invitation.role },
      update: {},
    });
    return true;
  });
  if (!result) return errorResponse("Приглашение уже использовано", null);
  revalidatePath("/teacher");
  return successResponse("Вы присоединились к школе", { organizationId: invitation.organizationId });
}
