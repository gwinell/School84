import Link from "next/link";
import { Brand } from "@/components/brand";

import { requireTeacher } from "@/app/data/teacher/require-teacher";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await requireTeacher();
  return <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
      <Link href="/teacher" className="flex items-center gap-2 text-lg font-semibold" aria-label="SchoolSphere — преподавательская">
        <Brand markClassName="size-7" nameClassName="text-base" />
        <span className="hidden text-sm text-muted-foreground sm:inline">Преподавательская</span>
      </Link>
      <div className="flex items-center gap-4 text-sm">
        <Link href="/teacher" className="underline-offset-4 hover:underline">Мои курсы</Link>
        <Link href="/dashboard/schools" className="underline-offset-4 hover:underline">Мои школы</Link>
        <Link href="/dashboard" className="underline-offset-4 hover:underline">Обучение</Link>
        <span className="text-muted-foreground">{session.user.name || session.user.email}</span>
        {session.user.role === "admin" ? <Link href="/admin" className="underline-offset-4 hover:underline">Администрирование</Link> : null}
      </div>
    </header>
    <main>{children}</main>
  </div>;
}
