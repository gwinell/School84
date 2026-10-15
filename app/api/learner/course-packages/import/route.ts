import { NextResponse } from "next/server";

import { requireUser } from "@/app/data/user/require-user";
import { COURSE_PACKAGE_MAX_ARCHIVE_BYTES } from "@/lib/course-package/archive";
import { fetchGithubCourseBundle, githubRawBundleUrl } from "@/lib/course-package/github-source";
import { importCoursePackage } from "@/lib/course-package/service";
import arcjet, { fixedWindow } from "@/lib/arcjet";
import prisma from "@/lib/prisma";

const MAX_MULTIPART_BYTES = COURSE_PACKAGE_MAX_ARCHIVE_BYTES + 1024 * 1024;
const importRateLimit = arcjet.withRule(fixedWindow({ mode: "LIVE", window: "10m", max: 3 }));
const activeImports = new Set<string>();

async function readBoundedFormData(request: Request): Promise<FormData> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_MULTIPART_BYTES)) throw new Error("Request is too large");
  if (!request.body) throw new Error("Request has no body");
  const reader = request.body.getReader();
  let size = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) { controller.close(); return; }
        size += value.byteLength;
        if (size > MAX_MULTIPART_BYTES) { await reader.cancel(); controller.error(new Error("Request is too large")); return; }
        controller.enqueue(value);
      } catch (error) { controller.error(error); }
    },
    cancel(reason) { void reader.cancel(reason); },
  });
  const bounded = new Request(request.url, { method: request.method, headers: request.headers, body, duplex: "half" } as RequestInit);
  return bounded.formData();
}

async function getPersonalOrganization(userId: string) {
  const existing = await prisma.organization.findUnique({ where: { ownerUserId: userId }, select: { id: true, slug: true, type: true } });
  if (existing) {
    if (existing.type !== "PERSONAL") throw new Error("Invalid personal workspace state");
    return { id: existing.id, slug: existing.slug };
  }
  try {
    const created = await prisma.organization.create({
      data: { name: "Моя библиотека", slug: `personal-${userId}`, type: "PERSONAL", ownerUserId: userId },
      select: { id: true, slug: true },
    });
    return created;
  } catch (error) {
    // Parallel first imports may race on the unique owner key; reuse only that user's workspace.
    const raced = await prisma.organization.findUnique({ where: { ownerUserId: userId }, select: { id: true, slug: true, type: true } });
    if (raced?.type === "PERSONAL") return { id: raced.id, slug: raced.slug };
    throw error;
  }
}

export async function POST(request: Request) {
  const session = await requireUser();
  const decision = await importRateLimit.protect(request, { fingerprint: session.user.id });
  if (decision.isDenied()) return NextResponse.json({ error: "Лимит импорта исчерпан. Повторите позже." }, { status: 429 });
  if (activeImports.has(session.user.id)) return NextResponse.json({ error: "Импорт курса уже выполняется. Повторите позже." }, { status: 429 });
  activeImports.add(session.user.id);

  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
      return NextResponse.json({ error: "Ожидается multipart/form-data" }, { status: 415 });
    }
    let formData: FormData;
    try { formData = await readBoundedFormData(request); }
    catch { return NextResponse.json({ error: "Не удалось прочитать форму или превышен лимит размера" }, { status: 413 }); }

    const entries = [...formData.entries()];
    if (entries.length !== 1 || !["file", "githubUrl"].includes(entries[0]?.[0] ?? "")) {
      return NextResponse.json({ error: "Передайте ровно один bundle-файл или GitHub URL" }, { status: 400 });
    }
    const [key, value] = entries[0]!;
    let bytes: Uint8Array;
    if (key === "file" && typeof File !== "undefined" && value instanceof File) {
      if (!value.size || value.size > COURSE_PACKAGE_MAX_ARCHIVE_BYTES || !/\.(s84course|zip)$/i.test(value.name)) {
        return NextResponse.json({ error: "Выберите файл .s84course или .zip в пределах лимита размера" }, { status: 400 });
      }
      bytes = new Uint8Array(await value.arrayBuffer());
    } else if (key === "githubUrl" && typeof value === "string") {
      try {
        const rawUrl = githubRawBundleUrl(value.trim());
        if (!new URL(rawUrl).pathname.toLowerCase().endsWith(".s84course")) return NextResponse.json({ error: "GitHub URL должен вести на файл .s84course" }, { status: 400 });
        bytes = await fetchGithubCourseBundle(value.trim());
      } catch { return NextResponse.json({ error: "Не удалось получить .s84course файл с GitHub" }, { status: 400 }); }
    } else {
      return NextResponse.json({ error: "Передайте ровно один bundle-файл или GitHub URL" }, { status: 400 });
    }
    if (bytes.byteLength > COURSE_PACKAGE_MAX_ARCHIVE_BYTES) return NextResponse.json({ error: "Bundle превышает лимит размера" }, { status: 413 });

    const organization = await getPersonalOrganization(session.user.id);
    const result = await importCoursePackage({ bytes, organizationId: organization.id, userId: session.user.id, personalLearner: true });
    return NextResponse.json({ course: { id: result.courseId, title: result.title, slug: result.slug, organizationSlug: organization.slug } }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Personal course package import failed", error);
    return NextResponse.json({ error: "Не удалось импортировать курс. Проверьте формат пакета." }, { status: 400 });
  } finally {
    activeImports.delete(session.user.id);
  }
}
