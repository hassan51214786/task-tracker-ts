# Typed Task Tracker

This is my AI-assisted Week 1 task tracker assignment. It uses plain TypeScript and an in-memory API. There is no database or UI framework.

The project models loading, empty, error and success states explicitly. It supports task validation, filtering, stable sorting, overlapping pages, optimistic changes, cached reads and debounced search. The renderer returns escaped HTML strings.

## Run the checks

Use Node.js 22 or newer. Open a terminal in this folder and run:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run test:coverage
```

The coverage command generates `coverage/index.html` and `coverage/coverage-summary.json`. The config fails below 85% lines or 80% branches. The lockfile pins the dependency versions used for verification.

## How the files fit together

| File                | What it does                                                         |
| ------------------- | -------------------------------------------------------------------- |
| `src/types.ts`      | Immutable task shape, validated branded ids and generic async states |
| `src/validation.ts` | Parses unknown input and reports every rejected field                |
| `src/api.ts`        | Simulates task reads, overlapping pages and task changes             |
| `src/fetcher.ts`    | Retries network failures, adds timeouts and blocks stale results     |
| `src/filters.ts`    | AND filters, stable sorting, multi-key sorting and grouping          |
| `src/pagination.ts` | Shares repeated load requests, combines pages and handles failures   |
| `src/store.ts`      | Pure reducer and optimistic changes with rollback                    |
| `src/cache.ts`      | TTL cache, stale-while-revalidate and shared in-flight promises      |
| `src/search.ts`     | Debounced queries, cancellation and superseded-result protection     |
| `src/render.ts`     | Generic exhaustive rendering and safe task HTML                      |
| `src/stats.ts`      | Counts, completion percentage and average completion time            |
| `tests/`            | Meaningful tests, including fake-timer and generated-input cases     |

## Decisions I made

`completedAt` is a required `Date | null`. A boolean would tell me whether a task is done but would lose the completion time. `null` means open; `undefined` is rejected. `createdAt` always needs a valid date, so a null value is rejected there too.

I validate task ids before assigning their brand. The other cast creates the generic grouping dictionary. Both casts have comments. There is no `any` or non-null assertion in the TypeScript code.

The API retries network and timeout failures up to three attempts. Validation errors are not retried. Each attempt gets its own timeout, and cancelling also clears the backoff timer. The fetcher cancels an older request and checks a request number before publishing state.

Sorting uses a copied array. Equal values keep their original order, and null completion dates stay last in either direction. Priority order is low, medium, high. Tag sorting compares the tag lists in their current order. Tag filters match any supplied tag, while separate filter criteria combine with AND. Date range endpoints are inclusive.

When pages overlap, the record with the later `createdAt` wins. Equal timestamps keep the version already visible. A failed later page leaves earlier tasks visible and exposes an error separately. The loader stops repeated cursors and defaults to a maximum of 100 pages.

The store saves operations on the same task in FIFO order. It keeps confirmed tasks separately from pending edits. If a save fails, it removes only that operation and replays the remaining pending edits. A failure cannot restore a whole old snapshot over a newer change on another task. A newer save on the same task waits for the earlier save to settle. The simulated API also serializes writes to prevent lost changes across different ids.

A stale cache value comes back immediately while one shared refresh runs. If the refresh fails, the stale value stays available and `getError(key)` exposes the failure. Search cancels old requests and checks the query version before publishing results.

The generic renderer's success callback returns trusted HTML. Task titles, tags and error messages are escaped by the task renderer. Completed tasks get a `completed` class; open tasks get an `open` class. There is no due-date field, so the project does not invent an overdue rule.

Completion rate is a percentage from 0 to 100. Average completion time is in hours and includes completed tasks only. Empty statistics return zero instead of NaN.

## Git history and review status

Public repository: https://github.com/hassan51214786/task-tracker-ts

The repository has more than 12 focused commits and three stacked feature branches. No feature branch has been merged into `main`.

1. `feat/foundations`: types, validation, filters and tests; Draft PR #1.
2. `feat/async-layer`: API, retries, pagination, caching and search; Draft PR #2.
3. `feat/state-rendering`: optimistic store, rendering, statistics and documentation; third Draft PR.

The branches are stacked to keep each review focused. After each dependency is approved and merged by the reviewer, retarget the next PR to `main` and rerun CI. Reviewer approvals, reviewer merges and actual teammate contributions are still required. The handoff notes explain these remaining steps.

AI helped prepare the implementation and checks. Before requesting review, I need to read the files, run the checks on my machine and be able to explain the design.
