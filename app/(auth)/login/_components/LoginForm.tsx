"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { GithubIcon, LoaderIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

interface LoginFormProps {
  redirectTo?: string;
  demoLoginEnabled?: boolean;
}

export function LoginForm({ redirectTo = "/", demoLoginEnabled = false }: LoginFormProps) {
  const router = useRouter();

  const [githubPending, startGitHubTransition] = useTransition();
  const [emailPending, startEmailTransition] = useTransition();
  const [demoPending, startDemoTransition] = useTransition();
  const [email, setEmail] = useState("");

  async function signInWithGitHub() {
    startGitHubTransition(async () => {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: redirectTo,
        fetchOptions: {
          onSuccess: () => {
            toast.success("Successfully logged in!");
          },
          onError: (error: { error: { message: string } }) => {
            console.error("Error logging in with GitHub:", error);

            toast.error(`Error logging in: ${error.error.message}`);
          },
        },
      });
    });
  }

  function signInWithEmail() {
    startEmailTransition(async () => {
      await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
        fetchOptions: {
          onSuccess: () => {
            toast.success("OTP sent to your email!");
            router.push(
              `/verify-request?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirectTo)}`,
            );
          },
          onError: (error) => {
            console.error("Error sending OTP:", error);
            toast.error(`Error sending OTP: ${error.error.message}`);
          },
        },
      });
    });
  }

  function signInAsDemo(email: string) {
    startDemoTransition(async () => {
      const sent = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      });

      if (sent.error) {
        toast.error(`Не удалось войти: ${sent.error.message}`);
        return;
      }

      await authClient.signIn.emailOtp({
        email,
        otp: "840084",
        fetchOptions: {
          onSuccess: () => {
            toast.success("Вы вошли в демо-аккаунт");
            router.push(redirectTo);
            router.refresh();
          },
          onError: (error: { error: { message: string } }) => {
            console.error("Demo sign-in failed:", error);
            toast.error(`Не удалось войти: ${error.error.message}`);
          },
        },
      });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Welcome Back</CardTitle>
        <CardDescription>
          Please login with your GitHub account to continue.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {demoLoginEnabled && (
          <div className="mb-5 space-y-2 rounded-lg border bg-muted/40 p-3">
            <p className="text-sm font-medium">Быстрый вход для проверки</p>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => signInAsDemo("admin@school84.local")}
              disabled={demoPending}
            >
              {demoPending ? <LoaderIcon size={16} className="animate-spin" /> : null}
              Войти как преподаватель
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => signInAsDemo("student@school84.local")}
              disabled={demoPending}
            >
              {demoPending ? <LoaderIcon size={16} className="animate-spin" /> : null}
              Войти как ученик
            </Button>
          </div>
        )}

        <Button
          className="w-full"
          variant="outline"
          onClick={signInWithGitHub}
          disabled={githubPending}
        >
          {githubPending ? (
            <>
              <LoaderIcon size={16} className="animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <GithubIcon size={16} />
              Login with GitHub
            </>
          )}
        </Button>

        <div
          className="my-3 relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0
            after:flex after:items-center after:border-t after:border-border"
        >
          <span className="relative z-10 bg-card px-2 text-muted-foreground">
            or continue with
          </span>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <Button
            className="w-full"
            onClick={signInWithEmail}
            disabled={emailPending || !email}
          >
            {emailPending ? (
              <>
                <LoaderIcon size={16} className="animate-spin" />
                Sending...
              </>
            ) : (
              <>Send OTP</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
