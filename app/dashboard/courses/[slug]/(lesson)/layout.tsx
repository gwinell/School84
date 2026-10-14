import { Suspense } from "react";

import { LessonLayoutContent } from "./_components/LessonLayoutContent";
import { LessonLayoutSkeleton } from "./_components/LessonLayoutSkeleton";

interface LessonLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string; organizationSlug?: string }>;
}

export default async function LessonLayout({
  children,
  params,
}: LessonLayoutProps) {
  const { slug, organizationSlug } = await params;

  return (
    <Suspense fallback={<LessonLayoutSkeleton />}>
      <LessonLayoutContent slug={slug} organizationSlug={organizationSlug}>{children}</LessonLayoutContent>
    </Suspense>
  );
}
