import { buttonVariants } from "@/components/ui/button";
import { ArrowLeftIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import Link from "next/link";

interface IAuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: IAuthLayoutProps) {
  return (
    <div className="min-h-svh relative flex flex-col items-center justify-center">
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

        {children}

        <div className="text-center text-xs text-muted-foreground">
          By clicking continue, you agree to our{" "}
          <Link href="/terms" className="text-primary hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </div>
      </div>
    </div>
  );
}
