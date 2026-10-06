import { parseTaskList } from "./validation.js";
import type { Task, TaskId } from "./types.js";
export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: "network" | "timeout" | "validation" | "abort",
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function abortError(): ApiError {
  return new ApiError("Request cancelled", "abort");
}
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    const timer = setTimeout(
      () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      },
      Math.max(0, ms),
    );
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
export interface TaskPage {
  items: Task[];
  nextCursor: string | null;
}
export interface MutationApi {
  addTask(task: Task): Promise<Task>;
  updateTask(task: Task): Promise<Task>;
  deleteTask(id: TaskId): Promise<void>;
}
export interface SimulationOptions {
  readonly data?: unknown;
  readonly rng?: () => number;
  readonly minDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly failureRate?: number;
  readonly pageSize?: number;
  readonly overlap?: number;
}
export function createSimulatedApi(options: SimulationOptions = {}) {
  const rng = options.rng ?? Math.random;
  let data: unknown = options.data ?? [];
  const pageSize = Math.max(1, options.pageSize ?? 3);
  const overlap = Math.min(pageSize - 1, Math.max(0, options.overlap ?? 1));
  async function read(signal?: AbortSignal): Promise<Task[]> {
    const min = options.minDelayMs ?? 10;
    const max = Math.max(min, options.maxDelayMs ?? 100);
    await delay(min + rng() * (max - min), signal);
    if (rng() < (options.failureRate ?? 0))
      throw new ApiError("Simulated network failure", "network");
    const result = parseTaskList(data);
    if (result.rejected.length > 0)
      throw new ApiError(
        result.rejected
          .map((r) => `${r.index}: ${r.errors.join(", ")}`)
          .join("; "),
        "validation",
      );
    return result.tasks;
  }
  // Serialize writes so concurrent saves on different ids cannot lose updates.
  let writes: Promise<void> = Promise.resolve();
  function write<T>(operation: () => Promise<T>): Promise<T> {
    const result = writes.then(operation);
    writes = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  return {
    fetchTasks: read,
    async fetchTasksPage(
      cursor: string | null,
      signal?: AbortSignal,
    ): Promise<TaskPage> {
      if (cursor !== null && !/^\d+$/.test(cursor))
        throw new ApiError("Invalid cursor", "validation");
      const start = cursor === null ? 0 : Number(cursor);
      if (!Number.isSafeInteger(start))
        throw new ApiError("Invalid cursor", "validation");
      const tasks = await read(signal);
      return {
        items: tasks.slice(start, start + pageSize),
        nextCursor:
          start + pageSize < tasks.length
            ? String(start + pageSize - overlap)
            : null,
      };
    },
    addTask(task: Task): Promise<Task> {
      return write(async () => {
        const tasks = await read();
        if (tasks.some((t) => t.id === task.id))
          throw new ApiError("Duplicate task id", "validation");
        const parsed = parseTaskList([task]);
        const saved = parsed.tasks[0];
        if (!saved) throw new ApiError("Invalid task", "validation");
        data = [...tasks, saved];
        return saved;
      });
    },
    updateTask(task: Task): Promise<Task> {
      return write(async () => {
        const tasks = await read();
        if (!tasks.some((t) => t.id === task.id))
          throw new ApiError("Task not found", "validation");
        const parsed = parseTaskList([task]);
        const saved = parsed.tasks[0];
        if (!saved) throw new ApiError("Invalid task", "validation");
        data = tasks.map((t) => (t.id === task.id ? saved : t));
        return saved;
      });
    },
    deleteTask(id: TaskId): Promise<void> {
      return write(async () => {
        const tasks = await read();
        data = tasks.filter((t) => t.id !== id);
      });
    },
  };
}
