import type { Task, TaskId } from "./types.js";
export type ParseResult =
  { ok: true; task: Task } | { ok: false; errors: string[] };
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function strings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => typeof item === "string")
  );
}
function date(value: unknown): Date | undefined {
  if (!(value instanceof Date) && typeof value !== "string") return undefined;
  const parsed = new Date(value instanceof Date ? value.getTime() : value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}
export function parseTask(raw: unknown): ParseResult {
  if (!record(raw)) return { ok: false, errors: ["Task must be an object"] };
  const errors: string[] = [];
  const id = raw.id;
  const title = raw.title;
  const priority = raw.priority;
  const tags = raw.tags;
  const createdAt = date(raw.createdAt);
  const completedAt = raw.completedAt === null ? null : date(raw.completedAt);
  if (typeof id !== "string" || id.trim().length === 0)
    errors.push("id must be a non-empty string");
  if (typeof title !== "string" || title.trim().length === 0)
    errors.push("title must be non-empty");
  if (typeof title === "string" && title.length > 120)
    errors.push("title must be at most 120 characters");
  if (priority !== "low" && priority !== "medium" && priority !== "high")
    errors.push("priority must be low, medium or high");
  if (!strings(tags)) errors.push("tags must be an array of strings");
  if (createdAt === undefined) errors.push("createdAt must be a valid date");
  if (completedAt === undefined)
    errors.push("completedAt must be null or a valid date");
  if (errors.length > 0) return { ok: false, errors };
  // Repeating these guards gives TypeScript proof without casting external data.
  if (
    typeof id !== "string" ||
    typeof title !== "string" ||
    !strings(tags) ||
    createdAt === undefined ||
    completedAt === undefined ||
    (priority !== "low" && priority !== "medium" && priority !== "high")
  ) {
    return { ok: false, errors: ["Invalid task"] };
  }
  // The brand is introduced only here, after runtime validation of the id.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const taskId = id as TaskId;
  return {
    ok: true,
    task: {
      id: taskId,
      title: title.trim(),
      priority,
      tags: [...tags],
      createdAt,
      completedAt,
    },
  };
}
export function parseTaskList(raw: unknown): {
  tasks: Task[];
  rejected: { index: number; errors: string[] }[];
} {
  if (!Array.isArray(raw))
    return {
      tasks: [],
      rejected: [{ index: -1, errors: ["Expected an array of tasks"] }],
    };
  const tasks: Task[] = [];
  const rejected: { index: number; errors: string[] }[] = [];
  raw.forEach((item: unknown, index: number) => {
    const result = parseTask(item);
    if (result.ok) tasks.push(result.task);
    else rejected.push({ index, errors: result.errors });
  });
  return { tasks, rejected };
}
