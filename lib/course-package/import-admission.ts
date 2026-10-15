import arcjet, { fixedWindow } from "@/lib/arcjet";

/** Shared by learner and school routes so both consume the same cluster-wide budget. */
export const coursePackageGlobalRateLimit = arcjet.withRule(
  fixedWindow({ mode: "LIVE", window: "10m", max: 8 }),
);

// A single local slot bounds simultaneous archive expansion and asset staging
// in each app process. Arcjet caps aggregate attempts across hosts, but it is a
// rate budget rather than a distributed semaphore; multiple hosts can still
// each run one import concurrently.
const MAX_LOCAL_CONCURRENT_IMPORTS = 1;
let localImportsInFlight = 0;

export function acquireCoursePackageImportSlot(): (() => void) | null {
  if (localImportsInFlight >= MAX_LOCAL_CONCURRENT_IMPORTS) return null;
  localImportsInFlight += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    localImportsInFlight -= 1;
  };
}
