import { NextResponse } from "next/server";

import { requireCourseTeacher } from "@/app/data/teacher/require-course-teacher";
import { exportCoursePackage } from "@/lib/course-package/service";

export async function GET(request: Request, context: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await context.params;
  await requireCourseTeacher(courseId);
  const includeProgress = new URL(request.url).searchParams.get("includeProgress") === "true";
  try {
    const bundle = await exportCoursePackage(courseId, includeProgress);
    const body = new ArrayBuffer(bundle.byteLength);
    new Uint8Array(body).set(bundle);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/vnd.school84.course+zip",
        "content-disposition": 'attachment; filename="course.s84course"',
        "cache-control": "private, no-store",
        "content-length": String(bundle.byteLength),
      },
    });
  } catch (error) {
    console.error("Course package export failed", error);
    return NextResponse.json({ error: "Не удалось экспортировать курс" }, { status: 400 });
  }
}
