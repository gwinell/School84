import { type Metadata } from "next";
import { MailIcon, ShieldCheckIcon, TimerIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getOptionalSession } from "../_lib/get-optional-session";

import { ContactForm } from "./_components/ContactForm";

export const metadata: Metadata = {
  title: "Contact | SchoolSphere",
  description:
    "Get in touch with the SchoolSphere team. Questions about a course, your account, or anything else? Send us a message.",
};

const SUPPORT_EMAIL = "support@knowsphere.app";

export default async function ContactPage() {
  const session = await getOptionalSession();
  const defaultName = session?.user?.name ?? "";
  const defaultEmail = session?.user?.email ?? "";

  return (
    /* The section itself escapes <main className="container mx-auto px-4 ...">
       with the same w-screen + left-50% + -translate-x-50% trick used by the
       home Hero, so the dot grid + orbs + squares fill the full viewport
       even though <main> constrains its own width. */
    <section className="relative w-screen left-1/2 -translate-x-1/2 flex min-h-[calc(100svh-4rem)] items-center justify-center overflow-hidden py-24">
      {/* Background layer — viewport-spanning decorative dots/orbs/squares. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <svg
          className="absolute inset-0 h-full w-full text-foreground/5"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <pattern
              id="contact-dot-grid"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="2" cy="2" r="1" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#contact-dot-grid)" />
        </svg>

        <div className="absolute -right-32 top-1/4 size-104 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -left-24 bottom-1/4 size-96 rounded-full bg-purple-500/12 blur-3xl" />

        <div className="absolute right-[14%] top-[22%] size-10 -rotate-6 rounded-md border border-foreground/10 bg-background/60 shadow-sm backdrop-blur-sm" />
        <div className="absolute bottom-[26%] left-[12%] size-7 rotate-12 rounded-md border border-foreground/10 bg-background/60 shadow-sm backdrop-blur-sm" />
        <div className="absolute bottom-[18%] right-[10%] size-5 rotate-45 rounded-md border border-foreground/10 bg-background/40 shadow-sm backdrop-blur-sm" />
      </div>

      <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-4 md:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <div className="space-y-8">
          <div className="space-y-4">
            <p className="text-sm font-medium uppercase tracking-wider text-primary">
              Contact
            </p>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Get in touch.
            </h1>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
              Questions about a tutorial, the starter kit, or the course? Send a
              message and a human will reply, usually within a day or two.
            </p>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-medium">Prefer plain email?</p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex items-center gap-2 text-base font-medium text-foreground underline-offset-4 hover:underline"
            >
              <MailIcon className="size-4 text-primary" />
              {SUPPORT_EMAIL}
            </a>
            <p className="text-sm text-muted-foreground">
              It lands in the same inbox.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
              <TimerIcon className="mt-0.5 size-4 text-primary" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Quick replies</p>
                <p className="text-xs text-muted-foreground">
                  Usually within 1&ndash;2 business days
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
              <ShieldCheckIcon className="mt-0.5 size-4 text-primary" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Private & secure</p>
                <p className="text-xs text-muted-foreground">
                  Your details stay between us
                </p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Send a message</CardTitle>
            </CardHeader>
            <CardContent>
              <ContactForm
                defaultName={defaultName}
                defaultEmail={defaultEmail}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
