import type { Task, TaskId } from "./types.js";
import { assertNever } from "./types.js";
import type { MutationApi } from "./api.js";
import { errorMessage } from "./fetcher.js";
export type TaskPatch = Partial<Omit<Task, "id" | "createdAt">>;
export type TaskAction =
  | { readonly type: "add"; readonly task: Task }
  | { readonly type: "update"; readonly id: TaskId; readonly patch: TaskPatch }
  | { readonly type: "toggle"; readonly id: TaskId; readonly at: Date }
  | { readonly type: "delete"; readonly id: TaskId };
export function taskReducer(
  tasks: readonly Task[],
  action: TaskAction,
): Task[] {
  switch (action.type) {
    case "add":
      return tasks.some((task) => task.id === action.task.id)
        ? [...tasks]
        : [...tasks, action.task];
    case "update":
      return tasks.map((task) =>
        task.id === action.id ? { ...task, ...action.patch } : task,
      );
    case "toggle":
      return tasks.map((task) =>
        task.id === action.id
          ? {
              ...task,
              completedAt:
                task.completedAt === null
                  ? new Date(action.at.getTime())
                  : null,
            }
          : task,
      );
    case "delete":
      return tasks.filter((task) => task.id !== action.id);
    default:
      return assertNever(action);
  }
}
export interface StoreState {
  readonly tasks: readonly Task[];
  readonly pending: number;
  readonly error: string | null;
}
export function createTaskStore(
  api: MutationApi,
  initial: readonly Task[] = [],
  now: () => Date = () => new Date(),
) {
  let confirmed: Task[] = [...initial];
  let pending: { token: number; action: TaskAction }[] = [];
  let token = 0;
  let state: StoreState = { tasks: [...initial], pending: 0, error: null };
  const listeners = new Set<(state: StoreState) => void>();
  const queues = new Map<TaskId, Promise<void>>();
  function publish(error: string | null) {
    state = {
      tasks: pending.reduce(
        (tasks, item) => taskReducer(tasks, item.action),
        confirmed,
      ),
      pending: pending.length,
      error,
    };
    listeners.forEach((listener) => listener(state));
  }
  function mutate(action: TaskAction): Promise<void> {
    const id = action.type === "add" ? action.task.id : action.id;
    const currentToken = ++token;
    pending = [...pending, { token: currentToken, action }];
    publish(null);
    // Requests on one id are FIFO; different ids can save concurrently.
    // Rollback drops only the failed action and replays newer pending actions.
    const previous = queues.get(id) ?? Promise.resolve();
    const result = previous.then(async () => {
      try {
        const candidate = taskReducer(confirmed, action);
        if (action.type === "delete") {
          await api.deleteTask(id);
          confirmed = taskReducer(confirmed, action);
        } else {
          const wanted = candidate.find((task) => task.id === id);
          if (!wanted) throw new Error("Task not found");
          const saved =
            action.type === "add"
              ? await api.addTask(wanted)
              : await api.updateTask(wanted);
          if (saved.id !== id)
            throw new Error("API returned a different task id");
          confirmed =
            action.type === "add"
              ? taskReducer(confirmed, { type: "add", task: saved })
              : confirmed.map((task) => (task.id === id ? saved : task));
        }
        pending = pending.filter((item) => item.token !== currentToken);
        publish(null);
      } catch (error) {
        pending = pending.filter((item) => item.token !== currentToken);
        publish(errorMessage(error));
      }
    });
    queues.set(id, result);
    void result.then(() => {
      if (queues.get(id) === result) queues.delete(id);
    });
    return result;
  }
  return {
    getState: () => state,
    subscribe(listener: (state: StoreState) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    addTask: (task: Task) => mutate({ type: "add", task }),
    updateTask: (id: TaskId, patch: TaskPatch) =>
      mutate({ type: "update", id, patch }),
    toggleComplete: (id: TaskId) => mutate({ type: "toggle", id, at: now() }),
    deleteTask: (id: TaskId) => mutate({ type: "delete", id }),
  };
}
