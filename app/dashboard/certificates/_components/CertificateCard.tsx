import {
  AwardIcon,
  CalendarIcon,
  ClockIcon,
  ExternalLinkIcon,
  GraduationCapIcon,
  LockIcon,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { tMyCertificate } from "@/app/data/user/get-my-certificates";

interface CertificateCardProps {
  certificate: tMyCertificate;
}

function formatLevel(level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED"): string {
  return level.charAt(0) + level.slice(1).toLowerCase();
}

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "0 min";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatIssueDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function CertificateCard({ certificate }: CertificateCardProps) {
  const live = certificate.course;
  const displayTitle = live?.title ?? certificate.courseTitleSnapshot;
  const displayLevel = live?.level ?? certificate.levelSnapshot;
  const displayDuration = live?.duration ?? certificate.durationSnapshot;
  const publicHref = `/certificates/${certificate.verificationCode}`;

  return (
    <article className="flex flex-col gap-4 rounded-xl border bg-card p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <AwardIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="line-clamp-2 text-base font-semibold leading-tight">
            {displayTitle}
          </h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <GraduationCapIcon className="size-3" />
              {formatLevel(displayLevel)}
            </span>
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="size-3" />
              {formatDuration(displayDuration)}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarIcon className="size-3" />
              Issued {formatIssueDate(certificate.issuedAt)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        {certificate.isPubliclyVisible ? (
          <Badge variant="secondary" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-primary" />
            Public
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1.5 text-muted-foreground">
            <LockIcon className="size-3" />
            Private
          </Badge>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {live ? (
            <Link
              href={`/dashboard/schools/${encodeURIComponent(live.organizationSlug)}/courses/${encodeURIComponent(live.slug)}`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              View course
            </Link>
          ) : null}
          <Link
            href={publicHref}
            target="_blank"
            className={buttonVariants({ size: "sm" })}
          >
            View certificate
            <ExternalLinkIcon className="size-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}
