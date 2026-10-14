"use server";

import {
  bulkAssignStudents,
  inviteStudentToCourse,
} from "@/app/admin/courses/[courseId]/assignments/actions";
import type {
  EnrollmentOptions,
  RosterActionResult,
} from "./_components/CourseRosterManager";

export async function inviteStudentToCourseForRoster(
  input: EnrollmentOptions & { email: string },
): Promise<RosterActionResult<{ inviteUrl: string | null; alreadyAssigned: boolean }>> {
  const result = await inviteStudentToCourse(input);
  return { ...result, data: result.data ?? undefined };
}

export async function bulkAssignStudentsForRoster(
  input: EnrollmentOptions & { emails: string[] },
): Promise<RosterActionResult<{ created: number; alreadyAssigned: number; invalid: string[] }>> {
  const result = await bulkAssignStudents(input);
  return { ...result, data: result.data ?? undefined };
}
