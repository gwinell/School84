"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";

import arcjet, { fixedWindow } from "@/lib/arcjet";
import prisma from "@/lib/prisma";
import { request } from "@arcjet/next";
import { errorResponse, successResponse } from "@/lib/responses";
import { type tApiResponse } from "@/types/api";
import { type tCourseReviewView } from "@/types/course-reviews";
import { requireUser } from "@/app/data/user/require-user";
import { getCourseLearnerAccess } from "@/app/data/user/course-learner-access";

const aj = arcjet.withRule(
  fixedWindow({
    mode: "LIVE",
    window: "1m",
    max: 5,
  }),
);

const reviewSchema = z.object({
  courseId: z.string().min(1),
  rating: z
    .number()
    .int("Rating must be a whole number")
    .min(1, "Please pick a rating")
    .max(5, "Rating must be between 1 and 5"),
  comment: z
    .string()
    .trim()
    .min(10, "Please share at least 10 characters of feedback")
    .max(2000, "Comment must be at most 2000 characters"),
});

const editSchema = z.object({
  reviewId: z.string().min(1),
  rating: z
    .number()
    .int("Rating must be a whole number")
    .min(1, "Please pick a rating")
    .max(5, "Rating must be between 1 and 5"),
  comment: z
    .string()
    .trim()
    .min(10, "Please share at least 10 characters of feedback")
    .max(2000, "Comment must be at most 2000 characters"),
});

async function getReviewView(
  reviewId: string,
): Promise<tCourseReviewView | null> {
  const row = await prisma.courseReview.findUnique({
    where: { id: reviewId },
    select: {
      id: true,
      rating: true,
      comment: true,
      isEdited: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: { id: true, name: true, image: true, role: true },
      },
    },
  });

  if (!row) return null;

  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    isEdited: row.isEdited,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: {
      id: row.user.id,
      name: row.user.name,
      image: row.user.image,
      role: row.user.role,
    },
  };
}

export async function submitReviewAction({
  courseId,
  rating,
  comment,
}: {
  courseId: string;
  rating: number;
  comment: string;
}): Promise<tApiResponse<tCourseReviewView | null>> {
  const session = await requireUser();

  try {
    const req = await request();
    const decision = await aj.protect(req, {
      fingerprint: session.user.id,
    });

    if (decision.isDenied()) {
      return errorResponse("Too many requests. Please slow down.", null);
    }

    const parsed = reviewSchema.safeParse({ courseId, rating, comment });
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return errorResponse(firstIssue?.message ?? "Invalid review", null);
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, slug: true, status: true, organizationId: true },
    });

    if (!course || course.status !== "PUBLISHED") {
      return errorResponse("Course not available for review", null);
    }

    const enrollment = await getCourseLearnerAccess({ userId: session.user.id, userRole: session.user.role, courseId: course.id, organizationId: course.organizationId });

    if (!enrollment) {
      return errorResponse(
        "You need an active enrollment to review this course",
        null,
      );
    }

    let reviewId: string;
    try {
      const created = await prisma.courseReview.create({
        data: {
          userId: session.user.id,
          courseId: course.id,
          rating: parsed.data.rating,
          comment: parsed.data.comment,
        },
        select: { id: true },
      });
      reviewId = created.id;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const existing = await prisma.courseReview.findUnique({
          where: {
            userId_courseId: {
              userId: session.user.id,
              courseId: course.id,
            },
          },
          select: { id: true },
        });
        if (existing) {
          return errorResponse(
            "You've already reviewed this course. Edit your existing review instead.",
            { id: existing.id } as unknown as tCourseReviewView,
          );
        }
      }
      throw err;
    }

    revalidatePath(`/courses/${course.slug}`);
    revalidatePath("/courses");

    const view = await getReviewView(reviewId);

    return successResponse<tCourseReviewView | null>("Review submitted", view);
  } catch {
    return errorResponse("Failed to submit review", null);
  }
}

export async function editReviewAction({
  reviewId,
  rating,
  comment,
}: {
  reviewId: string;
  rating: number;
  comment: string;
}): Promise<tApiResponse<tCourseReviewView | null>> {
  const session = await requireUser();

  try {
    const parsed = editSchema.safeParse({ reviewId, rating, comment });
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return errorResponse(firstIssue?.message ?? "Invalid review", null);
    }

    const review = await prisma.courseReview.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        userId: true,
        courseId: true,
        course: { select: { slug: true, status: true, organizationId: true } },
      },
    });

    if (!review) {
      return errorResponse("Review not found", null);
    }

    if (review.userId !== session.user.id) {
      return errorResponse("You can only edit your own review", null);
    }

    if (review.course.status !== "PUBLISHED") {
      return errorResponse("Course not available", null);
    }

    const enrollment = await getCourseLearnerAccess({ userId: session.user.id, userRole: session.user.role, courseId: review.courseId, organizationId: review.course.organizationId });

    if (!enrollment) {
      return errorResponse(
        "Editing is disabled because your enrollment is no longer active",
        null,
      );
    }

    await prisma.courseReview.update({
      where: { id: reviewId },
      data: {
        rating: parsed.data.rating,
        comment: parsed.data.comment,
        isEdited: true,
      },
    });

    revalidatePath(`/courses/${review.course.slug}`);
    revalidatePath("/courses");

    const view = await getReviewView(reviewId);

    return successResponse<tCourseReviewView | null>("Review updated", view);
  } catch {
    return errorResponse("Failed to update review", null);
  }
}
