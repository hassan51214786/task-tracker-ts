export type TaskId = string & { readonly __brand: "TaskId" };
export type Priority = "low" | "medium" | "high";
export interface Task {
  readonly id: TaskId;
  readonly title: string;
  readonly priority: Priority;
  // null means still open; a Date also records WHEN completion happened.
  // undefined would create an ambiguous third state, so this field is required.
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly tags: readonly string[];
}
export type AsyncState<T> =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "empty" }
  | { readonly status: "success"; readonly data: T };
export function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${String(value)}`);
}
export function mapAsyncState<T, U>(
  state: AsyncState<T>,
  fn: (data: T) => U,
): AsyncState<U> {
  switch (state.status) {
    case "success":
      return { status: "success", data: fn(state.data) };
    case "loading":
    case "error":
    case "empty":
      return state;
    default:
      return assertNever(state);
  }
}
export function taskState(tasks: Task[]): AsyncState<Task[]> {
  return tasks.length === 0
    ? { status: "empty" }
    : { status: "success", data: tasks };
}
