import "server-only";

import { requireUser } from "@/app/data/user/require-user";
import { redirect } from "next/navigation";

export async function requireTeacher() {
  const session = await requireUser();
  if (session.user.role !== "admin" && session.user.role !== "teacher") {
    redirect("/not-admin");
  }
  return session;
}
