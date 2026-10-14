"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

interface ProfileFormProps {
  initialName: string;
  email: string;
  image: string | null;
}

function getInitials(name: string, email: string): string {
  const trimmed = name.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  const local = email.split("@")[0] ?? "";
  return local.slice(0, 2).toUpperCase() || "?";
}

export function ProfileForm({ initialName, email, image }: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const trimmed = name.trim();
  const isUnchanged = trimmed === initialName.trim();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending) return;

    if (trimmed.length < 2) {
      setError("Name must be at least 2 characters long");
      return;
    }

    setError(null);

    startTransition(async () => {
      const { error: updateError } = await authClient.updateUser({
        name: trimmed,
      });

      if (updateError) {
        toast.error(updateError.message ?? "Failed to update your profile");
        return;
      }

      toast.success("Profile updated successfully");
      router.refresh();
    });
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Personal information</CardTitle>
        <CardDescription>
          Update the name and profile details on your account.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="size-14 rounded-full">
              <AvatarImage src={image ?? undefined} alt={initialName} />
              <AvatarFallback className="rounded-full">
                {getInitials(initialName, email)}
              </AvatarFallback>
            </Avatar>
            <div className="text-sm">
              <p className="font-medium">{initialName.trim() || "Learner"}</p>
              <p className="text-muted-foreground">{email}</p>
            </div>
          </div>

          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="name">Full name</FieldLabel>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Your name"
              autoComplete="name"
              aria-invalid={error ? true : undefined}
              disabled={isPending}
            />
            {error ? (
              <FieldError>{error}</FieldError>
            ) : (
              <FieldDescription>
                This is the name shown to other learners.
              </FieldDescription>
            )}
          </Field>

          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" value={email} readOnly disabled />
            <FieldDescription>
              Your email is managed by your sign-in method and can&apos;t be
              changed here.
            </FieldDescription>
          </Field>

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending || isUnchanged}>
              {isPending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
