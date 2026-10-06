import type { Task, AsyncState } from "./types.js";
import { taskState } from "./types.js";
import type { TaskPage } from "./api.js";
import { withRetry, errorMessage, type RetryOptions } from "./fetcher.js";
export function mergePages(
  previous: readonly Task[],
  incoming: readonly Task[],
): Task[] {
  const byId = new Map(previous.map((task) => [task.id, task]));
  for (const task of incoming) {
    const old = byId.get(task.id);
    // Later createdAt wins; equal timestamps keep the already visible version.
    if (!old || task.createdAt > old.createdAt) byId.set(task.id, task);
  }
  return [...byId.values()];
}
export function createPageLoader(
  fetchPage: (cursor: string | null, signal: AbortSignal) => Promise<TaskPage>,
  options: RetryOptions & { maxPages?: number } = {},
) {
  let tasks: Task[] = [];
  let state: AsyncState<Task[]> = { status: "empty" };
  let error: string | null = null;
  let cursor: string | null = null;
  let done = false;
  let pages = 0;
  let inFlight: Promise<void> | undefined;
  const seen = new Set<string | null>();
  const listeners = new Set<() => void>();
  function notify() {
    listeners.forEach((listener) => listener());
  }
  return {
    getState: () => state,
    getError: () => error,
    hasMore: () => !done,
    isLoading: () => inFlight !== undefined,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    loadMore(): Promise<void> {
      if (inFlight) return inFlight;
      if (done) return Promise.resolve();
      error = null;
      if (tasks.length === 0) state = { status: "loading" };
      const requestedCursor = cursor;
      // Set the shared promise before callbacks can re-enter loadMore.
      inFlight = Promise.resolve().then(async () => {
        notify();
        try {
          if (pages >= (options.maxPages ?? 100) || seen.has(requestedCursor))
            throw new Error("Pagination loop prevented");
          const page = await withRetry(
            (signal) => fetchPage(requestedCursor, signal),
            options,
          );
          tasks = mergePages(tasks, page.items);
          pages++;
          seen.add(requestedCursor);
          cursor = page.nextCursor;
          done = cursor === null;
          state = taskState(tasks);
          if (!done && seen.has(cursor)) {
            done = true;
            error = "Repeated cursor prevented";
          }
          if (!done && pages >= (options.maxPages ?? 100)) {
            done = true;
            error = "Maximum page count reached";
          }
        } catch (cause) {
          error = errorMessage(cause);
          // A separate error channel keeps earlier successful pages on screen.
          state =
            tasks.length > 0
              ? taskState(tasks)
              : { status: "error", message: error };
        } finally {
          inFlight = undefined;
          notify();
        }
      });
      return inFlight;
    },
  };
}
