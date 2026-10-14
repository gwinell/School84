import { notFound } from "next/navigation";

export default function PublicCertificatesDisabledLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  void children;
  notFound();
}
