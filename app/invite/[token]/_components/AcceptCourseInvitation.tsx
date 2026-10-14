"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { acceptCourseInvitation } from "@/app/admin/courses/[courseId]/assignments/actions";
import { authClient } from "@/lib/auth-client";
import { tryCatch } from "@/hooks/try-catch";

export function AcceptCourseInvitation({ token, email, loginHref }: { token: string; email: string; loginHref: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function accept() {
    setErrorMessage(null);
    startTransition(async () => {
      const { data, error } = await tryCatch(acceptCourseInvitation(token));
      if (error || !data || data.status === "error") {
        const message = data?.message ?? "Не удалось принять приглашение";
        setErrorMessage(message);
        toast.error(message);
        return;
      }
      toast.success(data.message ?? "Курс добавлен");
      router.push("/dashboard");
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
    <p className="text-sm text-muted-foreground">Приглашение выдано для <strong className="text-foreground">{email}</strong>. Подтверждённый email аккаунта должен совпасть.</p>
    <Button type="button" onClick={accept} disabled={isPending}>{isPending ? "Добавляем курс…" : "Принять приглашение"}</Button>
    <Button type="button" variant="outline" className="ml-2" onClick={switchAccount} disabled={isPending}>Войти с другим email</Button>
    {errorMessage ? <p role="alert" className="text-sm text-destructive">{errorMessage}</p> : null}
  </div>;
}
