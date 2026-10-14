/** Deadlines are soft: a submission after the exact due instant is late but remains accepted. */
export function isSubmissionLate(submittedAt: Date, dueAt: Date | null): boolean {
  return dueAt !== null && submittedAt.getTime() > dueAt.getTime();
}
