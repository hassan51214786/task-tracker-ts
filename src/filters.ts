import type { Task, Priority } from "./types.js";
export interface TaskFilter {
  readonly priority?: Priority;
  readonly completed?: boolean;
  readonly tags?: readonly string[];
  readonly from?: Date;
  readonly to?: Date;
}
export function filterTasks(
  tasks: readonly Task[],
  filter: TaskFilter,
): Task[] {
  return tasks.filter(
    (task) =>
      (filter.priority === undefined || task.priority === filter.priority) &&
      (filter.completed === undefined ||
        (task.completedAt !== null) === filter.completed) &&
      (filter.tags === undefined ||
        filter.tags.length === 0 ||
        filter.tags.some((tag) => task.tags.includes(tag))) &&
      (filter.from === undefined || task.createdAt >= filter.from) &&
      (filter.to === undefined || task.createdAt <= filter.to),
  );
}
export function compareValues<T extends string | number>(a: T, b: T): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
const ranks: Record<Priority, number> = { low: 0, medium: 1, high: 2 };
export interface SortKey {
  readonly by: keyof Task;
  readonly direction: "asc" | "desc";
}
function compareTasks(a: Task, b: Task, key: SortKey): number {
  let comparison: number;
  switch (key.by) {
    case "title":
      comparison = compareValues(a.title.toLowerCase(), b.title.toLowerCase());
      break;
    case "priority":
      comparison = compareValues(ranks[a.priority], ranks[b.priority]);
      break;
    case "completedAt":
      // Nulls stay last in BOTH directions, independent of rank inversion.
      if (a.completedAt === null || b.completedAt === null)
        return a.completedAt === b.completedAt
          ? 0
          : a.completedAt === null
            ? 1
            : -1;
      comparison = compareValues(
        a.completedAt.getTime(),
        b.completedAt.getTime(),
      );
      break;
    case "createdAt":
      comparison = compareValues(a.createdAt.getTime(), b.createdAt.getTime());
      break;
    case "id":
      comparison = compareValues(a.id, b.id);
      break;
    case "tags":
      comparison = compareValues(a.tags.join("\u0000"), b.tags.join("\u0000"));
      break;
  }
  return key.direction === "asc" ? comparison : -comparison;
}
export function sortTasksBy(
  tasks: readonly Task[],
  keys: readonly SortKey[],
): Task[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      for (const key of keys) {
        const result = compareTasks(a.task, b.task, key);
        if (result !== 0) return result;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.task);
}
export function sortTasks(
  tasks: readonly Task[],
  by: keyof Task,
  direction: "asc" | "desc",
): Task[] {
  return sortTasksBy(tasks, [{ by, direction }]);
}
export function groupBy<T, K extends PropertyKey>(
  items: readonly T[],
  keyFn: (item: T) => K,
): Record<K, T[]> {
  // A null-prototype dictionary safely supports keys such as __proto__.
  // The generic cast describes the dynamically constructed dictionary only.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const groups = Object.create(null) as Record<K, T[]>;
  for (const item of items) {
    const key = keyFn(item);
    (groups[key] ??= []).push(item);
  }
  return groups;
}
export function groupTasksByPriority(
  tasks: readonly Task[],
): Record<Priority, Task[]> {
  return {
    ...{ low: [], medium: [], high: [] },
    ...groupBy(tasks, (task) => task.priority),
  };
}
