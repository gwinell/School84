"use client";

import { useEffect } from "react";

import { setLastVisitedLearningPosition } from "../learning-cursor-actions";

/** Persist the learner's last opened lesson/cell so the dashboard can resume there. */
export function LearningCursorMarker({ courseId, lessonId, cellId }: { courseId: string; lessonId: string; cellId?: string }) {
  useEffect(() => {
    void setLastVisitedLearningPosition({ courseId, lessonId, cellId }).catch(() => undefined);
  }, [courseId, lessonId, cellId]);
  return null;
}
