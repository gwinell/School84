"use server";

import prisma from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { errorResponse, successResponse } from "@/lib/responses";
import { type CourseSchemaType, courseSchema } from "@/lib/zodSchemas";
import { deriveCourseSlug } from "@/lib/formatSlug";
import { z } from "zod";
import { requireAdmin } from "@/app/data/admin/require-admin";
import arcjet, { detectBot, fixedWindow } from "@/lib/arcjet";
import { request } from "@arcjet/next";
import { safeAdminLog } from "@/lib/activity/admin-log";
import {
  CATEGORY_LIMIT_EXCEEDED,
  resolveCategories,
} from "@/app/data/course/resolve-categories";

const aj = arcjet
  .withRule(
    detectBot({
      mode: "LIVE",
      allow: [],
    }),
  )
  .withRule(
    fixedWindow({
      mode: "LIVE",
      window: "1m",
      max: 5,
    }),
  );

export async function createCourse(values: CourseSchemaType) {
  const session = await requireAdmin();

  if (!session?.user?.id) {
    return errorResponse("Unauthorized", null);
  }

  try {
    const req = await request();
    const decision = await aj.protect(req, {
      fingerprint: session.user.id,
    });

    if (decision.isDenied()) {
      return errorResponse("Too many requests", null);
    }

    const validatedData = courseSchema.safeParse({
      ...values,
      slug: deriveCourseSlug(values.slug, values.title),
    });

    if (!validatedData.success) {
      return errorResponse("Invalid data", z.treeifyError(validatedData.error));
    }

    const { categories: categoryNames, ...courseFields } = validatedData.data;

    const slugTaken = await prisma.course.findUnique({
      where: { slug: courseFields.slug },
      select: { id: true },
    });
    if (slugTaken) {
      return errorResponse(
        `The slug "${courseFields.slug}" is already in use. Please choose another.`,
        null,
      );
    }

    let course;
    try {
      course = await prisma.$transaction(async (tx) => {
        const categories = await resolveCategories(categoryNames, tx);

        const created = await tx.course.create({
          data: {
            ...courseFields,
            userId: session.user.id,
            stripePriceId: null,
            categories: {
              connect: categories.map((c) => ({ id: c.id })),
            },
          },
        });

        if (courseFields.fileKey) {
          await tx.pendingUpload
            .delete({ where: { key: courseFields.fileKey } })
            .catch(() => {});
        }

        return created;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return errorResponse(
          "That slug is already in use. Please choose another.",
          null,
        );
      }
      if (err instanceof CATEGORY_LIMIT_EXCEEDED) {
        return errorResponse(err.message, null);
      }
      throw err;
    }

    await safeAdminLog({
      action: "COURSE_CREATED",
      entityType: "COURSE",
      entityId: course.id,
      entityLabel: course.title,
      metadata: {
        status: course.status,
        level: course.level,
        categories: categoryNames,
      },
    });

    return successResponse("Course created successfully", course);
  } catch (error) {
    console.error("Failed to create course: ", error);

    return errorResponse("Failed to create course", null);
  }
}
