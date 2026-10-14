import { notFound } from "next/navigation";

export default function ProjectsDisabledLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  void children;
  notFound();
}
