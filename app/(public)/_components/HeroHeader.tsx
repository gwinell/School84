"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Brand } from "@/components/brand";
import { ModeToggle } from "@/components/ModeToggle";
import { authClient } from "@/lib/auth-client";
import { UserDropDown } from "./UserDropDown";
import { useSignOut } from "@/hooks/use-signout";
import { cn } from "@/lib/utils";

const menuItems = [
  { name: "Home", href: "/" },
  { name: "Contact", href: "/contact" },
];

function isActiveLink(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  pathname,
  onNavigate,
  className,
}: {
  pathname: string;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <ul className={cn("flex items-center gap-2 sm:gap-8 text-sm", className)}>
      {menuItems.map((item) => {
        const active = isActiveLink(pathname, item.href);
        return (
          <li key={item.name}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative inline-block px-2 py-1 duration-150",
                active
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-accent-foreground",
              )}
            >
              <span>{item.name}</span>
              <span
                aria-hidden
                className={cn(
                  "absolute -bottom-1 left-2 right-2 h-0.5 rounded-full bg-foreground transition-all duration-300",
                  active ? "opacity-100 scale-x-100" : "opacity-0 scale-x-50",
                )}
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export const HeroHeader = () => {
  const [menuState, setMenuState] = useState(false);
  const pathname = usePathname();

  const { data: session, isPending, error } = authClient.useSession();

  const { handleSignout } = useSignOut();

  return (
    <header>
      <nav
        data-state={menuState && "active"}
        className="bg-background/50 fixed inset-x-0 top-0 z-20 w-full overflow-x-clip border-b backdrop-blur-3xl"
      >
        <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-2 transition-all duration-300 md:px-6 lg:gap-0 lg:px-8 lg:py-3">
          {/* Left: logo */}
          <Link
            href="/"
            aria-label="SchoolSphere home"
            className="flex shrink-0 items-center gap-2"
          >
            <Brand nameClassName="hidden text-xl lg:inline" />
          </Link>

          {/* Center: desktop nav links */}
          <div className="hidden lg:flex lg:flex-1 lg:justify-center">
            <NavLinks pathname={pathname} />
          </div>

          {/* Right: auth + theme toggle + (mobile) hamburger */}
          <div className="flex items-center gap-2 sm:gap-3 lg:w-auto">
            <ModeToggle />

            <Button
              variant="outline"
              size="icon"
              nativeButton
              onClick={() => setMenuState(!menuState)}
              aria-label={menuState == true ? "Close Menu" : "Open Menu"}
              aria-expanded={menuState}
              className="relative z-20 lg:hidden"
            >
              <Menu className="in-data-[state=active]:rotate-180 in-data-[state=active]:scale-0 in-data-[state=active]:opacity-0 size-5 duration-200" />
              <X className="in-data-[state=active]:rotate-0 in-data-[state=active]:scale-100 in-data-[state=active]:opacity-100 absolute inset-0 m-auto size-5 -rotate-180 scale-0 opacity-0 duration-200" />
              <span className="sr-only">Toggle menu</span>
            </Button>

            {isPending ? null : session && !error ? (
              <UserDropDown
                name={session.user?.name}
                email={session.user?.email}
                imageUrl={session.user?.image}
                role={session.user?.role ?? null}
                onLogout={handleSignout}
              />
            ) : (
              <Button
                render={
                  <Link href="/login" onClick={() => setMenuState(false)}>
                    Log In
                  </Link>
                }
                variant="outline"
                size="sm"
                nativeButton={false}
              />
            )}
          </div>
        </div>

        {/* Mobile menu (when open) */}
        <div
          data-state={menuState ? "active" : undefined}
          className="container mx-auto hidden w-full flex-col gap-4 px-4 pb-6 md:px-6 lg:hidden data-[state=active]:flex lg:px-8"
        >
          <div className="rounded-3xl border bg-background p-6 shadow-2xl shadow-zinc-300/20 dark:shadow-none">
            <NavLinks
              pathname={pathname}
              onNavigate={() => setMenuState(false)}
              className="flex-col items-start gap-1"
            />
          </div>
        </div>
      </nav>
    </header>
  );
};
