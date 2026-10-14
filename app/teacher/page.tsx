import Link from "next/link";
import { ArrowRightIcon, BookOpenIcon } from "lucide-react";

import { adminGetTeachingCourses } from "@/app/data/teacher/get-course-gradebook";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brand } from "@/components/brand";

export default async function TeacherHomePage() {
  const courses = await adminGetTeachingCourses();
  return <div className="space-y-6">
    <div className="space-y-1">
      <h1 className="text-3xl font-bold tracking-tight">Курсы и ученики</h1>
      <p className="text-sm text-muted-foreground">Открывайте журнал успеваемости, управляйте назначениями и проверяйте работы.</p>
    </div>
    {courses.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {courses.map((course) => <Card key={course.id}>
        <CardHeader className="space-y-2"><Brand brand={course.organization} markClassName="size-6" nameClassName="text-sm" /><CardTitle className="line-clamp-2">{course.title}</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <Link className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline" href={`/schools/${encodeURIComponent(course.organization.slug)}/courses`}>Курсы школы<BookOpenIcon className="size-4" /></Link>
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
