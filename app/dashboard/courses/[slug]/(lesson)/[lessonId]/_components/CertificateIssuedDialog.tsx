"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AwardIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfetti } from "@/hooks/use-confetti";

interface CertificateIssuedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  verificationCode: string;
  courseSlug: string | null;
  organizationSlug: string;
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // no-op
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="gap-1.5"
    >
      {copied ? (
        <CheckIcon className="size-4 text-primary" />
      ) : (
        <CopyIcon className="size-4" />
      )}
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

export function CertificateIssuedDialog({
  open,
  onOpenChange,
  verificationCode,
  courseSlug,
  organizationSlug,
}: CertificateIssuedDialogProps) {
  const fire = useConfetti();
  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/certificates/${verificationCode}`
      : `/certificates/${verificationCode}`;

  useEffect(() => {
    if (open) fire();
  }, [open, fire]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="items-center text-center sm:items-center sm:text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <AwardIcon className="size-6" />
          </div>
          <DialogTitle className="text-center">
            You earned a certificate!
          </DialogTitle>
          <DialogDescription className="text-center">
            Congratulations on completing the course. Your certificate is ready
            to share — anyone with the link can view it.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 p-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Public link
          </p>
          <p className="mt-1 break-all font-mono text-xs">{publicUrl}</p>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <CopyLinkButton url={publicUrl} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {courseSlug ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                render={<Link href={`/dashboard/schools/${encodeURIComponent(organizationSlug)}/courses/${encodeURIComponent(courseSlug)}`} />}
                onClick={() => onOpenChange(false)}
              >
                Back to course
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              render={<Link href={publicUrl} target="_blank" />}
              onClick={() => onOpenChange(false)}
            >
              View certificate
              <ExternalLinkIcon className="size-4" />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
