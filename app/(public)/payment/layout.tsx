import { notFound } from "next/navigation";

export default function PaymentsDisabledLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  void children;
  notFound();
}
