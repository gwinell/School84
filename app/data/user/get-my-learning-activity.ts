import "server-only";

import { requireUser } from "./require-user";
import prisma from "@/lib/prisma";

export async function getMyLearningActivity() {
  const session = await requireUser();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const firstDay = new Date(today);
  firstDay.setUTCDate(firstDay.getUTCDate() - 364);

  const days = await prisma.studentDailyActivity.findMany({
    where: { userId: session.user.id, day: { gte: firstDay, lte: today } },
    orderBy: { day: "asc" },
    select: {
      day: true,
      readingSeconds: true,
      solvingSeconds: true,
      codeSubmissions: true,
      acceptedTasks: true,
    },
  });

  const total = days.reduce((result, day) => ({
    readingSeconds: result.readingSeconds + day.readingSeconds,
    solvingSeconds: result.solvingSeconds + day.solvingSeconds,
    codeSubmissions: result.codeSubmissions + day.codeSubmissions,
    acceptedTasks: result.acceptedTasks + day.acceptedTasks,
    activeDays: result.activeDays + Number(
      day.readingSeconds + day.solvingSeconds + day.codeSubmissions > 0,
    ),
  }), { readingSeconds: 0, solvingSeconds: 0, codeSubmissions: 0, acceptedTasks: 0, activeDays: 0 });

  return {
    days: days.map((day) => ({
      day: day.day.toISOString().slice(0, 10),
      readingSeconds: day.readingSeconds,
      solvingSeconds: day.solvingSeconds,
      codeSubmissions: day.codeSubmissions,
      acceptedTasks: day.acceptedTasks,
    })),
    total,
    rangeStart: firstDay.toISOString().slice(0, 10),
    rangeEnd: today.toISOString().slice(0, 10),
  };
}
