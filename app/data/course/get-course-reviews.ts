import "server-only";

import prisma from "@/lib/prisma";
import { normalizePagination } from "@/lib/pagination";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

export type tCourseReviewsPage = {
  items: Array<{
    id: string;
    rating: number;
    comment: string;
    isEdited: boolean;
    createdAt: Date;
    updatedAt: Date;
    author: {
      id: string;
      name: string;
      image: string | null;
      role: string | null;
    };
  }>;
  total: number;
  page: number;
  pageSize: number;
};

export async function getCourseReviews({
  courseId,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  courseId: string;
  page?: number;
  pageSize?: number;
}): Promise<tCourseReviewsPage> {
  const { page: safePage, pageSize: safePageSize, skip, take } =
    normalizePagination(
      { page, pageSize },
      { defaultPageSize: DEFAULT_PAGE_SIZE, maxPageSize: MAX_PAGE_SIZE },
    );

  const [rows, total] = await Promise.all([
    prisma.courseReview.findMany({
      where: { courseId, course: { organization: { type: "SCHOOL" } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
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
    }),
    prisma.courseReview.count({ where: { courseId, course: { organization: { type: "SCHOOL" } } } }),
  ]);

  return {
    items: rows.map((row) => ({
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
    })),
    total,
    page: safePage,
    pageSize: safePageSize,
  };
}

export async function getCourseRatingAggregate({
  courseId,
}: {
  courseId: string;
}): Promise<{ avg: number; count: number }> {
  const result = await prisma.courseReview.aggregate({
    where: { courseId, course: { organization: { type: "SCHOOL" } } },
    _avg: { rating: true },
    _count: { _all: true },
  });

  return {
    avg: result._avg.rating ?? 0,
    count: result._count._all,
  };
}
