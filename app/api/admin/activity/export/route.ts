import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { csvEscape } from "@/lib/activity/csv";
import { ACTIVITY_PRESENTATION } from "@/lib/activity/activity-actions";

import {
  adminGetActivities,
  type tActivityItem,
} from "@/app/data/admin/admin-get-activities";
import {
  parseActionParam,
  parseEntityIdParam,
  parseEntityParam,
} from "@/app/admin/activity/_lib/filters";

const MAX_EXPORT = 5000;

function parseDateParam(value: string | null): Date | null {
  if (!value) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return new Date(num);
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (session.user.role !== "admin") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const entityType = parseEntityParam(params.get("entityType") ?? undefined);
  const entityId = parseEntityIdParam(params.get("entityId") ?? undefined);
  const page = await adminGetActivities({
    actorId: params.get("actorId") || null,
    action: parseActionParam(params.get("action") ?? undefined),
    entityType,
    entityId: entityType ? entityId : null,
    from: parseDateParam(params.get("from")),
    to: parseDateParam(params.get("to")),
    take: MAX_EXPORT,
  });

  const rows: unknown[][] = [
    [
      "id",
      "createdAt",
      "actorId",
      "actorName",
      "actorType",
      "action",
      "entityType",
      "entityId",
      "entityLabel",
      "metadata",
    ],
    ...page.items.map((i: tActivityItem) => [
      i.id,
      i.createdAt,
      i.actorId,
      i.actorName,
      i.actorType,
      ACTIVITY_PRESENTATION[i.action].label,
      i.entityType,
      i.entityId,
      i.entityLabel,
      i.metadata === null ? "" : JSON.stringify(i.metadata),
    ]),
  ];

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="activity-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}