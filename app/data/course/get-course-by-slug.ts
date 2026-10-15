import "server-only";

import { notFound } from "next/navigation";

import prisma from "@/lib/prisma";
import { getDownloadUrl } from "@/lib/s3/get-download-url";

export async function getCourseBySlug(slug: string, organizationSlug?: string) {
  const courses = await prisma.course.findMany({
    where: { slug, organization: { type: "SCHOOL", ...(organizationSlug ? { slug: organizationSlug } : {}) } },
    take: 2,
    select: {
      id: true,
      title: true,
      description: true,
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
      user: {
        select: {
          name: true,
          image: true,
        },
      },
      courseChapters: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          position: true,
          lessons: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              title: true,
              description: true,
              position: true,
            },
          },
        },
      },
    },
  });

  // A slug-only legacy URL is safe only while it resolves to one tenant.
  const course = courses.length === 1 ? courses[0] : null;

  if (!course || course.status !== "PUBLISHED") {
    notFound();
  }

  const imageUrl = await getDownloadUrl(course.fileKey);

  return { ...course, imageUrl };
}

export type tCourseDetail = Awaited<ReturnType<typeof getCourseBySlug>>;
