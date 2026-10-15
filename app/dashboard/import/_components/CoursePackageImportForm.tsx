"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertCircleIcon, BookOpenCheckIcon, UploadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ImportedCourse = {
  id: string;
  title: string;
  slug: string;
  organizationSlug: string;
};

type ImportResponse = {
  course?: ImportedCourse;
  error?: string;
};

type PackageSource = "file" | "githubUrl";

export function CoursePackageImportForm() {
  const [source, setSource] = useState<PackageSource>("file");
  const [file, setFile] = useState<File | null>(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [course, setCourse] = useState<ImportedCourse | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCourse(null);

    if (source === "file" && !file) {
      setError("Choose a course package file to upload.");
      return;
    }
    if (source === "githubUrl" && !githubUrl.trim()) {
      setError("Enter a direct link to a prepared course package.");
      return;
    }

    // The learner endpoint accepts exactly one package source. Keep school and
    // progress fields out of this personal import flow.
    const formData = new FormData();
    if (source === "file" && file) formData.set("file", file);
    if (source === "githubUrl") formData.set("githubUrl", githubUrl.trim());

    setPending(true);
    try {
      const response = await fetch("/api/learner/course-packages/import", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as ImportResponse | null;
      if (!response.ok) throw new Error(payload?.error || "The course could not be imported.");
      const imported = payload?.course;
      if (!imported?.slug || !imported.organizationSlug) {
        throw new Error("The course was imported, but its learning link was missing. Refresh your dashboard and try again.");
      }
      setCourse(imported);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The course could not be imported.");
    } finally {
      setPending(false);
    }
  }

  const learningHref = course
    ? `/dashboard/schools/${encodeURIComponent(course.organizationSlug)}/courses/${encodeURIComponent(course.slug)}`
    : "";

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5 md:p-6">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
          <UploadIcon className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Add a prepared course</h2>
          <p className="text-sm text-muted-foreground">
            Import a <code>.s84course</code> package or ZIP prepared for SchoolSphere.
          </p>
        </div>
      </div>

      <form className="space-y-5" onSubmit={submit}>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Package source</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="learner-package-source"
                value="file"
                checked={source === "file"}
                onChange={() => setSource("file")}
              />
              Upload a file
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="learner-package-source"
                value="githubUrl"
                checked={source === "githubUrl"}
                onChange={() => setSource("githubUrl")}
              />
              Link to a package on GitHub
            </label>
          </div>
        </fieldset>

        {source === "file" ? (
          <label className="block space-y-2">
            <span className="text-sm font-medium">Course package (.s84course or .zip)</span>
            <Input
              aria-label="Course package file"
              type="file"
              accept=".s84course,.zip,application/zip"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
        ) : (
          <label className="block space-y-2">
            <span className="text-sm font-medium">Direct link to the prepared package file</span>
            <Input
              aria-label="Direct GitHub course package URL"
              type="url"
              value={githubUrl}
              onChange={(event) => setGithubUrl(event.target.value)}
              placeholder="https://github.com/owner/repository/blob/main/course.s84course"
            />
          </label>
        )}

        <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Starting from a GitHub repository?</p>
          <p className="mt-1">
            Ask your coding agent to convert the repository into a SchoolSphere course package first. This importer accepts prepared course packages; it does not convert source repositories itself.
          </p>
        </div>

        {error ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        {course ? (
          <div role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <BookOpenCheckIcon className="size-4 text-primary" aria-hidden="true" />
              “{course.title}” is ready in your learning space.
            </p>
            <Link className="mt-3 inline-flex text-sm font-medium text-primary underline underline-offset-4" href={learningHref}>
              Start learning
            </Link>
          </div>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? "Importing course…" : "Import course"}
        </Button>
      </form>
    </section>
  );
}
