"use client";

import Link from "next/link";
import { useTransition } from "react";
import { BellIcon, CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { tryCatch } from "@/hooks/try-catch";

export type StudentNotification = {
  id: string;
  type: "COURSE_ASSIGNED" | "COURSE_DUE_SOON" | "COURSE_OVERDUE" | string;
  title: string;
  body: string;
  readAt: Date | string | null;
  createdAt: Date | string;
  courseId: string;
  course: { title: string; slug: string };
};

export function NotificationCenter({
  notifications,
  onMarkRead,
}: {
  notifications: StudentNotification[];
  onMarkRead: (id: string) => Promise<{ status: "success" | "error"; message?: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  if (!notifications.length) return null;

  function markRead(id: string) {
    startTransition(async () => {
      const { data, error } = await tryCatch(onMarkRead(id));
      if (error || !data || data.status === "error") {
        toast.error(data?.message ?? "Не удалось отметить уведомление");
        return;
      }
      router.refresh();
    });
  }

  return <Card aria-labelledby="notifications-heading">
    <CardHeader><CardTitle id="notifications-heading" className="flex items-center gap-2"><BellIcon className="size-5" />Уведомления</CardTitle></CardHeader>
    <CardContent className="space-y-2">
      {notifications.map((notification) => <article key={notification.id} className={`flex flex-wrap items-start gap-3 rounded-lg border p-3 ${notification.readAt ? "opacity-70" : "bg-muted/30"}`}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{notification.title}</p>{!notification.readAt ? <Badge>Новое</Badge> : null}</div>
          <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
          <Link href={`/dashboard/courses/${notification.course.slug}`} className="mt-2 inline-block text-sm underline underline-offset-4">{notification.course.title}</Link>
        </div>
        {!notification.readAt ? <Button type="button" variant="outline" size="sm" disabled={isPending} aria-label={`Отметить прочитанным: ${notification.title}`} onClick={() => markRead(notification.id)}><CheckIcon />Прочитано</Button> : <span className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(notification.createdAt))}</span>}
      </article>)}
    </CardContent>
  </Card>;
}
