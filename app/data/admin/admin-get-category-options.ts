import "server-only";

import prisma from "@/lib/prisma";
import { requireTeacher } from "@/app/data/teacher/require-teacher";

export type tCategoryOption = {
  id: string;
  name: string;
  slug: string;
};

/**
 * Lightweight category list used by the course form's multi-select.
 * Hard-capped at MAX_CATEGORIES so the dropdown never grows unbounded.
 */
export async function adminGetCategoryOptions(): Promise<tCategoryOption[]> {
  await requireTeacher();

  const categories = await prisma.category.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });

  return categories;
}