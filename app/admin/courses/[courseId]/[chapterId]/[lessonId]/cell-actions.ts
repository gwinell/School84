"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireTeacher } from "@/app/data/teacher/require-teacher";
import { Prisma } from "@/lib/generated/prisma/client";
import prisma from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/responses";
import { canUseCourseMediaKeys, extractInlineMediaKeys } from "@/lib/teacher/course-media";

const cellTypeSchema = z.enum(["TEXT", "CODE_TASK", "QUIZ"]);
const exampleSchema = z.object({
  input: z.string().max(5000),
  output: z.string().max(5000),
});

const cellSchema = z.object({
  type: cellTypeSchema,
  title: z.string().max(200).nullable(),
  textContent: z.string().max(100_000).nullable(),
  taskPrompt: z.string().max(30_000).nullable(),
  starterCode: z.string().max(30_000).nullable(),
  examples: z.array(exampleSchema).max(20),
  testCases: z.array(exampleSchema).max(12),
  lintConfig: z.record(z.string(), z.unknown()).nullable(),
});

function normalizeImageKeys(content: string | null) {
  if (!content) return content;
  try {
    const json = JSON.parse(content) as Record<string, unknown>;
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      const record = value as Record<string, unknown>;
      const attrs = record.attrs as Record<string, unknown> | undefined;
      if (attrs && typeof attrs.key === "string") attrs.src = attrs.key;
      Object.values(record).forEach(visit);
    };
    visit(json);
    return JSON.stringify(json);
  } catch {
    return content;
  }
}

async function getLessonPath(lessonId: string) {
  const session = await requireTeacher();
  const managedCourseIds = session.user.role === "admin"
    ? null
    : (await prisma.courseInstructor.findMany({ where: { userId: session.user.id }, select: { courseId: true } })).map((row) => row.courseId);
  return prisma.lesson.findFirst({
    where: { id: lessonId, ...(managedCourseIds ? { chapter: { courseId: { in: managedCourseIds } } } : {}) },
    select: {
      id: true,
      chapterId: true,
      chapter: { select: { courseId: true } },
    },
  });
}

async function getCellPath(cellId: string) {
  const session = await requireTeacher();
  const managedCourseIds = session.user.role === "admin"
    ? null
    : (await prisma.courseInstructor.findMany({ where: { userId: session.user.id }, select: { courseId: true } })).map((row) => row.courseId);
  return prisma.lessonCell.findFirst({
    where: { id: cellId, ...(managedCourseIds ? { lesson: { chapter: { courseId: { in: managedCourseIds } } } } : {}) },
    select: { id: true, lessonId: true, lesson: { select: { chapter: { select: { courseId: true } } } } },
  });
}

export async function createLessonCell({
  lessonId,
  type,
}: {
  lessonId: string;
  type: "TEXT" | "CODE_TASK" | "QUIZ";
}) {
  const path = await getLessonPath(lessonId);
  if (!path) return errorResponse("Lesson not found", null);

  try {
    const cell = await prisma.$transaction(async (tx) => {
      const lastCell = await tx.lessonCell.findFirst({
        where: { lessonId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const created = await tx.lessonCell.create({
        data: {
          lessonId,
          type,
          position: (lastCell?.position ?? 0) + 1,
          ...(type === "QUIZ" ? { quiz: { create: {} } } : {}),
        },
        select: {
          id: true,
          position: true,
          type: true,
          title: true,
          textContent: true,
          taskPrompt: true,
          starterCode: true,
          examples: true,
          testCases: true,
          lintConfig: true,
          quiz: {
            select: {
              id: true,
              questions: {
                orderBy: { position: "asc" },
                select: {
                  id: true,
                  text: true,
                  type: true,
                  position: true,
                  answers: {
                    orderBy: { position: "asc" },
                    select: {
                      id: true,
                      text: true,
                      isCorrect: true,
                      explanation: true,
                      position: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      return created;
    });

    revalidatePath(`/admin/courses/${path.chapter.courseId}/edit`);
    return successResponse("Cell added", cell);
  } catch {
    return errorResponse("Could not add cell", null);
  }
}

export async function updateLessonCell({
  cellId,
  values,
}: {
  cellId: string;
  values: unknown;
}) {
  const session = await requireTeacher();
  const parsed = cellSchema.safeParse(values);
  if (!parsed.success) return errorResponse("Invalid cell data", null);
  const scopedPath = await getCellPath(cellId);
  if (!scopedPath) return errorResponse("Cell not found", null);

  const cell = await prisma.lessonCell.findUnique({
    where: { id: cellId },
    select: {
      id: true,
      type: true,
      lessonId: true,
      textContent: true,
      lesson: { select: { chapter: { select: { courseId: true } } } },
    },
  });
  if (!cell) return errorResponse("Cell not found", null);

  const courseId = cell.lesson.chapter.courseId;
  const incomingMediaKeys = parsed.data.type === "TEXT"
    ? extractInlineMediaKeys(parsed.data.textContent)
    : [];
  const existingMediaKeys = cell.type === "TEXT"
    ? extractInlineMediaKeys(cell.textContent)
    : [];
  if (!(await canUseCourseMediaKeys({
    keys: incomingMediaKeys,
    existingKeys: existingMediaKeys,
    courseId,
    userId: session.user.id,
    role: session.user.role,
  }))) {
    return errorResponse("Image upload is not available", null);
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (cell.type === "QUIZ" && parsed.data.type !== "QUIZ") {
        await tx.quiz.deleteMany({ where: { cellId } });
      }
      const content = parsed.data;
      await tx.lessonCell.update({
        where: { id: cellId },
        data: {
          type: content.type,
          title: content.title,
          textContent:
            content.type === "TEXT"
              ? normalizeImageKeys(content.textContent)
              : null,
          taskPrompt:
            content.type === "CODE_TASK" ? content.taskPrompt : null,
          starterCode:
            content.type === "CODE_TASK" ? content.starterCode : null,
          examples:
            content.type === "CODE_TASK" ? content.examples : Prisma.DbNull,
          testCases:
            content.type === "CODE_TASK" ? content.testCases : Prisma.DbNull,
          lintConfig:
            content.type === "CODE_TASK"
              ? content.lintConfig
                ? (content.lintConfig as Prisma.InputJsonObject)
                : Prisma.DbNull
              : Prisma.DbNull,
        },
      });
      const imageKeys = new Set<string>();
      const visit = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        const record = value as Record<string, unknown>;
        const attrs = record.attrs as Record<string, unknown> | undefined;
        if (typeof attrs?.key === "string") imageKeys.add(attrs.key);
        Object.values(record).forEach(visit);
      };
      if (content.type === "TEXT" && content.textContent) {
        try {
          visit(JSON.parse(content.textContent));
        } catch {
          // Plain text / malformed JSON has no uploaded image keys.
        }
      }
      if (imageKeys.size) {
        await tx.pendingUpload.deleteMany({
          where: {
            key: { in: Array.from(imageKeys) },
            ...(session.user.role === "admin"
              ? {}
              : { userId: session.user.id, courseId }),
          },
        });
      }
    });

    revalidatePath(
      `/admin/courses/${cell.lesson.chapter.courseId}/${cell.lessonId}`,
    );
    return successResponse("Cell saved", null);
  } catch {
    return errorResponse("Could not save cell", null);
  }
}

export async function deleteLessonCell({ cellId }: { cellId: string }) {
  const scopedPath = await getCellPath(cellId);
  if (!scopedPath) return errorResponse("Cell not found", null);
  const cell = await prisma.lessonCell.findUnique({
    where: { id: cellId },
    select: {
      id: true,
      lessonId: true,
      position: true,
      lesson: { select: { chapter: { select: { courseId: true } } } },
    },
  });
  if (!cell) return errorResponse("Cell not found", null);

  try {
    await prisma.$transaction(async (tx) => {
      const siblings = await tx.lessonCell.findMany({
        where: { lessonId: cell.lessonId, id: { not: cellId } },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      await Promise.all(
        siblings.map((sibling, index) =>
          tx.lessonCell.update({
            where: { id: sibling.id },
            data: { position: -(index + 1) },
          }),
        ),
      );
      await tx.lessonCell.delete({ where: { id: cellId } });
      await Promise.all(
        siblings.map((sibling, index) =>
          tx.lessonCell.update({
            where: { id: sibling.id },
            data: { position: index + 1 },
          }),
        ),
      );
    });

    revalidatePath(
      `/admin/courses/${cell.lesson.chapter.courseId}/${cell.lessonId}`,
    );
    return successResponse("Cell deleted", null);
  } catch {
    return errorResponse("Could not delete cell", null);
  }
}

export async function reorderLessonCells({
  lessonId,
  cellIds,
}: {
  lessonId: string;
  cellIds: string[];
}) {
  const path = await getLessonPath(lessonId);
  if (!path) return errorResponse("Lesson not found", null);

  const existing = await prisma.lessonCell.findMany({
    where: { lessonId },
    select: { id: true },
  });
  if (
    cellIds.length !== existing.length ||
    new Set(cellIds).size !== existing.length ||
    existing.some((cell) => !cellIds.includes(cell.id))
  ) {
    return errorResponse("Invalid cell order", null);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await Promise.all(
        cellIds.map((id, index) =>
          tx.lessonCell.update({
            where: { id },
            data: { position: -(index + 1) },
          }),
        ),
      );
      await Promise.all(
        cellIds.map((id, index) =>
          tx.lessonCell.update({
            where: { id },
            data: { position: index + 1 },
          }),
        ),
      );
    });
    revalidatePath(`/admin/courses/${path.chapter.courseId}/${lessonId}`);
    return successResponse("Cells reordered", null);
  } catch {
    return errorResponse("Could not reorder cells", null);
  }
}
