import { NextResponse } from "next/server";
import { z } from "zod";
import arcjet, { fixedWindow } from "@/lib/arcjet";

import { requireTeacher } from "@/app/data/teacher/require-teacher";
import prisma from "@/lib/prisma";
import { COURSE_PACKAGE_MAX_ARCHIVE_BYTES } from "@/lib/course-package/archive";
import { fetchGithubCourseBundle } from "@/lib/course-package/github-source";
import { importCoursePackage } from "@/lib/course-package/service";

const MAX_MULTIPART_BYTES = COURSE_PACKAGE_MAX_ARCHIVE_BYTES + 1024 * 1024;
const organizationSchema = z.string().cuid();
const activeImports = new Set<string>();
const importRateLimit = arcjet.withRule(fixedWindow({ mode: "LIVE", window: "10m", max: 3 }));

async function readBoundedFormData(request: Request, limit: number): Promise<FormData> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > limit)) throw new Error("Request is too large");
  if (!request.body) throw new Error("Request has no body");
  const reader = request.body.getReader();
  let size = 0;
  const boundedBody = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) { controller.close(); return; }
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel();
          controller.error(new Error("Request is too large"));
          return;
        }
        controller.enqueue(value);
      } catch (error) { controller.error(error); }
    },
    cancel(reason) { void reader.cancel(reason); },
  });
  const copy = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: boundedBody,
    duplex: "half",
  } as RequestInit);
  return copy.formData();
}

async function canAuthorInOrganization(input: { organizationId: string; userId: string; role: string | null | undefined }) {
  const organization = await prisma.organization.findUnique({ where: { id: input.organizationId }, select: { id: true, type: true } });
  if (!organization || organization.type !== "SCHOOL") return false;
  if (input.role === "admin") return true;
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } },
    select: { role: true },
  });
  return membership?.role === "OWNER" || membership?.role === "ADMIN" || membership?.role === "TEACHER";
}

export async function POST(request: Request) {
  const session = await requireTeacher();
  const decision = await importRateLimit.protect(request, { fingerprint: session.user.id });
  if (decision.isDenied()) return NextResponse.json({ error: "Лимит импорта исчерпан. Повторите позже." }, { status: 429 });
  if (activeImports.has(session.user.id)) return NextResponse.json({ error: "Ваш импорт курса уже выполняется. Повторите позже." }, { status: 429 });
  activeImports.add(session.user.id);
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
      return NextResponse.json({ error: "Ожидается multipart/form-data" }, { status: 415 });
    }
    let formData: FormData;
    try {
      formData = await readBoundedFormData(request, MAX_MULTIPART_BYTES);
    } catch {
      return NextResponse.json({ error: "Не удалось прочитать форму или превышен лимит размера" }, { status: 413 });
    }

    const organizationId = organizationSchema.safeParse(formData.get("organizationId"));
    if (!organizationId.success) return NextResponse.json({ error: "Выберите организацию" }, { status: 400 });
    if (!(await canAuthorInOrganization({ organizationId: organizationId.data, userId: session.user.id, role: session.user.role }))) {
      return NextResponse.json({ error: "Нет прав импортировать курс в эту организацию" }, { status: 403 });
    }
    const fileValue = formData.get("file");
    const githubValue = formData.get("githubUrl");
    const hasFile = typeof File !== "undefined" && fileValue instanceof File && fileValue.size > 0;
    const githubUrl = typeof githubValue === "string" ? githubValue.trim() : "";
    if (hasFile === Boolean(githubUrl) || (fileValue && !hasFile && fileValue !== "")) {
      return NextResponse.json({ error: "Передайте ровно один bundle-файл или GitHub URL" }, { status: 400 });
    }
    const includeProgressValue = formData.get("includeProgress");
    if (includeProgressValue !== null && includeProgressValue !== "true" && includeProgressValue !== "false") {
      return NextResponse.json({ error: "Некорректное значение includeProgress" }, { status: 400 });
    }
    const includeProgress = includeProgressValue === "true";

    try {
      const bytes = hasFile ? new Uint8Array(await (fileValue as File).arrayBuffer()) : await fetchGithubCourseBundle(githubUrl);
      if (bytes.byteLength > COURSE_PACKAGE_MAX_ARCHIVE_BYTES) return NextResponse.json({ error: "Bundle превышает лимит размера" }, { status: 413 });
      const result = await importCoursePackage({ bytes, organizationId: organizationId.data, userId: session.user.id, includeProgress });
      return NextResponse.json({
        course: { id: result.courseId, title: result.title, slug: result.slug },
        progress: result.progress,
        warnings: result.progress.skippedUnknownLearners || result.progress.skippedLocations
          ? ["Некоторые записи прогресса пропущены: пользователь не найден в организации или позиция отсутствует в курсе."]
          : [],
      }, { status: 201, headers: { "cache-control": "no-store" } });
    } catch (error) {
      console.error("Course package import failed", error);
      return NextResponse.json({ error: "Не удалось импортировать курс. Проверьте формат пакета, права и настройки организации." }, { status: 400 });
    }
  } finally {
    activeImports.delete(session.user.id);
  }
}
