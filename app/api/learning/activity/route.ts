import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/app/data/user/require-user";
import { getCourseLearnerAccess } from "@/app/data/user/course-learner-access";
import arcjet, { fixedWindow } from "@/lib/arcjet";
import { canAccessAssignedLesson } from "@/lib/course-access";
import prisma from "@/lib/prisma";

const heartbeatSchema = z.object({
  eventId: z.string().uuid(),
  cellId: z.string().min(1),
  kind: z.enum(["READING", "SOLVING"]),
  seconds: z.number().int().min(1).max(20),
});

const activityRateLimit = arcjet.withRule(fixedWindow({ mode: "LIVE", window: "1m", max: 4 }));

export async function POST(request: Request) {
  const session = await requireUser();
  const decision = await activityRateLimit.protect(request, { fingerprint: session.user.id });
  if (decision.isDenied()) return NextResponse.json({ error: "Too many activity events" }, { status: 429 });
  const parsed = heartbeatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid activity event" }, { status: 400 });

  const cell = await prisma.lessonCell.findUnique({
    where: { id: parsed.data.cellId },
    select: {
      id: true,
      type: true,
      lessonId: true,
      lesson: { select: { chapter: { select: { course: { select: { id: true, status: true, organizationId: true } } } } } },
    },
  });
  if (!cell || cell.lesson.chapter.course.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Cell unavailable" }, { status: 404 });
  }
  if ((parsed.data.kind === "READING" && cell.type !== "TEXT") || (parsed.data.kind === "SOLVING" && cell.type !== "CODE_TASK")) {
    return NextResponse.json({ error: "Activity type does not match this cell" }, { status: 400 });
  }

  const courseId = cell.lesson.chapter.course.id;
  const isAdmin = session.user.role === "admin";
  const enrollment = await getCourseLearnerAccess({ userId: session.user.id, userRole: session.user.role, courseId, organizationId: cell.lesson.chapter.course.organizationId });
  if (!enrollment) return NextResponse.json({ error: "Course not assigned" }, { status: 403 });
  if (!isAdmin) {
    if (enrollment.accessMode === "SEQUENTIAL" && !(await canAccessAssignedLesson({
      userId: session.user.id,
      courseId,
      lessonId: cell.lessonId,
    }))) {
      return NextResponse.json({ error: "Lesson locked" }, { status: 403 });
    }
  }

  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.learningActivityHeartbeat.create({
        data: {
          eventId: parsed.data.eventId,
          userId: session.user.id,
          lessonCellId: cell.id,
          kind: parsed.data.kind,
          activeSeconds: parsed.data.seconds,
        },
      });
      await tx.studentDailyActivity.upsert({
        where: { userId_day: { userId: session.user.id, day } },
        create: {
          userId: session.user.id,
          day,
          readingSeconds: parsed.data.kind === "READING" ? parsed.data.seconds : 0,
          solvingSeconds: parsed.data.kind === "SOLVING" ? parsed.data.seconds : 0,
        },
        update: parsed.data.kind === "READING"
          ? { readingSeconds: { increment: parsed.data.seconds } }
          : { solvingSeconds: { increment: parsed.data.seconds } },
      });
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
