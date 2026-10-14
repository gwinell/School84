"use client";

import { useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, HelpCircleIcon } from "lucide-react";

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    id: "pricing",
    question: "How much does SchoolSphere cost?",
    answer:
      "Sign up is free. Many courses are free; paid courses are priced individually by their instructors. You'll always see the price up front before enrolling, and we never auto-charge.",
  },
  {
    id: "refund",
    question: "What's your refund policy?",
    answer:
      "Every paid course comes with a 30-day money-back guarantee. If the course isn't right for you, reach out within 30 days of purchase and we'll issue a full refund — no questions asked.",
  },
  {
    id: "certificate",
    question: "Do I get a certificate after completing a course?",
    answer:
      "Yes. Finish every lesson in a paid course and your certificate of completion is generated automatically. It's shareable on LinkedIn, downloadable as PDF, and includes a unique verification URL.",
  },
  {
    id: "lifetime",
    question: "How long do I have access to a course?",
    answer:
      "Lifetime. Once you enroll, the course — and every future update the instructor publishes — is yours forever. Revisit lessons as often as you like, at any pace.",
  },
];

function FaqRow({
  faq,
  isOpen,
  onOpenChange,
}: {
  faq: FaqItem;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onOpenChange}
      className="rounded-xl border border-border bg-card shadow-xs transition-colors hover:border-foreground/20"
    >
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-4 rounded-xl px-5 py-4 text-left",
          "transition-colors hover:bg-muted/30",
        )}
      >
        <div className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <HelpCircleIcon className="size-4" aria-hidden />
        </div>

        <span className="flex-1 text-sm font-semibold leading-snug">
          {faq.question}
        </span>

        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-300",
            isOpen && "rotate-180",
          )}
          aria-hidden
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="overflow-hidden">
        <div className="border-t border-border px-5 py-4 pl-17 text-sm leading-relaxed text-muted-foreground">
          {faq.answer}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function FaqList() {
  const [openId, setOpenId] = useState<string | null>(FAQS[0]?.id ?? null);

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {FAQS.map((faq) => (
        <FaqRow
          key={faq.id}
          faq={faq}
          isOpen={openId === faq.id}
          onOpenChange={(open) => setOpenId(open ? faq.id : null)}
        />
      ))}
    </div>
  );
}
