import Link from "next/link";
import { ArrowLeftIcon, PencilIcon } from "lucide-react";

import { requireTeacher } from "@/app/data/teacher/require-teacher";
import { requireCourseTeacher } from "@/app/data/teacher/require-course-teacher";
import { getAssignableTeachers, getCourseGradebook, getCourseInstructors, getCourseInvitations } from "@/app/data/teacher/get-course-gradebook";
import { assignTeacherToCourse, bulkAssignStudents, cancelCourseInvitation, cancelEnrollment, inviteStudentToCourse, removeTeacherFromCourse, setEnrollmentDueDate, submitReview } from "@/app/admin/courses/[courseId]/assignments/actions";
import { CourseGradebook } from "../../_components/CourseGradebook";
import { CourseInstructorsManager } from "../../_components/CourseInstructorsManager";
import { CourseInvitationsList } from "../../_components/CourseInvitationsList";
import { CourseRosterManager, type EnrollmentOptions, type RosterActionResult } from "../../_components/CourseRosterManager";
import { buttonVariants } from "@/components/ui/button";

export default async function TeacherCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const session = await requireTeacher();
  const [authorizedCourse, gradebook, invitations, candidates, instructors] = await Promise.all([
    requireCourseTeacher(courseId),
    getCourseGradebook(courseId),
    getCourseInvitations(courseId),
    session.user.role === "admin" ? getAssignableTeachers() : Promise.resolve([]),
    getCourseInstructors(courseId),
  ]);
  const enrollments = gradebook.students.map((student) => ({
    ...student.enrollment,
    user: student.user,
  }));
  const now = new Date();
  const invitationRows = invitations.map((invitation) => ({ ...invitation, isExpired: invitation.expiresAt <= now }));

  async function onInvite(input: EnrollmentOptions & { email: string }): Promise<RosterActionResult<{ inviteUrl: string | null; alreadyAssigned: boolean }>> {
    const result = await inviteStudentToCourse(input);
    return { ...result, data: result.data ?? undefined };
  }

  async function onBulkAssign(input: EnrollmentOptions & { emails: string[] }): Promise<RosterActionResult<{ created: number; alreadyAssigned: number; invalid: string[] }>> {
    const result = await bulkAssignStudents(input);
    return { ...result, data: result.data ?? undefined };
  }

  return <div className="space-y-8">
    <Link href="/teacher" className={buttonVariants({ variant: "ghost", size: "sm" })}><ArrowLeftIcon />Все курсы</Link>
    <header className="space-y-1">
      <h1 className="text-3xl font-bold tracking-tight">{authorizedCourse.course.title}</h1>
      <p className="text-sm text-muted-foreground">Управление учениками, сроками, прогрессом и проверкой работ.</p>
      <Link href={`/teacher/courses/${courseId}/edit`} className={buttonVariants({ variant: "outline", size: "sm", className: "mt-3" })}><PencilIcon />Редактировать материалы курса</Link>
    </header>

    {session.user.role === "admin" ? <CourseInstructorsManager
      courseId={courseId}
      instructors={instructors}
      candidates={candidates}
      onAssign={assignTeacherToCourse}
      onRemove={removeTeacherFromCourse}
    /> : null}

    <CourseRosterManager
      courseId={courseId}
      enrollments={enrollments}
      onInvite={onInvite}
      onBulkAssign={onBulkAssign}
      onCancel={cancelEnrollment}
      onSetDueDate={setEnrollmentDueDate}
    />
    <CourseInvitationsList courseId={courseId} invitations={invitationRows} onCancel={cancelCourseInvitation} />
    <CourseGradebook students={gradebook.students} onReview={submitReview} />
  </div>;
}
