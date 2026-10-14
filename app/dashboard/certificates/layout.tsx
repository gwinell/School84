import { notFound } from "next/navigation";

export default function CertificatesDisabledLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  void children;
  notFound();
}
