import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCertificateByCode } from "@/app/data/certificate/get-certificate-by-code";

import { CertificateView } from "./_components/CertificateView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageParams {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({
  params,
}: PageParams): Promise<Metadata> {
  const { code } = await params;
  const certificate = await getCertificateByCode(code);

  if (!certificate) {
    return {
      title: "Certificate not found | SchoolSphere",
      robots: { index: false, follow: false },
    };
  }

  const live = certificate.liveCourse;
  const title = live?.title ?? certificate.courseTitleSnapshot;
  const description = `${certificate.recipient.name} completed "${title}" on SchoolSphere.`;

  return {
    title: `${certificate.recipient.name} — ${title} | SchoolSphere Certificate`,
    description,
    openGraph: {
      title: `${certificate.recipient.name} — ${title}`,
      description,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `${certificate.recipient.name} — ${title}`,
      description,
    },
    robots: { index: true, follow: true },
  };
}

export default async function PublicCertificatePage({ params }: PageParams) {
  const { code } = await params;

  if (!code || code.length > 64) {
    notFound();
  }

  const certificate = await getCertificateByCode(code);

  if (!certificate) {
    notFound();
  }

  const publicUrl = `/certificates/${certificate.verificationCode}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center justify-center gap-6 py-12 md:py-16 min-h-screen">
      <CertificateView certificate={certificate} publicUrl={publicUrl} />
    </div>
  );
}
