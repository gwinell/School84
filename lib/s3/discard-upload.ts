import "server-only";

import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import prisma from "@/lib/prisma";
import { env } from "@/lib/env";
import { S3Client } from "@/lib/S3Client";

export type DiscardResult = "deleted" | "not-owned" | "missing";

export async function discardUpload(
  key: string,
  userId: string,
): Promise<DiscardResult> {
  if (!key) return "missing";

  const row = await prisma.pendingUpload.findUnique({
    where: { key },
    select: { userId: true },
  });

  if (!row) {
    return "missing";
  }

  if (row.userId !== userId) {
    return "not-owned";
  }

  await deleteObjectStrict(key);
  await prisma.pendingUpload.delete({ where: { key } }).catch(() => {});

  return "deleted";
}

export async function discardUploads(
  keys: string[],
  userId: string,
): Promise<{ key: string; result: DiscardResult }[]> {
  return Promise.all(
    keys.map(async (key) => ({ key, result: await discardUpload(key, userId) })),
  );
}

// Admin-driven S3 delete. Does not consult PendingUpload — used by entity
// delete paths (course/lesson removed → file should go too) and by orphan
// sweeps where ownership has already been verified. Best-effort.
export async function deleteObject(key: string): Promise<void> {
  try {
    await deleteObjectStrict(key);
  } catch {
    // Entity deletion remains best-effort.
  }
}

async function deleteObjectStrict(key: string): Promise<void> {
  if (!key) return;
  // Pending uploads retain their retry record until S3 confirms deletion.
  await S3Client.send(
    new DeleteObjectCommand({
      Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES,
      Key: key,
    }),
  );
}

export type SweepResult = {
  scanned: number;
  deleted: number;
  errors: number;
};

export async function sweepOrphanUploads(
  olderThanHours: number = 24,
): Promise<SweepResult> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

  const rows = await prisma.pendingUpload.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { key: true },
  });

  let deleted = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      await deleteObjectStrict(row.key);
      await prisma.pendingUpload.delete({ where: { key: row.key } });
      deleted++;
    } catch {
      errors++;
    }
  }

  return { scanned: rows.length, deleted, errors };
}
