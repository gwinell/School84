import { SettingsIcon } from "lucide-react";

import { getMyCertificateVisibility } from "@/app/data/user/get-my-certificate-visibility";

import { CertificateVisibilityCard } from "./_components/CertificateVisibilityCard";

export const metadata = {
  title: "Settings | SchoolSphere",
};

export default async function SettingsPage() {
  const showCertificatesPublicly = await getMyCertificateVisibility();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure your learning preferences and privacy.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 pt-2">
          <SettingsIcon className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Privacy
          </h3>
        </div>
        <CertificateVisibilityCard
          initialValue={showCertificatesPublicly}
        />
      </div>
    </div>
  );
}
