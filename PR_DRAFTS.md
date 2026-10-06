# Draft PR descriptions

Replace the SHA command with its actual output when opening each PR. Update local checks after running them on your machine, and add real GitHub CI links after the runs finish.

## PR 1: Define task types, validation and typed queries

Problem solved: Incoming task data is checked before use, and task states and queries have explicit TypeScript types.

Files changed: Task and async-state types, validation, filtering/sorting/grouping, shared test helpers and foundation tests.

Risk / permissions affected: No external permissions; plain typed data operations only.

Local checks run: The prepared branch passed lint, typecheck and coverage tests. I will repeat these locally before requesting review.

Known limits: No real backend; renderer and async modules arrive in the dependent PRs. Null `createdAt` is rejected because the model requires a date.

Final SHA: Run `git rev-parse --short feat/foundations`.

The ids become branded only after runtime validation. The compiler also verifies this invalid sort key:

```ts
// @ts-expect-error "deadline" is not keyof Task
sortTasks(tasks, "deadline", "asc");
```

## PR 2: Make asynchronous task loading safe

Problem solved: Slow or failing requests no longer replace newer results, drop earlier pages or cause duplicate requests for the same cached key.

Files changed: Simulated API, retry fetcher, pagination, cache, debounced search and async tests.

Risk / permissions affected: Timers and in-memory state only; no external network or account access.

Local checks run: The prepared branch passed lint, typecheck and coverage tests. I will repeat these locally before requesting review.

Known limits: Simulated API only; retryable failures use network or timeout ApiError kinds. A stale cache refresh error is exposed separately while old data stays available.

Final SHA: Run `git rev-parse --short feat/async-layer`.

Overlapping page versions use later `createdAt`; equal dates keep the already loaded record. The second quick `loadMore()` call shares the first promise. Cancellations clear active work and backoff timers, and tests exercise out-of-order resolution with fake timers.

## PR 3: Add optimistic state, safe rendering and statistics

Problem solved: Task changes appear immediately, failed saves roll back safely, and every user text value is escaped before reaching task HTML.

Files changed: Store and reducer, rendering, statistics, their tests, project README and review handoff notes.

Risk / permissions affected: In-memory state and HTML strings only; no new external permissions.

Local checks run: The prepared branch passed lint, typecheck and coverage tests. I will repeat these locally before requesting review.

Known limits: Plain HTML strings rather than a browser UI; no due-date field, persistence or real backend. Public review and GitHub CI evidence must still be added.

Final SHA: Run `git rev-parse --short feat/state-rendering`.

Same-task saves are FIFO. A failed operation is removed from the pending queue and later edits are replayed on confirmed state. A rollback cannot overwrite a newer saved change to another task. The renderer uses `assertNever`; adding an unhandled async variant makes the project fail typechecking.
