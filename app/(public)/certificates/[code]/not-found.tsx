import { AwardIcon } from "lucide-react";

import { NotFoundView } from "@/components/general/NotFoundView";

export default function CertificateNotFound() {
  return (
    <NotFoundView
      className="min-h-svh"
      icon={AwardIcon}
      title="Certificate not found"
      description="This certificate doesn't exist, or its owner has chosen to keep it private. If you got here from a shared link, please ask the owner to double-check the URL."
      backHref="/"
      backLabel="Back to SchoolSphere"
    />
  );
}
