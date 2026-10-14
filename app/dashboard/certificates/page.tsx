import { Suspense } from "react";

import { getMyCertificates } from "@/app/data/user/get-my-certificates";

import { CertificatesList } from "./_components/CertificatesList";
import { CertificatesListSkeleton } from "./_components/CertificatesListSkeleton";

export const metadata = {
  title: "My Certificates | SchoolSphere",
  description: "Certificates you have earned by completing courses.",
};

export default function MyCertificatesPage() {
  return (
    <div className="flex flex-1 flex-col space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">My Certificates</h2>
        <p className="text-sm text-muted-foreground">
          Share your certificates with anyone using the public link.
        </p>
      </div>

      <Suspense fallback={<CertificatesListSkeleton />}>
        <CertificatesSection />
      </Suspense>
    </div>
  );
}

async function CertificatesSection() {
  const certificates = await getMyCertificates();
  return <CertificatesList certificates={certificates} />;
}
