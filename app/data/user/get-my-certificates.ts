import "server-only";

import prisma from "@/lib/prisma";
import { getDownloadUrls } from "@/lib/s3/get-download-url";

import { requireUser } from "./require-user";

export type tMyCertificate = {
  id: string;
  verificationCode: string;
  issuedAt: Date;

  course: {
    id: string;
    slug: string;
    title: string;
    smallDesc: string;
    imageUrl: string | null;
    level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
    duration: number;
    organizationSlug: string;
  } | null;

  // Snapshot fields — kept for display if the live course goes away.
  courseTitleSnapshot: string;
  courseSlugSnapshot: string;
  levelSnapshot: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  durationSnapshot: number;
  lessonsCountSnapshot: number;

  isPubliclyVisible: boolean;
};

export async function getMyCertificates(): Promise<tMyCertificate[]> {
  const session = await requireUser();

  const rows = await prisma.certificate.findMany({
    where: { userId: session.user.id },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      verificationCode: true,
      issuedAt: true,
      courseTitleSnapshot: true,
      courseSlugSnapshot: true,
      levelSnapshot: true,
      durationSnapshot: true,
      lessonsCountSnapshot: true,
      course: {
        select: {
          id: true,
          slug: true,
          title: true,
          smallDesc: true,
          fileKey: true,
          level: true,
          duration: true,
          organization: { select: { slug: true } },
        },
      },
      user: { select: { showCertificatesPublicly: true } },
    },
  });

  const imageUrls = await getDownloadUrls(
    rows.map((row) => row.course?.fileKey ?? null),
  );

  return rows.map((row, i) => ({
    id: row.id,
    verificationCode: row.verificationCode,
    issuedAt: row.issuedAt,
    course: row.course && {
      id: row.course.id,
      slug: row.course.slug,
      title: row.course.title,
      smallDesc: row.course.smallDesc,
      imageUrl: imageUrls[i],
      level: row.course.level,
      duration: row.course.duration,
      organizationSlug: row.course.organization.slug,
    },
    courseTitleSnapshot: row.courseTitleSnapshot,
    courseSlugSnapshot: row.courseSlugSnapshot,
    levelSnapshot: row.levelSnapshot,
    durationSnapshot: row.durationSnapshot,
    lessonsCountSnapshot: row.lessonsCountSnapshot,
    isPubliclyVisible: row.user.showCertificatesPublicly,
  }));
}
