"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import arcjet, { fixedWindow } from "@/lib/arcjet";
import { request } from "@arcjet/next";
import prisma from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/responses";
import { requireUser } from "@/app/data/user/require-user";
import { getCourseLearnerAccess } from "@/app/data/user/course-learner-access";
import { canAccessAssignedLesson } from "@/lib/course-access";
import { getLessonComments } from "@/app/data/user/get-lesson-comments";
import { getLessonReplies } from "@/app/data/user/get-lesson-replies";
import {
  type tCommentPage,
  type tCommentSort,
  type tLessonCommentView,
} from "@/types/comments";
import { type tApiResponse } from "@/types/api";

const contentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Comment cannot be empty")
    .max(1000, "Comment must be at most 1000 characters"),
});

const aj = arcjet.withRule(
  fixedWindow({
    mode: "LIVE",
    window: "1m",
    max: 60,
  }),
);

interface tLessonContext {
  courseId: string;
  slug: string;
}

async function getLessonContext(
  lessonId: string,
): Promise<tLessonContext | null> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      chapter: {
        select: {
          course: {
            select: { id: true, slug: true, organizationId: true },
          },
        },
      },
    },
  });

  if (!lesson) return null;

  return {
    courseId: lesson.chapter.course.id,
    slug: lesson.chapter.course.slug,
  };
}

async function hasAccess(
  userId: string,
  role: string | null | undefined,
  courseId: string,
  lessonId: string,
): Promise<boolean> {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, chapter: { courseId, course: { status: "PUBLISHED" } } },
    select: { id: true, chapter: { select: { course: { select: { organizationId: true } } } } },
  });
  if (!lesson) return false;
  if (role === "admin") return true;

  const enrollment = await getCourseLearnerAccess({ userId, userRole: role, courseId, organizationId: lesson.chapter.course.organizationId });
  if (!enrollment) return false;
  return enrollment.accessMode !== "SEQUENTIAL" || canAccessAssignedLesson({ userId, courseId, lessonId });
}

async function getCommentView(
  commentId: string,
  viewerId: string,
): Promise<tLessonCommentView | null> {
  const row = await prisma.lessonComment.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      content: true,
      isEdited: true,
      createdAt: true,
      user: {
        select: { id: true, name: true, image: true, role: true },
      },
      _count: {
        select: { likes: true, replies: true },
      },
      likes: {
        where: { userId: viewerId },
        select: { id: true },
      },
    },
  });

  if (!row) return null;

  return {
    id: row.id,
    content: row.content,
    isEdited: row.isEdited,
    createdAt: row.createdAt,
    author: {
      id: row.user.id,
      name: row.user.name,
      image: row.user.image,
      role: row.user.role,
    },
    likeCount: row._count.likes,
    likedByMe: row.likes.length > 0,
    replyCount: row._count.replies,
  };
}

export async function createCommentAction({
  lessonId,
  content,
}: {
  lessonId: string;
  content: string;
}): Promise<tApiResponse<tLessonCommentView | null>> {
  const session = await requireUser();

  try {
    const req = await request();
    const decision = await aj.protect(req, { fingerprint: session.user.id });
    if (decision.isDenied()) {
      return errorResponse("Too many requests. Please try again later.", null);
    }

    const parsed = contentSchema.safeParse({ content });
    if (!parsed.success) {
      return errorResponse("Invalid comment", null);
    }

    const context = await getLessonContext(lessonId);
    if (!context) {
      return errorResponse("Lesson not found", null);
    }

    if (
      !(await hasAccess(session.user.id, session.user.role, context.courseId, lessonId))
    ) {
      return errorResponse("You are not enrolled in this course", null);
    }

    const comment = await prisma.lessonComment.create({
      data: {
        content: parsed.data.content,
        userId: session.user.id,
        lessonId,
      },
    });

    revalidatePath(`/dashboard/courses/${context.slug}/${lessonId}`);

    const view: tLessonCommentView = {
      id: comment.id,
      content: comment.content,
      isEdited: false,
      createdAt: comment.createdAt,
      author: {
        id: session.user.id,
        name: session.user.name,
        image: session.user.image ?? null,
        role: session.user.role ?? null,
      },
      likeCount: 0,
      likedByMe: false,
      replyCount: 0,
    };

    return successResponse("Comment added", view);
  } catch {
    return errorResponse("Failed to add comment", null);
  }
}

export async function createReplyAction({
  commentId,
  content,
}: {
  commentId: string;
  content: string;
}): Promise<tApiResponse<tLessonCommentView | null>> {
  const session = await requireUser();

  try {
    const req = await request();
    const decision = await aj.protect(req, { fingerprint: session.user.id });
    if (decision.isDenied()) {
      return errorResponse("Too many requests. Please try again later.", null);
    }

    const parsed = contentSchema.safeParse({ content });
    if (!parsed.success) {
      return errorResponse("Invalid comment", null);
    }

    const parent = await prisma.lessonComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        parentId: true,
        lessonId: true,
        lesson: {
          select: {
            chapter: {
              select: {
                course: { select: { id: true, slug: true } },
              },
            },
          },
        },
      },
    });

    if (!parent) {
      return errorResponse("Comment not found", null);
    }

    if (parent.parentId !== null) {
      return errorResponse("Cannot reply to a reply", null);
    }

    const courseId = parent.lesson.chapter.course.id;
    const slug = parent.lesson.chapter.course.slug;

    if (!(await hasAccess(session.user.id, session.user.role, courseId, parent.lessonId))) {
      return errorResponse("You are not enrolled in this course", null);
    }

    const reply = await prisma.lessonComment.create({
      data: {
        content: parsed.data.content,
        userId: session.user.id,
        lessonId: parent.lessonId,
        parentId: parent.id,
      },
    });

    revalidatePath(`/dashboard/courses/${slug}/${parent.lessonId}`);

    const view = await getCommentView(reply.id, session.user.id);

    return successResponse("Reply added", view);
  } catch {
    return errorResponse("Failed to add reply", null);
  }
}

export async function editCommentAction({
  commentId,
  content,
}: {
  commentId: string;
  content: string;
}): Promise<tApiResponse<tLessonCommentView | null>> {
  const session = await requireUser();

  try {
    const parsed = contentSchema.safeParse({ content });
    if (!parsed.success) {
      return errorResponse("Invalid comment", null);
    }

    const comment = await prisma.lessonComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        userId: true,
        lessonId: true,
        lesson: {
          select: {
            chapter: {
              select: {
                course: { select: { id: true, slug: true } },
              },
            },
          },
        },
      },
    });

    if (!comment) {
      return errorResponse("Comment not found", null);
    }

    if (comment.userId !== session.user.id) {
      return errorResponse("You can only edit your own comments", null);
    }

    if (!(await hasAccess(session.user.id, session.user.role, comment.lesson.chapter.course.id, comment.lessonId))) {
      return errorResponse("You are not allowed to edit comments in this course", null);
    }

    await prisma.lessonComment.update({
      where: { id: commentId },
      data: { content: parsed.data.content, isEdited: true },
    });

    revalidatePath(
      `/dashboard/courses/${comment.lesson.chapter.course.slug}/${comment.lessonId}`,
    );

    const view = await getCommentView(commentId, session.user.id);

    return successResponse("Comment updated", view);
  } catch {
    return errorResponse("Failed to update comment", null);
  }
}

export async function deleteCommentAction({
  commentId,
}: {
  commentId: string;
}): Promise<tApiResponse<null>> {
  const session = await requireUser();

  try {
    const comment = await prisma.lessonComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        userId: true,
        lessonId: true,
        lesson: {
          select: {
            chapter: {
              select: {
                course: { select: { id: true, slug: true } },
              },
            },
          },
        },
      },
    });

    if (!comment) {
      return errorResponse("Comment not found", null);
    }

    if (comment.userId !== session.user.id && session.user.role !== "admin") {
      return errorResponse("You are not allowed to delete this comment", null);
    }

    if (!(await hasAccess(session.user.id, session.user.role, comment.lesson.chapter.course.id, comment.lessonId))) {
      return errorResponse("You are not allowed to delete comments in this course", null);
    }

    await prisma.lessonComment.delete({
      where: { id: commentId },
    });

    revalidatePath(
      `/dashboard/courses/${comment.lesson.chapter.course.slug}/${comment.lessonId}`,
    );

    return successResponse("Comment deleted", null);
  } catch {
    return errorResponse("Failed to delete comment", null);
  }
}

export async function toggleCommentLikeAction({
  commentId,
}: {
  commentId: string;
}): Promise<tApiResponse<{ likeCount: number; likedByMe: boolean } | null>> {
  const session = await requireUser();

  try {
    const req = await request();
    const decision = await aj.protect(req, { fingerprint: session.user.id });
    if (decision.isDenied()) {
      return errorResponse("Too many requests. Please try again later.", null);
    }

    const comment = await prisma.lessonComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        lessonId: true,
        lesson: {
          select: {
            chapter: {
              select: {
                course: { select: { id: true, slug: true } },
              },
            },
          },
        },
      },
    });

    if (!comment) {
      return errorResponse("Comment not found", null);
    }

    const courseId = comment.lesson.chapter.course.id;

    if (!(await hasAccess(session.user.id, session.user.role, courseId, comment.lessonId))) {
      return errorResponse("You are not enrolled in this course", null);
    }

    const existing = await prisma.lessonCommentLike.findUnique({
      where: {
        userId_commentId: {
          userId: session.user.id,
          commentId,
        },
      },
    });

    if (existing) {
      await prisma.lessonCommentLike.delete({
        where: { id: existing.id },
      });
    } else {
      try {
        await prisma.lessonCommentLike.create({
          data: {
            userId: session.user.id,
            commentId,
          },
        });
      } catch {
        // Unique constraint raced — the like already exists.
      }
    }

    const likeCount = await prisma.lessonCommentLike.count({
      where: { commentId },
    });

    return successResponse("Like updated", {
      likeCount,
      likedByMe: !existing,
    });
  } catch {
    return errorResponse("Failed to update like", null);
  }
}

export async function getCommentsPageAction({
  lessonId,
  page,
  pageSize,
  sort,
}: {
  lessonId: string;
  page: number;
  pageSize: number;
  sort: tCommentSort;
}): Promise<tApiResponse<tCommentPage | null>> {
  const session = await requireUser();

  try {
    const context = await getLessonContext(lessonId);
    if (!context) {
      return errorResponse("Lesson not found", null);
    }

    if (
      !(await hasAccess(session.user.id, session.user.role, context.courseId, lessonId))
    ) {
      return errorResponse("You are not enrolled in this course", null);
    }

    const pageData = await getLessonComments({
      lessonId,
      viewerId: session.user.id,
      page,
      pageSize,
      sort,
    });
    return successResponse("Comments loaded", pageData);
  } catch {
    return errorResponse("Failed to load comments", null);
  }
}

export async function getRepliesPageAction({
  commentId,
  page,
  pageSize,
}: {
  commentId: string;
  page: number;
  pageSize: number;
}): Promise<tApiResponse<tCommentPage | null>> {
  const session = await requireUser();

  try {
    const comment = await prisma.lessonComment.findUnique({
      where: { id: commentId },
      select: {
        lessonId: true,
        lesson: {
          select: {
            chapter: {
              select: {
                course: { select: { id: true } },
              },
            },
          },
        },
      },
    });

    if (!comment) {
      return errorResponse("Comment not found", null);
    }

    const courseId = comment.lesson.chapter.course.id;

    if (!(await hasAccess(session.user.id, session.user.role, courseId, comment.lessonId))) {
      return errorResponse("You are not enrolled in this course", null);
    }

    const pageData = await getLessonReplies({
      commentId,
      viewerId: session.user.id,
      page,
      pageSize,
    });
    return successResponse("Replies loaded", pageData);
  } catch {
    return errorResponse("Failed to load replies", null);
  }
}
