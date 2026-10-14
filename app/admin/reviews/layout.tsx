import { notFound } from "next/navigation";

export default function ReviewsDisabledLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  void children;
  notFound();
}
