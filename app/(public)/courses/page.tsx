import { Badge } from "@/components/ui/badge";
import { BookOpenIcon, SparklesIcon } from "lucide-react";
import { Suspense } from "react";

import { getCoursesPage } from "@/app/data/course/get-all-courses";
import { CoursesExplorer } from "./_components/CoursesExplorer";
import { CoursesExplorerSkeleton } from "./_components/CoursesExplorerSkeleton";
import {
  LEVELS,
  SORTS,
  type LevelFilter,
  type SortKey,
} from "./_lib/courses-filters";

export const metadata = {
  title: "Courses | SchoolSphere",
  description:
    "Browse our published courses and start learning something new today.",
};

interface PublicCoursesPageProps {
  searchParams: Promise<{
    q?: string;
    level?: string;
    sort?: string;
    page?: string;
  }>;
}

export default async function PublicCoursesPage({
  searchParams,
}: PublicCoursesPageProps) {
  const params = await searchParams;

  const q = typeof params.q === "string" ? params.q : "";
  const level = LEVELS.includes(params.level as LevelFilter)
    ? (params.level as LevelFilter)
    : "All";
  const sort = SORTS.includes(params.sort as SortKey)
    ? (params.sort as SortKey)
    : "newest";
  const page = Number.parseInt(params.page ?? "1", 10);

  const catalog = await getCoursesPage({ q, level, sort, page });

  return (
    <div className="space-y-12 pb-12 md:pb-16">
      <section className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full w-screen left-1/2 -translate-x-1/2 bg-linear-to-b from-primary/10 via-primary/5 to-transparent"
        />

        <div className="mx-auto flex max-w-3xl flex-col items-center text-center space-y-6 pt-24 md:pt-32 pb-12 md:pb-16">
          <Badge variant="secondary" className="gap-1.5">
            <SparklesIcon className="size-3" />
            Explore
          </Badge>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
            Find your next course
          </h1>

          <p className="max-w-2xl text-base md:text-lg text-muted-foreground">
            Browse our library of expert-led courses. Filter by topic, level, or
            length to find the perfect match for your learning journey.
          </p>

          <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
            <BookOpenIcon className="size-4" />
            <span className="tabular-nums font-medium text-foreground">
              {catalog.total}
            </span>
            <span>
              {catalog.total === 1 ? "course" : "courses"} available
            </span>
          </div>
        </div>
      </section>

      <Suspense fallback={<CoursesExplorerSkeleton />}>
        <CoursesExplorer catalog={catalog} />
      </Suspense>
    </div>
  );
}
