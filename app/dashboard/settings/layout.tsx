import { notFound } from "next/navigation";

export default function SettingsDisabledLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  void children;
  notFound();
}
