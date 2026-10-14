import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptCourseInvitation } from "./_components/AcceptCourseInvitation";

export default async function CourseInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const loginHref = `/login?redirect=${encodeURIComponent(`/invite/${token}`)}`;
  return <main className="mx-auto flex min-h-[70vh] max-w-lg items-center px-4 py-10">
    <Card className="w-full">
      <CardHeader><CardTitle>Приглашение на курс</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {session?.user ? <AcceptCourseInvitation token={token} email={session.user.email} loginHref={loginHref} /> : <>
          <p className="text-sm text-muted-foreground">Войдите или создайте аккаунт с тем же подтверждённым email, на который выдана ссылка.</p>
          <Link href={loginHref} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Войти или зарегистрироваться</Link>
        </>}
      </CardContent>
    </Card>
  </main>;
}
