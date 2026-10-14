import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { RatingBadge } from "@/components/general/RatingBadge";
import { type tCourseDetail } from "@/app/data/course/get-course-by-slug";
import {
  AwardIcon,
  BookOpenIcon,
  ClockIcon,
  ExternalLinkIcon,
  GraduationCapIcon,
  InfinityIcon,
  MonitorIcon,
  PlayCircleIcon,
  SmartphoneIcon,
  TagIcon,
  type LucideIcon,
} from "lucide-react";

import { formatDate, formatDuration } from "../_lib/format-duration";
import { formatPrice } from "@/lib/format-price";
import { EnrollmentButton } from "./EnrollmentButton";
import { WishlistButton } from "./WishlistButton";

interface CourseSummaryCardProps {
  course: tCourseDetail;
  totalLessons: number;
  slug: string;
  organizationSlug: string;
  isEnrolled: boolean;
  isSignedIn: boolean;
  ratingAvg: number;
  ratingCount: number;
  isWishlisted: boolean;
  myCertificateVerificationCode: string | null;
}

interface StatItemProps {
  icon: LucideIcon;
  label: string;
  value: string;
}

function StatItem({ icon: Icon, label, value }: StatItemProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-muted/40 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </div>
      <div className="text-sm font-medium leading-snug">{value}</div>
    </div>
  );
}

interface BenefitItemProps {
  icon: LucideIcon;
  label: string;
}

function BenefitItem({ icon: Icon, label }: BenefitItemProps) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <Icon className="size-4 shrink-0 text-primary" aria-hidden />
      <span>{label}</span>
    </li>
  );
}

const BENEFITS: BenefitItemProps[] = [
  { icon: InfinityIcon, label: "Lifetime access" },
  { icon: AwardIcon, label: "Certificate of completion" },
  { icon: SmartphoneIcon, label: "Access on mobile" },
  { icon: MonitorIcon, label: "Access on desktop" },
  { icon: PlayCircleIcon, label: "Downloadable resources" },
];

export function CourseSummaryCard({
  course,
  totalLessons,
  slug,
  organizationSlug,
  isEnrolled,
  isSignedIn,
  ratingAvg,
  ratingCount,
  isWishlisted,
  myCertificateVerificationCode,
}: CourseSummaryCardProps) {
  const levelLabel =
    course.level.charAt(0) + course.level.slice(1).toLowerCase();
  const chaptersCount = course.courseChapters.length;
  const isFree = !course.priceCents;

  return (
    <Card className="overflow-hidden shadow-sm lg:shadow-md">
      <CardHeader className="space-y-3">
        {myCertificateVerificationCode ? (
          <Link
            href={`/certificates/${myCertificateVerificationCode}`}
            target="_blank"
            className="inline-flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm transition-colors hover:bg-primary/10"
          >
            <span className="flex items-center gap-2 font-medium text-primary">
              <AwardIcon className="size-4" />
              You have a certificate
            </span>
            <ExternalLinkIcon className="size-3.5 text-primary" />
          </Link>
        ) : null}
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <CardTitle className="text-3xl font-bold tracking-tight">
              {formatPrice(course.priceCents)}
            </CardTitle>
            {!isFree && (
              <span className="text-sm text-muted-foreground line-through">
                ${((course.priceCents * 1.5) / 100).toFixed(2)}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            One-time payment • Lifetime access
          </p>
          {ratingCount > 0 ? (
            <RatingBadge
              avg={ratingAvg}
              count={ratingCount}
              className="pt-1 text-sm"
            />
          ) : (
            <p className="pt-1 text-xs text-muted-foreground">No reviews yet</p>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <EnrollmentButton
            courseId={course.id}
            slug={slug}
            organizationSlug={organizationSlug}
            isEnrolled={isEnrolled}
            isSignedIn={isSignedIn}
            priceCents={course.priceCents}
          />
          <WishlistButton
            courseId={course.id}
            slug={slug}
            organizationSlug={organizationSlug}
            isWishlisted={isWishlisted}
            isSignedIn={isSignedIn}
            isEnrolled={isEnrolled}
          />
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-2.5">
          <StatItem
            icon={ClockIcon}
            label="Duration"
            value={formatDuration(course.duration)}
          />
          <StatItem
            icon={GraduationCapIcon}
            label="Difficulty"
            value={levelLabel}
          />
          <StatItem
            icon={TagIcon}
            label="Categories"
            value={
              course.categories.length > 0
                ? course.categories.map((c) => c.name).join(", ")
                : "Uncategorized"
            }
          />
          <StatItem
            icon={BookOpenIcon}
            label="Chapters"
            value={`${chaptersCount} ${chaptersCount === 1 ? "chapter" : "chapters"}`}
          />
          <StatItem
            icon={PlayCircleIcon}
            label="Total lessons"
            value={`${totalLessons} ${totalLessons === 1 ? "lesson" : "lessons"}`}
          />
          <StatItem
            icon={ClockIcon}
            label="Last updated"
            value={formatDate(course.updatedAt)}
          />
        </div>

        <Separator />

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">This course includes:</h3>
          <ul className="space-y-2.5">
            {BENEFITS.map((benefit) => (
              <BenefitItem key={benefit.label} {...benefit} />
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
