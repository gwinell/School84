import { type Metadata } from "next";

import { CancelContent } from "./_components/CancelContent";

export const metadata: Metadata = {
  title: "Payment cancelled | SchoolSphere",
  description:
    "Your payment was cancelled. You weren't charged and can try again anytime.",
};

export default function PaymentCancelPage() {
  return (
    <section className="relative w-screen left-1/2 -translate-x-1/2 flex min-h-[calc(100svh-4rem)] items-center justify-center overflow-hidden py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <svg
          className="absolute inset-0 h-full w-full text-foreground/5"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <pattern
              id="cancel-dot-grid"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="2" cy="2" r="1" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cancel-dot-grid)" />
        </svg>

        <div className="absolute -right-32 top-1/4 size-104 rounded-full bg-amber-500/12 blur-3xl" />
        <div className="absolute -left-24 bottom-1/4 size-96 rounded-full bg-primary/12 blur-3xl" />

        <div className="absolute right-[14%] top-[22%] size-10 -rotate-6 rounded-md border border-foreground/10 bg-background/60 shadow-sm backdrop-blur-sm" />
        <div className="absolute bottom-[26%] left-[12%] size-7 rotate-12 rounded-md border border-foreground/10 bg-background/60 shadow-sm backdrop-blur-sm" />
        <div className="absolute bottom-[18%] right-[10%] size-5 rotate-45 rounded-md border border-foreground/10 bg-background/40 shadow-sm backdrop-blur-sm" />
      </div>

      <CancelContent />
    </section>
  );
}
