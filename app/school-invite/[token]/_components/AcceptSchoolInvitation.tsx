"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acceptOrganizationInvitation } from "@/app/data/organization/actions";
import { authClient } from "@/lib/auth-client";
import { tryCatch } from "@/hooks/try-catch";

export function AcceptSchoolInvitation({ token, email, loginHref }: { token: string; email: string; loginHref: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function accept() {
    setErrorMessage(null);
    startTransition(async () => {
      const { data, error } = await tryCatch(acceptOrganizationInvitation(token));
      if (error || !data || data.status === "error") {
        const message = data?.message ?? "This invitation is invalid or expired.";
        setErrorMessage(message);
        toast.error(message);
        return;
      }
      toast.success(data.message ?? "You joined the school");
      router.push("/dashboard/schools");
      router.refresh();
    });
  }

  function switchAccount() {
    startTransition(async () => {
      await authClient.signOut();
      router.replace(loginHref);
    });
  }

  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">This invitation is for <strong className="text-foreground">{email}</strong>. The signed-in account must use that verified email address.</p>
    <Button type="button" onClick={accept} disabled={isPending}>{isPending ? "Joining…" : "Accept school invitation"}</Button>
    <Button type="button" variant="outline" className="ml-2" onClick={switchAccount} disabled={isPending}>Use another email</Button>
    {errorMessage ? <p role="alert" className="text-sm text-destructive">{errorMessage}</p> : null}
  </div>;
}
