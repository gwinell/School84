import Link from "next/link";
import { BookOpenCheckIcon } from "lucide-react";

import { requireTeacher } from "@/app/data/teacher/require-teacher";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await requireTeacher();
  return <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
      <Link href="/teacher" className="flex items-center gap-2 text-lg font-semibold"><BookOpenCheckIcon className="size-5" />Преподавательская</Link>
      <div className="flex items-center gap-4 text-sm">
        <Link href="/teacher" className="underline-offset-4 hover:underline">Мои курсы</Link>
        <span className="text-muted-foreground">{session.user.name || session.user.email}</span>
        {session.user.role === "admin" ? <Link href="/admin" className="underline-offset-4 hover:underline">Администрирование</Link> : null}
      </div>
    </header>
    <main>{children}</main>
  </div>;
}
