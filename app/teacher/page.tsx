import Link from "next/link";
import { ArrowRightIcon, BookOpenIcon } from "lucide-react";

import { adminGetTeachingCourses } from "@/app/data/teacher/get-course-gradebook";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TeacherHomePage() {
  const courses = await adminGetTeachingCourses();
  return <div className="space-y-6">
    <div className="space-y-1">
      <h1 className="text-3xl font-bold tracking-tight">Курсы и ученики</h1>
      <p className="text-sm text-muted-foreground">Открывайте журнал успеваемости, управляйте назначениями и проверяйте работы.</p>
    </div>
    {courses.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {courses.map((course) => <Card key={course.id}>
        <CardHeader><CardTitle className="line-clamp-2">{course.title}</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><BookOpenIcon className="size-4" />{course.status}</span>
          <Link className={buttonVariants({ size: "sm" })} href={`/teacher/courses/${course.id}`}>Журнал <ArrowRightIcon /></Link>
        </CardContent>
      </Card>)}
    </div> : <Card><CardContent className="p-8 text-center">
      <h2 className="font-semibold">Курсы пока не назначены</h2>
      <p className="mt-2 text-sm text-muted-foreground">Администратор может подключить преподавателя к курсу.</p>
      <Link href="/dashboard" className={buttonVariants({ variant: "outline", className: "mt-4" })}>Вернуться к обучению</Link>
    </CardContent></Card>}
  </div>;
}
