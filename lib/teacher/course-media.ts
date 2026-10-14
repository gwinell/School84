import "server-only";

import prisma from "@/lib/prisma";

export function extractInlineMediaKeys(textContent: string | null): string[] {
  if (!textContent) return [];
  try {
    const keys = new Set<string>();
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      const record = value as Record<string, unknown>;
      const attrs = record.attrs as Record<string, unknown> | undefined;
      if (typeof attrs?.key === "string" && attrs.key.length > 0) keys.add(attrs.key);
      Object.values(record).forEach(visit);
    };
    visit(JSON.parse(textContent));
    return [...keys];
  } catch {
    return [];
  }
}

/** Existing keys are accepted only when already attached to this exact item. */
export async function canUseCourseMediaKeys(input: {
  keys: string[];
  existingKeys?: string[];
  courseId: string;
  userId: string;
  role: string | null | undefined;
}): Promise<boolean> {
  const keys = [...new Set(input.keys.filter(Boolean))];
  if (keys.length === 0 || input.role === "admin") return true;
  const existing = new Set(input.existingKeys ?? []);
  const newKeys = keys.filter((key) => !existing.has(key));
  if (newKeys.length === 0) return true;

  const owned = await prisma.pendingUpload.findMany({
    where: {
      key: { in: newKeys },
      userId: input.userId,
      courseId: input.courseId,
    },
    select: { key: true },
  });
  return new Set(owned.map((row) => row.key)).size === newKeys.length;
}
