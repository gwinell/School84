import { env } from "@/lib/env";
import { NextResponse } from "next/server";
import z from "zod";
import { v4 as uuidv4 } from "uuid";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3Client } from "@/lib/S3Client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import arcjet, { detectBot, fixedWindow } from "@/lib/arcjet";
import { requireUser } from "@/app/data/user/require-user";
import { canAccessUploadCourse } from "@/app/api/s3/course-access";
import prisma from "@/lib/prisma";

const fileUploadSchema = z.object({
  fileName: z.string().min(1, { message: "File name is required" }),
  contentType: z.string().min(1, { message: "Content type is required" }),
  size: z.number().min(1, { message: "Size is required" }),
  isImage: z.boolean().optional(),
  courseId: z.string().min(1).optional(),
});

const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB

const IMAGE_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);

const VIDEO_CONTENT_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

// Strip directory components and anything that isn't URL/object-key safe so a
// caller can't smuggle path separators or `..` into the S3 key.
function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 100);
  return cleaned || "file";
}

const aj = arcjet
  .withRule(
    detectBot({
      mode: "LIVE",
      allow: [],
    }),
  )
  .withRule(
    fixedWindow({
      mode: "LIVE",
      window: "1m",
      max: 5,
    }),
  );

export async function POST(request: Request) {
  const session = await requireUser();

  try {
    const decision = await aj.protect(request, {
      fingerprint: session.user.id,
    });

    if (decision.isDenied()) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();

    const validation = fileUploadSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.message },
        { status: 400 },
      );
    }

    if (!(await canAccessUploadCourse({
      role: session.user.role,
      userId: session.user.id,
      courseId: validation.data.courseId,
    }))) {
      return NextResponse.json({ error: "Course ID is required" }, { status: 403 });
    }

    const { fileName, contentType, size, isImage } = validation.data;

    const isVideo = contentType.startsWith("video/");
    const allowedTypes = isVideo ? VIDEO_CONTENT_TYPES : IMAGE_CONTENT_TYPES;
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

    if (!allowedTypes.has(contentType)) {
      return NextResponse.json(
        { error: `Unsupported ${isVideo ? "video" : "image"} content type` },
        { status: 400 },
      );
    }

    if (typeof isImage === "boolean" && isImage === isVideo) {
      return NextResponse.json(
        { error: "Content type does not match the upload kind" },
        { status: 400 },
      );
    }

    if (size > maxBytes) {
      return NextResponse.json(
        { error: `File too large. Maximum ${maxBytes / 1024 / 1024}MB` },
        { status: 400 },
      );
    }

    const uniqueKey = `${uuidv4()}-${sanitizeFileName(fileName)}`;

    const command = new PutObjectCommand({
      Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES,
      Key: uniqueKey,
      ContentType: contentType,
      ContentLength: size,
    });

    const presignedUrl = await getSignedUrl(S3Client, command, {
      expiresIn: 360, // URL expires in 6 minutes
    });

    await prisma.pendingUpload.upsert({
      where: { key: uniqueKey },
      create: {
        key: uniqueKey,
        userId: session.user.id,
        courseId: validation.data.courseId ?? null,
      },
      update: {
        userId: session.user.id,
        courseId: validation.data.courseId ?? null,
        createdAt: new Date(),
      },
    });

    return NextResponse.json({ presignedUrl, key: uniqueKey }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 },
    );
  }
}
