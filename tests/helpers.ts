import { parseTask } from "../src/validation.js";
import type { Task } from "../src/types.js";
export function task(id = "a", fields: Partial<Omit<Task, "id">> = {}): Task {
  const result = parseTask({
    id,
    title: `Task ${id}`,
    priority: "medium",
    completedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    tags: [],
    ...fields,
  });
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.task;
}
export function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error("Not initialized");
  };
  let reject: (reason: Error) => void = () => {
    throw new Error("Not initialized");
  };
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
