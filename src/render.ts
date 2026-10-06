import type { AsyncState, Task } from "./types.js";
import { assertNever } from "./types.js";
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}
// The callback returns trusted HTML; task rendering below escapes every text value.
export function renderAsyncState<T>(
  state: AsyncState<T>,
  renderData: (data: T) => string,
): string {
  switch (state.status) {
    case "loading":
      return '<p class="loading" role="status">Loading tasks...</p>';
    case "empty":
      return '<p class="empty">No tasks yet. Add your first task.</p>';
    case "error":
      return `<p class="error" role="alert">${escapeHtml(state.message)}. Please retry.</p>`;
    case "success":
      return renderData(state.data);
    default:
      return assertNever(state);
  }
}
export function renderTasks(state: AsyncState<Task[]>): string {
  return renderAsyncState(
    state,
    (tasks) =>
      `<ul class="tasks">${tasks.map((task) => `<li class="task ${task.completedAt === null ? "open" : "completed"}"><strong>${escapeHtml(task.title)}</strong><span class="priority">${escapeHtml(task.priority)}</span><span>${task.completedAt === null ? "Open" : "Done"}</span><span class="tags">${task.tags.map(escapeHtml).join(", ")}</span></li>`).join("")}</ul>`,
  );
}
