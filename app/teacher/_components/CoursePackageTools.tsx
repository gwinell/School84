"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type OrganizationOption = { id: string; name: string };

type ImportResult = {
  course: { id: string; title: string; slug: string };
  warnings?: string[];
};

export function CoursePackageImportForm({ organizations }: { organizations: OrganizationOption[] }) {
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [source, setSource] = useState<"file" | "github">("file");
  const [file, setFile] = useState<File | null>(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [includeProgress, setIncludeProgress] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    if (!organizationId) {
      setError("Выберите организацию для импорта.");
      return;
    }
    if (source === "file" && !file) {
      setError("Выберите файл курса.");
      return;
    }
    if (source === "github" && !githubUrl.trim()) {
      setError("Укажите ссылку на GitHub-репозиторий.");
      return;
    }

    const formData = new FormData();
    formData.set("organizationId", organizationId);
    formData.set("includeProgress", String(includeProgress));
    if (source === "file" && file) formData.set("file", file);
    if (source === "github") formData.set("githubUrl", githubUrl.trim());

    setPending(true);
    try {
      const response = await fetch("/api/teacher/course-packages/import", { method: "POST", body: formData });
      const payload = await response.json().catch(() => null) as (ImportResult & { error?: string }) | null;
      if (!response.ok) throw new Error(payload?.error || "Не удалось импортировать курс.");
      if (!payload?.course?.id) throw new Error("Сервер импортировал пакет без данных курса.");
      setResult(payload);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось импортировать курс.");
    } finally {
      setPending(false);
    }
  }

  return <section className="space-y-4 rounded-xl border bg-card p-5">
    <div>
      <h2 className="text-xl font-semibold">Импорт курса</h2>
      <p className="mt-1 text-sm text-muted-foreground">Загрузите пакет курса или импортируйте его из GitHub.</p>
    </div>
    {organizations.length ? <form className="space-y-4" onSubmit={submit}>
      <label className="block space-y-2">
        <span className="text-sm font-medium">Организация</span>
        <select aria-label="Организация для импорта" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
          {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
        </select>
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Источник пакета</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="course-package-source" value="file" checked={source === "file"} onChange={() => setSource("file")} />Файл курса</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="course-package-source" value="github" checked={source === "github"} onChange={() => setSource("github")} />GitHub URL</label>
        </div>
      </fieldset>
      {source === "file" ? <label className="block space-y-2">
        <span className="text-sm font-medium">Файл пакета (.s84course или .zip)</span>
        <Input aria-label="Файл пакета курса" type="file" accept=".s84course,.zip,application/zip" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label> : <label className="block space-y-2">
        <span className="text-sm font-medium">Ссылка на файл пакета в GitHub</span>
        <Input aria-label="GitHub URL курса" type="url" value={githubUrl} onChange={(event) => setGithubUrl(event.target.value)} placeholder="https://github.com/owner/repository/blob/main/course.s84course" />
      </label>}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={includeProgress} onChange={(event) => setIncludeProgress(event.target.checked)} />
        <span>Импортировать прогресс, если он есть в пакете</span>
      </label>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {result ? <div role="status" className="space-y-1 text-sm">
        <p>Курс «{result.course.title}» импортирован. <a className="underline underline-offset-4" href={`/teacher/courses/${result.course.id}/edit`}>Открыть курс</a></p>
        {result.warnings?.map((warning) => <p key={warning} className="text-muted-foreground">{warning}</p>)}
      </div> : null}
      <Button type="submit" disabled={pending}>{pending ? "Импортируем…" : "Импортировать курс"}</Button>
    </form> : <p className="text-sm text-muted-foreground">Нет доступных организаций для импорта.</p>}
  </section>;
}

export function CoursePackageExportControls({ courseId }: { courseId: string }) {
  const [includeProgress, setIncludeProgress] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function exportCourse() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/teacher/courses/${encodeURIComponent(courseId)}/package?includeProgress=${includeProgress}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "Не удалось экспортировать курс.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1]?.split(/[\\/]/).pop() || "course.s84course";
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось экспортировать курс.");
    } finally {
      setPending(false);
    }
  }

  return <section className="space-y-3 rounded-xl border bg-card p-5">
    <div>
      <h2 className="text-xl font-semibold">Экспорт курса</h2>
      <p className="mt-1 text-sm text-muted-foreground">Содержимое и настройки сохраняются в переносимый пакет курса.</p>
    </div>
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={includeProgress} onChange={(event) => setIncludeProgress(event.target.checked)} />
      <span>Включить прогресс учеников</span>
    </label>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <Button type="button" disabled={pending} onClick={exportCourse}>{pending ? "Готовим пакет…" : "Скачать пакет курса"}</Button>
  </section>;
}
