import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import prisma from "@/lib/prisma";

export default async function SchoolPublicLayout({
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

  if (!organization) notFound();

  return (
    <div className="space-y-8 pb-8">
      <section
        aria-label={`Школа ${organization.name}`}
        className="mt-20 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5 md:mt-24"
        style={organization.primaryColor ? { borderColor: organization.primaryColor } : undefined}
      >
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Онлайн-школа</p>
          <Brand brand={organization} nameClassName="text-xl md:text-2xl" markClassName="size-11" />
        </div>
        <p className="max-w-md text-sm text-muted-foreground">Курсы и учебные материалы школы «{organization.name}».</p>
      </section>
      {children}
    </div>
  );
}
