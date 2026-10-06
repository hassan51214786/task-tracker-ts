import { it, expect } from "vitest";
import { renderAsyncState, renderTasks, escapeHtml } from "../src/render.js";
import { computeStats } from "../src/stats.js";
import { task } from "./helpers.js";
it("renders strings through the same generic renderer", () => {
  expect(
    renderAsyncState({ status: "success", data: "Hello" }, escapeHtml),
  ).toBe("Hello");
});
it("renders numbers through the same generic renderer", () => {
  expect(renderAsyncState({ status: "success", data: 42 }, String)).toBe("42");
});
it("renders distinct loading empty and error states", () => {
  expect(renderTasks({ status: "loading" })).toContain("Loading tasks");
  expect(renderTasks({ status: "empty" })).toContain("No tasks yet");
  expect(renderTasks({ status: "error", message: "offline" })).toContain(
    "Please retry",
  );
});
it("neutralizes script titles tags and errors", () => {
  const attack = "<script>alert(1)</script>";
  const html = renderTasks({
    status: "success",
    data: [task("a", { title: attack, tags: [attack] })],
  });
  expect(html).not.toContain("<script>");
  expect(html.match(/&lt;script&gt;/g)).toHaveLength(2);
  expect(renderTasks({ status: "error", message: attack })).toContain(
    "&lt;script&gt;",
  );
});
it("escapes quotes ampersands and angle brackets", () => {
  expect(escapeHtml("\"'&<>")).toBe("&quot;&#39;&amp;&lt;&gt;");
});
it("shows priority and completion styling", () => {
  const html = renderTasks({
    status: "success",
    data: [task(), task("b", { priority: "high", completedAt: new Date() })],
  });
  expect(html).toContain("task open");
  expect(html).toContain("task completed");
  expect(html).toContain("Done");
  expect(html).toContain("high");
});
it("handles empty statistics without NaN", () => {
  expect(computeStats([])).toEqual({
    total: 0,
    completed: 0,
    open: 0,
    completionRate: 0,
    perPriority: { low: 0, medium: 0, high: 0 },
    averageTimeToCompleteHours: 0,
  });
});
it("computes counts rate and mean completion hours", () => {
  expect(
    computeStats([
      task("a", {
        priority: "low",
        completedAt: new Date("2026-01-01T02:00:00Z"),
      }),
      task("b", {
        priority: "high",
        completedAt: new Date("2026-01-01T04:00:00Z"),
      }),
      task("c", { priority: "high" }),
    ]),
  ).toEqual({
    total: 3,
    completed: 2,
    open: 1,
    completionRate: (2 / 3) * 100,
    perPriority: { low: 1, medium: 0, high: 2 },
    averageTimeToCompleteHours: 3,
  });
});
it("fails the exhaustive renderer on unsupported runtime variants", () => {
  // @ts-expect-error Runtime fault injection for the exhaustive default branch.
  expect(() => renderAsyncState({ status: "future" }, String)).toThrow(
    "Unhandled variant",
  );
});
