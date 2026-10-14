import type { ReactNode } from "react";
import { requireUser } from "@/app/data/user/require-user";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

import { DashboardHeader } from "./_components/DashboardHeader";
import { DashboardSidebar } from "./_components/DashboardSidebar";
import prisma from "@/lib/prisma";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const session = await requireUser();
  const teachingMembership = await prisma.organizationMembership.findFirst({
    where: { userId: session.user.id, role: { in: ["OWNER", "ADMIN", "TEACHER"] } },
    select: { userId: true },
  });
  return (
    <SidebarProvider
      className="h-svh overflow-hidden"
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 52)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      {/* Sidebar */}
      <DashboardSidebar variant="inset" role={session.user.role ?? undefined} hasTeachingAccess={Boolean(teachingMembership)} />

      <SidebarInset className="min-h-0 overflow-hidden">
        {/* Header */}
        <DashboardHeader />

        <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto p-4 *:shrink-0 md:space-y-6 lg:py-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
