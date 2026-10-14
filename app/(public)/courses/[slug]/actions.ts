"use server";

import { requireUser } from "@/app/data/user/require-user";
import { errorResponse } from "@/lib/responses";
import type { tApiResponse } from "@/types/api";

/** Course access is granted by an administrator, never by self-enrollment. */
export async function enrollInCourseAction({
  courseId,
}: {
  courseId: string;
}): Promise<tApiResponse<null>> {
  await requireUser();
  void courseId;
  return errorResponse("Course access is managed by your administrator.", null);
}
