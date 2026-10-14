import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptSchoolInvitation } from "./_components/AcceptSchoolInvitation";

export default async function SchoolInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const loginHref = `/login?redirect=${encodeURIComponent(`/school-invite/${token}`)}`;
  return <main className="mx-auto flex min-h-[70vh] max-w-lg items-center px-4 py-10">
    <Card className="w-full">
      <CardHeader><CardTitle>Invitation to a school</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {session?.user ? <AcceptSchoolInvitation token={token} email={session.user.email} loginHref={loginHref} /> : <>
          <p className="text-sm text-muted-foreground">Sign in or create an account using the invited email address. The invitation expires after seven days and can only be used once.</p>
          <Link href={loginHref} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Sign in or create an account</Link>
        </>}
      </CardContent>
    </Card>
  </main>;
}
