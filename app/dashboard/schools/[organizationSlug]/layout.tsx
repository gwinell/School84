import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import prisma from "@/lib/prisma";

export default async function TenantLearningLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const organization = await prisma.organization.findUnique({
    where: { slug: organizationSlug },
    select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true },
  });

  // Course and lesson loaders remain responsible for membership/enrollment access.
  // This layout resolves only public branding from the tenant slug in the route.
  if (!organization) notFound();

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
