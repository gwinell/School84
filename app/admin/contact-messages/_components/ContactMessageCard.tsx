import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExpandableContent } from "@/components/ui/expandable-content";
import { type tContactMessage } from "@/app/data/admin/admin-get-contact-messages";
import { MailIcon, Trash2Icon, UserIcon } from "lucide-react";
import Link from "next/link";

interface ContactMessageCardProps {
  message: tContactMessage;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function ContactMessageCard({ message }: ContactMessageCardProps) {
  const isLinkedAccount = Boolean(message.userId);

  return (
    <div className="group flex flex-col rounded-xl border border-border bg-card text-card-foreground shadow-xs transition-shadow hover:shadow-md">
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="truncate text-sm font-semibold">{message.name}</h3>
            <a
              href={`mailto:${message.email}`}
              className="truncate text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
            >
              {message.email}
            </a>
          </div>

          <Badge
            variant={isLinkedAccount ? "default" : "secondary"}
            className="shrink-0 gap-1"
          >
            <UserIcon className="size-3" />
            {isLinkedAccount ? "Account" : "Guest"}
          </Badge>
        </div>

        <ExpandableContent
          collapsedHeight={96}
          labels={{ showMore: "Read more" }}
          className="flex-1"
        >
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {message.message}
          </p>
        </ExpandableContent>

        <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-xs">
          <span className="text-muted-foreground">
            {formatDate(message.createdAt)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border p-3">
        <Button
          render={
            <Link href={`mailto:${message.email}?subject=Re: Your message to SchoolSphere`} />
          }
          variant="outline"
          size="sm"
          nativeButton={false}
          className="flex-1"
        >
          <MailIcon className="size-4" />
          Reply
        </Button>
        <Button
          render={
            <Link
              href={`/admin/contact-messages/${message.id}/delete`}
            />
          }
          variant="destructive"
          size="sm"
          nativeButton={false}
          className="flex-1"
        >
          <Trash2Icon className="size-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}
