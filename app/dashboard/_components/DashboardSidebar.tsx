"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ComponentProps, type ReactNode } from "react";
import {
  GraduationCapIcon,
  LayersIcon,
  MessageCircleQuestionMarkIcon,
  UserIcon,
  ClipboardListIcon,
} from "lucide-react";

import NavUser from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface IItems {
  title: string;
  url: string;
  icon: ReactNode;
}

function isNavItemActive(pathname: string, url: string) {
  if (url === "#") return false;
  const segmentCount = url.split("/").filter(Boolean).length;
  if (segmentCount <= 1) return pathname === url;
  return pathname === url || pathname.startsWith(url + "/");
}

export function DashboardSidebar({ role, ...props }: ComponentProps<typeof Sidebar> & { role?: string | null }) {
  const pathname = usePathname();

  const navMain: IItems[] = [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: <GraduationCapIcon size={16} />,
    },
    {
      title: "Profile",
      url: "/dashboard/profile",
      icon: <UserIcon size={16} />,
    },
  ];
  if (role === "teacher" || role === "admin") {
    navMain.push({ title: "Teaching", url: "/teacher", icon: <ClipboardListIcon size={16} /> });
  }

  const navSecondary: IItems[] = [
    {
      title: "Get Help",
      url: "/contact",
      icon: <MessageCircleQuestionMarkIcon size={16} />,
    },
  ];

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* Sidebar Header */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/dashboard" />}
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <LayersIcon className="size-5!" />
              <span className="text-base font-semibold">KnowSphere</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Sidebar Content */}
      <SidebarContent>
        <NavMain items={navMain} pathname={pathname} />
        <NavSecondary
          items={navSecondary}
          pathname={pathname}
          className="mt-auto"
        />
      </SidebarContent>

      {/* Sidebar Footer */}
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}

interface NavMainProps {
  items: IItems[];
  pathname: string;
}

function NavMain({ items, pathname }: NavMainProps) {
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                title={item.title}
                isActive={isNavItemActive(pathname, item.url)}
                render={<Link href={item.url} />}
              >
                {item.icon}
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

interface NavSecondaryProps {
  items: IItems[];
  pathname: string;
}

function NavSecondary({
  items,
  pathname,
  ...props
}: NavSecondaryProps & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                isActive={isNavItemActive(pathname, item.url)}
                render={<Link href={item.url} />}
              >
                {item.icon}
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
