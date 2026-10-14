import type { Metadata } from "next";
import CourseDetailPage, { generateMetadata as courseMetadata } from "@/app/(public)/courses/[slug]/page";

type Props = { params: Promise<{ organizationSlug: string; slug: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  return courseMetadata(props);
}

export default function SchoolCoursePage(props: Props) {
  return <CourseDetailPage params={props.params} />;
}
