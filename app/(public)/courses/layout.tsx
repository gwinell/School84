import { notFound } from "next/navigation";

export default function CourseStoreDisabledLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  void children;
  notFound();
}
