"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ChevronLeftIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, PanelLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { tCourseForLearningChapter } from "@/app/data/user/get-course-for-learning";
import { LessonChaptersList } from "./LessonChaptersList";
import { dashboardCourseHref } from "@/lib/organization/course-links";

export function PlayerHeader({
  courseSlug,
  courseTitle,
  organizationSlug,
  chapters,
  children,
}: {
  courseSlug: string;
  organizationSlug: string;
  courseTitle: string;
  chapters: tCourseForLearningChapter[];
  children: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <section className="-m-4 flex min-h-[calc(100svh-8rem)] flex-col overflow-hidden rounded-xl border bg-background md:-m-6">
      <header className="sticky top-0 z-30 flex min-h-14 items-center gap-2 bg-slate-950 px-3 text-white shadow-sm sm:px-4">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="hidden text-white hover:bg-white/10 hover:text-white lg:inline-flex"
          aria-label={sidebarOpen ? "Свернуть темы курса" : "Открыть темы курса"}
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen((open) => !open)}
        >
          {sidebarOpen ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-white hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Открыть список тем и уроков"
          onClick={() => setMobileOpen(true)}
        >
          <PanelLeftIcon />
        </Button>
        <Link
          href={dashboardCourseHref(organizationSlug, courseSlug)}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white sm:text-sm"
        >
          <ChevronLeftIcon className="size-4" aria-hidden />
          <span className="hidden sm:inline">К курсу</span>
        </Link>
        <span className="h-5 w-px bg-white/20" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold sm:text-base">
          {courseTitle}
        </span>
        <span className="hidden rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-slate-300 sm:inline-flex">
          SchoolSphere
        </span>
      </header>

      <div className={`grid min-h-0 flex-1 ${sidebarOpen ? "lg:grid-cols-[280px_minmax(0,1fr)]" : "lg:grid-cols-[0_minmax(0,1fr)]"}`}>
        <aside className={`hidden min-h-0 overflow-hidden border-r bg-card lg:block ${sidebarOpen ? "" : "border-r-0"}`}>
          {sidebarOpen ? <LessonChaptersList chapters={chapters} courseSlug={courseSlug} organizationSlug={organizationSlug} /> : null}
        </aside>
        <main className="min-w-0 overflow-x-hidden overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[min(88vw,360px)] gap-0 p-0">
          <SheetHeader className="border-b pr-12">
            <SheetTitle>Темы и уроки</SheetTitle>
            <SheetDescription>{courseTitle}</SheetDescription>
          </SheetHeader>
          <LessonChaptersList
            chapters={chapters}
            courseSlug={courseSlug}
            organizationSlug={organizationSlug}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </section>
  );
}
