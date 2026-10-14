"use client";

import { ComponentProps } from "react";
import { usePathname } from "next/navigation";

import {
  LayersIcon,
  PlusCircleIcon,
  LayoutDashboardIcon,
  BookCheckIcon,
  HistoryIcon,
  MessageCircleIcon,
  TagIcon,
} from "lucide-react";

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
import Link from "next/link";
import NavUser from "@/components/nav-user";

function isNavItemActive(pathname: string, url: string) {
  if (url === "#") return false;
  const segmentCount = url.split("/").filter(Boolean).length;
  if (segmentCount <= 1) return pathname === url;
  return pathname === url || pathname.startsWith(url + "/");
}

export function AdminSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();

  const navMain = [
    {
      title: "Dashboard",
      url: "/admin",
      icon: <LayoutDashboardIcon size={16} />,
    },
    {
      title: "Courses",
      url: "/admin/courses",
      icon: <BookCheckIcon size={16} />,
    },
    {
      title: "Categories",
      url: "/admin/categories",
      icon: <TagIcon size={16} />,
    },
    {
      title: "Activity",
      url: "/admin/activity",
      icon: <HistoryIcon size={16} />,
    },
    {
      title: "Messages",
      url: "/admin/contact-messages",
      icon: <MessageCircleIcon size={16} />,
    },
  ];

  const navSecondary: IItems[] = [];

  return (
    <Sidebar collapsible="icon" {...props}>
      {/* Sidebar Header */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/admin" />}
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <LayersIcon className="size-5!" />
              <span className="text-base font-semibold">KnowSphere Admin</span>
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

interface IItems {
  title: string;
  url: string;
  icon: React.ReactNode;
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
          <SidebarMenuItem className="flex items-center gap-2 mb-2">
            <SidebarMenuButton
              tooltip="Create a new course"
              render={<Link href="/admin/courses/new" />}
              className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear"
            >
              <PlusCircleIcon />
              <span>Quick Create</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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
