import "server-only";

import prisma from "@/lib/prisma";
import { WISHLIST_PAGE_SIZE } from "@/lib/constants/wishlist";
import { normalizePagination } from "@/lib/pagination";
import { getDownloadUrls } from "@/lib/s3/get-download-url";

import { requireUser } from "./require-user";

const MAX_PAGE_SIZE = 50;

export type tWishlistCourse = {
  id: string;
  slug: string;
  organization: { id: string; name: string; slug: string; logoUrl: string | null; primaryColor: string | null };
  title: string;
  smallDesc: string;
  duration: number;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  priceCents: number;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  categories: { id: string; name: string; slug: string }[];
  lessonsCount: number;
  chaptersCount: number;
  reviewAvg: number;
  reviewCount: number;
  isEnrolled: boolean;
  wishlistItemId: string;
  savedAt: Date;
};

export type tWishlistPage = {
  items: tWishlistCourse[];
  total: number;
  page: number;
  pageSize: number;
};

export async function getMyWishlistCourses({
  page = 1,
  pageSize = WISHLIST_PAGE_SIZE,
}: {
  page?: number;
  pageSize?: number;
}): Promise<tWishlistPage> {
  const session = await requireUser();
  const { page: safePage, pageSize: safePageSize, skip, take } =
    normalizePagination(
      { page, pageSize },
      { defaultPageSize: WISHLIST_PAGE_SIZE, maxPageSize: MAX_PAGE_SIZE },
    );

  const [rows, total] = await Promise.all([
    prisma.wishlistItem.findMany({
      where: {
        userId: session.user.id,
        course: { status: "PUBLISHED", organization: { type: "SCHOOL" } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        createdAt: true,
        course: {
          select: {
            id: true,
            slug: true,
            organization: { select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true } },
            title: true,
            smallDesc: true,
            duration: true,
            level: true,
            status: true,
            priceCents: true,
            fileKey: true,
            createdAt: true,
            updatedAt: true,
            categories: {
              select: { id: true, name: true, slug: true },
              orderBy: { name: "asc" },
            },
            courseChapters: {
              select: {
                lessons: { select: { id: true } },
              },
            },
            courseReviews: { select: { rating: true } },
            enrollment: {
              where: { userId: session.user.id, status: "Active" },
              select: { id: true },
            },
          },
        },
      },
    }),
    prisma.wishlistItem.count({
      where: {
        userId: session.user.id,
        course: { status: "PUBLISHED", organization: { type: "SCHOOL" } },
      },
    }),
  ]);

  const imageUrls = await getDownloadUrls(rows.map((r) => r.course.fileKey));

  const items: tWishlistCourse[] = rows.map((row, i) => {
    const ratings = row.course.courseReviews;
    const reviewCount = ratings.length;
    const reviewAvg =
      reviewCount === 0
        ? 0
        : ratings.reduce((acc, r) => acc + r.rating, 0) / reviewCount;

    return {
      id: row.course.id,
      slug: row.course.slug,
      organization: row.course.organization,
      title: row.course.title,
      smallDesc: row.course.smallDesc,
      duration: row.course.duration,
      level: row.course.level,
      status: row.course.status,
      priceCents: row.course.priceCents,
      imageUrl: imageUrls[i],
      createdAt: row.course.createdAt,
      updatedAt: row.course.updatedAt,
      categories: row.course.categories,
      lessonsCount: row.course.courseChapters.reduce(
        (acc, chapter) => acc + chapter.lessons.length,
        0,
      ),
      chaptersCount: row.course.courseChapters.length,
      reviewAvg,
      reviewCount,
      isEnrolled: row.course.enrollment.length > 0,
      wishlistItemId: row.id,
      savedAt: row.createdAt,
    };
  });

  return { items, total, page: safePage, pageSize: safePageSize };
}
