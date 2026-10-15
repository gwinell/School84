"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CheckIcon,
  Code2Icon,
  FileTextIcon,
  ListChecksIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import type { TAdminGetLesson } from "@/app/data/admin/admin-get-lesson";
import type { Prisma } from "@/lib/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/rich-text-editor/Editor";
import { tryCatch } from "@/hooks/try-catch";
import { cn } from "@/lib/utils";
import { QuizEditor } from "@/app/admin/courses/[courseId]/[chapterId]/[lessonId]/_components/QuizEditor";
import {
  createLessonCell,
  deleteLessonCell,
  reorderLessonCells,
  updateLessonCell,
} from "@/app/admin/courses/[courseId]/[chapterId]/[lessonId]/cell-actions";

type Cell = TAdminGetLesson["cells"][number];
type CellType = "TEXT" | "CODE_TASK" | "QUIZ";

const cellTypeLabels: Record<CellType, string> = {
  TEXT: "Текст",
  CODE_TASK: "Задача",
  QUIZ: "Quiz",
};

const cellIcons = {
  TEXT: FileTextIcon,
  CODE_TASK: Code2Icon,
  QUIZ: ListChecksIcon,
} satisfies Record<CellType, typeof FileTextIcon>;

function parseJsonList(value: unknown) {
  return JSON.stringify(Array.isArray(value) ? value : [], null, 2);
}

type CodeLanguage = "python" | "javascript";

function readLintConfig(value: unknown): { language: CodeLanguage; linters: string[]; checkerCode: string } {
  const fallback = { language: "python" as const, linters: ["ruff"], checkerCode: "" };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const config = value as Record<string, unknown>;

  // Older courses stored a language-keyed map, for example { python: ["ruff"] }.
  if (config.language !== "python" && config.language !== "javascript") {
    const legacyLanguage = Object.keys(config).find((key) => key === "python" || key === "javascript") as CodeLanguage | undefined;
    if (!legacyLanguage) return fallback;
    const legacyLinters = config[legacyLanguage];
    return {
      language: legacyLanguage,
      linters: Array.isArray(legacyLinters) ? legacyLinters.filter((name): name is string => typeof name === "string") : (legacyLanguage === "python" ? ["ruff"] : []),
      checkerCode: typeof config.checkerCode === "string" ? config.checkerCode : "",
    };
  }

  return {
    language: config.language,
    linters: Array.isArray(config.linters) ? config.linters.filter((name): name is string => typeof name === "string") : (config.language === "python" ? ["ruff"] : []),
    checkerCode: typeof config.checkerCode === "string" ? config.checkerCode : "",
  };
}

export function LessonCellEditor({
  courseId,
  chapterId,
  lesson,
  selectedCell,
  courseHrefBase = `/admin/courses/${courseId}`,
}: {
  courseId: string;
  chapterId: string;
  lesson: TAdminGetLesson;
  selectedCell: Cell | null;
  courseHrefBase?: string;
}) {
  const router = useRouter();
  const [cells, setCells] = useState<Cell[]>(lesson.cells);
  const [activeId, setActiveId] = useState(selectedCell?.id ?? null);
  const [newCellType, setNewCellType] = useState<CellType>("TEXT");
  const [isPending, startTransition] = useTransition();
  const active = cells.find((cell) => cell.id === activeId) ?? null;
  const chapterList = lesson.chapter.course.courseChapters;


  function selectCell(id: string) {
    setActiveId(id);
    router.replace(
      `${courseHrefBase}/chapters/${chapterId}/lessons/${lesson.id}?cellId=${id}`,
      { scroll: false },
    );
  }

  function addCell(type: CellType) {
    startTransition(async () => {
      const { data, error } = await tryCatch(
        createLessonCell({ lessonId: lesson.id, type }),
      );
      if (error || data?.status !== "success" || !data.data) {
        toast.error(data?.status === "error" ? data.message : "Не удалось добавить ячейку");
        return;
      }
      setCells((previous) => [...previous, data.data as Cell]);
      selectCell(data.data.id);
      toast.success(`${cellTypeLabels[type]} ячейка добавлена`);
    });
  }

  function removeCell() {
    if (!active || !window.confirm("Удалить выбранную ячейку?")) return;
    const next = cells.filter((cell) => cell.id !== active.id);
    startTransition(async () => {
      const { data, error } = await tryCatch(deleteLessonCell({ cellId: active.id }));
      if (error || data?.status === "error") {
        toast.error(data?.status === "error" ? data.message : "Не удалось удалить ячейку");
        return;
      }
      setCells(next);
      const fallback = next[0] ?? null;
      setActiveId(fallback?.id ?? null);
      router.replace(
        fallback
          ? `${courseHrefBase}/chapters/${chapterId}/lessons/${lesson.id}?cellId=${fallback.id}`
          : `${courseHrefBase}/chapters/${chapterId}/lessons/${lesson.id}`,
        { scroll: false },
      );
      toast.success("Ячейка удалена");
    });
  }

  function moveCell(direction: -1 | 1) {
    if (!active) return;
    const index = cells.findIndex((cell) => cell.id === active.id);
    const destination = index + direction;
    if (destination < 0 || destination >= cells.length) return;
    const next = [...cells];
    const [moved] = next.splice(index, 1);
    next.splice(destination, 0, moved);
    setCells(next);
    startTransition(async () => {
      const { data, error } = await tryCatch(
        reorderLessonCells({ lessonId: lesson.id, cellIds: next.map((cell) => cell.id) }),
      );
      if (error || data?.status === "error") {
        toast.error(data?.status === "error" ? data.message : "Не удалось переставить ячейки");
        setCells(cells);
      }
    });
  }

  function changeType(type: CellType) {
    if (!active || active.type === type) return;
    startTransition(async () => {
      const values = getCellValues(active);
      const { data, error } = await tryCatch(
        updateLessonCell({ cellId: active.id, values: { ...values, type } }),
      );
      if (error || data?.status === "error") {
        toast.error(data?.status === "error" ? data.message : "Не удалось изменить тип ячейки");
        return;
      }
      setCells((previous) => previous.map((cell) => cell.id === active.id ? { ...cell, type } : cell));
      router.refresh();
      toast.success(`Тип ячейки: ${cellTypeLabels[type]}`);
    });
  }

  return (
    <div className="-m-4 flex min-h-[calc(100vh-4rem)] flex-col lg:-m-6">
      <header className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-3 lg:px-6">
        <Button variant="ghost" size="icon" nativeButton={false} render={<Link href={`${courseHrefBase}/chapters/${chapterId}`} />} aria-label="Назад к главе">
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">{lesson.chapter.course.title} / {lesson.chapter.title}</p>
          <h1 className="truncate text-lg font-semibold">{lesson.title}</h1>
        </div>
        <nav className="flex max-w-full items-center gap-1 overflow-x-auto" aria-label="Уроки главы">
          {chapterList.find((chapter) => chapter.id === chapterId)?.lessons.map((item, index) => (
            <Button
              key={item.id}
              size="sm"
              variant={item.id === lesson.id ? "secondary" : "ghost"}
              nativeButton={false}
              render={<Link href={`${courseHrefBase}/chapters/${chapterId}/lessons/${item.id}`} />}
              className="shrink-0"
            >
              <span className="text-muted-foreground">{index + 1}.</span>{item.title}
            </Button>
          ))}
        </nav>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="border-b bg-muted/20 p-3 lg:border-r lg:border-b-0">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Курс</p>
          <nav className="max-h-52 space-y-3 overflow-auto lg:max-h-[calc(100vh-9rem)]">
            {chapterList.map((chapter, chapterIndex) => (
              <section key={chapter.id}>
                <Link
                  href={`${courseHrefBase}/chapters/${chapter.id}`}
                  className={cn("block rounded px-2 py-1 text-xs font-semibold", chapter.id === chapterId ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {chapterIndex + 1}. {chapter.title}
                </Link>
                <div className="mt-1 space-y-0.5">
                  {chapter.lessons.map((item, lessonIndex) => (
                    <Link
                      key={item.id}
                      href={`${courseHrefBase}/chapters/${chapter.id}/lessons/${item.id}`}
                      className={cn("block truncate rounded px-2 py-1.5 text-sm", item.id === lesson.id ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}
                    >
                      <span className="mr-2 text-xs opacity-60">{lessonIndex + 1}.</span>{item.title}
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 space-y-5 p-4 lg:p-6">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
              {cells.map((cell, index) => {
                const Icon = cellIcons[cell.type];
                return (
                  <Button
                    key={cell.id}
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Ячейка ${index + 1}: ${cellTypeLabels[cell.type]}`}
                    title={`${index + 1}. ${cellTypeLabels[cell.type]}${cell.title ? ` — ${cell.title}` : ""}`}
                    onClick={() => selectCell(cell.id)}
                    className={cn("size-10 shrink-0 rounded-md border bg-muted text-foreground hover:bg-muted/80", active?.id === cell.id && "border-primary ring-2 ring-primary/30")}
                  >
                    <Icon className="size-4" />
                  </Button>
                );
              })}
            </div>
            <select
              value={newCellType}
              onChange={(event) => setNewCellType(event.target.value as CellType)}
              disabled={isPending}
              aria-label="Тип новой ячейки"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="TEXT">Текст</option>
              <option value="CODE_TASK">Задача</option>
              <option value="QUIZ">Quiz</option>
            </select>
            <Button type="button" size="icon" variant="outline" disabled={isPending} onClick={() => addCell(newCellType)} title={`Добавить: ${cellTypeLabels[newCellType]}`}>
              <PlusIcon />
            </Button>
            {active && active.type !== newCellType ? (
              <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => changeType(newCellType)}>
                Применить к выбранной
              </Button>
            ) : null}
            <div className="flex items-center gap-1 border-l pl-2">
              <Button type="button" size="icon" variant="ghost" disabled={!active || isPending || cells.findIndex((cell) => cell.id === active.id) === 0} onClick={() => moveCell(-1)} aria-label="Переместить ячейку выше"><ArrowUpIcon /></Button>
              <Button type="button" size="icon" variant="ghost" disabled={!active || isPending || cells.findIndex((cell) => cell.id === active.id) === cells.length - 1} onClick={() => moveCell(1)} aria-label="Переместить ячейку ниже"><ArrowDownIcon /></Button>
              <Button type="button" size="icon" variant="ghost" disabled={!active || isPending} onClick={removeCell} aria-label="Удалить выбранную ячейку"><Trash2Icon /></Button>
            </div>
          </div>

          {active ? (
            <section className="mx-auto w-full max-w-5xl space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Ячейка {cells.findIndex((cell) => cell.id === active.id) + 1}</p>
                  <h2 className="text-2xl font-semibold">{active.title || cellTypeLabels[active.type]}</h2>
                </div>
              </div>
              <CellContentEditor
                key={`${active.id}:${active.type}`}
                courseId={courseId}
                cell={active}
                isPending={isPending}
                onSave={(values) => startTransition(async () => {
                  const { data, error } = await tryCatch(updateLessonCell({ cellId: active.id, values }));
                  if (error || data?.status === "error") {
                    toast.error(data?.status === "error" ? data.message : "Не удалось сохранить ячейку");
                  } else {
                    setCells((previous) => previous.map((cell) =>
                      cell.id === active.id ? { ...cell, ...values } as Cell : cell,
                    ));
                    toast.success("Ячейка сохранена");
                  }
                })}
              />
              {active.type === "QUIZ" ? (
                <QuizEditor key={active.id} cellId={active.id} initialQuiz={active.quiz} />
              ) : null}
            </section>
          ) : (
            <div className="mx-auto flex min-h-72 max-w-3xl flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-center">
              <p className="font-medium">В этом уроке пока нет ячеек</p>
              <p className="text-sm text-muted-foreground">Добавьте текст, задачу или quiz через панель.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button disabled={isPending} onClick={() => addCell("TEXT")}>Добавить текст</Button>
                <Button variant="outline" disabled={isPending} onClick={() => addCell("CODE_TASK")}>Добавить задачу</Button>
                <Button variant="outline" disabled={isPending} onClick={() => addCell("QUIZ")}>Добавить quiz</Button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function getCellValues(cell: Cell) {
  return {
    type: cell.type,
    title: cell.title,
    textContent: cell.textContent,
    taskPrompt: cell.taskPrompt,
    starterCode: cell.starterCode,
    examples: Array.isArray(cell.examples) ? cell.examples : [],
    testCases: Array.isArray(cell.testCases) ? cell.testCases : [],
    lintConfig: cell.lintConfig && typeof cell.lintConfig === "object" && !Array.isArray(cell.lintConfig) ? cell.lintConfig : null,
  };
}

function CellContentEditor({
  courseId,
  cell,
  isPending,
  onSave,
}: {
  courseId: string;
  cell: Cell;
  isPending: boolean;
  onSave: (values: ReturnType<typeof getCellValues>) => void;
}) {
  const [title, setTitle] = useState(cell.title ?? "");
  const [textContent, setTextContent] = useState(cell.textContent ?? "");
  const [taskPrompt, setTaskPrompt] = useState(cell.taskPrompt ?? "");
  const [starterCode, setStarterCode] = useState(cell.starterCode ?? "");
  const [examples, setExamples] = useState(parseJsonList(cell.examples));
  const [testCases, setTestCases] = useState(parseJsonList(cell.testCases));
  const initialLintConfig = readLintConfig(cell.lintConfig);
  const [codeLanguage, setCodeLanguage] = useState<CodeLanguage>(initialLintConfig.language);
  const [linters, setLinters] = useState<string[]>(initialLintConfig.linters);
  const [checkerCode, setCheckerCode] = useState(initialLintConfig.checkerCode);
  const [jsonError, setJsonError] = useState("");

  function save() {
    try {
      const parsedExamples: unknown = JSON.parse(examples || "[]");
      const parsedTests: unknown = JSON.parse(testCases || "[]");
      if (!Array.isArray(parsedExamples) || !Array.isArray(parsedTests)) {
        throw new Error("Проверьте JSON: ожидался список примеров и тестов.");
      }
      setJsonError("");
      const savedLintConfig: Prisma.JsonObject = {
        language: codeLanguage,
        linters,
        ...(checkerCode.trim() ? { checkerCode } : {}),
      };
      onSave({
        type: cell.type,
        title: title.trim() || null,
        textContent: cell.type === "TEXT" ? textContent : null,
        taskPrompt: cell.type === "CODE_TASK" ? taskPrompt : null,
        starterCode: cell.type === "CODE_TASK" ? starterCode : null,
        examples: parsedExamples,
        testCases: parsedTests,
        lintConfig: savedLintConfig,
      });
    } catch {
      setJsonError("Проверьте JSON в примерах и автотестах.");
    }
  }

  return (
    <div className="space-y-5 rounded-xl border bg-card p-4 sm:p-6">
      <label className="block space-y-2">
        <span className="text-sm font-medium">Название ячейки</span>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например: Переменные и типы данных" />
      </label>

      {cell.type === "TEXT" ? (
        <label className="block space-y-2">
          <span className="text-sm font-medium">Конспект</span>
          <RichTextEditor field={{ value: textContent, onChange: setTextContent }} courseId={courseId} />
        </label>
      ) : null}

      {cell.type === "CODE_TASK" ? (
        <div className="space-y-4">
          <label className="block space-y-2"><span className="text-sm font-medium">Условие задачи</span><Textarea value={taskPrompt} onChange={(event) => setTaskPrompt(event.target.value)} className="min-h-32" placeholder="Опишите, что должна сделать программа." /></label>
          <label className="block space-y-2"><span className="text-sm font-medium">Стартовый код</span><Textarea value={starterCode} onChange={(event) => setStarterCode(event.target.value)} className="min-h-36 font-mono text-sm" placeholder="# Код, который увидит ученик" /></label>
          <div className="grid gap-4 lg:grid-cols-2">
            <JsonField label="Примеры ввода/вывода" value={examples} onChange={setExamples} />
            <JsonField label="Автотесты" value={testCases} onChange={setTestCases} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-medium">Язык решения</span>
              <select
                aria-label="Язык решения"
                value={codeLanguage}
                onChange={(event) => {
                  const language = event.target.value as CodeLanguage;
                  setCodeLanguage(language);
                  setLinters(language === "python" ? ["ruff"] : ["eslint"]);
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="python">Python</option>
                <option value="javascript">JavaScript</option>
              </select>
            </label>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Линтеры</legend>
              <label className="flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm">
                <input
                  type="checkbox"
                  aria-label={codeLanguage === "python" ? "Ruff" : "ESLint"}
                  checked={linters.includes(codeLanguage === "python" ? "ruff" : "eslint")}
                  onChange={(event) => {
                    const linter = codeLanguage === "python" ? "ruff" : "eslint";
                    setLinters((current) => event.target.checked
                      ? [...new Set([...current, linter])]
                      : current.filter((name) => name !== linter));
                  }}
                />
                {codeLanguage === "python" ? "Ruff" : "ESLint"}
              </label>
            </fieldset>
          </div>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Дополнительный код автопроверки</span>
            <Textarea
              aria-label="Код дополнительной автопроверки"
              value={checkerCode}
              onChange={(event) => setCheckerCode(event.target.value)}
              className="min-h-48 font-mono text-sm"
              spellCheck={false}
              placeholder={codeLanguage === "python" ? "# Необязательная дополнительная проверка на Python" : "// Необязательная дополнительная проверка на JavaScript"}
            />
            <span className="block text-xs text-muted-foreground">
              Контракт: <code>{codeLanguage === "python"
                ? "def check(input_text, expected_output, actual_output, source_code):"
                : "function check({input, expectedOutput, actualOutput, sourceCode})"}</code>
              <br />Верните true/false или пустую/непустую строку с сообщением об отказе.
            </span>
            <span className="block text-xs text-muted-foreground">Код хранится вместе с языком и линтерами в настройках задачи.</span>
          </label>
          <p className="text-xs text-muted-foreground">Пример записи: [{`{"input":"2 3\\n","output":"5\\n"}`}]. Автотесты и проверка кода выполняются сервером.</p>
          {jsonError ? <p role="alert" className="text-sm text-destructive">{jsonError}</p> : null}
        </div>
      ) : null}

      <div className="flex justify-end border-t pt-4">
        <Button disabled={isPending} onClick={save}>
          <CheckIcon /> {isPending ? "Сохраняем…" : "Сохранить ячейку"}
        </Button>
      </div>
    </div>
  );
}

function JsonField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-36 font-mono text-xs" spellCheck={false} />
    </label>
  );
}
