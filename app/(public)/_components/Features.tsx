import {
  AwardIcon,
  BookOpenIcon,
  ClockIcon,
  GraduationCapIcon,
  PlayCircleIcon,
  SparklesIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface FeatureItem {
  title: string;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
}

const FEATURES: FeatureItem[] = [
  {
    title: "Wide Range of Courses",
    description:
      "Explore a diverse selection of courses across various subjects and disciplines, from beginner essentials to advanced specializations.",
    icon: BookOpenIcon,
    iconClassName: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    title: "Expert Instructors",
    description:
      "Learn from industry experts and experienced educators who are passionate about teaching and dedicated to your growth.",
    icon: GraduationCapIcon,
    iconClassName: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    title: "Flexible Learning",
    description:
      "Access course materials anytime, anywhere, and learn at your own pace — on your schedule, on your terms.",
    icon: ClockIcon,
    iconClassName: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    title: "Interactive Content",
    description:
      "Engage with multimedia content, quizzes, and assignments designed to deepen understanding and improve retention.",
    icon: PlayCircleIcon,
    iconClassName: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  {
    title: "Community Support",
    description:
      "Join a vibrant community of learners to share knowledge, collaborate, ask questions, and grow together.",
    icon: UsersIcon,
    iconClassName: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  {
    title: "Certification",
    description:
      "Earn certificates upon course completion to showcase your achievements and stand out to employers and clients.",
    icon: AwardIcon,
    iconClassName: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  },
];

function FeatureCard({
  title,
  description,
  icon: Icon,
  iconClassName,
}: FeatureItem) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-foreground/20">
      {/* Hover-revealed subtle grid pattern in the card background,
          masked with a radial gradient so it's strongest at center
          and fades smoothly toward the edges. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-xl text-foreground/8 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "20px 20px",
          maskImage:
            "radial-gradient(ellipse at center, black 0%, rgba(0,0,0,0.4) 50%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black 0%, rgba(0,0,0,0.4) 50%, transparent 100%)",
        }}
      />

      <div className="relative">
        <div
          className={cn(
            "inline-flex size-12 items-center justify-center rounded-lg",
            iconClassName,
          )}
        >
          <Icon className="size-6" aria-hidden />
        </div>

        <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>

        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

export function Features() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-primary/5 via-primary/2 to-transparent"
      />

      <div className="mx-auto max-w-6xl space-y-12 px-4 py-16 md:px-6 md:py-24 lg:px-8">
        <div className="mx-auto max-w-2xl space-y-4 text-center">
          <Badge variant="secondary" className="gap-1.5">
            <SparklesIcon className="size-3" />
            Why SchoolSphere
          </Badge>

          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-balance">
            Everything you need to learn, all in one place.
          </h2>

          <p className="text-base md:text-lg text-muted-foreground leading-relaxed text-balance">
            Built for learners and instructors who care about quality — with
            modern tools that make teaching and learning feel effortless.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}
