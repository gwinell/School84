import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import prisma from "@/lib/prisma";
import { requireUser } from "@/app/data/user/require-user";

export default async function TenantLearningLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const session = await requireUser();
  const organization = await prisma.organization.findUnique({
    where: { slug: organizationSlug },
    select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true, type: true, ownerUserId: true },
  });

  // Personal library metadata is private even before the course loader runs.
  if (!organization || (organization.type === "PERSONAL" && organization.ownerUserId !== session.user.id)) notFound();

  return (
    <div className="space-y-4">
      <header
        aria-label={`Школа ${organization.name}`}
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
        style={organization.primaryColor ? { borderColor: organization.primaryColor } : undefined}
      >
        <Brand brand={organization} nameClassName="text-base md:text-lg" markClassName="size-9" />
        <span className="text-sm text-muted-foreground">Учебный кабинет школы</span>
      </header>
      {children}
    </div>
  );
}
