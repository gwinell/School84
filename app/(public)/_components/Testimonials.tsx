import { QuoteIcon, SparklesIcon, StarIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface Testimonial {
  id: string;
  name: string;
  role: string;
  initials: string;
  rating: number;
  content: string;
  iconColor?: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    id: "t1",
    name: "Sarah Khalil",
    role: "Frontend Developer",
    initials: "SK",
    rating: 5,
    iconColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    content:
      "SchoolSphere changed how I learn. The lessons are clear, the platform is fast, and I can pick up right where I left off on any device.",
  },
  {
    id: "t2",
    name: "Marcus Reeves",
    role: "Product Designer",
    initials: "MR",
    rating: 5,
    iconColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    content:
      "As a product designer, I care about details. SchoolSphere nails them — from the seamless checkout to the clean course player. The mobile experience is just as polished as desktop. It's rare to find a learning platform that feels this well-designed.",
  },
  {
    id: "t3",
    name: "Aisha Patel",
    role: "Data Scientist",
    initials: "AP",
    rating: 5,
    iconColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    content:
      "I've tried a lot of platforms and SchoolSphere is the first one where I actually finish courses. The instructor quality is consistently high, the content is well-structured, and the community keeps me accountable. I went from curious to confident in six months.",
  },
  {
    id: "t4",
    name: "Daniel Okafor",
    role: "Self-taught Developer",
    initials: "DO",
    rating: 5,
    iconColor: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    content:
      "Self-taught for years. SchoolSphere filled the gaps I didn't know I had. Worth every penny.",
  },
  {
    id: "t5",
    name: "Priya Sharma",
    role: "Marketing Manager",
    initials: "PS",
    rating: 5,
    iconColor: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    content:
      "The best part is how everything is organized. I can pick a learning path, track my progress, and revisit any lesson. The mobile app means I learn during my commute without skipping a beat. My team has now subscribed for everyone.",
  },
  {
    id: "t6",
    name: "James Walsh",
    role: "Studio Founder",
    initials: "JW",
    rating: 5,
    iconColor: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    content:
      "I run a small studio and use SchoolSphere to keep my team sharp on the latest tools. The platform lets us assign courses, track who completed what, and run reports in seconds. The customer support team actually replies quickly — that's rare. We tried three competitors before settling on SchoolSphere.",
  },
  {
    id: "t7",
    name: "Fatima Hassan",
    role: "Computer Science Student",
    initials: "FH",
    rating: 5,
    iconColor: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    content:
      "Great instructors, great content, and I love the certificate feature for my LinkedIn profile.",
  },
  {
    id: "t8",
    name: "Carlos Mendoza",
    role: "UX Researcher",
    initials: "CM",
    rating: 5,
    iconColor: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    content:
      "The interactive lessons are a game-changer. Quizzes and projects keep me engaged, not just passively watching. I've recommended SchoolSphere to my entire design team — it's that good.",
  },
  {
    id: "t9",
    name: "Emma Wallace",
    role: "Career Switcher",
    initials: "EW",
    rating: 5,
    iconColor: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    content:
      "I switched careers from accounting to UX at 38. SchoolSphere's structured learning paths gave me the confidence to keep going on tough days. Six months in, I landed my first UX role. The instructors genuinely care, the community is supportive, and the certificates helped prove my new skills to employers. I couldn't have done it without this platform.",
  },
  {
    id: "t10",
    name: "Yuki Tanaka",
    role: "DevOps Engineer",
    initials: "YT",
    rating: 5,
    iconColor: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    content:
      "The depth of content is what keeps me coming back. Surface-level tutorials are everywhere, but SchoolSphere goes deep on real-world projects. I learn something new in every session and apply it to my work the next day.",
  },
];

function Stars({ rating }: { rating: number }) {
  return (
    <div
      className="flex items-center gap-0.5 text-amber-400"
      aria-label={`${rating} out of 5 stars`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <StarIcon
          key={i}
          className={`size-3.5 ${
            i < rating ? "fill-amber-400" : "fill-transparent"
          }`}
          aria-hidden
        />
      ))}
    </div>
  );
}

interface TestimonialCardProps {
  testimonial: Testimonial;
}

function TestimonialCard({ testimonial }: TestimonialCardProps) {
  const { name, role, initials, rating, content, iconColor } = testimonial;

  return (
    <article className="flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-xs transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:border-foreground/20">
      <div className="flex items-start justify-between">
        <div
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${
            iconColor ?? "bg-primary/10 text-primary"
          }`}
          aria-hidden
        >
          <QuoteIcon className="size-4" />
        </div>

        <Stars rating={rating} />
      </div>

      <blockquote className="flex-1 text-sm leading-relaxed text-foreground/90">
        &ldquo;{content}&rdquo;
      </blockquote>

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Avatar className="size-9">
          <AvatarFallback className="text-xs font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">{role}</span>
        </div>
      </div>
    </article>
  );
}

export function Testimonials() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-primary/5 via-primary/2 to-transparent"
      />

      <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl space-y-4 text-center">
          <Badge variant="secondary" className="gap-1.5">
            <SparklesIcon className="size-3" />
            Loved by learners
          </Badge>

          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-balance">
            What our community says
          </h2>

          <p className="text-base md:text-lg text-muted-foreground leading-relaxed text-balance">
            Real feedback from learners and instructors who use SchoolSphere every
            day to build new skills and grow their careers.
          </p>
        </div>

        {/* CSS columns masonry. Each child gets `break-inside-avoid` so a card
            never splits across columns. The mask fades the top and bottom 8% so
            cards dissolve toward the edges. */}
        <div
          className="columns-1 gap-6 md:columns-2 lg:columns-3"
          style={{
            maskImage:
              "linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)",
          }}
        >
          {TESTIMONIALS.map((testimonial) => (
            <div key={testimonial.id} className="mb-6 break-inside-avoid">
              <TestimonialCard testimonial={testimonial} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
