"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BookmarkIcon, CheckIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tryCatch } from "@/hooks/try-catch";
import { publicCourseHref } from "@/lib/organization/course-links";

import {
  addToWishlistAction,
  removeFromWishlistAction,
} from "./wishlist-actions";

interface WishlistButtonProps {
  courseId: string;
  slug: string;
  organizationSlug: string;
  isWishlisted: boolean;
  isSignedIn: boolean;
  isEnrolled: boolean;
  className?: string;
}

export function WishlistButton({
  courseId,
  slug,
  organizationSlug,
  isWishlisted,
  isSignedIn,
  isEnrolled,
  className,
}: WishlistButtonProps) {
  // Optimistic overlay: takes precedence over the server-provided value
  // until the action completes and the page is refreshed.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [isPending, startTransition] = useTransition();

  const saved = optimistic ?? isWishlisted;

  if (isEnrolled) return null;

  if (!isSignedIn) {
    return (
      <Button
        variant="outline"
        className={cn("w-full", className)}
        size="lg"
        nativeButton={false}
        render={<Link href={`/login?redirect=${encodeURIComponent(publicCourseHref(organizationSlug, slug))}`} />}
      >
        <BookmarkIcon className="size-4" />
        Sign in to save
      </Button>
    );
  }

  function toggle() {
    const next = !saved;
    setOptimistic(next);

    const action = next
      ? addToWishlistAction({ courseId })
      : removeFromWishlistAction({ courseId });

    startTransition(async () => {
      const { data: result, error } = await tryCatch(action);

      if (error || !result) {
        setOptimistic(null);
        toast.error("Unexpected error. Please try again.");
        return;
      }

      if (result.status === "error") {
        setOptimistic(null);
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setOptimistic(null);
    });
  }

  return (
    <Button
      type="button"
      variant={saved ? "secondary" : "outline"}
      className={cn("w-full", className)}
      size="lg"
      onClick={toggle}
      disabled={isPending}
      aria-pressed={saved}
    >
      {isPending ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : saved ? (
        <BookmarkIcon className="size-4 fill-current" />
      ) : (
        <BookmarkIcon className="size-4" />
      )}
      {saved ? "Saved" : "Add to wishlist"}
      {saved ? <CheckIcon className="size-4" /> : null}
    </Button>
  );
}
