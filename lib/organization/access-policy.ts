export type OrganizationAccessRole = "OWNER" | "ADMIN" | "TEACHER" | "STUDENT";

/** Course assignment may promote learners but must never demote school managers. */
export function roleAfterTeacherAssignment(role: OrganizationAccessRole | null | undefined): OrganizationAccessRole {
  return role === "OWNER" || role === "ADMIN" ? role : "TEACHER";
}

export function canClaimOrganizationInvitation({
  emailVerified,
  accountEmail,
  invitationEmail,
  acceptedAt,
  expiresAt,
  now = new Date(),
}: {
  emailVerified: boolean;
  accountEmail: string;
  invitationEmail: string;
  acceptedAt: Date | null;
  expiresAt: Date;
  now?: Date;
}) {
  return emailVerified && !acceptedAt && expiresAt > now && accountEmail.trim().toLowerCase() === invitationEmail.trim().toLowerCase();
}

/** Platform admin is the only global bypass; tenant roles always require a matching membership. */
export function canManageCourse({
  userRole,
  membershipRole,
  isCourseInstructor,
}: {
  userRole: string | null | undefined;
  membershipRole: OrganizationAccessRole | null | undefined;
  isCourseInstructor: boolean;
}) {
  if (userRole === "admin") return true;
  if (!membershipRole) return false;
  if (membershipRole === "OWNER" || membershipRole === "ADMIN") return true;
  return membershipRole === "TEACHER" && isCourseInstructor;
}
