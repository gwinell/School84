import "server-only";

import prisma from "@/lib/prisma";

export type tCertificateForViewer = {
  id: string;
  verificationCode: string;
  recipientName: string;
  issuedAt: Date;

  courseTitleSnapshot: string;
  courseSlugSnapshot: string;
  levelSnapshot: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  durationSnapshot: number;
  instructorNameSnapshot: string;
  lessonsCountSnapshot: number;

  liveCourse: {
    id: string;
    slug: string;
    title: string;
    level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
    duration: number;
    liveLessonsCount: number;
    instructorName: string;
  } | null;

  recipient: {
    id: string;
    name: string;
    image: string | null;
  };
};

export async function getCertificateByCode(
  code: string,
): Promise<tCertificateForViewer | null> {
  const certificate = await prisma.certificate.findUnique({
    where: { verificationCode: code },
    select: {
      id: true,
      verificationCode: true,
      recipientName: true,
      issuedAt: true,
      courseTitleSnapshot: true,
      courseSlugSnapshot: true,
      levelSnapshot: true,
      durationSnapshot: true,
      instructorNameSnapshot: true,
      lessonsCountSnapshot: true,
      organizationTypeSnapshot: true,
      course: {
        select: {
          id: true,
          slug: true,
          title: true,
          level: true,
          duration: true,
          organization: { select: { type: true } },
          user: { select: { name: true } },
          courseChapters: {
            select: {
              lessons: { select: { id: true } },
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          showCertificatesPublicly: true,
        },
      },
    },
  });

  if (!certificate) return null;

  if (certificate.organizationTypeSnapshot !== "SCHOOL") return null;
  if (certificate.course && certificate.course.organization.type !== "SCHOOL") return null;

  if (!certificate.user.showCertificatesPublicly) return null;

  return {
    id: certificate.id,
    verificationCode: certificate.verificationCode,
    recipientName: certificate.recipientName,
    issuedAt: certificate.issuedAt,
    courseTitleSnapshot: certificate.courseTitleSnapshot,
    courseSlugSnapshot: certificate.courseSlugSnapshot,
    levelSnapshot: certificate.levelSnapshot,
    durationSnapshot: certificate.durationSnapshot,
    instructorNameSnapshot: certificate.instructorNameSnapshot,
    lessonsCountSnapshot: certificate.lessonsCountSnapshot,
    liveCourse: certificate.course
      ? {
          id: certificate.course.id,
          slug: certificate.course.slug,
          title: certificate.course.title,
          level: certificate.course.level,
          duration: certificate.course.duration,
          liveLessonsCount: certificate.course.courseChapters.reduce(
            (acc, ch) => acc + ch.lessons.length,
            0,
          ),
          instructorName: certificate.course.user.name,
        }
      : null,
    recipient: {
      id: certificate.user.id,
      name: certificate.user.name,
      image: certificate.user.image,
    },
  };
}
