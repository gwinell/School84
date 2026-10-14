import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeftIcon, ShieldAlertIcon } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/brand";

export default function NotAdminPage() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6">
      <Link
        href="/"
        className={buttonVariants({
          variant: "ghost",
          className: "absolute top-4 left-4 md:top-8 md:left-8",
        })}
      >
        <ArrowLeftIcon />
        Back
      </Link>

      <div className="w-full flex flex-col gap-6 max-w-sm">
        <Link
          href="/"
          className="flex items-center gap-2 self-center font-medium"
        >
          <Brand />
        </Link>

        <Card className="w-full mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldAlertIcon className="size-7" />
            </div>
            <CardTitle className="text-2xl">Access Restricted</CardTitle>
            <CardDescription>
              You do not have permission to view this page. If you believe this
              is a mistake, please contact support.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex justify-center">
            <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Admin role required
            </span>
          </CardContent>

          <CardFooter className="flex flex-col gap-2">
            <Link href="/" className={buttonVariants({ className: "w-full" })}>
              Go back home
            </Link>
            <Link
              href="mailto:support@knowsphere.app"
              className={buttonVariants({
                variant: "link",
                className: "w-full",
              })}
            >
              Contact support
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
