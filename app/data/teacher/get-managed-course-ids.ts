import "server-only";

import prisma from "@/lib/prisma";

/** Courses visible to this staff account: all courses in managed schools plus individually assigned courses where the teacher still has school membership. */
export async function getManagedCourseIds(userId: string, userRole: string | null | undefined): Promise<string[] | null> {
  if (userRole === "admin") return null;
  const rows = await prisma.course.findMany({
    where: {
      OR: [
        { organization: { is: { memberships: { some: { userId, role: { in: ["OWNER", "ADMIN"] } } } } } },
        {
          instructors: { some: { userId } },
          organization: { is: { memberships: { some: { userId, role: "TEACHER" } } } },
        },
      ],
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}
