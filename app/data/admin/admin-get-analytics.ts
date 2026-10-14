import "server-only";

import prisma from "@/lib/prisma";
import { getDownloadUrls } from "@/lib/s3/get-download-url";
import { requireAdmin } from "./require-admin";

const DAYS = 30;

export type tAnalyticsSparkPoint = {
  date: string;
  value: number;
};

export type tAnalyticsDailyPoint = {
  date: string;
  enrollments: number;
};

export type tAnalyticsRecentCourse = {
  id: string;
  title: string;
  smallDesc: string;
  imageUrl: string | null;
  duration: number;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  slug: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  createdAt: Date;
};

export type tAnalyticsStats = {
  totalUsers: number;
  totalCourses: number;
  publishedCourses: number;
  activeEnrollments: number;
  contactMessages: number;
  newUsersThisPeriod: number;
  newCoursesThisPeriod: number;
  newEnrollmentsThisPeriod: number;
};

export type tAnalytics = {
  stats: tAnalyticsStats;
  sparklines: {
    users: tAnalyticsSparkPoint[];
    courses: tAnalyticsSparkPoint[];
    enrollments: tAnalyticsSparkPoint[];
  };
  enrollmentTrend: tAnalyticsDailyPoint[];
  recentCourses: tAnalyticsRecentCourse[];
};

type DayCountRow = { day: Date; count: number };
type DayEnrollmentRow = { day: Date; enrollments: number };

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildEmptyBuckets(days: number): Map<string, number> {
  const buckets = new Map<string, number>();
  const today = startOfDayUTC(new Date());
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today);
    day.setUTCDate(today.getUTCDate() - i);
    buckets.set(isoDay(day), 0);
  }
  return buckets;
}

export async function adminGetAnalytics(): Promise<tAnalytics> {
  await requireAdmin();

  const today = startOfDayUTC(new Date());
  const startDate = new Date(today);
  startDate.setUTCDate(today.getUTCDate() - (DAYS - 1));

  const [
    totalUsers,
    totalCourses,
    publishedCourses,
    activeEnrollments,
    contactMessages,
    recentCourses,
    userDayRows,
    courseDayRows,
    enrollmentDayRows,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.course.count(),
    prisma.course.count({ where: { status: "PUBLISHED" } }),
    prisma.enrollment.count({ where: { status: "Active" } }),
    prisma.contactMessage.count(),
    prisma.course.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        smallDesc: true,
        fileKey: true,
        duration: true,
        level: true,
        slug: true,
        status: true,
        createdAt: true,
      },
    }),
    // Aggregate per day in Postgres so we only move ~30 rows per metric instead
    // of every row created in the window.
    prisma.$queryRaw<DayCountRow[]>`
      SELECT date_trunc('day', "createdAt") AS day, count(*)::int AS count
      FROM "user"
      WHERE "createdAt" >= ${startDate}
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.$queryRaw<DayCountRow[]>`
      SELECT date_trunc('day', "createdAt") AS day, count(*)::int AS count
      FROM "Course"
      WHERE "createdAt" >= ${startDate}
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.$queryRaw<DayEnrollmentRow[]>`
      SELECT date_trunc('day', "createdAt") AS day,
             count(*)::int AS enrollments
      FROM "Enrollment"
      WHERE "createdAt" >= ${startDate}
      GROUP BY 1
      ORDER BY 1
    `,
  ]);

  const userBuckets = buildEmptyBuckets(DAYS);
  for (const row of userDayRows) {
    userBuckets.set(isoDay(startOfDayUTC(row.day)), row.count);
  }

  const courseBuckets = buildEmptyBuckets(DAYS);
  for (const row of courseDayRows) {
    courseBuckets.set(isoDay(startOfDayUTC(row.day)), row.count);
  }

  const enrollmentBuckets = buildEmptyBuckets(DAYS);
  const trendBuckets = new Map<string, tAnalyticsDailyPoint>();

  for (let i = DAYS - 1; i >= 0; i--) {
    const day = new Date(today);
    day.setUTCDate(today.getUTCDate() - i);
    trendBuckets.set(isoDay(day), {
      date: isoDay(day),
      enrollments: 0,
    });
  }

  for (const row of enrollmentDayRows) {
    const key = isoDay(startOfDayUTC(row.day));
    enrollmentBuckets.set(key, row.enrollments);
    const trendPoint = trendBuckets.get(key);
    if (trendPoint) {
      trendPoint.enrollments += row.enrollments;
    }
  }

  const newUsersThisPeriod = userDayRows.reduce((acc, r) => acc + r.count, 0);
  const newCoursesThisPeriod = courseDayRows.reduce(
    (acc, r) => acc + r.count,
    0,
  );
  const newEnrollmentsThisPeriod = enrollmentDayRows.reduce(
    (acc, r) => acc + r.enrollments,
    0,
  );
  const sparkPointsFromBuckets = (
    buckets: Map<string, number>,
  ): tAnalyticsSparkPoint[] =>
    Array.from(buckets.entries()).map(([date, value]) => ({ date, value }));

  const recentImageUrls = await getDownloadUrls(
    recentCourses.map((c) => c.fileKey),
  );

  return {
    stats: {
      totalUsers,
      totalCourses,
      publishedCourses,
      activeEnrollments,
      contactMessages,
      newUsersThisPeriod,
      newCoursesThisPeriod,
      newEnrollmentsThisPeriod,
    },
    sparklines: {
      users: sparkPointsFromBuckets(userBuckets),
      courses: sparkPointsFromBuckets(courseBuckets),
      enrollments: sparkPointsFromBuckets(enrollmentBuckets),
    },
    enrollmentTrend: Array.from(trendBuckets.values()),
    recentCourses: recentCourses.map((c, i) => ({
      id: c.id,
      title: c.title,
      smallDesc: c.smallDesc,
      imageUrl: recentImageUrls[i],
      duration: c.duration,
      level: c.level,
      slug: c.slug,
      status: c.status,
      createdAt: c.createdAt,
    })),
  };
}
