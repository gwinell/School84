import type { ReactNode } from "react";
import { CalendarDaysIcon, CheckCircle2Icon, Clock3Icon, SendIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { getMyLearningActivity } from "@/app/data/user/get-my-learning-activity";

type LearningActivity = Awaited<ReturnType<typeof getMyLearningActivity>>;

export function LearningActivityStats({ activity }: { activity: LearningActivity }) {
  const dayByDate = new Map(activity.days.map((day) => [day.day, day]));
  const end = new Date(`${activity.rangeEnd}T00:00:00.000Z`);
  const start = new Date(`${activity.rangeStart}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const calendarDays: { date: string; outsideRange: boolean }[] = [];
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const key = date.toISOString().slice(0, 10);
    calendarDays.push({ date: key, outsideRange: key < activity.rangeStart });
  }

  const engagedSeconds = activity.total.readingSeconds + activity.total.solvingSeconds;

  return (
    <section className="space-y-4" aria-labelledby="activity-heading">
      <div className="space-y-1">
        <h3 id="activity-heading" className="text-lg font-semibold">Активность за год</h3>
        <p className="text-sm text-muted-foreground">Время чтения и решения задач учитывается, пока вкладка открыта и вы активны.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<SendIcon />} label="Отправлено решений" value={activity.total.codeSubmissions.toLocaleString("ru-RU")} />
        <Stat icon={<CheckCircle2Icon />} label="Задач принято" value={activity.total.acceptedTasks.toLocaleString("ru-RU")} />
        <Stat icon={<Clock3Icon />} label="Время занятий" value={formatDuration(engagedSeconds)} detail={`чтение ${formatDuration(activity.total.readingSeconds)} · задачи ${formatDuration(activity.total.solvingSeconds)}`} />
        <Stat icon={<CalendarDaysIcon />} label="Дней с активностью" value={activity.total.activeDays.toLocaleString("ru-RU")} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Календарь занятий</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto pb-2">
            <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]" role="img" aria-label="Активность по дням за последний год">
              {calendarDays.map(({ date, outsideRange }) => {
                const row = dayByDate.get(date);
                const seconds = (row?.readingSeconds ?? 0) + (row?.solvingSeconds ?? 0);
                const submissions = row?.codeSubmissions ?? 0;
                const intensity = seconds === 0 && submissions === 0
                  ? 0
                  : seconds < 900 && submissions === 0
                    ? 1
                    : seconds < 1_800 && submissions < 2
                      ? 2
                      : seconds < 3_600 && submissions < 4
                        ? 3
                        : 4;
                const title = `${date}: ${submissions} отправлено, ${row?.acceptedTasks ?? 0} принято · чтение ${minutesLabel(row?.readingSeconds ?? 0)} · задачи ${minutesLabel(row?.solvingSeconds ?? 0)}`;
                return (
                  <span
                    key={date}
                    title={title}
                    className={`size-[11px] rounded-[3px] ${outsideRange ? "opacity-0" : intensityClass[intensity]}`}
                  />
                );
              })}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <span>Меньше</span>
            {[0, 1, 2, 3, 4].map((level) => <span key={level} className={`size-[11px] rounded-[3px] ${intensityClass[level]}`} />)}
            <span>Больше</span>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function Stat({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail?: string }) {
  return (
    <Card>
      <CardContent className="flex min-h-28 items-start gap-3 p-4">
        <span className="mt-0.5 text-muted-foreground [&>svg]:size-4">{icon}</span>
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

const intensityClass = [
  "bg-muted",
  "bg-emerald-200 dark:bg-emerald-950",
  "bg-emerald-400 dark:bg-emerald-800",
  "bg-emerald-500 dark:bg-emerald-600",
  "bg-emerald-700 dark:bg-emerald-400",
];

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} ч ${remainder} мин` : `${hours} ч`;
}

function minutesLabel(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return `${minutes} мин`;
}
