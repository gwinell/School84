import Link from "next/link";
import {
  AwardIcon,
  BookOpenIcon,
  CalendarIcon,
  ClockIcon,
  GraduationCapIcon,
  SparklesIcon,
  UserIcon,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { tCertificateForViewer } from "@/app/data/certificate/get-certificate-by-code";

import { CertificateActions } from "./CertificateActions";

interface CertificateViewProps {
  certificate: tCertificateForViewer;
  publicUrl: string;
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
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function CertificateView({
  certificate,
  publicUrl,
}: CertificateViewProps) {
  const live = certificate.liveCourse;

  const displayTitle = live?.title ?? certificate.courseTitleSnapshot;
  const displayLevel = live?.level ?? certificate.levelSnapshot;
  const displayDuration = live?.duration ?? certificate.durationSnapshot;
  const displayInstructor =
    live?.instructorName ?? certificate.instructorNameSnapshot;

  const liveLessonsCount = live?.liveLessonsCount ?? null;
  const newLessonsAdded =
    liveLessonsCount !== null &&
    liveLessonsCount > certificate.lessonsCountSnapshot;

  const courseHref = live ? `/courses/${live.slug}` : null;

  return (
    <div className="space-y-6">
      {newLessonsAdded ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <SparklesIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-foreground/90">
            This course has been updated with{" "}
            <span className="font-medium">
              {liveLessonsCount! - certificate.lessonsCountSnapshot} new lesson
              {liveLessonsCount! - certificate.lessonsCountSnapshot === 1
                ? ""
                : "s"}
            </span>{" "}
            since this certificate was issued.
          </p>
        </div>
      ) : null}

      <article
        className="relative overflow-hidden rounded-2xl border bg-card p-8 shadow-sm md:p-12 print:shadow-none print:border-2"
        aria-label="Certificate of completion"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/60 via-primary to-primary/60"
        />

        <div className="space-y-10">
          <header className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <AwardIcon className="size-7" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Certificate of Completion
              </p>
              <p className="text-sm text-muted-foreground">
                SchoolSphere verifies that
              </p>
            </div>
          </header>

          <div className="flex flex-col items-center gap-4 text-center">
            <Avatar size="lg" className="size-16">
              {certificate.recipient.image ? (
                <AvatarImage
                  src={certificate.recipient.image}
                  alt={certificate.recipient.name}
                />
              ) : null}
              <AvatarFallback>{initials(certificate.recipient.name)}</AvatarFallback>
            </Avatar>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              {certificate.recipient.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              has successfully completed the course
            </p>
          </div>

          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-semibold leading-tight md:text-3xl">
              {displayTitle}
            </h2>
            {courseHref ? (
              <Link
                href={courseHref}
                className="inline-block text-sm text-primary underline-offset-4 hover:underline"
              >
                View course on SchoolSphere
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                The original course is no longer available on SchoolSphere.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FactItem
              icon={GraduationCapIcon}
              label="Level"
              value={formatLevel(displayLevel)}
            />
            <FactItem
              icon={ClockIcon}
              label="Duration"
              value={formatDuration(displayDuration)}
            />
            <FactItem
              icon={UserIcon}
              label="Instructor"
              value={displayInstructor}
            />
            <FactItem
              icon={CalendarIcon}
              label="Issued"
              value={formatIssueDate(certificate.issuedAt)}
            />
          </div>

          <footer className="space-y-4 border-t pt-6">
            <div className="flex flex-col gap-3 text-xs sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="font-medium text-muted-foreground">
                  Verification ID
                </p>
                <p className="font-mono text-foreground">
                  {certificate.verificationCode}
                </p>
              </div>
              <Badge variant="secondary" className="gap-1.5 self-start sm:self-auto">
                <BookOpenIcon className="size-3" />
                Verified credential
              </Badge>
            </div>
          </footer>
        </div>
      </article>

      <div className="flex flex-col items-center gap-4 print:hidden">
        <CertificateActions url={publicUrl} />
        <p className="text-xs text-muted-foreground">
          Anyone with this link can view this certificate. The recipient has
          chosen to make it public.
        </p>
      </div>
    </div>
  );
}

interface FactItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}

function FactItem({ icon: Icon, label, value }: FactItemProps) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </div>
      <p className="mt-1 text-sm font-medium leading-snug">{value}</p>
    </div>
  );
}
