import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";
import prisma from "@/lib/prisma";
import { normalizePagination } from "@/lib/pagination";
import { getDownloadUrls } from "@/lib/s3/get-download-url";

export const COURSE_CATALOG_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 48;

export type tCourseLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export type tCourseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type tCourse = {
  id: string;
  title: string;
  smallDesc: string;
  duration: number;
  level: tCourseLevel;
  status: tCourseStatus;
  priceCents: number;
  imageUrl: string | null;
  slug: string;
  organization: { id: string; name: string; slug: string; logoUrl: string | null; primaryColor: string | null };
  createdAt: Date;
  updatedAt: Date;
  categories: { id: string; name: string; slug: string }[];
  lessonsCount: number;
  chaptersCount: number;
  reviewAvg: number;
  reviewCount: number;
};

export type tCourseSort =
  | "newest"
  | "price-asc"
  | "price-desc"
  | "duration-asc"
  | "duration-desc";

export type tCourseLevelFilter = "All" | "Beginner" | "Intermediate" | "Advanced";

export type tCourseCatalogPage = {
  items: tCourse[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

const ORDER_BY: Record<
  tCourseSort,
  Prisma.CourseOrderByWithRelationInput[]
> = {
  newest: [{ createdAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
  "price-asc": [{ priceCents: "asc" }, { id: "asc" }],
  "price-desc": [{ priceCents: "desc" }, { id: "desc" }],
  "duration-asc": [{ duration: "asc" }, { id: "asc" }],
  "duration-desc": [{ duration: "desc" }, { id: "desc" }],
};

export async function getCoursesPage({
  q = "",
  level = "All",
  sort = "newest",
  page = 1,
  pageSize = COURSE_CATALOG_PAGE_SIZE,
  organizationSlug,
}: {
  q?: string;
  level?: tCourseLevelFilter;
  sort?: tCourseSort;
  page?: number;
  pageSize?: number;
  organizationSlug?: string;
} = {}): Promise<tCourseCatalogPage> {
  const {
    page: safePage,
    pageSize: safePageSize,
    skip,
    take,
  } = normalizePagination(
    { page, pageSize },
    { defaultPageSize: COURSE_CATALOG_PAGE_SIZE, maxPageSize: MAX_PAGE_SIZE },
  );

  const query = q.trim();
  const where: Prisma.CourseWhereInput = {
    status: "PUBLISHED",
    ...(organizationSlug ? { organization: { slug: organizationSlug } } : {}),
    ...(level !== "All"
      ? { level: level.toUpperCase() as tCourseLevel }
      : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { smallDesc: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      orderBy: ORDER_BY[sort] ?? ORDER_BY.newest,
      skip,
      take,
      select: {
        id: true,
        title: true,
        smallDesc: true,
        duration: true,
        level: true,
        status: true,
        priceCents: true,
        fileKey: true,
        slug: true,
        organization: { select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true } },
        createdAt: true,
        updatedAt: true,
        categories: {
          select: { id: true, name: true, slug: true },
          orderBy: { name: "asc" },
        },
        courseChapters: {
          select: { lessons: { select: { id: true } } },
        },
      },
    }),
  ]);

  const courseIds = rows.map((row) => row.id);

  const [imageUrls, ratingRows] = await Promise.all([
    getDownloadUrls(rows.map((row) => row.fileKey)),
    courseIds.length > 0
      ? prisma.courseReview.groupBy({
          by: ["courseId"],
          where: { courseId: { in: courseIds } },
          _avg: { rating: true },
          _count: { _all: true },
        })
      : Promise.resolve(
          [] as {
            courseId: string;
            _avg: { rating: number | null };
            _count: { _all: number };
          }[],
        ),
  ]);

  const ratingsByCourse = new Map(
    ratingRows.map((row) => [
      row.courseId,
      { avg: row._avg.rating ?? 0, count: row._count._all },
    ]),
  );

  const items: tCourse[] = rows.map((course, i) => {
    const rating = ratingsByCourse.get(course.id);

    return {
      id: course.id,
      title: course.title,
      smallDesc: course.smallDesc,
      duration: course.duration,
      level: course.level,
      status: course.status,
      priceCents: course.priceCents,
      imageUrl: imageUrls[i],
      slug: course.slug,
      organization: course.organization,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      categories: course.categories,
      lessonsCount: course.courseChapters.reduce(
        (acc, chapter) => acc + chapter.lessons.length,
        0,
      ),
      chaptersCount: course.courseChapters.length,
      reviewAvg: rating?.avg ?? 0,
      reviewCount: rating?.count ?? 0,
    };
  });

  return {
    items,
    total,
    page: safePage,
    pageSize: safePageSize,
    hasMore: safePage * safePageSize < total,
  };
}
