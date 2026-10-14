import Link from "next/link";
import {
  ArrowRightIcon,
  BookOpenIcon,
  GraduationCapIcon,
  SparklesIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

interface StatItem {
  icon: LucideIcon;
  value: string;
  label: string;
}

interface HeroProps {
  isAuthenticated: boolean;
}

const STATS: StatItem[] = [
  { icon: UsersIcon, value: "10K+", label: "Active learners" },
  { icon: BookOpenIcon, value: "200+", label: "Expert courses" },
  { icon: GraduationCapIcon, value: "50+", label: "Instructors" },
];

export function Hero({ isAuthenticated }: HeroProps) {
  return (
    /* The section itself escapes <main className="container mx-auto px-4 ...">
       by going w-screen + left-50% + -translate-x-50%. This puts the hero's
       background decorations in the viewport's containing block instead of
       <main>'s narrower box, so the orbs/grid reach the screen edges. */
    <section className="relative w-screen left-1/2 -translate-x-1/2 flex min-h-[calc(100svh-4rem)] items-center justify-center overflow-hidden py-20">
      {/* Background decorations — inside the section's now-viewport-width
          containing block, so inset-0 naturally spans edge-to-edge. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* Layer 1: subtle dot grid */}
        <svg
          className="absolute inset-0 h-full w-full text-foreground/5"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <pattern
              id="hero-dot-grid"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="2" cy="2" r="1" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-dot-grid)" />
        </svg>

        {/* Layer 2: blurred gradient orbs */}
        <div className="absolute -left-20 top-1/4 size-112 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -right-20 bottom-1/4 size-112 rounded-full bg-purple-500/15 blur-3xl" />

        {/* Layer 3: floating squares */}
        <div className="absolute left-[12%] top-[18%] size-8 rotate-12 rounded-md border border-foreground/10 bg-background/60 shadow-sm backdrop-blur-sm" />
        <div className="absolute right-[14%] top-[26%] size-12 -rotate-6 rounded-md border border-foreground/10 bg-background/60 shadow-sm backdrop-blur-sm" />
        <div className="absolute bottom-[20%] left-[18%] size-6 rotate-45 rounded-md border border-foreground/10 bg-background/60 shadow-sm backdrop-blur-sm" />
        <div className="absolute bottom-[28%] right-[10%] size-10 -rotate-12 rounded-md border border-foreground/10 bg-background/40 shadow-sm backdrop-blur-sm" />
      </div>

      {/* Content stays inside a normal-width container */}
      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center space-y-8 px-4 md:px-6 lg:px-8">
        <Badge variant="secondary" className="gap-1.5">
          <SparklesIcon className="size-3" />
          The new way to learn online
        </Badge>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] text-balance">
          Elevate your{" "}
          <span className="bg-linear-to-r from-primary to-purple-500 bg-clip-text text-transparent">
            learning journey
          </span>{" "}
          with SchoolSphere.
        </h1>

        <p className="max-w-2xl text-base md:text-lg lg:text-xl text-muted-foreground leading-relaxed text-balance">
          Discover courses taught by industry experts, learn at your own pace,
          and unlock your potential — all in one modern place.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Link href="/courses" className={buttonVariants({ size: "lg" })}>
            Explore Courses
            <ArrowRightIcon className="size-4" />
          </Link>
          {!isAuthenticated && (
            <Link
              href="/login"
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              Sign In
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 pt-6">
          {STATS.map((stat) => (
            <div key={stat.label} className="flex items-center gap-2 text-sm">
              <stat.icon className="size-4 text-primary" aria-hidden />
              <span className="font-semibold tabular-nums text-foreground">
                {stat.value}
              </span>
              <span className="text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
