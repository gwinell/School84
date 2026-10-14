"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { tAnalyticsDailyPoint } from "@/app/data/admin/admin-get-analytics";

interface EnrollmentTrendChartProps {
  data: tAnalyticsDailyPoint[];
}

const config = {
  enrollments: {
    label: "Enrollments",
    color: "var(--color-chart-1)",
  },
} satisfies ChartConfig;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function formatDayLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

export function EnrollmentTrendChart({ data }: EnrollmentTrendChartProps) {
  const hasData = data.some((point) => point.enrollments > 0);

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Course assignments</CardTitle>
        <CardDescription>Assignments during the last 30 days.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto! h-72 w-full">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient
                id="enrollment-trend-fill"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="var(--color-chart-1)"
                  stopOpacity={0.35}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-chart-1)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={formatDayLabel}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={32}
              allowDecimals={false}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--color-border)", strokeDasharray: 3 }}
              content={<ChartTooltipContent indicator="line" />}
            />
            <Area
              type="monotone"
              dataKey="enrollments"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              fill="url(#enrollment-trend-fill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
        {!hasData ? (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            No course assignments yet in the last 30 days.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
