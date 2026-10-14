"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ComponentProps, type ReactNode } from "react";
import {
  GraduationCapIcon,
  MessageCircleQuestionMarkIcon,
  UserIcon,
  ClipboardListIcon,
  SchoolIcon,
} from "lucide-react";

import NavUser from "@/components/nav-user";
import { Brand } from "@/components/brand";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
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

export type SchoolNavEntry = {
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
};

function isNavItemActive(pathname: string, url: string) {
  if (url === "#") return false;
  const segmentCount = url.split("/").filter(Boolean).length;
  if (segmentCount <= 1) return pathname === url;
  return pathname === url || pathname.startsWith(url + "/");
}

export function DashboardSidebar({ role, hasTeachingAccess = false, schools = [], ...props }: ComponentProps<typeof Sidebar> & { role?: string | null; hasTeachingAccess?: boolean; schools?: SchoolNavEntry[] }) {
  const pathname = usePathname();

  const navMain: IItems[] = [
    {
      title: "Обучение",
      url: "/dashboard",
      icon: <GraduationCapIcon size={16} />,
    },
    {
      title: "Профиль",
      url: "/dashboard/profile",
      icon: <UserIcon size={16} />,
    },
    { title: "Мои школы", url: "/dashboard/schools", icon: <SchoolIcon size={16} /> },
  ];
  if (role === "teacher" || role === "admin" || hasTeachingAccess) {
    navMain.push({ title: "Преподавание", url: "/teacher", icon: <ClipboardListIcon size={16} /> });
  }

  const navSecondary: IItems[] = [
    {
      title: "Помощь",
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
              <Brand markClassName="size-5" nameClassName="text-base" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Sidebar Content */}
      <SidebarContent>
        <NavMain items={navMain} pathname={pathname} />
        <SchoolNavigation schools={schools} pathname={pathname} />
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

export function SchoolNavigation({ schools, pathname }: { schools: SchoolNavEntry[]; pathname: string }) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Школы</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {schools.length ? schools.map((school) => {
            const href = `/schools/${encodeURIComponent(school.slug)}/courses`;
            return (
              <SidebarMenuItem key={school.slug}>
                <SidebarMenuButton
                  title={school.name}
                  isActive={pathname.startsWith(href)}
                  render={<Link href={href} />}
                >
                  <Brand brand={school} markClassName="size-5" nameClassName="text-sm" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          }) : (
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link href="/dashboard/schools" />}>
                <SchoolIcon size={16} />
                <span>Добавить школу</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
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
