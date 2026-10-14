import { notFound } from "next/navigation";

export default function WishlistDisabledLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  void children;
  notFound();
}
