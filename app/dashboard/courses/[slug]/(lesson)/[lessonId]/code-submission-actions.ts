"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/app/data/user/require-user";
import { env } from "@/lib/env";
import { canAccessAssignedLesson } from "@/lib/course-access";
import prisma from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/responses";
import type { CodeSubmissionStatus } from "@/lib/generated/prisma/client";
import type { tApiResponse } from "@/types/api";

const submitSchema = z.object({
  cellId: z.string().min(1),
  sourceCode: z.string().min(1).max(30_000),
});

const runnerResultSchema = z.object({
  status: z.enum(["ACCEPTED", "WRONG_ANSWER", "LINT_ERROR", "RUNTIME_ERROR", "TIME_LIMIT"]),
  passedTests: z.number().int().nonnegative(),
  totalTests: z.number().int().positive(),
  actualOutput: z.string().max(16_000).optional().default(""),
  errorText: z.string().max(16_000).nullable().optional(),
  lintOutput: z.string().max(16_000).nullable().optional(),
  durationMs: z.number().int().nonnegative(),
});

type SubmissionResult = {
  status: CodeSubmissionStatus;
  passedTests: number;
  totalTests: number;
  actualOutput: string;
  errorText: string | null;
  lintOutput: string | null;
  durationMs: number;
};

function safeText(value: string | null | undefined) {
  return value?.slice(0, 8_000) ?? null;
}

export async function submitCodeTaskAction(input: unknown): Promise<tApiResponse<SubmissionResult | null>> {
  const session = await requireUser();
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return errorResponse("Проверьте код и попробуйте снова", null);

  const cell = await prisma.lessonCell.findUnique({
    where: { id: parsed.data.cellId },
    select: {
      id: true,
      type: true,
      testCases: true,
      lintConfig: true,
      lessonId: true,
      lesson: {
        select: {
          chapter: {
            select: {
              course: { select: { id: true, slug: true, status: true } },
            },
          },
        },
      },
    },
  });

  if (!cell || cell.type !== "CODE_TASK" || cell.lesson.chapter.course.status !== "PUBLISHED") {
    return errorResponse("Задача не найдена", null);
  }

  const course = cell.lesson.chapter.course;
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: session.user.id, courseId: course.id } },
    select: { status: true, accessMode: true },
  });
  const isAdmin = session.user.role === "admin";
  if (!isAdmin && (!enrollment || enrollment.status !== "Active")) {
    return errorResponse("Курс не назначен вашему аккаунту", null);
  }
  if (
    !isAdmin && enrollment?.accessMode === "SEQUENTIAL" &&
    !(await canAccessAssignedLesson({ userId: session.user.id, courseId: course.id, lessonId: cell.lessonId }))
  ) {
    return errorResponse("Сначала примите все задачи в предыдущих уроках", null);
  }

  const recentSubmissions = await prisma.codeSubmission.count({
    where: { userId: session.user.id, createdAt: { gte: new Date(Date.now() - 60_000) } },
  });
  if (recentSubmissions >= 5) return errorResponse("Подождите минуту перед следующей отправкой", null);

  const tests = Array.isArray(cell.testCases)
    ? cell.testCases.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const row = item as { input?: unknown; output?: unknown };
        return typeof row.input === "string" && typeof row.output === "string"
          ? [{ input: row.input, output: row.output }]
          : [];
      })
    : [];
  if (tests.length === 0) return errorResponse("Для этой задачи пока не настроены тесты", null);
  if (tests.length > 12) return errorResponse("В задаче слишком много тестов для безопасного запуска", null);

  const configuredLinters = cell.lintConfig && typeof cell.lintConfig === "object" && !Array.isArray(cell.lintConfig)
    ? (cell.lintConfig as { python?: unknown }).python
    : undefined;
  if (Array.isArray(configuredLinters) && configuredLinters.some((name) => name !== "ruff")) {
    return errorResponse("Сейчас поддерживается линтер Ruff для Python", null);
  }
  const lintEnabled = configuredLinters === undefined || (Array.isArray(configuredLinters) && configuredLinters.includes("ruff"));

  let result: SubmissionResult;
  try {
    const response = await fetch(`${env.PYTHON_RUNNER_URL}/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.PYTHON_RUNNER_TOKEN}`,
      },
      body: JSON.stringify({ code: parsed.data.sourceCode, tests, lint: lintEnabled }),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Runner returned ${response.status}`);
    const runnerResult = runnerResultSchema.parse(await response.json());
    result = {
      ...runnerResult,
      actualOutput: safeText(runnerResult.actualOutput) ?? "",
      errorText: safeText(runnerResult.errorText),
      lintOutput: safeText(runnerResult.lintOutput),
    };
  } catch {
    result = {
      status: "SYSTEM_ERROR",
      passedTests: 0,
      totalTests: tests.length,
      actualOutput: "",
      errorText: "Не удалось запустить проверку. Попробуйте позже.",
      lintOutput: null,
      durationMs: 0,
    };
  }

  const daily = new Date();
  daily.setUTCHours(0, 0, 0, 0);
  await prisma.$transaction(async (tx) => {
    await tx.codeSubmission.create({
      data: {
        userId: session.user.id,
        lessonCellId: cell.id,
        sourceCode: parsed.data.sourceCode,
        status: result.status,
        passedTests: result.passedTests,
        totalTests: result.totalTests,
        actualOutput: result.actualOutput,
        errorText: result.errorText,
        lintOutput: result.lintOutput,
        durationMs: result.durationMs,
      },
    });
    await tx.lessonCellProgress.createMany({
      data: [{
        userId: session.user.id,
        lessonCellId: cell.id,
        status: "IN_PROGRESS",
        attempts: 0,
      }],
      skipDuplicates: true,
    });

    const progressUpdate = await tx.lessonCellProgress.updateMany({
      where: {
        userId: session.user.id,
        lessonCellId: cell.id,
        status: { not: "PASSED" },
      },
      data: {
        attempts: { increment: 1 },
        ...(result.status === "ACCEPTED" ? { status: "PASSED", passedAt: new Date() } : {}),
      },
    });
    const newlyAccepted = result.status === "ACCEPTED" && progressUpdate.count === 1;

    await tx.studentDailyActivity.upsert({
      where: { userId_day: { userId: session.user.id, day: daily } },
      create: {
        userId: session.user.id,
        day: daily,
        codeSubmissions: 1,
        acceptedTasks: newlyAccepted ? 1 : 0,
      },
      update: {
        codeSubmissions: { increment: 1 },
        ...(newlyAccepted ? { acceptedTasks: { increment: 1 } } : {}),
      },
    });

    if (result.status === "ACCEPTED") {
      const siblings = await tx.lessonCell.findMany({ where: { lessonId: cell.lessonId }, select: { id: true } });
      const passed = await tx.lessonCellProgress.count({
        where: { userId: session.user.id, lessonCellId: { in: siblings.map((sibling) => sibling.id) }, status: "PASSED" },
      });
      if (siblings.length > 0 && passed === siblings.length) {
        await tx.lessonProgress.upsert({
          where: { userId_lessonId: { userId: session.user.id, lessonId: cell.lessonId } },
          create: { userId: session.user.id, lessonId: cell.lessonId, completed: true },
          update: { completed: true },
        });
      }
    }
  });

  revalidatePath(`/dashboard/courses/${course.slug}/${cell.lessonId}`);
  revalidatePath(`/dashboard/courses/${course.slug}`);
  revalidatePath("/dashboard");
  return successResponse("Решение проверено", result);
}
