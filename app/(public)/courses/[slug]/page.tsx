import { type Metadata } from "next";

import { getCourseBySlug } from "@/app/data/course/get-course-by-slug";
import {
  getCourseRatingAggregate,
  getCourseReviews,
} from "@/app/data/course/get-course-reviews";
import { isCourseWishlisted } from "@/app/data/course/get-wishlist-state";
import { checkIfCourseBought } from "@/app/data/user/user-is-enrolled";
import { getOptionalSession } from "@/app/(public)/_lib/get-optional-session";
import { REVIEW_PAGE_SIZE } from "@/lib/constants/reviews";
import prisma from "@/lib/prisma";
import { publicCourseHref } from "@/lib/organization/course-links";
import { CoverImage } from "./_components/CoverImage";
import { CourseCurriculum } from "./_components/CourseCurriculum";
import { CourseHeader } from "./_components/CourseHeader";
import { CourseInfoTags } from "./_components/CourseInfoTags";
import { CourseReviewsSection } from "./_components/CourseReviewsSection";
import { CourseSummaryCard } from "./_components/CourseSummaryCard";
import { DescriptionSection } from "./_components/DescriptionSection";

interface CoursePageProps {
  params: Promise<{ slug: string; organizationSlug?: string }>;
}

export async function generateMetadata({
  params,
}: CoursePageProps): Promise<Metadata> {
  const { slug, organizationSlug } = await params;
  const course = await getCourseBySlug(slug, organizationSlug);
  const path = publicCourseHref(course.organization.slug, course.slug);
  return {
    title: `${course.title} | SchoolSphere`,
    description: course.smallDesc,
    alternates: { canonical: path },
    openGraph: {
      title: course.title,
      description: course.smallDesc,
      url: path,
      type: "website",
    },
  };
}

export default async function CourseDetailPage({ params }: CoursePageProps) {
  const { slug, organizationSlug } = await params;
  const course = await getCourseBySlug(slug, organizationSlug);

  const session = await getOptionalSession();
  const currentUserId = session?.user?.id ?? null;
  const isSignedIn = !!session?.user;

  const [
    isEnrolled,
    aggregate,
    isWishlisted,
    myCertificate,
    reviewsPage,
    myReviewRow,
  ] = await Promise.all([
    checkIfCourseBought({ courseId: course.id, userId: currentUserId }),
    getCourseRatingAggregate({ courseId: course.id }),
    currentUserId
      ? isCourseWishlisted({ courseId: course.id, userId: currentUserId })
      : Promise.resolve(false),
    currentUserId
      ? prisma.certificate.findUnique({
          where: {
            userId_courseId: {
              userId: currentUserId,
              courseId: course.id,
            },
          },
          select: { verificationCode: true },
        })
      : Promise.resolve(null),
    getCourseReviews({
      courseId: course.id,
      page: 1,
      pageSize: REVIEW_PAGE_SIZE,
    }),
    currentUserId
      ? prisma.courseReview.findUnique({
          where: {
            userId_courseId: {
              userId: currentUserId,
              courseId: course.id,
            },
          },
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
        })
      : Promise.resolve(null),
  ]);

  const totalLessons = course.courseChapters.reduce(
    (acc, chapter) => acc + chapter.lessons.length,
    0,
  );

  const myReview = myReviewRow
    ? {
        id: myReviewRow.id,
        rating: myReviewRow.rating,
        comment: myReviewRow.comment,
        isEdited: myReviewRow.isEdited,
        createdAt: myReviewRow.createdAt,
        updatedAt: myReviewRow.updatedAt,
        author: {
          id: myReviewRow.user.id,
          name: myReviewRow.user.name,
          image: myReviewRow.user.image,
          role: myReviewRow.user.role,
        },
      }
    : null;

  return (
    <div className="pt-24 lg:pt-32 pb-12 lg:pb-16">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-10 lg:gap-12">
        <div className="lg:col-span-6 space-y-8">
          <CoverImage imageUrl={course.imageUrl} title={course.title} />

          <CourseHeader title={course.title} smallDesc={course.smallDesc} />

          <CourseInfoTags course={course} totalLessons={totalLessons} />

          <DescriptionSection description={course.description} />

          <CourseReviewsSection
            courseId={course.id}
            isEnrolled={isEnrolled}
            currentUserId={currentUserId}
            initialReviews={reviewsPage.items}
            initialTotal={reviewsPage.total}
            initialAvg={aggregate.avg}
            initialCount={aggregate.count}
            myReview={myReview}
          />

          <CourseCurriculum chapters={course.courseChapters} />
        </div>

        <aside className="lg:col-span-4 lg:sticky lg:top-24 lg:self-start">
          <CourseSummaryCard
            course={course}
            totalLessons={totalLessons}
            slug={slug}
            organizationSlug={course.organization.slug}
            isEnrolled={isEnrolled}
            isSignedIn={isSignedIn}
            ratingAvg={aggregate.avg}
            ratingCount={aggregate.count}
            isWishlisted={isWishlisted}
            myCertificateVerificationCode={myCertificate?.verificationCode ?? null}
          />
        </aside>
      </div>
    </div>
  );
}
