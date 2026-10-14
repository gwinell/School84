import { Suspense } from "react";
import prisma from "@/lib/prisma";

import { PageHeader } from "@/components/admin/page-header";
import { MAX_CATEGORIES } from "@/lib/constants/categories";

import { CategoriesList } from "./_components/CategoriesList";
import { CategoriesListSkeleton } from "./_components/CategoriesListSkeleton";
import { NewCategoryDialog } from "./_components/NewCategoryDialog";

export const metadata = {
  title: "Categories | SchoolSphere Admin",
};

export default async function CategoriesPage() {
  const count = await prisma.category.count();
  const remaining = Math.max(MAX_CATEGORIES - count, 0);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            Categories
            <span className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
              {count} / {MAX_CATEGORIES}
            </span>
          </span>
        }
      />

      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {remaining > 0
            ? `${remaining} slot${remaining === 1 ? "" : "s"} remaining.`
            : "Limit reached — delete a category to free up a slot."}
        </p>
        <NewCategoryDialog />
      </div>

      <Suspense fallback={<CategoriesListSkeleton />}>
        <CategoriesList />
      </Suspense>
    </>
  );
}