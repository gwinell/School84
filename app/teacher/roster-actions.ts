"use server";

import {
  bulkInviteStudentsToCourse,
  inviteStudentToCourse,
} from "@/app/admin/courses/[courseId]/assignments/actions";
import type {
  BulkInvitationResult,
  EnrollmentOptions,
  RosterActionResult,
} from "./_components/CourseRosterManager";

export async function inviteStudentToCourseForRoster(
  input: EnrollmentOptions & { email: string },
): Promise<RosterActionResult<{ inviteUrl: string | null; alreadyAssigned: boolean; emailDelivery?: "sent" | "failed" | "console" }>> {
  const result = await inviteStudentToCourse(input);
  return { ...result, data: result.data ?? undefined };
}

export async function bulkInviteStudentsForRoster(
  input: EnrollmentOptions & { emails: string[] },
): Promise<RosterActionResult<BulkInvitationResult>> {
  const result = await bulkInviteStudentsToCourse(input);
  return { ...result, data: result.data ?? undefined };
}
