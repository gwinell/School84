"use client";

import { tAdminCourse } from "@/app/data/admin/admin-get-courses";
import { CourseImage } from "@/components/general/CourseImage";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  ClockIcon,
  GraduationCapIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";

interface iAppProps {
  course: tAdminCourse;
}

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "0 min";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

export function AdminCourseCard({ course }: iAppProps) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl bg-card text-card-foreground shadow-xs border border-border transition-shadow hover:shadow-lg">
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        <CourseImage
          imageUrl={course.imageUrl}
          alt={course.title}
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
          imageClassName="transition-transform duration-500 group-hover:scale-105"
        />
        {course.status && (
          <Badge className="absolute" style={{ top: 8, left: 8 }}>
            {course.status.charAt(0) + course.status.slice(1).toLowerCase()}
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/admin/courses/${course.id}/edit`}
            className="line-clamp-1 text-sm font-semibold leading-snug hover:underline underline-offset-4"
          >
            {course.title}
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger
              nativeButton
              className={cn(
                "-mr-1.5 -mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-popup-open:bg-muted data-popup-open:text-foreground",
              )}
              aria-label="Course actions"
            >
              <MoreHorizontalIcon className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={2}>
              <DropdownMenuItem
                render={<Link href={`/admin/courses/${course.id}/edit`} />}
              >
                <PencilIcon />
                Edit course
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                render={<Link href={`/admin/courses/${course.id}/delete`} />}
              >
                <Trash2Icon />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="flex-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {course.smallDesc}
        </p>

        <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <GraduationCapIcon className="size-2" />
            <span className="capitalize">{course.level}</span>
            <span className="text-border">|</span>
            <ClockIcon className="size-2" />
            <span>{formatDuration(course.duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
