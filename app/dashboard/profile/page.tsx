import { requireUser } from "@/app/data/user/require-user";

import { ProfileForm } from "./_components/ProfileForm";

export const metadata = {
  title: "Profile | SchoolSphere",
};

export default async function ProfilePage() {
  const session = await requireUser();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Profile</h2>
        <p className="text-sm text-muted-foreground">
          Manage your account details and preferences.
        </p>
      </div>

      <ProfileForm
        initialName={session.user.name}
        email={session.user.email}
        image={session.user.image ?? null}
      />
    </div>
  );
}
