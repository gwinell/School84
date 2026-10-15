import { CoursePackageImportForm } from "./_components/CoursePackageImportForm";

export const metadata = {
  title: "Import a course | SchoolSphere",
  description: "Add a prepared course package to your personal learning space.",
};

export default function CourseImportPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Import a course</h1>
        <p className="text-sm text-muted-foreground">
          Add a prepared SchoolSphere course package to your learning dashboard.
        </p>
      </div>
      <CoursePackageImportForm />
    </div>
  );
}
