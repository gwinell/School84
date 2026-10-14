# Acceptance matrix: teacher and learner feature requests

This is the independent acceptance plan for the requested platform features. It is deliberately contract-neutral: tests should call exported server actions/data functions or rendered component callbacks, rather than require a particular URL, schema field name, invitation policy, or grading scale. Once implementation exports stabilize, bind these cases to the actual contracts. Do not report external email, OAuth, notification scheduler, or browser persistence integrations as passing unless those services were exercised.

## Existing baseline and test approach

The previous release QA exercised the demo administrator and learner, course/lesson/code/quiz flows, sequential unlocks, and ordinary browser navigation. It did not verify separate teacher roles, course ownership scopes, learner invitations, group assignments/revocation, teacher gradebook/manual grading/deadlines, persisted quiz attempt history, or resume-to-last-cell behavior. The existing Node regression harness in `backend-regressions.test.cjs` runs real server modules with mocked infrastructure; `frontend-regressions.test.cjs` renders real TSX components with lightweight React/router mocks. Keep feature tests in those styles and use synthetic users/courses only.

## Test fixtures (synthetic, isolated)

Use three users: admin A, teacher T1, teacher T2, learner L1, learner L2, and an invited-but-not-yet-registered email. Use course C1 owned by T1 and C2 owned by T2, with one chapter, two lessons, one code task and one quiz each. Give L1 an active C1 enrollment and L2 a revoked C1 enrollment. Add a published/deadline-bound assignment and at least two quiz attempts for L1. Infrastructure such as Prisma, mail, clock, and notification delivery must be mocked at the boundary; no real account, live DB, email, or third-party service is required for unit tests.

## Server authorization and teacher role

| ID | Scenario | Acceptance evidence |
|---|---|---|
| AUTH-1 | T1 reads and edits C1 roster, assignments, gradebook, and course content | Real data/action exports return/update C1 only. |
| AUTH-2 | T1 requests C2 or its nested lesson/assignment IDs directly | Denied before reads/writes that disclose or mutate C2; UI hiding alone is insufficient. |
| AUTH-3 | T2 requests C1 | Denied with no mutation. |
| AUTH-4 | L1 calls a teacher operation directly | Denied; a learner session cannot gain teacher rights by crafting IDs/payloads. |
| AUTH-5 | Existing admin access and learner access | Existing documented admin behavior remains; ordinary learner course access remains enrollment-scoped. |
| AUTH-6 | Unauthenticated direct action/page request | Redirect/unauthorized response; no protected data returned. |

Do not assume whether admins also need an explicit course assignment: the product rule must be documented by the backend contract. Tests should enforce the chosen rule consistently at server boundaries.

## Invitations, group assignment, and revocation

| ID | Scenario | Acceptance evidence |
|---|---|---|
| ROSTER-1 | Invite an unregistered email | A pending invite is scoped to C1, has a bounded expiry, and cannot grant course access before acceptance. |
| ROSTER-2 | Accept invite using matching normalized email | Invite is consumed once and creates/activates only the intended enrollment; unrelated course access is unchanged. |
| ROSTER-3 | Mismatched email, expired invite, replay, or revoked invite | Rejected without enrollment or privilege changes. |
| ROSTER-4 | Bulk invite/assign a list with duplicates, malformed values, and an existing enrollment | Duplicate and normalization behavior is deterministic; report per-item results or fail atomically as the API documents; no duplicate enrollment rows. |
| ROSTER-5 | Revoke L1 from C1 | C1 protected course/lesson/quiz/code endpoints stop granting access; C2 and the learner account remain intact. |
| ROSTER-6 | Revoke the same enrollment twice | Idempotent documented response; does not delete progress/history. |
| ROSTER-7 | T1 tries to invite, assign, or revoke users on C2 | Denied at the server, with no writes or outgoing mail. |

## Gradebook, histories, manual review, deadlines, notices

| ID | Scenario | Acceptance evidence |
|---|---|---|
| GRADE-1 | T1 opens C1 gradebook | Shows only enrolled C1 learners, progress and permitted submissions; no T2/C2 data. |
| GRADE-2 | Quiz submitted with selected answer IDs | Attempt is persisted with learner, course/cell, timestamp, selected IDs and server-calculated result. A forged score/correct flag is ignored. |
| GRADE-3 | Repeat a quiz with different answers | Both attempts remain attributable and ordered; current/latest result follows the documented rule. Correct answer metadata is not exposed to learner payloads before submission. |
| GRADE-4 | Code submission history | Multiple attempts remain immutable and ordered with status/results; learner sees only own attempts and teacher sees only their assigned course. |
| GRADE-5 | Teacher adds a manual score/comment | Valid score bounds and non-empty/length rules are enforced server-side; review is persisted with reviewer/time and visible to the intended learner. |
| GRADE-6 | Out-of-scope teacher, learner, forged submission ID, invalid score, or stale review update | Denied/validation error with no unauthorized data or partial write. |
| DUE-1 | Teacher saves/clears a due date | Persisted server timestamp round-trips in UTC; display conversion does not shift the instant. Only authorized course teacher can change it. |
| DUE-2 | Submission before, at, and after the deadline | Late/accepted/rejected behavior matches the explicitly documented boundary rule, including exact-deadline equality and timezone conversion. |
| NOTICE-1 | Due-date/review notice is prepared or delivered | Recipient set is limited to the correct active course learners; revoked and unrelated learners receive nothing. Delivery failure is visible/retryable and does not corrupt the grade/submission. |

Due-date acceptance semantics (whether late work is accepted and whether equality is on-time) and notice timing/channel must be settled by implementation contract before asserting product-specific values. A mocked notification adapter only verifies recipient selection and retry behavior; it does not prove live delivery.

## Learner resume and personal history

| ID | Scenario | Acceptance evidence |
|---|---|---|
| RESUME-1 | Learner opens a lesson/cell and later leaves | Last location is persisted to the authenticated learner and course, not only browser memory. |
| RESUME-2 | Learner clicks Continue after visiting a later lesson/cell | Opens that last valid location rather than always selecting the first incomplete lesson. |
| RESUME-3 | Stored location is deleted, belongs to another course, is locked, or is no longer published | Safely falls back to the first valid accessible location; never discloses locked lesson content. |
| RESUME-4 | Learner completes course or has no unfinished work | Continue behavior is a documented completed/empty state, not a broken deep link. |
| RESUME-5 | Open same account in a second browser/session | Server-persisted location is recovered; client local state is not the sole source of truth. |
| HISTORY-1 | Learner opens own quiz/code history | Own attempts only, sorted consistently, with submitted answer/status/feedback suitable for learner display. |
| HISTORY-2 | Learner requests another learner's attempt/history by direct ID | Denied with no answer, score, source code, or feedback leakage. |
| HISTORY-3 | Failed network save of progress/history | Current code/answers remain in the editor and UI shows retryable failure; no false saved confirmation. |

## Human-style acceptance pass (after feature branches integrate)

On a disposable local database and isolated accounts: sign in as T1; invite one new learner and bulk assign two existing synthetic learners; confirm roster and revoke one; enter a due date; submit quiz twice and code twice as L1; add score/comment as T1; sign back in as L1 and verify notice, review, and own attempt history; open a later accessible cell, restart/reload the browser, and use Continue. Then repeat direct course/record URL checks as T2, L2, and an unauthenticated session. Capture rendered UI state and server response evidence. Delete only disposable fixtures after recording results. This is not a substitute for live email, scheduled-notice, or cross-browser testing.

## Implementation handoff points

Backend: provide stable exported server functions/actions for course-scoped teacher authorization, roster mutation/invite acceptance, gradebook/history fetch, quiz attempt creation, manual review, deadline update/submission rule, notice recipient selection, and resume-position read/write. Tests will bind to those exports and mock Prisma/mail/clock/notifications, never assert a speculative REST path.

Frontend: provide stable component exports or explicit callback props for roster invite/bulk/revoke, gradebook/history/manual review, deadline/notice, learner history, and the resume-link calculation. Tests will verify rendered visibility, user actions, loading/error behavior, and that resumed lesson/cell IDs are carried into the URL.
