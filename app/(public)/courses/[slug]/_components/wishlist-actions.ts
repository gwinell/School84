"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/lib/generated/prisma/client";

import arcjet, { fixedWindow } from "@/lib/arcjet";
import prisma from "@/lib/prisma";
import { request } from "@arcjet/next";
import { errorResponse, successResponse } from "@/lib/responses";
import { type tApiResponse } from "@/types/api";
import { requireUser } from "@/app/data/user/require-user";

const aj = arcjet.withRule(
  fixedWindow({
    mode: "LIVE",
    window: "1m",
    max: 20,
  }),
);

export async function addToWishlistAction({
  courseId,
}: {
  courseId: string;
}): Promise<tApiResponse<{ courseId: string } | null>> {
  const session = await requireUser();

  try {
    const req = await request();
    const decision = await aj.protect(req, {
      fingerprint: session.user.id,
    });
    if (decision.isDenied()) {
      return errorResponse("Too many requests. Please slow down.", null);
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, slug: true, status: true, organization: { select: { type: true } } },
    });

    if (!course || course.status !== "PUBLISHED" || course.organization.type !== "SCHOOL") {
      return errorResponse("Course not available", null);
    }

    try {
      await prisma.wishlistItem.create({
        data: {
          userId: session.user.id,
          courseId: course.id,
        },
      });
    } catch (err) {
      if (
        !(err instanceof Prisma.PrismaClientKnownRequestError) ||
        err.code !== "P2002"
      ) {
        throw err;
      }
      // Already wishlisted — idempotent success.
    }

    revalidatePath(`/courses/${course.slug}`);
    revalidatePath("/dashboard/wishlist");

    return successResponse("Course saved to your wishlist", {
      courseId: course.id,
    });
  } catch {
    return errorResponse("Failed to save course", null);
  }
}

export async function removeFromWishlistAction({
  courseId,
}: {
  courseId: string;
}): Promise<tApiResponse<{ courseId: string } | null>> {
  const session = await requireUser();

  try {
    const req = await request();
    const decision = await aj.protect(req, {
      fingerprint: session.user.id,
    });
    if (decision.isDenied()) {
      return errorResponse("Too many requests. Please slow down.", null);
    }

    const item = await prisma.wishlistItem.findUnique({
      where: {
        userId_courseId: {
          userId: session.user.id,
          courseId,
        },
      },
      select: { id: true, course: { select: { slug: true } } },
    });

    if (!item) {
      // Already removed — idempotent.
      return successResponse("Course removed from your wishlist", {
        courseId,
      });
    }

    await prisma.wishlistItem.delete({
      where: { id: item.id },
    });

    revalidatePath(`/courses/${item.course.slug}`);
    revalidatePath("/dashboard/wishlist");

    return successResponse("Course removed from your wishlist", {
      courseId,
    });
  } catch {
    return errorResponse("Failed to remove course", null);
  }
}
