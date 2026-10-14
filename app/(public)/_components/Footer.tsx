import Link from "next/link";
import Image from "next/image";
import { GithubIcon, LinkedinIcon, TwitterIcon } from "lucide-react";

import { Separator } from "@/components/ui/separator";

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Sign in", href: "/login" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
    ],
  },
];

interface SocialLink {
  label: string;
  href: string;
  icon: typeof TwitterIcon;
}

const SOCIAL_LINKS: SocialLink[] = [
  { label: "Twitter", href: "https://twitter.com/", icon: TwitterIcon },
  { label: "GitHub", href: "https://github.com/", icon: GithubIcon },
  { label: "LinkedIn", href: "https://linkedin.com/", icon: LinkedinIcon },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-muted/30 mt-16">
      <div className="container mx-auto px-4 md:px-6 lg:px-8">
        <div className="grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-12 lg:gap-12 lg:py-16">
          <div className="lg:col-span-7 space-y-6">
            <Link
              href="/"
              aria-label="KnowSphere home"
              className="inline-flex items-center gap-2"
            >
              <Image src="/logo.png" alt="KnowSphere logo" className="size-9" width={36} height={36} />
              <span className="text-xl font-bold tracking-tight">
                KnowSphere
              </span>
            </Link>

            <p className="max-w-md text-sm text-muted-foreground leading-relaxed">
              A modern learning platform to help you master new skills, grow
              your career, and explore what you love — taught by experts, on
              your schedule.
            </p>
          </div>

          <div className="lg:col-span-5 grid grid-cols-2 gap-8 sm:grid-cols-3">
            {FOOTER_COLUMNS.map((column) => (
              <div key={column.title} className="space-y-3">
                <h3 className="text-sm font-semibold">{column.title}</h3>
                <ul className="space-y-2">
                  {column.links.map((link) => (
                    <li key={`${column.title}-${link.label}`}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div className="flex flex-col items-center justify-between gap-4 py-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {year} KnowSphere. All rights reserved.
          </p>

          <div className="flex items-center gap-1">
            {SOCIAL_LINKS.map((social) => (
              <Link
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`KnowSphere on ${social.label}`}
                className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <social.icon className="size-4" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
