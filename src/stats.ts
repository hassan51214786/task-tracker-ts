import type { Task, Priority } from "./types.js";
export interface TaskStats {
  total: number;
  completed: number;
  open: number;
  completionRate: number;
  perPriority: Record<Priority, number>;
  averageTimeToCompleteHours: number;
}
export function computeStats(tasks: readonly Task[]): TaskStats {
  const perPriority: Record<Priority, number> = { low: 0, medium: 0, high: 0 };
  let completed = 0;
  let hours = 0;
  for (const task of tasks) {
    perPriority[task.priority]++;
    if (task.completedAt !== null) {
      completed++;
      hours +=
        (task.completedAt.getTime() - task.createdAt.getTime()) / 3600000;
    }
  }
  return {
    total: tasks.length,
    completed,
    open: tasks.length - completed,
    completionRate: tasks.length === 0 ? 0 : (completed / tasks.length) * 100,
    perPriority,
    averageTimeToCompleteHours: completed === 0 ? 0 : hours / completed,
  };
}
